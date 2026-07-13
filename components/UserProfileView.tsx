"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import {
  ApiError,
  api,
  channelAvatarUrl,
  userAvatarUrl,
  userBannerUrl,
} from "@/lib/api";
import type { Channel, PublicUserProfile } from "@/lib/api";
import { formatCount, formatMonthYear } from "@/lib/format";

export function UserProfileLoader({ username }: { username: string }) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "notfound" | "error" | "ready">("loading");

  useEffect(() => {
    const controller = new AbortController();
    api.getUserProfile(username, controller.signal)
      .then((value) => {
        setProfile(value);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
      });
    return () => controller.abort();
  }, [username]);

  if (status === "loading") return <div className="flex justify-center py-24"><Spinner label="Loading profile" /></div>;
  if (status === "notfound") return <EmptyState title="Profile not found" message="This profile is private or does not exist." />;
  if (status === "error" || !profile) return <ErrorState message="Could not load this profile." />;
  return <UserProfileView profile={profile} />;
}

export function UserProfileView({ profile }: { profile: PublicUserProfile }) {
  const name = profile.display_name || profile.username;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          <div aria-hidden="true" className="h-[150px] w-full overflow-hidden rounded-2xl bg-surface-muted sm:h-[190px]">
            {profile.has_banner ? (
              // eslint-disable-next-line @next/next/no-img-element -- API-served user image
              <img src={userBannerUrl(profile.id)} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="-mt-9 flex flex-wrap items-end gap-x-4 gap-y-3 px-2 sm:-mt-10 sm:flex-nowrap sm:gap-5 sm:px-4">
            <Avatar
              src={profile.has_avatar ? userAvatarUrl(profile.id) : null}
              name={name}
              className="relative z-[1] h-18 w-18 shrink-0 border-[3px] border-canvas text-[26px] shadow-md sm:h-26 sm:w-26 sm:border-4 sm:text-[38px]"
            />
            <div className="order-last w-full min-w-0 pb-1 sm:order-none sm:w-auto sm:flex-1">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{name}</h1>
              <p className="mt-0.5 text-[13px] text-fg-muted">
                @{profile.username} · {profile.channels.length} {profile.channels.length === 1 ? "channel" : "channels"}
              </p>
            </div>
          </div>
        </div>
        {profile.bio ? <p className="whitespace-pre-wrap px-2 text-sm leading-relaxed text-fg-muted sm:max-w-[640px] sm:px-4">{profile.bio}</p> : null}
      </header>

      <Tabs
        label="Profile sections"
        tabs={[
          {
            id: "channels",
            label: "Channels",
            panel: profile.channels.length === 0
              ? <EmptyState title="No channels yet" message="This user has not created a publishing channel." />
              : <ul aria-label={`Channels by ${name}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{profile.channels.map((channel) => <li key={channel.id}><ProfileChannelCard channel={channel} /></li>)}</ul>,
          },
          {
            id: "about",
            label: "About",
            panel: (
              <dl className="max-w-2xl divide-y divide-border-subtle overflow-hidden rounded-[14px] bg-surface-muted">
                <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-sm text-fg-muted">Joined</dt><dd className="text-sm font-semibold text-fg">{formatMonthYear(profile.created_at)}</dd></div>
                <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-sm text-fg-muted">Channels</dt><dd className="text-sm font-semibold tabular-nums text-fg">{profile.channels.length}</dd></div>
              </dl>
            ),
          },
        ]}
      />
    </div>
  );
}

function ProfileChannelCard({ channel }: { channel: Channel }) {
  const name = channel.display_name || channel.handle;
  return (
    <Link href={`/channels/${encodeURIComponent(channel.handle)}`} className="focus-ring flex h-full gap-3 rounded-2xl bg-surface-muted p-4 transition-colors hover:bg-surface-strong">
      <Avatar src={channel.has_avatar ? channelAvatarUrl(channel.handle) : null} name={name} className="h-12 w-12 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-fg">{name}</span>
        <span className="block truncate text-[13px] text-fg-muted">@{channel.handle}</span>
        <span className="mt-1 block text-xs text-fg-muted">{formatCount(channel.follower_count)} followers</span>
      </span>
    </Link>
  );
}
