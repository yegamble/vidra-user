import { ApiError } from "@/lib/api";
import type { ImportJob } from "@/lib/api";

// Import-from-URL status vocabulary (UPLOAD-09, backport W2.U2). Pure mapping of
// the backend's async `import_job` view (`state` + `stage`, see
// vidra-core/api/openapi.yaml #/components/schemas/ImportJob) onto the studio's
// four-step progress rail. Kept dependency-free (no React) so it is unit-tested
// directly.

export type ImportStageKey = "queued" | "metadata" | "downloading" | "processing";

export type ImportStage = { key: ImportStageKey; label: string };

// The ordered rail shown while a URL import runs. The backend reports coarse
// `stage` values (resolving | downloading | processing) once `state` is running;
// "queued" is the pending state before a worker picks the job up.
export const IMPORT_STAGES: readonly ImportStage[] = [
  { key: "queued", label: "Queued" },
  { key: "metadata", label: "Fetching metadata" },
  { key: "downloading", label: "Downloading" },
  { key: "processing", label: "Scanning & processing" },
] as const;

// importActiveStage maps an import job to the index of the rail step currently in
// progress. A pending job sits at "Queued" (0); a running job maps its `stage`
// (resolving → metadata, downloading, processing), defaulting to "Fetching
// metadata" when the worker has started but not yet reported a stage. Terminal
// (done/failed) jobs return -1 — the rail is no longer shown for them.
export function importActiveStage(job: Pick<ImportJob, "state" | "stage">): number {
  if (job.state === "pending") return 0;
  if (job.state === "running") {
    switch (job.stage) {
      case "downloading":
        return 2;
      case "processing":
        return 3;
      case "resolving":
      default:
        return 1;
    }
  }
  return -1;
}

// importResolved reports whether a still-running import has passed the resolving
// stage — the point at which the worker has applied any yt-dlp-resolved
// title/description to the draft, so the form can refetch and prefill. True once
// the job reports a concrete download/processing stage OR the worker rewrote the
// transient `auto` resolver to the concrete `direct`/`ytdlp` it actually ran.
export function importResolved(job: Pick<ImportJob, "state" | "stage" | "resolver">): boolean {
  if (job.state !== "running") return false;
  return job.stage === "downloading" || job.stage === "processing" || job.resolver !== "auto";
}

// isImportsDisabledError recognises the backend's stable "imports off" signal:
// the 503 `service_unavailable` a disabled resolver returns at enqueue time. The
// URL tab uses it to fall back to the honest disabled state rather than a dead
// form. (The proactive signal is GET /instance's `features.imports`; this is the
// defensive catch for a race or an explicitly-disabled resolver.)
export function isImportsDisabledError(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 503 || err.code === "service_unavailable");
}
