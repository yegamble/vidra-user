import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
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
    <AuthPage>
      <AuthPageHeading title="Create your account" />
      <SignupForm oauthPending={sp.oauth === "1"} oauthError={sp.oauth_error ?? ""} />
    </AuthPage>
  );
}
