"use client";

import { Textarea } from "@/components/ui/Textarea";

/** PeerTube's (and vidra-core's) cap on a channel/video support message. */
export const SUPPORT_TEXT_MAX = 1000;

/**
 * SupportTextField — the "Support text" textarea shared by the channel settings
 * and the Studio video edit form: a markdown message ("Support me on Liberapay:
 * <link>") shown behind the watch/channel Support button. The counter is the
 * field's hint, so it is announced with the label; it turns into the field error
 * past the cap (maxLength already stops typing, but a paste is clamped silently
 * by the browser, so the counter is what tells the user it happened).
 */
export function SupportTextField({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const used = [...value].length;
  return (
    <Textarea
      label="Support text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      rows={3}
      maxLength={SUPPORT_TEXT_MAX}
      className="resize-y"
      placeholder="Support me on Liberapay: https://…"
      hint={`Markdown, shown behind the Support button. ${used}/${SUPPORT_TEXT_MAX}`}
      error={used > SUPPORT_TEXT_MAX ? `At most ${SUPPORT_TEXT_MAX} characters.` : undefined}
    />
  );
}
