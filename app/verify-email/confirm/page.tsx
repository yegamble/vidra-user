import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { VerifyEmailConfirmForm } from "@/components/auth/VerifyEmailConfirmForm";
import { getInstanceConfig } from "@/lib/instance-config.server";

export default async function VerifyEmailConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, instance] = await Promise.all([searchParams, getInstanceConfig()]);
  return (
    <AuthPage>
      <AuthPageHeading title="Verify your email" instanceName={instance?.name} />
      <VerifyEmailConfirmForm token={(token ?? "").trim()} />
    </AuthPage>
  );
}
