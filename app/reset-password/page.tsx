import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getInstanceConfig } from "@/lib/instance-config.server";

export default async function ResetPasswordPage() {
  const instance = await getInstanceConfig();
  return (
    <AuthPage>
      <AuthPageHeading title="Reset your password" instanceName={instance?.name} />
      {/* features.mail is the boot signal for "this deployment has an outbound
          mail path at all". Without one the request still answers 202 and the
          user would be told to check an inbox nothing was sent to. */}
      <ResetPasswordForm mailEnabled={instance?.features?.mail !== false} />
    </AuthPage>
  );
}
