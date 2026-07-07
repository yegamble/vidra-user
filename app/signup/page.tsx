import { SignupForm } from "@/components/auth/SignupForm";

// The OAuth callback redirects back here carrying one-shot markers (?oauth=1 /
// ?oauth_error=<code>) when the flow was started from the signup page — see
// app/login/page.tsx for the mechanics.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; oauth_error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="mb-8 text-center text-2xl font-bold tracking-tight">Create your account</h1>
      <SignupForm oauthPending={sp.oauth === "1"} oauthError={sp.oauth_error ?? ""} />
    </main>
  );
}
