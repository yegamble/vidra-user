"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ServerIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { MutedInstance } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
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
            <Link href="/login" className="focus-ring rounded-sm font-semibold text-fg underline underline-offset-2">
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
      .getMutedInstances({ limit: FULL_LIST_LIMIT }, controller.signal)
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
        icon={<ServerIcon size={24} />}
        tint="indigo"
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
      setError(errorMessage(err, "Could not unmute this instance."));
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg">
          {instance.domain}
        </p>
        <p className="text-[13px] text-fg-muted">
          muted {relativeTime(instance.muted_at)}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label={`Unmute ${instance.domain}`}
        onClick={() => void unmute()}
        className="focus-ring shrink-0 rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-strong disabled:opacity-60"
      >
        Unmute
      </button>
    </div>
  );
}
