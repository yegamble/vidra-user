"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DeviceSetup } from "@/components/e2ee/DeviceSetup";
import { LockIcon } from "@/components/e2ee/LockIcon";
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
import { relativeTime } from "@/lib/format";

const MAX_MESSAGE_LEN = 5000;

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
export function EncryptedThreadView({
  conversationId,
  initialEnvelopes,
  recipientId,
  myUserId,
}: {
  conversationId: string;
  initialEnvelopes: EncryptedMessage[];
  recipientId?: string;
  myUserId: string;
}) {
  const [device, setDevice] = useState<DeviceState>("loading");
  const [messages, setMessages] = useState<ShownMessage[]>([]);

  // The peer to fan out to: the ?to hint, else inferred from an inbound envelope.
  const effectiveRecipientId =
    recipientId ?? initialEnvelopes.find((e) => e.sender_user_id !== myUserId)?.sender_user_id;

  const decryptAll = useCallback(
    async (envelopes: EncryptedMessage[]) => {
      const engine = await getEngine();
      // API returns newest-first; render oldest→newest.
      const ordered = [...envelopes].reverse();
      const shown: ShownMessage[] = [];
      for (const env of ordered) {
        let text: string | null;
        try {
          text = await engine.decryptEnvelope(env);
        } catch {
          text = null; // undecryptable on this device
        }
        shown.push({
          key: env.id,
          mine: env.sender_user_id === myUserId,
          text,
          created_at: env.created_at,
          expires_at: env.expires_at,
        });
      }
      setMessages(shown);
    },
    [myUserId],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const engine = await getEngine();
      const current = await engine.currentDevice();
      if (!active) return;
      if (!current) {
        setDevice("needs-setup");
        return;
      }
      setDevice(current);
      await decryptAll(initialEnvelopes);
      // Keep prekeys topped up so peers can always start a session with us.
      void engine.replenishOneTimeKeys().catch(() => {});
    })();
    return () => {
      active = false;
    };
    // initialEnvelopes is a stable snapshot from the parent's single load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const onSetupReady = useCallback(
    (d: LocalDevice) => {
      setDevice(d);
      void decryptAll(initialEnvelopes);
      void getEngine().then((e) => e.replenishOneTimeKeys().catch(() => {}));
    },
    [decryptAll, initialEnvelopes],
  );

  const onSent = useCallback((text: string, expiresAt?: string) => {
    setMessages((prev) => [
      ...prev,
      { key: `local-${Date.now()}`, mine: true, text, created_at: new Date().toISOString(), expires_at: expiresAt },
    ]);
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
          <MessageList messages={messages} />
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
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
        <LockIcon className="h-4 w-4" />
        <span className="text-sm font-semibold">End-to-end encrypted</span>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Only you and the people in this conversation can read these messages. The server still sees
        who you talk to and when, and a device added later can&rsquo;t read earlier messages.
      </p>
      <div>
        <button
          type="button"
          onClick={() => setShowSafety((v) => !v)}
          aria-expanded={showSafety}
          className="text-xs font-medium text-emerald-800 underline hover:text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-emerald-300"
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
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading safety numbers…</p>;
  }
  if (status === "error") {
    return (
      <p className="text-xs text-red-600 dark:text-red-400">Could not load safety numbers.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-zinc-600 dark:text-zinc-400">
        Compare these numbers with the other person over a channel you trust (in person, a call). If
        they match, no one is intercepting. The server could substitute keys for anyone you never
        verify.
      </p>
      {mine ? <FingerprintRow label={`This device (${mine.device_name})`} fp={mine} /> : null}
      {peers.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">The other person has no devices yet.</p>
      ) : (
        peers.map((p) => <FingerprintRow key={p.device_id} label={p.device_name} fp={p} />)
      )}
    </div>
  );
}

function FingerprintRow({ label, fp }: { label: string; fp: DeviceFingerprint }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <code className="break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
        {formatSafetyNumber(fp.fingerprint)}
      </code>
    </div>
  );
}

function MessageList({ messages }: { messages: ShownMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No messages yet. Encrypted messages you send will appear here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m) => (
        <li key={m.key} className={"flex " + (m.mine ? "justify-end" : "justify-start")}>
          <div
            className={
              "max-w-[75%] rounded-2xl px-3 py-2 text-sm " +
              (m.text === null
                ? "border border-dashed border-zinc-300 bg-transparent text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                : m.mine
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100")
            }
          >
            {m.text === null ? (
              <p className="flex items-center gap-1 italic">
                <LockIcon className="h-3 w-3" />
                Message can&rsquo;t be decrypted on this device
              </p>
            ) : (
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
            )}
            <span
              className={
                "mt-1 block text-right text-[10px] " +
                (m.mine && m.text !== null
                  ? "text-zinc-300 dark:text-zinc-500"
                  : "text-zinc-500 dark:text-zinc-400")
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
  onSent: (text: string, expiresAt?: string) => void;
}) {
  const [body, setBody] = useState("");
  const [timer, setTimer] = useState<DisappearingOption>("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const engine = await getEngine();
      const { sender_device_id, envelopes } = await engine.encryptMessage(
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
      onSent(trimmed, res.expires_at);
      setBody("");
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
      <textarea
        aria-label="Write an encrypted message"
        placeholder="Write an encrypted message…"
        rows={2}
        maxLength={MAX_MESSAGE_LEN}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          Disappearing
          <select
            aria-label="Disappearing messages timer"
            value={timer}
            onChange={(e) => setTimer(e.target.value as DisappearingOption)}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
