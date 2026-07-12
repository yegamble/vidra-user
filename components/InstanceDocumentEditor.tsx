"use client";

import { useCallback, useEffect, useState } from "react";

import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { InstanceDocumentName } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  CUSTOM_JS_CONFIRM_PHRASE,
  INSTANCE_DOCUMENT_CAPS,
  describeDocumentSize,
  isDocumentOverCap,
} from "@/lib/instance-documents";

// InstanceDocumentEditor — the admin editor panel for ONE instance document
// (config-parity W6 over the W1 store: homepage | custom_css | custom_js).
// Documents are NOT registry keys: each loads through GET
// /admin/instance-documents/{name}, saves the whole body with PUT, and clears
// with an empty-body PUT — so this panel renders inside a config-page section
// (like the W4 branding panel) with its own dirty-state save bar mirroring
// the ConfigForm idiom, a live UTF-8 byte counter against the backend's cap,
// and a confirmed Clear affordance.
//
// The `markdown` flavor (homepage) adds the shared rendered-preview modal;
// the `code` flavor (CSS/JS) renders monospace. `dangerConfirm` (custom JS —
// architecture note 6's XSS-as-a-feature posture) gates every non-empty save
// behind a typed confirmation: the operator must type "run this code" into a
// danger-styled modal that spells out that the script runs in every
// visitor's browser.

type Status = "loading" | "error" | "ready";

export function InstanceDocumentEditor({
  name,
  label,
  help,
  placeholder,
  markdown = false,
  code = false,
  dangerConfirm = false,
  rows = code ? 12 : 10,
}: {
  name: InstanceDocumentName;
  /** The textarea's accessible label, e.g. "Homepage content". */
  label: string;
  help?: string;
  placeholder?: string;
  /** Markdown document: show the shared Preview modal affordance. */
  markdown?: boolean;
  /** Code document: monospace textarea. */
  code?: boolean;
  /** Gate non-empty saves behind the typed confirmation (custom JS). */
  dangerConfirm?: boolean;
  rows?: number;
}) {
  const cap = INSTANCE_DOCUMENT_CAPS[name];
  const [status, setStatus] = useState<Status>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  // The server truth (last loaded/saved body) and the working copy.
  const [savedBody, setSavedBody] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  // The typed-confirmation modal (dangerConfirm): open + the phrase typed so far.
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  // The confirmed-clear affordance (inline, like the branding panel's remove).
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstanceDocument(name, controller.signal)
      .then((doc) => {
        setSavedBody(doc.body);
        setBody(doc.body);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [name, reloadKey]);

  const dirty = body !== savedBody;
  const overCap = isDocumentOverCap(body, cap);

  const persist = useCallback(
    async (next: string) => {
      setSaving(true);
      setSaved(false);
      setSaveError(null);
      try {
        const doc = await api.putInstanceDocument(name, next);
        setSavedBody(doc.body);
        setBody(doc.body);
        setSaved(true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 422 && err.fields?.length) {
          setSaveError(err.fields[0].message);
        } else {
          setSaveError(errorMessage(err, "Could not save the document."));
        }
      } finally {
        setSaving(false);
      }
    },
    [name],
  );

  const requestSave = useCallback(() => {
    if (saving || !dirty || overCap) return;
    // The typed confirmation guards code that will RUN in visitors' browsers;
    // clearing (empty body) removes that code and needs no ceremony.
    if (dangerConfirm && body.trim() !== "") {
      setPhrase("");
      setConfirming(true);
      return;
    }
    void persist(body);
  }, [saving, dirty, overCap, dangerConfirm, body, persist]);

  if (status === "loading") {
    return (
      <div className="flex justify-center rounded-2xl bg-surface-muted py-12">
        <Spinner label={`Loading ${label.toLowerCase()}`} />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Could not load the document."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  const phraseMatches = phrase.trim() === CUSTOM_JS_CONFIRM_PHRASE;

  return (
    <div
      role="group"
      // "…editor" keeps the group's accessible name distinct from the
      // textarea's own label so label queries stay unambiguous.
      aria-label={`${label} editor`}
      className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface-muted p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">{label}</span>
          {help ? <span className="block text-xs text-fg-muted">{help}</span> : null}
        </div>
        {markdown ? (
          <Button
            type="button"
            variant="tonal"
            size="sm"
            aria-label={`Preview ${label}`}
            onClick={() => setPreview(true)}
          >
            Preview
          </Button>
        ) : null}
      </div>

      <Textarea
        aria-label={label}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
        placeholder={placeholder}
        rows={rows}
        disabled={saving}
        error={overCap ? `Too large — the limit is ${describeDocumentSize(body, cap).split(" of ")[1]}.` : undefined}
        className={cn("resize-y", code && "font-mono text-[13px] leading-relaxed")}
        spellCheck={code ? false : undefined}
      />
      {/* The live size counter against the backend's byte cap. */}
      <span className={cn("text-xs", overCap ? "text-danger" : "text-fg-muted")}>
        {describeDocumentSize(body, cap)}
      </span>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={dangerConfirm ? "danger" : "primary"}
          size="sm"
          disabled={!dirty || saving || overCap}
          onClick={requestSave}
        >
          {saving ? "Saving…" : `Save ${label.toLowerCase()}`}
        </Button>
        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              setBody(savedBody);
              setSaved(false);
              setSaveError(null);
            }}
          >
            Discard
          </Button>
        ) : null}
        {/* Clear removes the stored document entirely (empty-body PUT), after
            an inline confirmation. Only offered while something is stored. */}
        {savedBody !== "" && !confirmingClear ? (
          <Button
            type="button"
            variant="danger-outline"
            size="sm"
            disabled={saving}
            onClick={() => setConfirmingClear(true)}
          >
            Clear
          </Button>
        ) : null}
        {confirmingClear ? (
          <span className="flex items-center gap-2 text-sm text-fg-muted">
            Remove the stored document?
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={saving}
              aria-label={`Confirm clearing ${label}`}
              onClick={() => {
                setConfirmingClear(false);
                void persist("");
              }}
            >
              Clear it
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingClear(false)}
            >
              Keep
            </Button>
          </span>
        ) : null}
        {dirty ? <span className="text-sm text-fg-muted">Unsaved changes</span> : null}
        {saved ? (
          <span role="status" className="text-sm text-success">
            Saved.
          </span>
        ) : null}
        {saveError ? (
          <span role="alert" className="text-sm text-danger">
            {saveError}
          </span>
        ) : null}
      </div>

      {preview ? (
        <Modal title={`Preview: ${label}`} onClose={() => setPreview(false)} className="max-w-2xl">
          <div className="max-h-[70vh] overflow-y-auto">
            {body.trim() === "" ? (
              <p className="text-sm text-fg-muted">Nothing to preview yet.</p>
            ) : (
              <Markdown>{body}</Markdown>
            )}
          </div>
        </Modal>
      ) : null}

      {confirming ? (
        <Modal
          title="This JavaScript runs in every visitor's browser"
          onClose={() => setConfirming(false)}
          className="max-w-lg"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-fg">
              Saving injects this script into <strong>every page, for every visitor</strong> —
              signed in or not. A mistake can break the site; malicious code can steal
              sessions. Only save code you wrote or fully trust.
            </p>
            <Input
              label={`Type “${CUSTOM_JS_CONFIRM_PHRASE}” to confirm`}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={CUSTOM_JS_CONFIRM_PHRASE}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={!phraseMatches || saving}
                onClick={() => {
                  setConfirming(false);
                  void persist(body);
                }}
              >
                Save and run it
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
