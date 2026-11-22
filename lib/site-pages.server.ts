import { cache } from "react";
import type { components } from "@/lib/api/generated";
import { serverJson } from "@/lib/server-json";

type Page = components["schemas"]["SitePage"];
type MenuEntry = components["schemas"]["SitePageSummary"];

export const getSitePageMenu = cache(async () =>
  (await serverJson<MenuEntry[]>("/api/v1/pages", {
    freshness: { revalidateSeconds: 60 }, timeoutMs: 2500,
  })) ?? [],
);

export const getSitePage = cache(async (slug: string) => {
  const missing = "missing";
  const page = await serverJson<Page | typeof missing>(`/api/v1/pages/${encodeURIComponent(slug)}`, {
    freshness: "no-store", forwardClientIp: true, timeoutMs: 5000, on404: missing,
  });
  if (page === null) throw new Error("The page could not be loaded.");
  return page === missing ? null : page;
});
