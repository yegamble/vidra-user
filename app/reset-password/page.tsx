import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthPage>
      <AuthPageHeading title="Reset your password" />
      <ResetPasswordForm />
    </AuthPage>
  );
}
