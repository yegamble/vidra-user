import { expect, test, type APIRequestContext } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL, adminToken } from "./fixtures";

// "Import from PeerTube" dry-run against a real vidra-core with a real, read-only
// PeerTube source configured.
//
// GATED: CI has NO PeerTube source to import from, and configuring one requires a
// second (read-only) PeerTube database + media store that the standard backed
// stack (frontend-e2e-backed.yml / the local compose profile in .ralph/AGENT.md)
// does not provision. So this spec only runs when the runner has booted a backend
// with a PeerTube source wired in AND sets E2E_PEERTUBE_SOURCE=true, e.g.:
//
//   # boot vidra-core with PEERTUBE_IMPORT_SOURCE_* (source DSN + media store) set,
//   # then:
//   E2E_PEERTUBE_SOURCE=true E2E_API_URL=http://localhost:8088 \
//     npm run e2e:backed -- peertube-import
//
// The UI only TRIGGERS and MONITORS the import — the source connection lives in
// server config, so NO source DB credentials are ever entered in the browser. This
// spec proves the launch→poll→report round trip against the real import worker and
// confirms the run is durably recorded (visible via the admin API read).
test.skip(
  process.env.E2E_PEERTUBE_SOURCE !== "true",
  "requires a backend booted with a read-only PeerTube source configured (set E2E_PEERTUBE_SOURCE=true)",
);

type BackedRun = {
  id: string;
  mode: string;
  state: string;
  report?: { dry_run: boolean; entities: Record<string, unknown> };
};

async function listRuns(request: APIRequestContext, token: string): Promise<BackedRun[]> {
  const res = await request.get(`${API_URL}/api/v1/admin/peertube-import`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return ((await res.json()) as { runs: BackedRun[] }).runs;
}

test("an admin previews a real PeerTube source with a dry run", async ({ page, request }) => {
  // Sign in as the deterministic admin through the UI (in-memory session).
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Open the Import page (client-side nav keeps the session).
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Import", exact: true }).click();

  // No credential form — the source connection comes from server config.
  await expect(
    page.getByText("Vidra never asks for or accepts your PeerTube database or storage credentials"),
  ).toBeVisible();
  expect(await page.locator('input[type="password"]').count()).toBe(0);

  // Launch a dry run — writes nothing, just reports the plan.
  await page.getByRole("button", { name: "Preview (dry run)" }).click();

  // The real worker finishes the analysis and the plan report renders (poll may
  // take a few seconds against a real source).
  await expect(page.getByRole("heading", { name: "Dry run preview" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText("This plan was computed without writing anything.", { exact: false }),
  ).toBeVisible({ timeout: 60_000 });

  // The run is durably recorded: the admin API read shows a done dry-run with a
  // report — proof the round trip hit the real backend, not just the UI.
  const token = await adminToken(request);
  await expect
    .poll(
      async () => {
        const runs = await listRuns(request, token);
        return runs.some((r) => r.mode === "dry_run" && r.state === "done" && r.report?.dry_run === true);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
});
