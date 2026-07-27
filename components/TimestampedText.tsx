import { linkifyTimestamps } from "@/lib/timestamp-links";

// Renders plain user text with (h:)mm:ss timestamps linkified into seek/`?t=`
// anchors (Wave F). It exists as a component (not an inline linkifyTimestamps
// call) so a ref-reading `onSeek` is handed in as a PROP rather than passed into
// a helper during the caller's render — the latter trips react-hooks/refs, since
// the linter cannot see that the tokenizer only invokes onSeek from onClick.
// The tokenizer never builds HTML strings, so this stays inside the sanitized,
// React-level rendering path (no dangerouslySetInnerHTML anywhere).
export function TimestampedText({
  text,
  durationSeconds = null,
  onSeek,
  keyPrefix,
}: {
  text: string;
  durationSeconds?: number | null;
  onSeek?: (seconds: number) => void;
  keyPrefix?: string;
}) {
  return <>{linkifyTimestamps(text, { durationSeconds, onSeek, keyPrefix })}</>;
}
