import { CircleCheck, Clock, RefreshCw, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RetryTallyJobButton, RunTallySyncButton } from "@/features/tally/tally-actions";
import { formatDateTime } from "@/lib/dates";
import { humanize } from "@/lib/format";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { TALLY_SYNC_STATUSES, tallyJobsQuerySchema } from "@/lib/validation/tally";
import { requirePagePermission } from "@/server/auth/current-user";
import { countTallyJobsByStatus, listTallyJobs } from "@/server/modules/tally/tally.queries";

export const metadata: Metadata = { title: "Tally sync" };

const DOCUMENT_PATHS: Partial<Record<string, string>> = {
  GRN: "/grns",
  DISPATCH: "/dispatches",
  ADJUSTMENT: "/adjustments",
};

export default async function TallyPage({ searchParams }: PageProps<"/tally">) {
  const user = await requirePagePermission("tally.view");
  const raw = await searchParams;
  const query = parseSearchParams(tallyJobsQuerySchema, raw);
  const [{ items, total }, counts] = await Promise.all([listTallyJobs(query), countTallyJobsByStatus()]);
  const canSync = can(user.role, "tally.sync");

  return (
    <>
      <PageHeader
        title="Tally sync"
        description="Accounting status of every posted document. A Tally failure never blocks or undoes a stock transaction."
        actions={canSync && <RunTallySyncButton />}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pending" value={counts.PENDING} icon={Clock} href="/tally?status=PENDING" />
        <StatCard label="In progress" value={counts.IN_PROGRESS} icon={RefreshCw} href="/tally?status=IN_PROGRESS" />
        <StatCard
          label="Failed"
          value={counts.FAILED}
          icon={TriangleAlert}
          href="/tally?status=FAILED"
          tone={counts.FAILED > 0 ? "danger" : "neutral"}
        />
        <StatCard label="Synced" value={counts.SYNCED} icon={CircleCheck} href="/tally?status=SYNCED" />
      </div>

      <Card>
        <FilterBar
          search={{ name: "q", placeholder: "Document number", value: query.q }}
          selects={[
            {
              name: "status",
              label: "All statuses",
              value: query.status,
              options: TALLY_SYNC_STATUSES.map((s) => ({ value: s, label: humanize(s) })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Document</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH numeric>Attempts</TH>
                  <TH>Last error</TH>
                  <TH>Next attempt / synced</TH>
                  {canSync && <TH className="sr-only">Actions</TH>}
                </tr>
              </THead>
              <TBody>
                {items.map((job) => {
                  const base = DOCUMENT_PATHS[job.entityType];
                  return (
                    <TR key={job.id}>
                      <TD>
                        {base ? (
                          <Link href={`${base}/${job.entityId}`} className="font-mono text-xs font-medium text-brand-700 hover:underline">
                            {job.entityNo}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">{job.entityNo}</span>
                        )}
                      </TD>
                      <TD className="text-xs">{humanize(job.entityType)}</TD>
                      <TD>
                        <StatusBadge status={job.status} />
                      </TD>
                      <TD numeric>{job.attempts}</TD>
                      <TD className="max-w-72 text-xs text-red-700">{job.status === "SYNCED" ? "" : (job.lastError ?? "")}</TD>
                      <TD className="text-xs">
                        {job.status === "SYNCED" ? formatDateTime(job.syncedAt) : formatDateTime(job.nextAttemptAt)}
                      </TD>
                      {canSync && <TD className="text-right">{job.status === "FAILED" && <RetryTallyJobButton jobId={job.id} />}</TD>}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/tally" searchParams={raw} />
          </>
        ) : (
          <EmptyState icon={CircleCheck} title="No sync jobs match these filters" />
        )}
      </Card>
    </>
  );
}
