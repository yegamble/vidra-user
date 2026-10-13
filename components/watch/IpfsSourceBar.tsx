"use client";

import { useT } from "@/components/I18nProvider";
import { RotateCwIcon } from "@/components/icons";
import type { PlainMessageKey } from "@/lib/i18n";

// The engine's selected source, including fallback. No invented peer counts.
export type IpfsSource = "server" | "fetching" | "ipfs" | "error" | "original" | "starting";

const LABEL: Record<IpfsSource, PlainMessageKey> = {
  server: "panels.ipfs.server",
  fetching: "panels.ipfs.fetching",
  ipfs: "panels.ipfs.ipfs",
  error: "panels.ipfs.error",
  original: "panels.ipfs.original",
  starting: "panels.ipfs.starting",
};

// Dot colour by state — decorative (the label carries the meaning as text, so
// this is never colour-only). fg-subtle for the neutral server default; the
// status tokens otherwise.
const DOT: Record<IpfsSource, string> = {
  server: "bg-fg-subtle",
  fetching: "bg-warning",
  ipfs: "bg-success",
  error: "bg-danger",
  original: "bg-fg-subtle",
  starting: "bg-warning",
};

// The toggle flips between the two sources. When already on (or fetching) IPFS,
// it offers to drop back to the server; otherwise it offers IPFS.
function toggleLabel(state: IpfsSource): PlainMessageKey {
  return state === "ipfs" || state === "fetching" ? "panels.ipfs.useServer" : "panels.ipfs.useIpfs";
}

/**
 * IpfsSourceBar — the thin status/source row under the watch player, shown only
 * when the playback session offers an eligible IPFS source.
 * A status dot + peer-free label, a re-fetch control (when IPFS is the active or
 * failed source), and a tonal pill that toggles the playback source. Purely
 * presentational: the playback engine owns selection and reports fallback.
 */
export function IpfsSourceBar({
  state,
  onToggle,
  onRefetch,
}: {
  state: IpfsSource;
  onToggle: () => void;
  onRefetch: () => void;
}) {
  const t = useT();
  const showRefetch = state === "ipfs" || state === "error";
  return (
    <div className="flex items-center gap-2 border-b border-border-subtle py-2.5">
      <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${DOT[state]}`} />
      <span className="text-[12.5px] text-fg-muted">{t(LABEL[state])}</span>
      {showRefetch ? (
        <button
          type="button"
          aria-label={t("panels.ipfs.refetch")}
          onClick={onRefetch}
          className="focus-ring ml-auto flex shrink-0 rounded p-1 text-fg-muted transition-colors hover:text-fg"
        >
          <RotateCwIcon size={14} strokeWidth={2} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        className={`focus-ring shrink-0 rounded-[10px] bg-surface-muted px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-strong ${
          showRefetch ? "" : "ml-auto"
        }`}
      >
        {t(toggleLabel(state))}
      </button>
    </div>
  );
}
