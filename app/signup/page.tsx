import { redirect } from "next/navigation";

import { AuthPage, AuthPageHeading, authBrandName } from "@/components/auth/AuthPage";
import { SignupForm } from "@/components/auth/SignupForm";
import { OwnerClaimCard } from "@/components/OwnerClaimCard";
import { getInstanceConfig } from "@/lib/instance-config.server";

// The OAuth callback redirects back here carrying one-shot markers (?oauth=1 /
// ?oauth_error=<code>) when the flow was started from the signup page — see
// app/login/page.tsx for the mechanics.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; oauth_error?: string; mfa?: string }>;
}) {
  const sp0 = await searchParams;
  // ?mfa=required means the provider round trip resolved to an account that
  // ALREADY EXISTS and has two-factor on — so this is a sign-in that needs a
  // code, not a signup. The challenge UI lives on the login page, and the
  // pending-challenge cookie is scoped to the API, not to this route, so the
  // marker travels and nothing is lost by moving.
  if (sp0.mfa === "required") redirect("/login?mfa=required");
  const [sp, instance] = await Promise.all([Promise.resolve(sp0), getInstanceConfig()]);
  return (
    <AuthPage>
      {/* First-run: every signup path is refused until the server has an
          owner, so say so before the form wastes anyone's time. */}
      <OwnerClaimCard instance={instance} className="mb-6" />
      <AuthPageHeading
        title={`Create your ${authBrandName(instance?.name)} account`}
        instanceName={instance?.name}
      />
      <SignupForm
        oauthPending={sp.oauth === "1"}
        oauthError={sp.oauth_error ?? ""}
        initialInstance={instance ?? undefined}
      />
    </AuthPage>
  );
}
