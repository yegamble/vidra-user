"use client";

import { memo, useCallback, useEffect, useMemo, useReducer, useState, type Dispatch } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import {
  cueIssue,
  cueIssues,
  formatVttTime,
  nextCueKey,
  parseVtt,
  parseVttTime,
  serializeVtt,
  type VttBlock,
  type VttCue,
} from "@/lib/vtt";

// core rejects a caption upload larger than this (maxCaptionSize); refuse
// client-side with a clear message instead of a bare 4xx.
const MAX_CAPTION_BYTES = 4 * 1024 * 1024;

const FIELD =
  "rounded-lg border border-border bg-surface px-2 py-1 text-sm text-fg focus-ring aria-[invalid=true]:border-danger";

type Action =
  | { type: "load"; blocks: VttBlock[] }
  | { type: "patch"; key: string; patch: Partial<Pick<VttCue, "startMs" | "endMs" | "text">> }
  | { type: "addAfter"; key: string | null; cue: VttCue }
  | { type: "remove"; key: string };

function reducer(blocks: VttBlock[], action: Action): VttBlock[] {
  switch (action.type) {
    case "load":
      return action.blocks;
    case "patch":
      return blocks.map((b) => (b.kind === "cue" && b.key === action.key ? { ...b, ...action.patch } : b));
    case "addAfter": {
      const at = action.key === null ? -1 : blocks.findIndex((b) => b.key === action.key);
      return [...blocks.slice(0, at + 1), action.cue, ...blocks.slice(at + 1)];
    }
    case "remove":
      return blocks.filter((b) => b.key !== action.key);
  }
}

