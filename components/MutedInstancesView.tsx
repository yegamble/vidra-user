"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { MutedInstance } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// MutedInstancesView lists the federated instances the signed-in user has muted
// (their videos/comments are hidden from the user's feeds and search) and lets
// them unmute. Muting happens from a remote video's watch page ("Mute
// instance"); this is the management surface. The session lives in memory, so
// a hard reload lands here signed out — we show a sign-in prompt rather than
// fetching a 401.
export function MutedInstancesView() {
  const { status, user } = useSession();

  if (status === "anon" || !user) {
    return (
      <EmptyState
        title="Sign in to manage muted instances"
        message={
          <>
            Your session has ended.{" "}
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            to see the instances you have muted.
          </>
        }
      />
    );
  }

  return <InstanceMuteList />;
}

function InstanceMuteList() {
  const [status, setStatus] = useState<Status>("loading");
  const [instances, setInstances] = useState<MutedInstance[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMutedInstances({ limit: 100 }, controller.signal)
      .then((res) => {
        setInstances(res.instances);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const onUnmuted = useCallback((domain: string) => {
    setInstances((prev) => prev.filter((i) => i.domain !== domain));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading muted instances" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your muted instances." onRetry={retry} />;
  }
  if (instances.length === 0) {
    return (
      <EmptyState
        title="No muted instances"
        message="Mute a federated instance from one of its videos and it will appear here. Content from muted instances is hidden from you."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {instances.map((instance) => (
        <li key={instance.domain}>
          <MutedInstanceRow instance={instance} onUnmuted={onUnmuted} />
        </li>
      ))}
    </ul>
  );
}

function MutedInstanceRow({
  instance,
  onUnmuted,
}: {
  instance: MutedInstance;
  onUnmuted: (domain: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unmute() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.unmuteInstance(instance.domain);
      onUnmuted(instance.domain);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not unmute this instance.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {instance.domain}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          muted {relativeTime(instance.muted_at)}
        </p>
        {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label={`Unmute ${instance.domain}`}
        onClick={() => void unmute()}
        className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        Unmute
      </button>
    </div>
  );
}
