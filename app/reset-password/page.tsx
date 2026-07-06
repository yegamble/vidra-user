import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="mb-8 text-center text-2xl font-bold tracking-tight">Reset your password</h1>
      <ResetPasswordForm />
    </main>
  );
}
