"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { LinkButton } from "@/components/ui/LinkButton";
import { api } from "@/lib/api";
import { readRemoteSearchResults, type RemoteSearchActor } from "@/lib/remote-search";
import { useApiResource } from "@/lib/use-api-resource";
import { useAsyncAction } from "@/lib/use-async-action";

// RemoteInteractionView is the target of /remote-interaction?uri= — where
// another fediverse server sends ITS users to follow or open content from
// their account here. A signed-in viewer's uri is resolved through the same
// remote-URI lookup search uses; a video goes to its remote watch page and a
// channel/account gets a Follow button. Anonymous visitors are asked to sign
// in and then returned to this exact URL.
export function RemoteInteractionView({ uri }: { uri: string | null }) {
  const { status } = useSession();
  if (!uri) {
    return (
      <EmptyState title="This link is missing or invalid" message="Go back to the other server and try again." />
    );
  }
  if (status === "restoring") {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Loading" />
      </div>
    );
  }
  if (status !== "authed") {
    const returnTo = `/remote-interaction?uri=${encodeURIComponent(uri)}`;
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-title">Sign in to continue</h1>
        <p className="text-sm text-fg-muted">
          Sign in to this server to follow or open that content from your account here.
        </p>
        <LinkButton href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Sign in</LinkButton>
      </div>
    );
  }
  return <ResolvedTarget uri={uri} />;
}

function ResolvedTarget({ uri }: { uri: string }) {
  const router = useRouter();
  const { status, data, retry } = useApiResource(
    (signal) => api.lookupRemoteUri(uri, signal).then(readRemoteSearchResults),
    [uri],
  );
  const hit = data?.[0] ?? null;
  const videoId = hit?.type === "video" ? hit.video.id : null;

  useEffect(() => {
    if (videoId) router.replace(`/remote/${videoId}`);
  }, [videoId, router]);

  if (status === "loading" || videoId) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Looking this up" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not look this up." onRetry={retry} />;
  }
  if (!hit || hit.type === "video") {
    return (
      <EmptyState
        title="We couldn’t find that here"
        message="The address may be wrong, the other server may be offline, or this instance may not allow looking up remote content."
      />
    );
  }
  return <FollowActor actor={hit.actor} kind={hit.type} />;
}

function FollowActor({ actor, kind }: { actor: RemoteSearchActor; kind: string }) {
  const [sent, setSent] = useState(false);
  const { run, busy, error } = useAsyncAction(async () => {
    await api.createRemoteFollow({ actor_url: actor.actor_url });
    setSent(true);
  }, "Could not follow this " + kind + ".");
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <h1 className="text-title">Follow {kind === "channel" ? "this channel" : "this account"}</h1>
      <p className="text-sm text-fg-muted">
        <span className="font-semibold text-fg">{actor.handle}</span> on {actor.domain}
      </p>
      {sent ? (
        <p role="status" className="text-sm text-fg-muted">
          Follow request sent. New videos will appear in your subscriptions once it is accepted.
        </p>
      ) : (
        <Button disabled={busy} onClick={() => void run()}>
          {busy ? "Following…" : "Follow"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
