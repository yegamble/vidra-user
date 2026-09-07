import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { ConfirmEmailChangeForm } from "@/components/auth/ConfirmEmailChangeForm";
import { getInstanceConfig } from "@/lib/instance-config.server";

// The landing page named by the confirmation message. It mirrors
// /verify-email/confirm and /reset-password/confirm: the code arrives in the
// URL, is submitted for the reader, and the page states what happened.
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, instance] = await Promise.all([searchParams, getInstanceConfig()]);
  return (
    <AuthPage>
      <AuthPageHeading title="Confirm email change" instanceName={instance?.name} />
      <ConfirmEmailChangeForm token={(token ?? "").trim()} />
    </AuthPage>
  );
}
