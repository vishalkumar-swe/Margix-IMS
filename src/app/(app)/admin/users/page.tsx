import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ResetPasswordDialog } from "@/features/users/reset-password-dialog";
import { EMPTY_USER, UserFormDialog } from "@/features/users/user-form-dialog";
import { formatDateTime } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/permissions";
import { requirePagePermission } from "@/server/auth/current-user";
import { listUsers } from "@/server/modules/users/users.queries";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const currentUser = await requirePagePermission("user.manage");
  const users = await listUsers();
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Users"
        description="Accounts and roles. Permissions follow the role (spec §4.2)."
        actions={<UserFormDialog initial={EMPTY_USER} />}
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Last sign-in</TH>
              <TH>Status</TH>
              <TH className="sr-only">Actions</TH>
            </tr>
          </THead>
          <TBody>
            {users.map((u) => {
              const locked = u.lockedUntil !== null && u.lockedUntil > now;
              const isSelf = u.id === currentUser.id;
              return (
                <TR key={u.id}>
                  <TD className="font-medium text-slate-900">
                    {u.name}
                    {isSelf && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}
                  </TD>
                  <TD className="text-xs">{u.email}</TD>
                  <TD>{ROLE_LABELS[u.role.code]}</TD>
                  <TD className="text-xs">{formatDateTime(u.lastLoginAt)}</TD>
                  <TD>
                    {locked ? (
                      <Badge tone="warning">Locked</Badge>
                    ) : (
                      <Badge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                    )}
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <UserFormDialog
                      userId={u.id}
                      isSelf={isSelf}
                      initial={{ name: u.name, email: u.email, mobile: u.mobile ?? "", role: u.role.code, isActive: u.isActive }}
                    />
                    <ResetPasswordDialog userId={u.id} userName={u.name} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
