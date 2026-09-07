import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getInstanceConfig } from "@/lib/instance-config.server";

export default async function ResetPasswordPage() {
  const instance = await getInstanceConfig();
  return (
    <AuthPage>
      <AuthPageHeading title="Reset your password" instanceName={instance?.name} />
      <ResetPasswordForm />
    </AuthPage>
  );
}
