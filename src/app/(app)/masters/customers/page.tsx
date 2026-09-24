import { Store } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EMPTY_PARTY, PartyFormDialog } from "@/features/masters/party-form-dialog";
import { PartyTable } from "@/features/masters/party-table";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCustomers } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const user = await requirePagePermission("master.view");
  const canManage = can(user.role, "master.manage");
  const customers = await listCustomers();

  return (
    <>
      <PageHeader
        title="Customers"
        description="Parties that stock is dispatched to."
        actions={canManage && <PartyFormDialog kind="customer" initial={EMPTY_PARTY} />}
      />
      <Card>
        {customers.length > 0 ? (
          <PartyTable kind="customer" parties={customers} canManage={canManage} />
        ) : (
          <EmptyState icon={Store} title="No customers yet" />
        )}
      </Card>
    </>
  );
}
