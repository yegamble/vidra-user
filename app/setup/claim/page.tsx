import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth/AuthPage";
import { ClaimOwnerForm } from "@/components/auth/ClaimOwnerForm";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { isOwnerClaimPending } from "@/lib/owner-claim";

// The first-run owner wizard. A standalone route (lib/app-shell) like the other
// account-entry flows: no header, no sidebar, no tab bar — one task on a narrow
// centered column.
//
// The gate: a server that reports it already has an owner has nothing to offer
// here, so the visitor goes home. A null snapshot means the instance document
// could not be read while rendering (backend still starting, mocked test
// environments) — that is NOT evidence the server is claimed, so the wizard
// renders and ClaimOwnerForm re-checks from the browser instead. Erring toward
// showing the wizard is the safe direction: the claim endpoint itself is the
// final authority and answers 403 on an already-claimed server.
export default async function ClaimOwnerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const [sp, instance] = await Promise.all([searchParams, getInstanceConfig()]);
  if (instance && !isOwnerClaimPending(instance)) redirect("/");
  return (
    <AuthPage>
      <ClaimOwnerForm fromSignup={sp.from === "signup"} />
    </AuthPage>
  );
}
