import { BellRing } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Quantity } from "@/components/shared/quantity";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EMPTY_RULE, ReorderRuleDialog } from "@/features/alerts/reorder-rule-dialog";
import { formatDateTime } from "@/lib/dates";
import { NOTIFICATION_ALERT_TYPE_LABELS, NOTIFICATION_ALERT_TYPES } from "@/lib/enums";
import { toNamedOption, toSkuOption } from "@/lib/options";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { alertListQuerySchema } from "@/lib/validation/alerts";
import { requirePagePermission } from "@/server/auth/current-user";
import { listReorderRules, listStockAlerts } from "@/server/modules/alerts/alerts.queries";
import { listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Stock alerts" };

export default async function AlertsPage({ searchParams }: PageProps<"/alerts">) {
  const user = await requirePagePermission("alert.view");
  const raw = await searchParams;
  const query = parseSearchParams(alertListQuerySchema, raw);
  const canManage = can(user.role, "alert.manage");
  const [{ items, total }, rules, godowns, skus] = await Promise.all([
    listStockAlerts(query),
    listReorderRules(),
    listGodowns(),
    canManage ? listSkuOptions() : Promise.resolve([]),
  ]);
  const skuOptions = skus.map(toSkuOption);
  const slow = query.type === "SLOW_MOVING";
  const godownOptions = godowns.filter((g) => g.isActive).map(toNamedOption);

  return (
    <>
      <PageHeader
        title="Stock alerts"
        description="Low-stock alerts are raised and cleared automatically as stock moves; slow-moving alerts by a daily scan. One alert per SKU, godown and type."
      />

      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "SKU code or name", value: query.q }}
          selects={[
            {
              name: "type",
              label: "Type",
              value: query.type,
              options: NOTIFICATION_ALERT_TYPES.map((t) => ({ value: t, label: NOTIFICATION_ALERT_TYPE_LABELS[t] })),
            },
            {
              name: "status",
              label: "Status",
              value: query.status,
              options: [
                { value: "ACTIVE", label: "Active" },
                { value: "RESOLVED", label: "Resolved" },
              ],
            },
            {
              name: "godownId",
              label: "All godowns",
              value: query.godownId,
              options: godowns.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>SKU</TH>
                  <TH>Godown</TH>
                  <TH numeric>Stock</TH>
                  <TH numeric>{slow ? "Days idle" : "Reorder level"}</TH>
                  <TH>Raised</TH>
                  <TH>{query.status === "ACTIVE" ? "Status" : "Resolved"}</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((alert) => (
                  <TR key={alert.id}>
                    <TD>
                      <Link href={`/stock/${alert.sku.id}`} className="font-medium hover:underline">
                        {alert.sku.code}
                      </Link>
                      <span className="block text-xs text-slate-500">{alert.sku.name}</span>
                    </TD>
                    <TD>{alert.godown.name}</TD>
                    <TD numeric>
                      <Quantity
                        value={alert.currentQty}
                        unit={alert.sku.baseUom.code}
                        className={alert.status === "ACTIVE" && !slow ? "font-semibold text-red-700" : undefined}
                      />
                    </TD>
                    <TD numeric>
                      {slow ? <span className="font-medium text-amber-700">{alert.daysIdle ?? "—"}</span> : <Quantity value={alert.thresholdQty} />}
                    </TD>
                    <TD className="text-xs">{formatDateTime(alert.createdAt)}</TD>
                    <TD className="text-xs">
                      {alert.status === "ACTIVE" ? (
                        <Badge tone={slow ? "warning" : "danger"}>{NOTIFICATION_ALERT_TYPE_LABELS[query.type]}</Badge>
                      ) : (
                        formatDateTime(alert.resolvedAt)
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/alerts" searchParams={raw} />
          </>
        ) : (
          <EmptyState
            icon={BellRing}
            title={query.status === "ACTIVE" ? "No active alerts" : "No resolved alerts"}
            description={
              query.status !== "ACTIVE"
                ? undefined
                : slow
                  ? "No stock is idle beyond the slow-stock period (checked daily)."
                  : "Every SKU with a reorder rule is above its level."
            }
          />
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Reorder rules"
          description="Set the minimum stock per SKU and godown. Who is notified, and how, is set under Administration → Notifications."
          actions={canManage && <ReorderRuleDialog initial={EMPTY_RULE} skus={skuOptions} godowns={godownOptions} />}
        />
        {rules.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>SKU</TH>
                <TH>Godown</TH>
                <TH numeric>Reorder level</TH>
                <TH>Status</TH>
                {canManage && <TH className="sr-only">Actions</TH>}
              </tr>
            </THead>
            <TBody>
              {rules.map((rule) => (
                <TR key={rule.id}>
                  <TD>
                    <span className="font-medium">{rule.sku.code}</span>
                    <span className="block text-xs text-slate-500">{rule.sku.name}</span>
                  </TD>
                  <TD>{rule.godown.name}</TD>
                  <TD numeric>
                    <Quantity value={rule.reorderLevel} unit={rule.sku.baseUom.code} />
                  </TD>
                  <TD>
                    <Badge tone={rule.isActive ? "success" : "neutral"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
                  </TD>
                  {canManage && (
                    <TD className="text-right">
                      <ReorderRuleDialog
                        existing={{
                          skuLabel: `${rule.sku.code} · ${rule.sku.name}`,
                          godownLabel: rule.godown.name,
                          unit: rule.sku.baseUom.code,
                        }}
                        skus={skuOptions}
                        godowns={godownOptions}
                        initial={{
                          skuId: rule.skuId,
                          godownId: rule.godownId,
                          reorderLevel: rule.reorderLevel.toString(),
                          isActive: rule.isActive,
                        }}
                      />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={BellRing} title="No reorder rules yet" />
        )}
      </Card>
    </>
  );
}
