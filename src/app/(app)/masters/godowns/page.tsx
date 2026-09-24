import { Warehouse } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EMPTY_GODOWN, GodownFormDialog } from "@/features/masters/godown-form-dialog";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";
import { listGodowns } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Godowns" };

export default async function GodownsPage() {
  const user = await requirePagePermission("master.view");
  const canManage = can(user.role, "master.manage");
  const godowns = await listGodowns();

  return (
    <>
      <PageHeader
        title="Godowns"
        description="Storage locations. Stock is always held per godown."
        actions={canManage && <GodownFormDialog initial={EMPTY_GODOWN} />}
      />
      <Card>
        {godowns.length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Address</TH>
                <TH>Tally</TH>
                <TH>Status</TH>
                {canManage && <TH className="sr-only">Actions</TH>}
              </tr>
            </THead>
            <TBody>
              {godowns.map((g) => (
                <TR key={g.id}>
                  <TD className="font-mono text-xs font-medium">{g.code}</TD>
                  <TD>
                    <Link href={`/stock?godownId=${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>
                  </TD>
                  <TD className="max-w-64 text-xs text-slate-500">{g.address ?? "—"}</TD>
                  <TD className="text-xs">
                    {!g.tallySyncEnabled ? (
                      <span className="text-slate-400">Not synced</span>
                    ) : g.tallyGodownName ? (
                      g.tallyGodownName
                    ) : (
                      <span className="text-amber-700">Not mapped</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={g.isActive ? "success" : "neutral"}>{g.isActive ? "Active" : "Inactive"}</Badge>
                  </TD>
                  {canManage && (
                    <TD className="text-right">
                      <GodownFormDialog
                        godownId={g.id}
                        initial={{
                          code: g.code,
                          name: g.name,
                          address: g.address ?? "",
                          tallySyncEnabled: g.tallySyncEnabled,
                          tallyGodownName: g.tallyGodownName ?? "",
                          isActive: g.isActive,
                        }}
                      />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Warehouse} title="No godowns yet" />
        )}
      </Card>
    </>
  );
}
