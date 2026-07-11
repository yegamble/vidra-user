import { redirect } from "next/navigation";

// /admin/config is a layout route (config-parity W2 IA); the index lands on
// its first page. Deep links to the old single page keep working via this
// redirect.
export default function AdminConfigIndexPage() {
  redirect("/admin/config/general");
}
