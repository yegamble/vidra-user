import { expect, test, type APIRequestContext } from "@playwright/test";

import { API_URL, registerUser, seedPublishedChannel } from "./fixtures";

// Proves the "Continue watching" server-side filter (Wave A3 + C5) against a real
// vidra-core + PostgreSQL: GET /me/history?progress=in_progress narrows the list
// to the resume-worthy subset, and the home "Continue watching" shelf is driven by
// it.
//
// FIXTURE NOTE: the shared upload sample is ~4s, and the in_progress floor is
// position_seconds >= 5, so a seeded video can never be an IN-progress entry here
// — it is a clean EXCLUDED case. That is exactly what this asserts end to end (the
// filtered read drops it while the full history keeps it, and the home shelf does
// not surface it). The positive "~50% still resumes" case is covered by the
// vidra-core store/handler tests and the frontend unit tests
// (components/HomeShelves.test.tsx, lib/resume-progress.test.ts), which can pin a
// long-duration position the tiny sample cannot express.
//
// WRITE-ONLY in this loop (npm run e2e:backed), never part of `npm run ci`.

async function historyIds(
  request: APIRequestContext,
  token: string,
  progress?: "in_progress",
): Promise<string[]> {
  const url = new URL(`${API_URL}/api/v1/me/history`);
  url.searchParams.set("limit", "50");
  if (progress) url.searchParams.set("progress", progress);
  const res = await request.get(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as { videos?: Array<{ id: string }> };
  return (body.videos ?? []).map((v) => v.id);
}

test("the in_progress filter narrows history and drives the Continue-watching shelf", async ({
  page,
  request,
}) => {
  const { videoId } = await seedPublishedChannel(request);
  const viewer = await registerUser(request, "cw");

  // Record a resume position for the viewer via the API. The sample is ~4s, so
  // this position can never satisfy the in_progress floor (>=5s) — a clean
  // "excluded" case for the server filter.
  const rec = await request.put(`${API_URL}/api/v1/videos/${videoId}/watch-progress`, {
    headers: { Authorization: `Bearer ${viewer.token}` },
    data: { position_seconds: 3 },
  });
  expect(rec.ok(), `record watch-progress ${rec.status()}`).toBeTruthy();

  // API proof: the FULL history includes the entry, the in_progress subset omits
  // it — the `progress` param demonstrably changes the result set server-side.
  await expect.poll(() => historyIds(request, viewer.token)).toContain(videoId);
  expect(await historyIds(request, viewer.token, "in_progress")).not.toContain(videoId);

  // UI: signed in as the viewer, the home page's "Continue watching" shelf does
  // NOT surface the ineligible entry (the shelf is driven by the in_progress
  // fetch; with no other history/following the band renders nothing).
  await page.goto("/login");
  await page.getByLabel("Email").fill(viewer.email);
  await page.getByLabel("Password").fill("supersecret-e2e");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();

  // Fresh load of home restores the session from its httpOnly cookie (avoids the
  // deferred post-login router.push race). The authed shelf then fetches with
  // progress=in_progress; with no eligible entry the "Continue watching" shelf
  // never renders.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Continue watching" })).toHaveCount(0);
});
