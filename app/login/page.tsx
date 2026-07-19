import { AuthPage } from "@/components/auth/AuthPage";
import { LoginForm } from "@/components/auth/LoginForm";
import { getInstanceConfig } from "@/lib/instance-config.server";

// The OAuth callback redirects back here carrying one-shot markers: ?oauth=1
// (success landing — the session cookie was just set) or ?oauth_error=<code>
// (user-actionable failure). They are read server-side and handed to the form,
// which immediately cleans them out of the URL.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; oauth_error?: string }>;
}) {
  const [sp, instance] = await Promise.all([searchParams, getInstanceConfig()]);
  // The page is a thin standalone wrapper; the title lives inside LoginForm so each
  // auth state owns its own heading (credentials → "Sign in"; the two-factor
  // challenge → its own title with no competing "Sign in" above it), matching
  // the App template's standalone auth screens.
  return (
    <AuthPage>
      <LoginForm
        oauthPending={sp.oauth === "1"}
        oauthError={sp.oauth_error ?? ""}
        initialProviders={instance?.oauth_providers}
        initialAtprotoLogin={instance?.atproto_login}
      />
    </AuthPage>
  );
}
