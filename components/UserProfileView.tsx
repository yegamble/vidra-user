"use client";

import { useEffect, useState } from "react";

import { ChannelResultCard } from "@/components/EntityResultCard";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, userAvatarUrl, userBannerUrl } from "@/lib/api";
import type { PublicUserProfile } from "@/lib/api";
import { formatMonthYear } from "@/lib/format";

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

type ProfileSection = "channels" | "about";

export function UserProfileView({ profile }: { profile: PublicUserProfile }) {
  const name = profile.display_name || profile.username;
  const [section, setSection] = useState<ProfileSection>("channels");
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          {/* Apple Music-style banner: the profile image when set, a soft
              monochrome gradient otherwise — the avatar always overlaps an
              elevated surface. */}
          <div aria-hidden="true" className="h-[160px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-surface-strong via-surface-muted to-surface-muted sm:h-[220px]">
            {profile.has_banner ? (
              // eslint-disable-next-line @next/next/no-img-element -- API-served user image
              <img src={userBannerUrl(profile.id)} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="-mt-12 flex flex-wrap items-end gap-x-4 gap-y-3 px-2 sm:flex-nowrap sm:gap-5 sm:px-4">
            <Avatar
              src={profile.has_avatar ? userAvatarUrl(profile.id) : null}
              name={name}
              className="relative z-[1] h-24 w-24 shrink-0 border-4 border-canvas text-[36px] shadow-soft"
            />
            <div className="order-last w-full min-w-0 pb-1 sm:order-none sm:w-auto sm:flex-1">
              <h1 className="text-title sm:text-large-title">{name}</h1>
              <p className="mt-1 text-subhead tabular-nums text-fg-muted">
                @{profile.username} · {profile.channels.length} {profile.channels.length === 1 ? "channel" : "channels"}
              </p>
            </div>
          </div>
        </div>
        {profile.bio ? <p className="whitespace-pre-wrap px-2 text-subhead leading-relaxed text-fg-muted sm:max-w-[640px] sm:px-4">{profile.bio}</p> : null}
      </header>

      {/* Section switcher in the segmented-control language (not a tab strip);
          the panel below swaps with the selected section. */}
      <div className="flex flex-col gap-5">
        <SegmentedControl
          label="Profile sections"
          value={section}
          onChange={setSection}
          options={[
            { value: "channels", label: "Channels" },
            { value: "about", label: "About" },
          ]}
        />
        {section === "channels" ? (
          profile.channels.length === 0 ? (
            <EmptyState title="No channels yet" message="This user has not created a publishing channel." />
          ) : (
            <ul aria-label={`Channels by ${name}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {profile.channels.map((channel) => (
                <li key={channel.id}>
                  <ChannelResultCard channel={channel} />
                </li>
              ))}
            </ul>
          )
        ) : (
          <dl className="max-w-2xl divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
            <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-subhead text-fg-muted">Joined</dt><dd className="text-subhead font-semibold text-fg">{formatMonthYear(profile.created_at)}</dd></div>
            <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-subhead text-fg-muted">Channels</dt><dd className="text-subhead font-semibold tabular-nums text-fg">{profile.channels.length}</dd></div>
            {profile.bluesky_handle ? (
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-subhead text-fg-muted">Bluesky</dt>
                <dd className="min-w-0 truncate text-subhead font-semibold text-fg">
                  <a
                    href={`https://bsky.app/profile/${encodeURIComponent(profile.bluesky_handle)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring rounded-sm text-accent underline underline-offset-2 hover:opacity-80"
                  >
                    @{profile.bluesky_handle}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </div>
    </div>
  );
}
