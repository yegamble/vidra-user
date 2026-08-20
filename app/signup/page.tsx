import { AuthPage, AuthPageHeading } from "@/components/auth/AuthPage";
import { SignupForm } from "@/components/auth/SignupForm";
import { OwnerClaimCard } from "@/components/OwnerClaimCard";
import { getInstanceConfig } from "@/lib/instance-config.server";

// The OAuth callback redirects back here carrying one-shot markers (?oauth=1 /
// ?oauth_error=<code>) when the flow was started from the signup page — see
// app/login/page.tsx for the mechanics.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; oauth_error?: string }>;
}) {
  const [sp, instance] = await Promise.all([searchParams, getInstanceConfig()]);
  return (
    <AuthPage>
      {/* First-run: every signup path is refused until the server has an
          owner, so say so before the form wastes anyone's time. */}
      <OwnerClaimCard instance={instance} className="mb-6" />
      <AuthPageHeading title="Create your account" />
      <SignupForm
        oauthPending={sp.oauth === "1"}
        oauthError={sp.oauth_error ?? ""}
        initialInstance={instance ?? undefined}
      />
    </AuthPage>
  );
}
