import { VerifyEmailConfirmForm } from "@/components/auth/VerifyEmailConfirmForm";

export default async function VerifyEmailConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="mb-8 text-center text-2xl font-bold tracking-tight">Verify your email</h1>
      <VerifyEmailConfirmForm token={(token ?? "").trim()} />
    </main>
  );
}
