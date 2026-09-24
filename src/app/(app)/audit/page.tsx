import { History } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { humanize } from "@/lib/format";
import { parseSearchParams } from "@/lib/search-params";
import { auditQuerySchema } from "@/lib/validation/audit";
import { requirePagePermission } from "@/server/auth/current-user";
import { listAuditFacets, listAuditLogs } from "@/server/modules/audit/audit.queries";
import { listUsers } from "@/server/modules/users/users.queries";

export const metadata: Metadata = { title: "Audit trail" };

/** Pretty-printed JSON for the expandable change details. */
function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requirePagePermission("audit.view");
  const raw = await searchParams;
  const query = parseSearchParams(auditQuerySchema, raw);
  const [{ items, total }, facets, users] = await Promise.all([listAuditLogs(query), listAuditFacets(), listUsers()]);

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Who did what, when and from where (spec §11). Records are append-only."
      />
      <Card>
        <FilterBar
          dates={[
            { name: "from", label: "From", value: query.from },
            { name: "to", label: "To", value: query.to },
          ]}
          selects={[
            {
              name: "action",
              label: "All actions",
              value: query.action,
              options: facets.actions.map((a) => ({ value: a, label: humanize(a) })),
            },
            {
              name: "entityType",
              label: "All record types",
              value: query.entityType,
              options: facets.entityTypes.map((t) => ({ value: t, label: t })),
            },
            {
              name: "userId",
              label: "All users",
              value: query.userId,
              options: users.map((u) => ({ value: u.id, label: u.name })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>User</TH>
                  <TH>Action</TH>
                  <TH>Record</TH>
                  <TH>Details</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((log) => (
                  <TR key={log.id} className="align-top">
                    <TD className="text-xs whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                      {log.ipAddress && <span className="block text-slate-400">{log.ipAddress}</span>}
                    </TD>
                    <TD className="text-xs">{log.user?.name ?? <span className="text-slate-400">System / anonymous</span>}</TD>
                    <TD className="text-xs font-medium">{humanize(log.action)}</TD>
                    <TD className="text-xs">
                      {log.entityType}
                      {log.entityId && <span className="block font-mono text-slate-400">{log.entityId.slice(0, 8)}…</span>}
                    </TD>
                    <TD className="max-w-md">
                      {log.oldData !== null || log.newData !== null ? (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-brand-700">View changes</summary>
                          <div className="mt-2 grid gap-2">
                            {log.oldData !== null && (
                              <div>
                                <p className="font-medium text-slate-500">Before</p>
                                <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 font-mono">{formatJson(log.oldData)}</pre>
                              </div>
                            )}
                            {log.newData !== null && (
                              <div>
                                <p className="font-medium text-slate-500">{log.oldData !== null ? "After" : "Data"}</p>
                                <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 font-mono">{formatJson(log.newData)}</pre>
                              </div>
                            )}
                          </div>
                        </details>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/audit" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={History} title="No audit records match these filters" />
        )}
      </Card>
    </>
  );
}
