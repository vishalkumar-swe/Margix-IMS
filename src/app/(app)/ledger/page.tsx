import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LedgerTable } from "@/features/ledger/ledger-table";
import { humanize } from "@/lib/format";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { ledgerQuerySchema, MOVEMENT_TYPES } from "@/lib/validation/ledger";
import { requirePagePermission } from "@/server/auth/current-user";
import { listLedgerEntries } from "@/server/modules/inventory/ledger.queries";
import { listGodowns, listSkuOptions } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Stock ledger" };

export default async function LedgerPage({ searchParams }: PageProps<"/ledger">) {
  const user = await requirePagePermission("ledger.view");
  const raw = await searchParams;
  const query = parseSearchParams(ledgerQuerySchema, raw);
  const [{ items, nextCursor }, godowns, skus] = await Promise.all([
    listLedgerEntries(query),
    listGodowns(),
    listSkuOptions(),
  ]);

  const nextPageHref = () => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && key !== "cursor") params.set(key, value);
    params.set("cursor", String(nextCursor));
    return `/ledger?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Stock ledger"
        description="Every stock change as an immutable entry. Mistakes are corrected with reversals, never edits."
      />
      <Card>
        <FilterBar
          search={{ name: "referenceNo", placeholder: "Reference no. (e.g. GRN-2026-000001)", value: query.referenceNo }}
          selects={[
            {
              name: "skuId",
              label: "All SKUs",
              value: query.skuId,
              options: skus.map((s) => ({ value: s.id, label: s.code })),
            },
            {
              name: "godownId",
              label: "All godowns",
              value: query.godownId,
              options: godowns.map((g) => ({ value: g.id, label: g.code })),
            },
            {
              name: "movementType",
              label: "All movement types",
              value: query.movementType,
              options: MOVEMENT_TYPES.map((t) => ({ value: t, label: humanize(t) })),
            },
          ]}
        />
        {items.length > 0 ? (
          <>
            <LedgerTable entries={items} canReverse={can(user.role, "ledger.reverse")} />
            <div className="flex justify-between border-t border-slate-200 px-4 py-3 text-sm">
              {query.cursor ? (
                <Link href="/ledger" className="text-brand-700 hover:underline">
                  Back to latest
                </Link>
              ) : (
                <span />
              )}
              {nextCursor && (
                <Link href={nextPageHref()} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  Older entries
                </Link>
              )}
            </div>
          </>
        ) : (
          <EmptyState icon={ScrollText} title="No ledger entries match these filters" />
        )}
      </Card>
    </>
  );
}
