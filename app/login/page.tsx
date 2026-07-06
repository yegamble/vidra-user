import { LoginForm } from "@/components/auth/LoginForm";

// The OAuth callback redirects back here carrying one-shot markers: ?oauth=1
// (success landing — the session cookie was just set) or ?oauth_error=<code>
// (user-actionable failure). They are read server-side and handed to the form,
// which immediately cleans them out of the URL.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; oauth_error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="mb-8 text-center text-3xl font-bold tracking-[-0.05em]">Sign in</h1>
      <LoginForm oauthPending={sp.oauth === "1"} oauthError={sp.oauth_error ?? ""} />
    </main>
  );
}
