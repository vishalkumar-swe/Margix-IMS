import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EMPTY_PARTY, PartyFormDialog } from "@/features/masters/party-form-dialog";
import { PartyTable } from "@/features/masters/party-table";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";
import { listSuppliers } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const user = await requirePagePermission("master.view");
  const canManage = can(user.role, "master.manage");
  const suppliers = await listSuppliers();

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Vendors that purchase orders are raised against."
        actions={canManage && <PartyFormDialog kind="supplier" initial={EMPTY_PARTY} />}
      />
      <Card>
        {suppliers.length > 0 ? (
          <PartyTable kind="supplier" parties={suppliers} canManage={canManage} />
        ) : (
          <EmptyState icon={Building2} title="No suppliers yet" />
        )}
      </Card>
    </>
  );
}
