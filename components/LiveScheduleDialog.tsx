"use client";

import { useState } from "react";

import { scheduleToIso, toLocalInputValue } from "@/components/studio/shared";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, errorMessage } from "@/lib/api";
import type { LiveStream } from "@/lib/api";

// LiveScheduleDialog edits ONE thing on an existing live: its planned start.
// The update contract is a full replace (title required), so the stream's other
// fields ride along unchanged; only scheduled_start_at is the user's input, and
// null clears it. A planned start is an announcement — saving it never starts
// the stream.
export function LiveScheduleDialog({
  stream,
  onClose,
  onSaved,
}: {
  stream: LiveStream;
  onClose: () => void;
  onSaved: (updated: LiveStream) => void;
}) {
  const [value, setValue] = useState(toLocalInputValue(stream.scheduled_start_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateLiveStream(stream.id, {
        title: stream.title,
        description: stream.description,
        privacy: stream.privacy,
        permanent: stream.permanent ?? false,
        replay_enabled: stream.replay_enabled ?? false,
        scheduled_start_at: next,
      });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Could not update the schedule."));
    } finally {
      setBusy(false);
    }
  }

  const iso = scheduleToIso(value);
  return (
    <Modal title="Schedule start" onClose={onClose} variant="dialog" className="sm:max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(iso ?? null);
        }}
        className="flex flex-col gap-4"
      >
        <Input
          type="datetime-local"
          label="Scheduled start"
          aria-label="Scheduled start"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          hint="Announced as Upcoming on your channel and the stream page. The stream still starts only when your encoder connects."
          error={error ?? undefined}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || iso === undefined}>
            {busy ? "Saving…" : "Save schedule"}
          </Button>
          {stream.scheduled_start_at ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void save(null)}>
              Clear schedule
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
