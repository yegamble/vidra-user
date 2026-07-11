import { AdminInstanceConfigView } from "@/components/AdminInstanceConfigView";

// The "homepage" instance-configuration page (config-parity W2 IA). All content is
// metadata-driven: lib/admin-config-ia.ts places the keys, the shared
// AdminInstanceConfigView renders this page's grouped sections.
export default function AdminConfigHomepagePage() {
  return <AdminInstanceConfigView page="homepage" />;
}
