import { Percent } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { HsnImportDialog } from "@/features/imports/import-dialogs";
import { EMPTY_HSN, HsnFormDialog } from "@/features/masters/hsn-form-dialog";
import { can } from "@/lib/permissions";
import { parseSearchParams } from "@/lib/search-params";
import { hsnListQuerySchema } from "@/lib/validation/hsn";
import { requirePagePermission } from "@/server/auth/current-user";
import { listHsnCodes } from "@/server/modules/hsn/hsn.queries";

export const metadata: Metadata = { title: "HSN & GST" };

export default async function HsnPage({ searchParams }: PageProps<"/masters/hsn">) {
  const user = await requirePagePermission("master.view");
  const raw = await searchParams;
  const query = parseSearchParams(hsnListQuerySchema, raw);
  const canManage = can(user.role, "master.manage");
  const { items, total } = await listHsnCodes(query);

  return (
    <>
      <PageHeader
        title="HSN & GST"
        description="Central HSN/SAC codes and their GST rates. Products and categories use these; new products get a suggested code and rate."
        actions={
          canManage && (
            <>
              <HsnImportDialog />
              <HsnFormDialog initial={EMPTY_HSN} />
            </>
          )
        }
      />
      <Card>
        <FilterBar search={{ name: "q", placeholder: "Code, description or keyword", value: query.q }} />
        {items.length > 0 ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>HSN / SAC</TH>
                  <TH>Description</TH>
                  <TH numeric>GST %</TH>
                  <TH numeric>Used by</TH>
                  <TH>Status</TH>
                  {canManage && <TH className="sr-only">Actions</TH>}
                </tr>
              </THead>
              <TBody>
                {items.map((hsn) => (
                  <TR key={hsn.code}>
                    <TD className="font-mono text-xs font-medium">{hsn.code}</TD>
                    <TD>
                      {hsn.description}
                      {hsn.keywords && <span className="block text-xs text-slate-500">{hsn.keywords}</span>}
                    </TD>
                    <TD numeric>{hsn.gstRate.toString()}</TD>
                    <TD numeric className="text-xs text-slate-500">
                      {hsn._count.skus} products · {hsn._count.categories} categories
                    </TD>
                    <TD>{hsn.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                    {canManage && (
                      <TD className="text-right">
                        <HsnFormDialog
                          editing
                          initial={{
                            code: hsn.code,
                            description: hsn.description,
                            gstRate: hsn.gstRate.toString(),
                            keywords: hsn.keywords ?? "",
                            isActive: hsn.isActive,
                          }}
                        />
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={query.page} pageSize={query.pageSize} total={total} pathname="/masters/hsn" searchParams={raw} />
          </>
        ) : (
          <EmptyState
            icon={Percent}
            title={query.q ? "No matching HSN codes" : "No HSN codes yet"}
            description={query.q ? "Try another code or word." : "Import the official HSN/SAC list or add codes one by one."}
          />
        )}
      </Card>
    </>
  );
}
