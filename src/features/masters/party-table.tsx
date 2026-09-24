import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PartyFormDialog } from "./party-form-dialog";

interface Party {
  id: string;
  code: string;
  name: string;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

/** Shared list for suppliers and customers. */
export function PartyTable({ kind, parties, canManage }: { kind: "supplier" | "customer"; parties: Party[]; canManage: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Code</TH>
          <TH>Name</TH>
          <TH>GSTIN</TH>
          <TH>Contact</TH>
          <TH>Status</TH>
          {canManage && <TH className="sr-only">Actions</TH>}
        </tr>
      </THead>
      <TBody>
        {parties.map((p) => (
          <TR key={p.id}>
            <TD className="font-mono text-xs font-medium">{p.code}</TD>
            <TD>
              {p.name}
              {p.address && <span className="block max-w-64 truncate text-xs text-slate-500">{p.address}</span>}
            </TD>
            <TD className="font-mono text-xs">{p.gstin ?? "—"}</TD>
            <TD className="text-xs">
              {p.phone ?? "—"}
              {p.email && <span className="block text-slate-500">{p.email}</span>}
            </TD>
            <TD>
              <Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Active" : "Inactive"}</Badge>
            </TD>
            {canManage && (
              <TD className="text-right">
                <PartyFormDialog
                  kind={kind}
                  partyId={p.id}
                  initial={{
                    code: p.code,
                    name: p.name,
                    gstin: p.gstin ?? "",
                    email: p.email ?? "",
                    phone: p.phone ?? "",
                    address: p.address ?? "",
                    isActive: p.isActive,
                  }}
                />
              </TD>
            )}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
