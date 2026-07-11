import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { VerifyEmailConfirmForm } from "@/components/auth/VerifyEmailConfirmForm";

export default async function VerifyEmailConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthPage>
      <AuthPageHeading title="Verify your email" />
      <VerifyEmailConfirmForm token={(token ?? "").trim()} />
    </AuthPage>
  );
}
