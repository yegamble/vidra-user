"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { DeviceSetup } from "@/components/e2ee/DeviceSetup";
import { LockIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { EncryptedMessage } from "@/lib/api";
import {
  type DeviceFingerprint,
  type LocalDevice,
  getEngine,
} from "@/lib/e2ee/engine";
import {
  type DisappearingOption,
  DISAPPEARING_OPTIONS,
  expiresInSeconds,
  formatSafetyNumber,
} from "@/lib/e2ee/envelope";
import { discardEncryptedDraft, readEncryptedDraft } from "@/lib/e2ee/drafts";
import { relativeTime } from "@/lib/format";
import { logger } from "@/lib/logger";

const MAX_MESSAGE_LEN = 5000;

// Client-generated id for a message we send: the outbox key AND the React key of
// its bubble, so the optimistic render and the persisted record are the same row.
function newMessageId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `sent-${Date.now()}-${Math.random()}`;
}

// A message as shown in the thread. `text` is null when this device could not
// decrypt the envelope (a graceful per-message undecryptable state, never a crash).
interface ShownMessage {
  key: string;
  mine: boolean;
  text: string | null;
  created_at: string;
  expires_at?: string;
}

type DeviceState = "loading" | "needs-setup" | LocalDevice;

// EncryptedThreadView renders an end-to-end-encrypted 1:1 thread: a lock header
// with honest §1 limitation copy, the decrypted messages (undecryptable ones
// flagged, not hidden), a composer that fans out per recipient device with a
// disappearing-message timer, and a safety-number panel for out-of-band
// verification. It requires a device set up on THIS browser first.
//
// The rendered list is the UNION of two sources, because the wire only carries
// half of it: envelopes addressed to this device (inbound, plus anything our
// other devices sent us) and this device's own outbox. The fan-out never
// addresses an envelope to the sending device and the backend returns only
// self-addressed envelopes, so a sender's own messages exist NOWHERE on the
// server — without the outbox they vanish on every remount.
export function EncryptedThreadView({
  conversationId,
  envelopes,
  recipientId,
  myUserId,
  onAtBottomChange,
  hasEarlier = false,
  loadingEarlier = false,
  earlierError = null,
  onLoadEarlier,
}: {
  conversationId: string;
  envelopes: EncryptedMessage[];
  recipientId?: string;
  myUserId: string;
  /** Reports whether the reader is at the newest message (read-watermark gate). */
  onAtBottomChange?: (atBottom: boolean) => void;
  /** Older history exists beyond the loaded window (the parent owns the cursor). */
  hasEarlier?: boolean;
  loadingEarlier?: boolean;
  earlierError?: string | null;
  onLoadEarlier?: () => void;
}) {
  const [device, setDevice] = useState<DeviceState>("loading");
  const [messages, setMessages] = useState<ShownMessage[]>([]);
  // Recovered from the outbox: who we last sent to in this thread.
  const [lastSentRecipientId, setLastSentRecipientId] = useState<string | undefined>(undefined);

  // The peer to fan out to: the ?to hint, else inferred from an inbound envelope,
  // else whoever we last sent to here — a sender who has only ever SENT has no
  // inbound envelope to infer from, and must not be left with a dead composer.
  const effectiveRecipientId =
    recipientId ??
    envelopes.find((e) => e.sender_user_id !== myUserId)?.sender_user_id ??
    lastSentRecipientId;

  // The id of the device set up on THIS browser, once it is known.
  const localDeviceId = typeof device === "object" ? device.device_id : null;

  const decryptAll = useCallback(
    async (list: EncryptedMessage[]) => {
      const engine = await getEngine();
      const now = Date.now();
      // API returns newest-first; render oldest→newest.
      const ordered = [...list].reverse();
      const shown: ShownMessage[] = [];
      for (const env of ordered) {
        // The list endpoint answers for the ACCOUNT, not for this browser: it
        // returns every envelope addressed to ANY of the caller's devices (core
        // joins the recipient device on user_id and takes no device parameter).
        // A send fans out one envelope per device, so on a two-device account
        // every message arrives here twice — once encrypted for this device and
        // once for the other one, which this device can never open. Rendering
        // the second copy as "can't be decrypted" would duplicate every message
        // in the thread AND drown the one case that placeholder exists for: an
        // envelope addressed HERE that will not open. Keep only what was
        // addressed to this device. A missing id means an older core that does
        // not report addressing — keep the envelope rather than hide a message.
        if (
          localDeviceId !== null &&
          env.recipient_device_id !== undefined &&
          env.recipient_device_id !== "" &&
          env.recipient_device_id !== localDeviceId
        ) {
          continue;
        }
        // An envelope kept across polls can outlive its disappearing-message
        // timer even though the server has already stopped serving it — drop it
        // here too rather than render a message that is supposed to be gone.
        if (env.expires_at !== undefined && new Date(env.expires_at).getTime() <= now) continue;
        let text: string | null;
        try {
          text = await engine.decryptEnvelope(env);
        } catch (err) {
          // Expected for history this device joined too late to read — but it is
          // also the ONLY trace a real ratchet fault leaves, so name the envelope
          // instead of swallowing it silently. Debug level: the benign case is
          // routine. The UI still renders the undecryptable placeholder.
          logger.debug("e2ee: envelope did not decrypt on this device", {
            envelope_id: env.id,
            sender_device_id: env.sender_device_id,
            error: errorMessage(err, "decrypt failed"),
          });
          text = null;
        }
        shown.push({
          key: env.id,
          mine: env.sender_user_id === myUserId,
          text,
          created_at: env.created_at,
          expires_at: env.expires_at,
        });
      }
      // Our own sends, which the server can never return (see the header). This
      // cannot double-render: this device gets no self-addressed envelope, and
      // our OTHER devices — which do receive a real envelope for it — have an
      // empty outbox for anything sent from here.
      //
      // The outbox holds the WHOLE conversation, but only a window of envelopes
      // is loaded. Bound it to the window, or a message we sent long ago would
      // float at the top of the thread, detached, above history that has not
      // been paged in yet. With all history loaded there is no boundary to
      // respect, so everything belongs.
      const oldestLoaded = list.length > 0 ? list[list.length - 1].created_at : undefined;
      const windowStart =
        hasEarlier && oldestLoaded !== undefined ? new Date(oldestLoaded).getTime() : null;
      const own = (await engine.ownMessages(conversationId)).filter(
        (rec) => windowStart === null || new Date(rec.created_at).getTime() >= windowStart,
      );
      for (const rec of own) {
        shown.push({
          key: rec.id,
          mine: true,
          text: rec.text,
          created_at: rec.created_at,
          expires_at: rec.expires_at,
        });
      }
      shown.sort((a, b) => {
        const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (t !== 0) return t;
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });
      setMessages(shown);
      const lastPeer = own[own.length - 1]?.recipient_user_id;
      if (lastPeer !== undefined) setLastSentRecipientId(lastPeer);
    },
    [conversationId, myUserId, hasEarlier, localDeviceId],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const engine = await getEngine();
      const current = await engine.currentDevice();
      if (!active) return;
      setDevice(current ?? "needs-setup");
      if (!current) return;
      // Keep prekeys topped up so peers can always start a session with us.
      void engine.replenishOneTimeKeys().catch(() => {});
    })();
    return () => {
      active = false;
    };
  }, [conversationId]);

  // Decrypt once the device is ready, and again whenever the parent's poll brings
  // a DIFFERENT set of envelopes. Keyed on the ids rather than the array identity
  // (which churns every poll); re-decrypting a seen envelope is a cache read.
  const envelopeIds = envelopes.map((e) => e.id).join(",");
  useEffect(() => {
    if (device === "loading" || device === "needs-setup") return;
    void (async () => {
      await decryptAll(envelopes);
    })();
    // `envelopes` is tracked by envelopeIds — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, envelopeIds, decryptAll]);

  const onSetupReady = useCallback((d: LocalDevice) => {
    // Setting the device re-runs the decrypt effect above.
    setDevice(d);
    void getEngine().then((e) => e.replenishOneTimeKeys().catch(() => {}));
  }, []);

  const onSent = useCallback((id: string, text: string, expiresAt?: string) => {
    setMessages((prev) =>
      // The composer persists the message BEFORE it renders it, so a decryptAll
      // racing the send (a poll landing in that window) can already have picked it
      // up from the outbox. Appending unconditionally would duplicate the React
      // key until the next decrypt — upsert instead.
      prev.some((m) => m.key === id)
        ? prev
        : [
            ...prev,
            {
              key: id,
              mine: true,
              text,
              created_at: new Date().toISOString(),
              expires_at: expiresAt,
            },
          ],
    );
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <LockHeader recipientId={effectiveRecipientId} />

      {device === "loading" ? (
        <div className="flex justify-center py-16">
          <Spinner label="Opening encrypted conversation" />
        </div>
      ) : device === "needs-setup" ? (
        <DeviceSetup onReady={onSetupReady} />
      ) : (
        <>
          <MessageList
            messages={messages}
            onAtBottomChange={onAtBottomChange}
            hasEarlier={hasEarlier}
            loadingEarlier={loadingEarlier}
            earlierError={earlierError}
            onLoadEarlier={onLoadEarlier}
          />
          <Composer
            conversationId={conversationId}
            recipientId={effectiveRecipientId}
            myUserId={myUserId}
            onSent={onSent}
          />
        </>
      )}
    </div>
  );
}

function LockHeader({ recipientId }: { recipientId?: string }) {
  const [showSafety, setShowSafety] = useState(false);
  // The sticky ThreadHeader now carries the "End-to-end encrypted" status line
  // (design §3.7), so this in-body card leads with a plain-language restatement
  // instead of repeating that exact label — it stays the detailed trust explainer
  // (what E2EE does and doesn't protect) plus the safety-numbers affordance.
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-success/25 bg-success/10 p-4">
      <div className="flex items-center gap-2 text-success">
        <LockIcon size={16} />
        <span className="text-sm font-semibold">Only you two can read this</span>
      </div>
      <p className="text-xs text-fg-muted">
        Only you and the people in this conversation can read these messages. The server still sees
        who you talk to and when, and a device added later can&rsquo;t read earlier messages.
      </p>
      <div>
        <button
          type="button"
          onClick={() => setShowSafety((v) => !v)}
          aria-expanded={showSafety}
          className="focus-ring rounded text-xs font-semibold text-success underline transition-opacity hover:opacity-80"
        >
          {showSafety ? "Hide safety numbers" : "View safety numbers"}
        </button>
      </div>
      {showSafety ? <SafetyNumbers recipientId={recipientId} /> : null}
    </div>
  );
}

function SafetyNumbers({ recipientId }: { recipientId?: string }) {
  const [mine, setMine] = useState<DeviceFingerprint | null>(null);
  const [peers, setPeers] = useState<DeviceFingerprint[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const engine = await getEngine();
        const local = await engine.localFingerprint();
        const remote = recipientId ? await engine.peerFingerprints(recipientId) : [];
        if (!active) return;
        setMine(local);
        setPeers(remote);
        setStatus("ready");
      } catch {
        if (active) setStatus("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [recipientId]);

  if (status === "loading") {
    return <p className="text-xs text-fg-muted">Loading safety numbers…</p>;
  }
  if (status === "error") {
    return <p className="text-xs text-danger">Could not load safety numbers.</p>;
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-fg-muted">
        Compare these numbers with the other person over a channel you trust (in person, a call). If
        they match, no one is intercepting. The server could substitute keys for anyone you never
        verify.
      </p>
      {mine ? <FingerprintRow label={`This device (${mine.device_name})`} fp={mine} /> : null}
      {peers.length === 0 ? (
        <p className="text-fg-muted">The other person has no devices yet.</p>
      ) : (
        peers.map((p) => <FingerprintRow key={p.device_id} label={p.device_name} fp={p} />)
      )}
    </div>
  );
}

function FingerprintRow({ label, fp }: { label: string; fp: DeviceFingerprint }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-fg">{label}</span>
      <code className="break-all font-mono text-[11px] text-fg-muted">
        {formatSafetyNumber(fp.fingerprint)}
      </code>
    </div>
  );
}

// Within this many px of the bottom → keep sticking to it (matches the plaintext
// timeline's STICK_THRESHOLD).
const STICK_THRESHOLD = 120;

// The encrypted view does not own its scroll container — ConversationView wraps
// the whole thread (lock header, list, composer) in one scroller — so walk up to
// find it rather than introducing a second, competing scroll area.
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

function MessageList({
  messages,
  onAtBottomChange,
  hasEarlier = false,
  loadingEarlier = false,
  earlierError = null,
  onLoadEarlier,
}: {
  messages: ShownMessage[];
  onAtBottomChange?: (atBottom: boolean) => void;
  hasEarlier?: boolean;
  loadingEarlier?: boolean;
  earlierError?: string | null;
  onLoadEarlier?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const stickRef = useRef(true);
  const initializedRef = useRef(false);
  const prevLenRef = useRef(0);
  const prevFirstKeyRef = useRef("");
  const prevLastKeyRef = useRef("");
  // Distance from the bottom captured when the reader asks for older history, so
  // the prepended page can be anchored to where they were.
  const anchorRef = useRef<number | null>(null);
  const hasMessages = messages.length > 0;

  // Track whether the reader is near the bottom. Inbound messages arrive on a 10s
  // poll, so auto-scrolling unconditionally would yank anyone who has scrolled up
  // to read history — the same rule MessageTimeline applies to plaintext. Re-runs
  // when the list stops being empty, which is when the sentinel (and so the
  // scroll container) first exists.
  useEffect(() => {
    if (!hasMessages) return;
    const el = scrollParentOf(bottomRef.current);
    scrollerRef.current = el;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
      stickRef.current = atBottom;
      onAtBottomChange?.(atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMessages, onAtBottomChange]);

  function requestEarlier() {
    const el = scrollerRef.current;
    anchorRef.current = el ? el.scrollHeight - el.scrollTop : null;
    onLoadEarlier?.();
  }

  useLayoutEffect(() => {
    const len = messages.length;
    const grew = len > prevLenRef.current;
    const firstKey = len > 0 ? messages[0].key : "";
    const lastKey = len > 0 ? messages[len - 1].key : "";
    const prevFirst = prevFirstKeyRef.current;
    const prevLast = prevLastKeyRef.current;
    prevLenRef.current = len;
    prevFirstKeyRef.current = firstKey;
    prevLastKeyRef.current = lastKey;

    if (!initializedRef.current) {
      // Open pinned to the newest message.
      if (len === 0) return;
      initializedRef.current = true;
      anchorRef.current = null;
      onAtBottomChange?.(true);
      bottomRef.current?.scrollIntoView({ block: "end" });
      return;
    }

    // A message the reader just SENT brings them back to the bottom; anything
    // else only does so while they are already near it. It must have GROWN: a
    // list that merely shrank — the newest message disappearing on its timer —
    // can leave one of ours last without anything having been sent.
    const sentByReader = grew && lastKey !== prevLast && messages[len - 1].mine;
    const anchor = anchorRef.current;

    if (grew && firstKey !== prevFirst && anchor !== null) {
      // A page of older history landed ABOVE the reader. Hold their place:
      // without this the viewport keeps its scrollTop and the content they were
      // reading jumps away.
      anchorRef.current = null;
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight - anchor;
      // A poll (or a send) can land in the SAME React batch as that page.
      // Staying put is right for everything except the reader's own message.
      if (!sentByReader) return;
    } else if (anchor !== null && !loadingEarlier) {
      // The request it was captured for has settled without prepending anything
      // (an empty page, or a failure). Drop it so a stale measurement can never
      // shift some later, unrelated update.
      anchorRef.current = null;
    }

    if (!stickRef.current && !sentByReader) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, onAtBottomChange, loadingEarlier]);

  const earlierControl = hasEarlier ? (
    <div className="flex flex-col items-center gap-1.5">
      {earlierError ? (
        <p role="alert" className="text-xs text-danger">
          {earlierError}
        </p>
      ) : null}
      <button
        type="button"
        disabled={loadingEarlier}
        onClick={requestEarlier}
        className="focus-ring rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
      >
        {loadingEarlier ? "Loading earlier messages…" : "Show earlier messages"}
      </button>
    </div>
  ) : null;

  if (messages.length === 0) {
    // The loaded window can be empty while history still exists behind it — a
    // disappearing-message thread whose whole recent page has expired. The pager
    // has to render here too, or that history is unreachable precisely where it
    // is most likely to be wanted.
    return (
      <>
        {earlierControl}
        <p className="py-8 text-center text-sm text-fg-muted">
          {hasEarlier
            ? "Nothing in this part of the conversation is still available."
            : "No messages yet. Encrypted messages you send will appear here."}
        </p>
      </>
    );
  }

  return (
    <>
      {earlierControl}
      <ul className="flex flex-col gap-2.5">
      {messages.map((m) => (
        <li key={m.key} className={"flex " + (m.mine ? "justify-end" : "justify-start")}>
          <div
            className={
              "max-w-[78%] rounded-[18px] px-3.5 py-2.5 text-[14.5px] leading-normal " +
              (m.text === null
                ? "border border-dashed border-border bg-transparent text-fg-muted"
                : m.mine
                  ? "rounded-br-md bg-accent text-accent-fg"
                  : "rounded-bl-md bg-surface-muted text-fg")
            }
          >
            {m.text === null ? (
              <p className="flex items-center gap-1 italic">
                <LockIcon size={12} />
                Message can&rsquo;t be decrypted on this device
              </p>
            ) : (
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
            )}
            <span
              className={
                "mt-1 block text-right text-[10px] " +
                (m.mine && m.text !== null ? "text-accent-fg/70" : "text-fg-muted")
              }
            >
              {relativeTime(m.created_at)}
              {m.expires_at ? " · disappears" : ""}
            </span>
          </div>
        </li>
      ))}
        <div ref={bottomRef} />
      </ul>
    </>
  );
}

// PartialDeliveryNotice reports a send that reached only some of the devices in
// this conversation — a device whose one-time keys are exhausted and that we
// have no session with cannot be encrypted for, and will never receive the
// message. The count spans every device the fan-out targets: the recipient's AND
// the sender's own other devices, which is why the copy does not say "theirs".
// The send itself succeeded, so the tone is a warning, not a failure, and it is
// dismissible: the reader has been told, and the next send replaces it.
function PartialDeliveryNotice({
  reached,
  total,
  onDismiss,
}: {
  reached: number;
  total: number;
  onDismiss: () => void;
}) {
  const missed = total - reached;
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-xl bg-warning/15 px-3.5 py-2.5 text-sm text-warning"
    >
      <p>
        Encrypted for {reached} of {total} devices in this conversation.{" "}
        {missed === 1 ? "One device has" : `${missed} devices have`} no unused keys left, so{" "}
        {missed === 1 ? "it won’t" : "they won’t"} receive this message.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="focus-ring shrink-0 rounded font-semibold underline transition-opacity hover:opacity-80"
      >
        Dismiss
      </button>
    </div>
  );
}

function Composer({
  conversationId,
  recipientId,
  myUserId,
  onSent,
}: {
  conversationId: string;
  recipientId?: string;
  myUserId: string;
  onSent: (id: string, text: string, expiresAt?: string) => void;
}) {
  const [body, setBody] = useState(() => readEncryptedDraft(conversationId) ?? "");
  const [timer, setTimer] = useState<DisappearingOption>("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the last send reached only SOME of the devices it fanned out to
  // (the recipient's plus our own other ones). The send itself succeeded, so this
  // is a notice, not an error — but staying quiet about it would let a sender
  // believe a device that got nothing can read the message.
  const [partial, setPartial] = useState<{ reached: number; total: number } | null>(null);

  // This composer mounts only after the local E2EE device is ready. Its state
  // initializer reads the process-memory draft; discard it only after React has
  // committed the composer so a render retry cannot lose the handoff.
  useEffect(() => {
    discardEncryptedDraft(conversationId);
  }, [conversationId]);

  if (!recipientId) {
    return (
      <EmptyState
        title="Waiting for the other device"
        message="You can send an encrypted message once the other person has set up a device."
      />
    );
  }

  async function submit() {
    const trimmed = body.trim();
    if (trimmed === "") return;
    setBusy(true);
    setError(null);
    setPartial(null);
    try {
      const engine = await getEngine();
      const { sender_device_id, envelopes, skipped } = await engine.encryptMessage(
        recipientId!,
        myUserId,
        trimmed,
      );
      if (envelopes.length === 0) {
        setError("The other person has no devices that can receive this yet.");
        setBusy(false);
        return;
      }
      const expires = expiresInSeconds(timer);
      const res = await api.sendEncryptedMessage(conversationId, {
        sender_device_id,
        envelopes,
        ...(expires !== undefined ? { expires_in_seconds: expires } : {}),
      });
      // Record what we sent BEFORE showing it: no envelope was addressed to this
      // device and the server returns a sender none of its own, so this record is
      // the only thing that survives a reload. A storage failure must not report
      // the (accepted) send as failed — the bubble just won't outlive the tab.
      const id = newMessageId();
      await engine
        .recordOwnMessage({
          id,
          conversationId,
          text: trimmed,
          created_at: res.created_at || new Date().toISOString(),
          ...(res.expires_at !== undefined ? { expires_at: res.expires_at } : {}),
          recipient_user_id: recipientId!,
        })
        .catch(() => {});
      onSent(id, trimmed, res.expires_at);
      setBody("");
      // Only after the send is accepted: a device we could not encrypt for gets
      // nothing, ever, and the sender is the only one who can know.
      if (skipped.length > 0) {
        setPartial({ reached: envelopes.length, total: envelopes.length + skipped.length });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You can't message this user.");
      } else {
        setError(errorMessage(err, "Could not send your encrypted message."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {partial ? (
        <PartialDeliveryNotice
          reached={partial.reached}
          total={partial.total}
          onDismiss={() => setPartial(null)}
        />
      ) : null}
      <textarea
        aria-label="Write an encrypted message"
        placeholder="Write an encrypted message…"
        rows={2}
        maxLength={MAX_MESSAGE_LEN}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="focus-ring w-full resize-none rounded-[22px] bg-surface-muted px-4 py-2.5 text-[14.5px] text-fg placeholder:text-fg-muted"
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          Disappearing
          <select
            aria-label="Disappearing messages timer"
            value={timer}
            onChange={(e) => setTimer(e.target.value as DisappearingOption)}
            className="focus-ring rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs text-fg"
          >
            {DISAPPEARING_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || body.trim() === ""}
          className="focus-ring rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
