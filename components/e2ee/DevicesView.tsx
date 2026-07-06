"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { LockIcon } from "@/components/e2ee/LockIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { E2EEDevice } from "@/lib/api";
import { getEngine } from "@/lib/e2ee/engine";
import { formatSafetyNumber } from "@/lib/e2ee/envelope";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// DevicesView lists the caller's registered E2EE devices and lets them remove
// one. The backend contract has no rename, so devices are list + delete only.
// Deleting a device cascades its stored envelopes (both directions) — honest
// copy makes clear that is irreversible and drops history that device held.
export function DevicesView() {
  const { status, user } = useSession();

  if (status === "restoring") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your account" />
      </div>
    );
  }

  if (status === "anon" || !user) {
    return (
      <EmptyState
        title="Sign in to manage your devices"
        message={
          <>
            Your session has ended.{" "}
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            to manage the devices that can read your encrypted messages.
          </>
        }
      />
    );
  }

  return <DeviceList />;
}

function DeviceList() {
  const [status, setStatus] = useState<Status>("loading");
  const [devices, setDevices] = useState<E2EEDevice[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    api
      .listMyE2EEDevices(controller.signal)
      .then(async (res) => {
        if (!active) return;
        setDevices(res.devices);
        setStatus("ready");
        // Best-effort: highlight the device set up on THIS browser.
        try {
          const engine = await getEngine();
          const current = await engine.currentDevice();
          if (active) setCurrentId(current?.device_id ?? null);
        } catch {
          // Non-fatal — the list still renders without a "this device" badge.
        }
      })
      .catch(() => {
        if (controller.signal.aborted || !active) return;
        setStatus("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const onDeleted = useCallback(
    async (id: string) => {
      setDevices((prev) => prev.filter((d) => d.id !== id));
      if (id === currentId) {
        setCurrentId(null);
        try {
          const engine = await getEngine();
          await engine.forgetDevice();
        } catch {
          // Non-fatal — the backend row is already gone.
        }
      }
    },
    [currentId],
  );

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading your devices" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your devices." onRetry={retry} />;
  }
  if (devices.length === 0) {
    return (
      <EmptyState
        title="No encrypted-messaging devices"
        message="Devices appear here the first time you use encrypted messaging on a browser."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {devices.map((device) => (
        <li key={device.id}>
          <DeviceRow
            device={device}
            isCurrent={device.id === currentId}
            onDeleted={onDeleted}
          />
        </li>
      ))}
    </ul>
  );
}

function DeviceRow({
  device,
  isCurrent,
  onDeleted,
}: {
  device: E2EEDevice;
  isCurrent: boolean;
  onDeleted: (id: string) => void | Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteE2EEDevice(device.id);
      await onDeleted(device.id);
    } catch (err) {
      setError(errorMessage(err, "Could not remove this device."));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            <span className="text-emerald-600 dark:text-emerald-400">
              <LockIcon />
            </span>
            {device.device_name}
            {isCurrent ? (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                This device
              </span>
            ) : null}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Added {relativeTime(device.created_at)}
          </p>
        </div>
        {armed ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60"
            >
              {busy ? "Removing…" : "Confirm remove"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setArmed(false)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Remove device ${device.device_name}`}
            onClick={() => setArmed(true)}
            className="shrink-0 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            Remove
          </button>
        )}
      </div>
      {armed ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Removing a device permanently deletes the encrypted messages stored for it — it can no
          longer read this or future conversations. This cannot be undone.
        </p>
      ) : null}
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          Safety number
        </span>
        <code className="break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
          {formatSafetyNumber(device.signing_key)}
        </code>
      </div>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
