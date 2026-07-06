import { ResetPasswordConfirmForm } from "@/components/auth/ResetPasswordConfirmForm";

export default async function ResetPasswordConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="mb-8 text-center text-2xl font-bold tracking-tight">Choose a new password</h1>
      <ResetPasswordConfirmForm token={(token ?? "").trim()} />
    </main>
  );
}
