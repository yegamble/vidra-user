import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { ConfirmEmailChangeForm } from "@/components/auth/ConfirmEmailChangeForm";

// The landing page named by the confirmation message. It mirrors
// /verify-email/confirm and /reset-password/confirm: the code arrives in the
// URL, is submitted for the reader, and the page states what happened.
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthPage>
      <AuthPageHeading title="Confirm email change" />
      <ConfirmEmailChangeForm token={(token ?? "").trim()} />
    </AuthPage>
  );
}
