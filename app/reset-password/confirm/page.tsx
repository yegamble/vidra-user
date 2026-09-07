import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { ResetPasswordConfirmForm } from "@/components/auth/ResetPasswordConfirmForm";
import { getInstanceConfig } from "@/lib/instance-config.server";

export default async function ResetPasswordConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, instance] = await Promise.all([searchParams, getInstanceConfig()]);
  return (
    <AuthPage>
      <AuthPageHeading title="Choose a new password" instanceName={instance?.name} />
      <ResetPasswordConfirmForm token={(token ?? "").trim()} />
    </AuthPage>
  );
}
