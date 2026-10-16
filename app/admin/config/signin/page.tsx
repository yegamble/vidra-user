import { AdminOIDCProvidersView } from "@/components/AdminOIDCProvidersView";

// The "sign-in" instance-configuration page. Bespoke rather than registry-driven
// (the email precedent): providers are documents with a write-only client secret
// and a fresh-credential rule, which the settings registry cannot carry.
export default function AdminConfigSignInPage() {
  return <AdminOIDCProvidersView />;
}
