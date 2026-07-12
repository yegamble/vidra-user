import Link from "next/link";

import { AdminInstanceConfigView } from "@/components/AdminInstanceConfigView";

// The "federation" instance-configuration page (config-parity W2 IA). All content is
// metadata-driven: lib/admin-config-ia.ts places the keys, the shared
// AdminInstanceConfigView renders this page's grouped sections. The follower-approval
// queue panel below is the one non-registry element: it links the queue that the
// federation_follower_approval toggle feeds (a page-local link, so the metadata-driven
// IA stays purely about registry keys).
export default function AdminConfigFederationPage() {
  return (
    <div className="flex flex-col gap-6">
      <AdminInstanceConfigView page="federation" />
      <section
        aria-labelledby="follower-queue-heading"
        className="rounded-2xl border border-border-subtle bg-surface p-4"
      >
        <h2 id="follower-queue-heading" className="text-[15px] font-bold tracking-tight text-fg">
          Follower requests
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
          While follower approval is on, new remote followers of local channels wait for an admin
          decision instead of being auto-accepted.
        </p>
        <Link
          href="/admin/federation/follower-requests"
          className="focus-ring mt-3 inline-flex items-center rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
        >
          Review follower requests
        </Link>
      </section>
    </div>
  );
}
