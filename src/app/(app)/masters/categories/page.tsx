import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CategoryForm } from "@/features/masters/category-form";
import { CategoryHsnDialog } from "@/features/masters/category-hsn-dialog";
import { CategoryToggleButton } from "@/features/masters/category-toggle-button";
import { UomForm } from "@/features/masters/uom-form";
import { can } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCategories, listUoms } from "@/server/modules/masters/masters.queries";

export const metadata: Metadata = { title: "Categories & units" };

export default async function CategoriesPage() {
  const user = await requirePagePermission("master.view");
  const canManage = can(user.role, "master.manage");
  const [categories, uoms] = await Promise.all([listCategories(), listUoms()]);

  return (
    <>
      <PageHeader title="Categories & units" description="Classification and units of measure used by SKUs." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Categories" />
          {canManage && (
            <CardBody className="border-b border-slate-200">
              <CategoryForm />
            </CardBody>
          )}
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Default HSN</TH>
                <TH>Status</TH>
                {canManage && <TH className="sr-only">Actions</TH>}
              </tr>
            </THead>
            <TBody>
              {categories.map((c) => (
                <TR key={c.id}>
                  <TD>{c.name}</TD>
                  <TD className="text-xs">
                    {c.hsn ? (
                      <>
                        <span className="font-mono font-medium">{c.hsn.code}</span> · {c.hsn.gstRate.toString()}% GST
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "Active" : "Inactive"}</Badge>
                  </TD>
                  {canManage && (
                    <TD className="text-right whitespace-nowrap">
                      <CategoryHsnDialog categoryId={c.id} name={c.name} hsnCode={c.hsnCode} />
                      <CategoryToggleButton categoryId={c.id} isActive={c.isActive} />
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Units of measure" description="Decimal places limit how precisely quantities can be entered." />
          {canManage && (
            <CardBody className="border-b border-slate-200">
              <UomForm />
            </CardBody>
          )}
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH numeric>Decimals</TH>
              </tr>
            </THead>
            <TBody>
              {uoms.map((u) => (
                <TR key={u.id}>
                  <TD className="font-mono text-xs font-medium">{u.code}</TD>
                  <TD>{u.name}</TD>
                  <TD numeric>{u.decimalPlaces}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
