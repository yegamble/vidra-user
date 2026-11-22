import { apiRequest } from "./client";
import type { components } from "./generated";

export type SitePage = components["schemas"]["SitePage"];
export type SitePageInput = components["schemas"]["SitePageInput"];
export type SitePageSummary = components["schemas"]["SitePageSummary"];

export const sitePages = {
  list: (signal?: AbortSignal) =>
    apiRequest<SitePageSummary[]>("/api/v1/admin/pages", { signal }),
  get: (slug: string, signal?: AbortSignal) =>
    apiRequest<SitePage>(`/api/v1/pages/${encodeURIComponent(slug)}`, { signal }),
  save: (slug: string, body: SitePageInput) =>
    apiRequest<SitePage>(`/api/v1/admin/pages/${encodeURIComponent(slug)}`, { method: "PUT", body }),
  remove: (slug: string, revision: string) =>
    apiRequest<void>(`/api/v1/admin/pages/${encodeURIComponent(slug)}`, { method: "DELETE", query: { revision } }),
};