// TimeField keeps its own draft so typing "1:0" never gets reformatted under the
// caret. The cue only changes once the draft parses; an unparsable draft stays on
// screen with an inline error and is reported upward so Save is blocked (a draft
// is never silently discarded on blur).
function TimeField({
  id,
  label,
  valueMs,
  onCommit,
  onValidity,
}: {
  id: string;
  label: string;
  valueMs: number;
  onCommit: (ms: number) => void;
  onValidity: (id: string, invalid: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => formatVttTime(valueMs));
  const [seen, setSeen] = useState(valueMs);
  const invalid = parseVttTime(draft) === null;
  // Resync when the cue changes from outside (not from our own commit).
  if (seen !== valueMs) {
    setSeen(valueMs);
    if (parseVttTime(draft) !== valueMs) setDraft(formatVttTime(valueMs));
  }
  return (
    <span className="flex flex-col gap-0.5">
      <input
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-err` : undefined}
        inputMode="decimal"
        spellCheck={false}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const ms = parseVttTime(e.target.value);
          onValidity(id, ms === null);
          if (ms !== null) onCommit(ms);
        }}
        onBlur={() => {
          if (!invalid) setDraft(formatVttTime(valueMs));
        }}
        className={`w-28 font-mono ${FIELD}`}
      />
      {invalid ? (
        <span id={`${id}-err`} className="text-xs text-danger">
          Use mm:ss.mmm
        </span>
      ) : null}
    </span>
  );
}

/** Test seam: called with the cue key each time a row renders. */
export const cueRowRenderProbe: { onRender?: (key: string) => void } = {};

const CueRow = memo(function CueRow({
  cue,
  n,
  prevEndMs,
  dispatch,
  autoFocus,
  onAdded,
  onValidity,
}: {
  cue: VttCue;
  n: number;
  prevEndMs: number | null;
  dispatch: Dispatch<Action>;
  autoFocus: boolean;
  onAdded: (key: string) => void;
  onValidity: (id: string, invalid: boolean) => void;
}) {
  cueRowRenderProbe.onRender?.(cue.key);
  // Computed from this row's own inputs (primitives), so memo() holds.
  const issue = cueIssue(cue, prevEndMs);
  return (
    <li
      className="flex flex-col gap-1.5 border-b border-border-subtle py-2 [contain-intrinsic-size:auto_110px] [content-visibility:auto]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-8 text-xs tabular-nums text-fg-muted">{n}</span>
        <TimeField
          id={`${cue.key}-s`}
          onValidity={onValidity}
          label={`Cue ${n} start`}
          valueMs={cue.startMs}
          onCommit={(startMs) => dispatch({ type: "patch", key: cue.key, patch: { startMs } })}
        />
        <span aria-hidden="true" className="text-fg-muted">
          →
        </span>
        <TimeField
          id={`${cue.key}-e`}
          onValidity={onValidity}
          label={`Cue ${n} end`}
          valueMs={cue.endMs}
          onCommit={(endMs) => dispatch({ type: "patch", key: cue.key, patch: { endMs } })}
        />
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            aria-label={`Add cue after ${n}`}
            onClick={() => {
              const created: VttCue = {
                kind: "cue",
                key: nextCueKey(),
                id: "",
                startMs: cue.endMs,
                endMs: cue.endMs + 2000,
                settings: "",
                text: "",
              };
              dispatch({ type: "addAfter", key: cue.key, cue: created });
              onAdded(created.key);
            }}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-fg-muted hover:bg-surface-muted focus-ring"
          >
            Add after
          </button>
          <button
            type="button"
            aria-label={`Delete cue ${n}`}
            onClick={() => dispatch({ type: "remove", key: cue.key })}
            className="rounded-full px-2.5 py-1 text-xs font-semibold text-fg-muted hover:bg-danger-surface hover:text-danger focus-ring"
          >
            Delete
          </button>
        </div>
      </div>
      <textarea
        aria-label={`Cue ${n} text`}
        aria-invalid={issue.error !== undefined}
        rows={Math.min(5, cue.text.split("\n").length)}
        value={cue.text}
        autoFocus={autoFocus}
        onChange={(e) => dispatch({ type: "patch", key: cue.key, patch: { text: e.target.value } })}
        className={`w-full resize-y ${FIELD}`}
      />
      {issue.error ? (
        <p className="text-xs text-danger">{issue.error}</p>
      ) : issue.warning ? (
        <p className="text-xs text-warning">{issue.warning}</p>
      ) : null}
    </li>
  );
});

// CaptionCueEditor edits one caption track cue by cue and saves it back through
// the SAME replace-by-language upload as a manual file (no separate endpoint, so
// core's header check and 4 MiB cap apply unchanged). Non-cue blocks (NOTE,
// STYLE, REGION), cue ids and cue settings are carried through untouched.
export function CaptionCueEditor({
  videoId,
  language,
  label,
  onClose,
  onSaved,
}: {
  videoId: string;
  language: string;
  label: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [header, setHeader] = useState("");
  const [blocks, dispatch] = useReducer(reducer, [] as VttBlock[]);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Ids ("<cueKey>-s" / "-e") of time inputs whose draft does not parse.
  const [badDrafts, setBadDrafts] = useState<ReadonlySet<string>>(new Set());
  const onValidity = useCallback((id: string, invalid: boolean) => {
    setBadDrafts((prev) => {
      if (prev.has(id) === invalid) return prev;
      const next = new Set(prev);
      if (invalid) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api
      .downloadCaptionText(videoId, language, controller.signal)
      .then((text) => {
        const doc = parseVtt(text);
        setHeader(doc.header);
        dispatch({ type: "load", blocks: doc.blocks });
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(errorMessage(err, "Could not load this caption track."));
        setPhase("failed");
      });
    return () => controller.abort();
  }, [videoId, language, attempt]);

  const cues = useMemo(() => blocks.filter((b): b is VttCue => b.kind === "cue"), [blocks]);
  const issues = useMemo(() => cueIssues(cues), [cues]);
  // A removed row can leave a stale id behind; only count drafts of live cues.
  const badCount = cues.reduce(
    (n, c) => n + (badDrafts.has(`${c.key}-s`) ? 1 : 0) + (badDrafts.has(`${c.key}-e`) ? 1 : 0),
    0,
  );
  const errorCount = issues.filter((i) => i.error).length + badCount;
  const warnCount = issues.filter((i) => i.warning).length;

  const act: Dispatch<Action> = useMemo(
    () => (a) => {
      setDirty(true);
      dispatch(a);
    },
    [],
  );

  function requestClose() {
    if (dirty && !window.confirm("Discard your changes to this caption?")) return;
    onClose();
  }

  async function save() {
    if (saving || errorCount > 0) return;
    const text = serializeVtt({ header, blocks });
    const file = new File([text], `${language}.vtt`, { type: "text/vtt" });
    if (file.size > MAX_CAPTION_BYTES) {
      setSaveError("This caption is larger than the 4 MiB limit.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.uploadCaption(videoId, { language, label: label || undefined, file });
      onSaved();
    } catch (err) {
      setSaveError(errorMessage(err, "Could not save the caption."));
      setSaving(false);
    }
  }

  return (
    <Modal title={`Caption cues (${language})`} onClose={requestClose} className="!max-w-3xl">
      {phase === "loading" ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : phase === "failed" ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-danger">
            {loadError}
          </p>
          <Button variant="secondary" size="sm" onClick={() => {
              setPhase("loading");
              setAttempt((a) => a + 1);
            }}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cues.length === 0 ? <p className="text-sm text-fg-muted">This track has no cues yet.</p> : null}
          <ul className="max-h-[55vh] overflow-y-auto pr-1">
            {cues.map((cue, i) => (
              <CueRow
                key={cue.key}
                cue={cue}
                n={i + 1}
                prevEndMs={i > 0 ? cues[i - 1].endMs : null}
                dispatch={act}
                autoFocus={cue.key === justAdded}
                onAdded={setJustAdded}
                onValidity={onValidity}
              />
            ))}
          </ul>
          <p className="text-xs text-fg-muted">
            Blank lines inside a cue are removed when you save.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const last = cues[cues.length - 1];
                const created: VttCue = {
                  kind: "cue",
                  key: nextCueKey(),
                  id: "",
                  startMs: last ? last.endMs : 0,
                  endMs: (last ? last.endMs : 0) + 2000,
                  settings: "",
                  text: "",
                };
                act({ type: "addAfter", key: last ? last.key : null, cue: created });
                setJustAdded(created.key);
              }}
            >
              Add cue at end
            </Button>
            <p role="status" className="text-xs text-fg-muted">
              {cues.length} cues
              {errorCount > 0 ? ` · ${errorCount} to fix` : ""}
              {warnCount > 0 ? ` · ${warnCount} overlapping` : ""}
            </p>
            <div className="ml-auto">
              <Button size="sm" onClick={() => void save()} disabled={saving || errorCount > 0 || !dirty}>
                {saving ? "Saving…" : "Save cues"}
              </Button>
            </div>
          </div>
          {saveError ? (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
