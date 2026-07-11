import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { ResetPasswordConfirmForm } from "@/components/auth/ResetPasswordConfirmForm";

export default async function ResetPasswordConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthPage>
      <AuthPageHeading title="Choose a new password" />
      <ResetPasswordConfirmForm token={(token ?? "").trim()} />
    </AuthPage>
  );
}
