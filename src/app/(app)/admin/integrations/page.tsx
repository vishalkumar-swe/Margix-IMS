import { Webhook } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IntegrationCheckButton } from "@/features/integrations/integration-check-button";
import { RetryWebhookDeliveryButton, WebhookActions } from "@/features/integrations/webhook-actions";
import { WebhookEndpointDialog } from "@/features/integrations/webhook-endpoint-dialog";
import { formatDateTime } from "@/lib/dates";
import { ALL_WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { requirePagePermission } from "@/server/auth/current-user";
import type { IntegrationState } from "@/server/integrations/integration.types";
import { describeIntegrations, type IntegrationOverview } from "@/server/integrations/registry";
import { listWebhookDeliveries, listWebhookEndpoints } from "@/server/integrations/webhooks/webhooks.service";

export const metadata: Metadata = { title: "Integrations" };

const STATE: Record<IntegrationState, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  "log-only": { label: "Log-only", tone: "warning" },
  simulated: { label: "Simulated", tone: "info" },
  disabled: { label: "Off", tone: "neutral" },
  misconfigured: { label: "Needs setup", tone: "danger" },
};

const DELIVERY_TONES: Record<string, BadgeTone> = {
  PENDING: "info",
  IN_PROGRESS: "info",
  DELIVERED: "success",
  FAILED: "danger",
};

const CATEGORY_LABELS: Record<IntegrationOverview["category"], string> = {
  accounting: "Accounting",
  messaging: "Messaging",
  events: "Events",
};

export default async function IntegrationsPage() {
  await requirePagePermission("settings.manage");
  const [integrations, endpoints, deliveries] = await Promise.all([
    describeIntegrations(),
    listWebhookEndpoints(),
    listWebhookDeliveries({ limit: 30 }),
  ]);

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Every connection to an outside system in one place: what is set up, what is waiting to be sent, and a live check. Credentials live in the server environment and are never shown here."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.key} integration={integration} />
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Webhook endpoints"
          description="Other systems that receive Margix events as signed JSON POSTs. Failed deliveries retry with backoff for about two hours."
          actions={<WebhookEndpointDialog />}
        />
        {endpoints.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Endpoint</TH>
                <TH>Events</TH>
                <TH>Status</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {endpoints.map((endpoint) => (
                <TR key={endpoint.id}>
                  <TD>
                    <span className="font-medium text-slate-900">{endpoint.name}</span>
                    <span className="block max-w-xs truncate font-mono text-xs text-slate-500" title={endpoint.url}>
                      {endpoint.url}
                    </span>
                  </TD>
                  <TD className="text-xs">
                    {endpoint.events.includes(ALL_WEBHOOK_EVENTS) ? (
                      "All events"
                    ) : (
                      <span title={endpoint.events.join(", ")}>
                        {endpoint.events.length} event{endpoint.events.length === 1 ? "" : "s"}
                        <span className="block max-w-xs truncate font-mono text-slate-500">{endpoint.events.join(", ")}</span>
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={endpoint.isActive ? "success" : "neutral"}>{endpoint.isActive ? "On" : "Paused"}</Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex flex-wrap items-start justify-end gap-1">
                      <WebhookEndpointDialog initial={{ id: endpoint.id, name: endpoint.name, url: endpoint.url, events: endpoint.events }} />
                      <WebhookActions id={endpoint.id} name={endpoint.name} isActive={endpoint.isActive} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            icon={Webhook}
            title="No webhooks yet"
            description="Add one to push orders, receipts, dispatches and low-stock alerts to another system as they happen."
          />
        )}
      </Card>

      {deliveries.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Recent webhook deliveries" description="The last 30 attempts across all endpoints." />
          <Table>
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Endpoint</TH>
                <TH>Status</TH>
                <TH>Result</TH>
                <TH>Queued</TH>
                <TH className="sr-only">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {deliveries.map((d) => (
                <TR key={d.id}>
                  <TD className="font-mono text-xs">{d.event}</TD>
                  <TD className="text-xs">{d.endpoint.name}</TD>
                  <TD>
                    <Badge tone={DELIVERY_TONES[d.status]}>{d.status.replace("_", " ").toLowerCase()}</Badge>
                  </TD>
                  <TD className="max-w-sm text-xs text-slate-600">
                    {d.responseStatus && <span className="font-mono">HTTP {d.responseStatus} · </span>}
                    {d.status === "DELIVERED" && d.deliveredAt
                      ? `Delivered ${formatDateTime(d.deliveredAt)}`
                      : (d.lastError ?? (d.attempts > 0 ? `Attempt ${d.attempts}` : "Waiting for the worker"))}
                    {d.status === "FAILED" && d.attempts < 6 && (
                      <span className="block text-slate-500">Next try {formatDateTime(d.nextAttemptAt)}</span>
                    )}
                  </TD>
                  <TD className="text-xs whitespace-nowrap">{formatDateTime(d.createdAt)}</TD>
                  <TD className="text-right">{d.status === "FAILED" && <RetryWebhookDeliveryButton id={d.id} />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function IntegrationCard({ integration }: { integration: IntegrationOverview }) {
  const state = STATE[integration.status.state];
  const { queue } = integration;
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {integration.name}
            <Badge tone={state.tone}>{state.label}</Badge>
          </span>
        }
        description={integration.description}
        actions={<span className="text-xs text-slate-500">{CATEGORY_LABELS[integration.category]}</span>}
      />
      <div className="flex flex-1 flex-col gap-4 px-5 py-4">
        <p className="text-sm text-slate-700">{integration.status.summary}</p>

        {integration.settings.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Server settings</p>
            <ul className="space-y-1">
              {integration.settings.map((setting) => (
                <li key={setting.env} className="flex items-baseline gap-2 text-xs">
                  <span
                    className={setting.isSet ? "text-emerald-600" : setting.required ? "text-red-600" : "text-slate-400"}
                    aria-label={setting.isSet ? "set" : "not set"}
                  >
                    {setting.isSet ? "●" : "○"}
                  </span>
                  <code className="font-mono text-slate-800">{setting.env}</code>
                  <span className="min-w-0 truncate text-slate-500" title={setting.description}>
                    {setting.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {queue && (
          <dl className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <dt className="text-slate-500">Waiting</dt>
              <dd className="text-base font-semibold tabular-nums text-slate-900">{queue.pending}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Failed</dt>
              <dd className={`text-base font-semibold tabular-nums ${queue.failed > 0 ? "text-red-700" : "text-slate-900"}`}>{queue.failed}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last success</dt>
              <dd className="text-slate-900">{queue.lastSuccessAt ? formatDateTime(queue.lastSuccessAt) : "—"}</dd>
            </div>
            {queue.failed > 0 && queue.lastError && (
              <div className="col-span-3 rounded-md bg-red-50 px-2 py-1.5 text-red-800">Last error: {queue.lastError}</div>
            )}
          </dl>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
          {integration.canCheck ? <IntegrationCheckButton integrationKey={integration.key} /> : <span />}
          <span className="text-xs text-slate-500">
            Setup guide: <code className="font-mono">docs/integrations.md#{integration.docsAnchor}</code>
          </span>
        </div>
      </div>
    </Card>
  );
}
