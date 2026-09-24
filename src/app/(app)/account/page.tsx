import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/auth/change-password-form";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="My account" description={`${user.name} · ${user.email} · ${ROLE_LABELS[user.role]}`} />
      <Card>
        <CardHeader title="Change password" />
        <CardBody>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </>
  );
}
