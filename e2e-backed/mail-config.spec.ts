import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL, adminToken, uniqueId } from "./fixtures";

// Proves /admin/config/email against a real vidra-core + PostgreSQL: the
// deterministic admin saves an outbound-mail document through the form, it
// survives a full page reload (so it reached the database, not component
// state), and "Remove this configuration" deletes it again.
//
// WHAT THIS STACK ACTUALLY IS, and why the assertions below look the way they
// do. The backed lane boots core with DEV_MAIL_CAPTURE_ENABLED=true (the
// reset/verify specs need the dev token seam), and dev capture WINS over every
// other source — so `source` here is "dev_capture", never "database", even
// with a document saved. The contract says so explicitly ("config may be
// non-null while this says dev_capture"), and the page keys its discard
// control on a STORED document rather than on the source for exactly that
// reason.
//
// The lane also sets no MFA_KEY_KEK and no FEDERATION_KEY_KEK (compose defaults
// them empty), so this deployment can seal no credential: `secrets_available`
// is false and every secret input is disabled. That is why the configuration
// saved here is a PASSWORD-LESS relay — the one shape that is legitimately
// storable without a key-encryption key. The expectations are derived from the
// GET rather than hard-coded, so a lane that later gains a KEK fails loudly on
// the assertion it invalidates instead of quietly testing something else.
//
// WRITE-ONLY in this loop: authored for the `backend-backed` project
// (npm run e2e:backed), not part of the mocked `npm run ci` gate.

type MailConfigState = {
  source: string;
  secrets_available: boolean;
  secret_status: string;
  environment: { configured: boolean };
  config: {
    transport: string;
    from_address: string;
    from_name: string;
    smtp?: { host: string; port: number; encryption: string; username: string };
  } | null;
};

async function mailConfig(request: APIRequestContext): Promise<MailConfigState> {
  const token = await adminToken(request);
  const res = await request.get(`${API_URL}/api/v1/admin/mail-config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as MailConfigState;
}

async function openEmailConfig(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await page.goto("/admin/config/email");
  await expect(page.getByRole("heading", { name: "How mail is sent" })).toBeVisible();
}

test("an outbound-mail document saves, survives a reload, and can be removed", async ({
  page,
  request,
}) => {
  const before = await mailConfig(request);
  // The stack's own answer, asserted rather than assumed — everything below
  // depends on it.
  expect(before.source).toBe("dev_capture");

  await openEmailConfig(page);

  // Dev capture is announced as the silent-failure it is: nothing is delivered.
  await expect(page.getByText(/captured for development instead of sent/)).toBeVisible();

  const secretsBlocked = before.secrets_available === false;
  if (secretsBlocked) {
    // No key-encryption key: the page says so at page level AND disables the
    // credential input, because a PUT carrying one would be refused with 409.
    await expect(page.getByText(/no key to encrypt credentials with/)).toBeVisible();
    await expect(page.getByLabel("Password")).toBeDisabled();
  } else {
    await expect(page.getByText(/no key to encrypt credentials with/)).toHaveCount(0);
  }

  // A password-less relay — storable with or without a key-encryption key.
  const host = `relay-${uniqueId()}.example.test`;
  const sender = `no-reply-${uniqueId()}@example.test`;
  await page.getByLabel("Server address").fill(host);
  await page.getByLabel("Port").fill("2525");
  await page.getByLabel("Username").fill("");
  await page.getByLabel("Sender name").fill("Vidra backed");
  await page.getByLabel("Sender address").fill(sender);
  await page.getByRole("button", { name: "Save mail settings" }).click();

  await expect(page.getByText("Mail settings saved.")).toBeVisible();

  // It reached the database, not just the component: read it back through the
  // API the panel does not own.
  const saved = await mailConfig(request);
  expect(saved.config?.transport).toBe("smtp");
  expect(saved.config?.smtp?.host).toBe(host);
  expect(saved.config?.smtp?.port).toBe(2525);
  expect(saved.config?.smtp?.encryption).toBe("starttls");
  expect(saved.config?.from_address).toBe(sender);
  // Dev capture still wins, and the panel says so rather than claiming the
  // freshly saved document is delivering anything.
  expect(saved.source).toBe("dev_capture");

  // A full reload re-fetches from the server and re-seeds the form.
  await page.reload();
  await expect(page.getByLabel("Server address")).toHaveValue(host);
  await expect(page.getByLabel("Port")).toHaveValue("2525");
  await expect(page.getByLabel("Sender address")).toHaveValue(sender);
  await expect(
    page.getByText(/saved and takes over the moment capture is turned off/),
  ).toBeVisible();

  // Removing it: the confirmation names the consequence before the delete.
  const discardLabel = before.environment.configured
    ? "Use environment configuration"
    : "Remove this configuration";
  await page.getByRole("button", { name: discardLabel }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Discard configuration" }).click();

  await expect(page.getByText("The stored configuration was removed.")).toBeVisible();
  const after = await mailConfig(request);
  expect(after.config).toBeNull();
  // And the control that removes a stored document is gone with the document.
  await expect(page.getByRole("button", { name: discardLabel })).toHaveCount(0);
});
