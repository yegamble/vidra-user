"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { LinkButton } from "@/components/ui/LinkButton";
import { Spinner } from "@/components/ui/Spinner";
import { errorMessage } from "@/lib/api/error-message";
import { sitePages, type SitePage, type SitePageSummary } from "@/lib/api/site-pages";
import { SitePageEditor } from "./SitePageEditor";

export function AdminSitePages() {
  const [pages, setPages] = useState<SitePageSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    sitePages.list(controller.signal).then(setPages).catch(err => {
      if (!controller.signal.aborted) setError(errorMessage(err, "Could not load pages."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;
  return (
    <div className="flex flex-col items-start gap-4">
      <LinkButton href="/admin/pages/create">Create page</LinkButton>
      {pages.length === 0 ? <p className="text-sm text-fg-muted">No custom pages yet.</p> : (
        <ul className="w-full divide-y divide-border-subtle">
          {pages.map(page => (
            <li key={page.slug} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/admin/pages/edit/${page.slug}`} className="focus-ring inline-flex min-h-11 items-center rounded-sm font-medium text-accent-text">{page.title}</Link>
              <span className="text-sm text-fg-muted">{page.in_menu ? `Menu position ${page.menu_order}` : "Direct link only"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EditSitePage({ slug }: { slug: string }) {
  const [page, setPage] = useState<SitePage>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    sitePages.get(slug, controller.signal).then(setPage).catch(err => {
      if (!controller.signal.aborted) setError(errorMessage(err, "Could not load this page."));
    });
    return () => controller.abort();
  }, [slug]);
  if (error) return <ErrorState message={error} />;
  return page ? <SitePageEditor page={page} /> : <Spinner />;
}
