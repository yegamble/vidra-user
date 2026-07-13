import { notFound } from "next/navigation";

import { UserProfileLoader, UserProfileView } from "@/components/UserProfileView";
import { getPublicUserProfile } from "@/lib/profile.server";

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  if (query.preview === "1") {
    return <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-4 sm:pt-6"><UserProfileLoader username={username} /></main>;
  }
  const profile = await getPublicUserProfile(username);
  if (!profile) notFound();
  return <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-4 sm:pt-6"><UserProfileView profile={profile} /></main>;
}
