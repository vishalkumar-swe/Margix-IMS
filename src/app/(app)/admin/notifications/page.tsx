import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ChannelTestButton } from "@/features/notifications/channel-test-button";
import { NotificationRuleForm } from "@/features/notifications/notification-rule-form";
import { RetryDeliveryButton } from "@/features/notifications/retry-delivery-button";
import { StockAgingForm } from "@/features/notifications/stock-aging-form";
import { formatDateTime } from "@/lib/dates";
import { NOTIFICATION_ALERT_TYPE_LABELS, NOTIFICATION_CHANNEL_LABELS } from "@/lib/enums";
import { humanize } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/current-user";
import { getChannelStatuses } from "@/server/modules/notifications/channels";
import { listNotificationRules } from "@/server/modules/notifications/notification-settings.service";
import {
  countDeliveriesByStatus,
  listRecentDeliveries,
  listRecipientUsers,
} from "@/server/modules/notifications/notifications.queries";
import { getStockAgingSettings } from "@/server/modules/settings/stock-aging";

export const metadata: Metadata = { title: "Notifications" };

const STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: "info",
  IN_PROGRESS: "info",
  SENT: "success",
  SKIPPED: "neutral",
  FAILED: "danger",
};

const IMMEDIATE_HINTS = {
  LOW_STOCK: "When a product reaches or falls below its reorder level.",
  SLOW_MOVING: "Right after the daily scan, for newly identified items.",
} as const;

export default async function NotificationSettingsPage() {
  await requirePagePermission("settings.manage");
  const [rules, users, aging, deliveries, counts] = await Promise.all([
    listNotificationRules(),
    listRecipientUsers(),
    getStockAgingSettings(),
    listRecentDeliveries({ limit: 50 }),
    countDeliveriesByStatus(),
  ]);
  const channels = getChannelStatuses();
  const lowStockRule = rules.find((r) => r.alertType === "LOW_STOCK");
  const recipientUsers = users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role.code }));

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Low-stock and slow-moving stock alerts by in-app notification, e-mail and WhatsApp. Messages are queued with the change that raised them and sent by the notify worker."
      />

      <Card>
        <CardHeader
          title="Channels"
          description="Credentials come from the server environment. A channel without them runs log-only: messages are recorded as skipped, never sent."
        />
        <Table>
          <THead>
            <tr>
              <TH>Channel</TH>
              <TH>Status</TH>
              <TH>Configuration</TH>
              <TH className="sr-only">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {channels.map((c) => (
              <TR key={c.channel}>
                <TD className="font-medium">{NOTIFICATION_CHANNEL_LABELS[c.channel]}</TD>
                <TD>
                  <Badge tone={c.configured ? "success" : "warning"}>{c.configured ? "Configured" : "Not configured"}</Badge>
                </TD>
                <TD className="text-xs text-slate-600">{c.detail}</TD>
                <TD className="text-right">
                  <ChannelTestButton
                    channel={c.channel}
                    defaultRecipient={
                      c.channel === "EMAIL"
                        ? (lowStockRule?.emailRecipients[0] ?? "")
                        : c.channel === "WHATSAPP" && lowStockRule?.whatsappRecipients[0]
                          ? `+${lowStockRule.whatsappRecipients[0]}`
                          : ""
                    }
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {rules.map((rule) => (
        <Card key={rule.alertType} className="mt-6">
          <CardHeader
            title={`${NOTIFICATION_ALERT_TYPE_LABELS[rule.alertType]} alerts`}
            description={
              rule.alertType === "LOW_STOCK"
                ? "Raised when a product's stock in a godown reaches or falls below its reorder level (set on Stock alerts). One notification per alert, not per movement."
                : "Raised by the daily scan for stock without movement for the slow-moving period below."
            }
            actions={
              <span className="text-xs text-slate-500">
                {rule.customised && rule.updatedAt ? `Last changed ${formatDateTime(rule.updatedAt)}` : "Default settings"}
              </span>
            }
          />
          <CardBody>
            <NotificationRuleForm
              alertType={rule.alertType}
              users={recipientUsers}
              immediateHint={IMMEDIATE_HINTS[rule.alertType]}
              initial={{
                isEnabled: rule.isEnabled,
                frequency: rule.frequency,
                digestTime: rule.digestTime,
                inAppEnabled: rule.inAppEnabled,
                emailEnabled: rule.emailEnabled,
                whatsappEnabled: rule.whatsappEnabled,
                inAppRoles: rule.inAppRoles,
                inAppUserIds: rule.inAppUserIds,
                emailRecipients: rule.emailRecipients,
                whatsappRecipients: rule.whatsappRecipients,
              }}
            />
          </CardBody>
        </Card>
      ))}

      <Card className="mt-6" id="stock-aging">
        <CardHeader
          title="Slow and dead stock"
          description="Days without movement before stock counts as slow-moving or dead, in reports, the daily scan and the checklist."
        />
        <CardBody>
          <StockAgingForm
            initial={{
              slowStockDays: String(aging.slowStockDays),
              deadStockDays: String(aging.deadStockDays),
              scanTime: aging.scanTime,
            }}
          />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Recent deliveries"
          description={`Sent ${counts.SENT} · queued ${counts.PENDING + counts.IN_PROGRESS} · skipped ${counts.SKIPPED} · failed ${counts.FAILED}. Failures are retried automatically with increasing delays.`}
        />
        {deliveries.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Queued</TH>
                <TH>Channel</TH>
                <TH>Recipient</TH>
                <TH>Message</TH>
                <TH>Status</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {deliveries.map((d) => (
                <TR key={d.id}>
                  <TD className="text-xs whitespace-nowrap">{formatDateTime(d.createdAt)}</TD>
                  <TD>{NOTIFICATION_CHANNEL_LABELS[d.channel]}</TD>
                  <TD className="max-w-48 truncate text-xs" title={d.recipient}>
                    {d.channel === "IN_APP" ? (users.find((u) => u.id === d.recipient)?.name ?? "User") : d.recipient}
                  </TD>
                  <TD className="max-w-72 truncate text-xs" title={d.subject}>
                    {d.subject}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONES[d.status]}>{humanize(d.status)}</Badge>
                    {d.lastError && <span className="mt-1 block max-w-64 truncate text-xs text-slate-500" title={d.lastError}>{d.lastError}</span>}
                  </TD>
                  <TD className="text-right">{d.status === "FAILED" && <RetryDeliveryButton id={d.id} />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Megaphone} title="Nothing sent yet" description="Deliveries appear here once alerts are raised." />
        )}
      </Card>
    </>
  );
}
