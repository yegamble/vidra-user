import { AdminEmailConfigView } from "@/components/AdminEmailConfigView";

// The "email" instance-configuration page. Bespoke rather than registry-driven
// (the IPFS precedent): outbound mail is a dedicated document with a write-only
// credential, which the instance-settings registry cannot carry.
export default function AdminConfigEmailPage() {
  return <AdminEmailConfigView />;
}
