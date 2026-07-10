import { expect, test, type Page } from "@playwright/test";

// Mocked E2EE messaging coverage. A real backend + WASM crypto is NOT used here
// (that is the write-only e2e-backed/e2ee.spec.ts). We inject a STUB crypto
// provider via a test seam (window.__VIDRA_E2EE_CRYPTO__) so the UI's setup /
// fan-out / decrypt orchestration runs for real over mocked API routes, without
// fighting the Olm WASM — exactly the slice's "inject a fake encryptor" rule.

const FEED = /\/api\/v1\/videos(\?|$)/;
const UNREAD = /\/api\/v1\/me\/notifications\/unread-count$/;
const CONVERSATIONS = /\/api\/v1\/me\/conversations(\?|$)/;
const START_CONVERSATION = /\/api\/v1\/conversations$/;
const ENC_MESSAGES = /\/api\/v1\/conversations\/enc1\/messages(\?|$)/;
const DEVICES = /\/api\/v1\/e2ee\/devices$/;
const DEVICE_DELETE = /\/api\/v1\/e2ee\/devices\/[^/]+$/;
const OTK_UPLOAD = /\/api\/v1\/e2ee\/devices\/[^/]+\/one-time-keys$/;
const OTK_COUNT = /\/api\/v1\/e2ee\/devices\/[^/]+\/one-time-keys\/count$/;
const CLAIM = /\/api\/v1\/users\/[^/]+\/e2ee\/claim$/;
const USER_DEVICES = /\/api\/v1\/users\/[^/]+\/e2ee\/devices$/;

// Watch-page routes for the "affordance only when advertised" tests.
const DETAIL = /\/api\/v1\/videos\/v1$/;
const ORIGINAL = /\/api\/v1\/videos\/v1\/original/;
const V1_COMMENTS = /\/api\/v1\/videos\/v1\/comments/;
const RATING = /\/api\/v1\/videos\/v1\/rating/;
const SAVED = /\/api\/v1\/me\/saved(\?|$)/;
const NO_RATING = { like_count: 0, dislike_count: 0, my_rating: null };

const videoDetail = {
  id: "v1",
  channel_id: "c1",
  title: "Watch Me",
  description: "",
  privacy: "public",
  state: "published",
  created_at: new Date().toISOString(),
  views: 1,
  has_thumbnail: false,
};

function bobComment() {
  return {
    id: "c1",
    video_id: "v1",
    body: "nice video",
    author_id: "u2",
    author_username: "bob",
    author_display_name: "Bob Builder",
    remote: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    edited: false,
  };
}

const session = {
  token: "acc",
  refresh_token: "ref",
  token_type: "Bearer",
  expires_in: 900,
  user: {
    id: "u1",
    username: "ada",
    email: "ada@example.test",
    role: "user",
    email_verified: false,
    display_name: "Ada Makes",
    bio: "",
    created_at: new Date().toISOString(),
  },
};

function encryptedSummary() {
  return {
    id: "enc1",
    updated_at: new Date().toISOString(),
    encrypted: true,
    other_user_id: "u2",
    other_username: "bob",
    other_display_name: "Bob Builder",
    last_message_body: "",
    last_message_at: new Date().toISOString(),
  };
}

// Injected in the browser before any app script: a deterministic stub Olm so the
// engine's real orchestration runs without WASM. encrypt = base64; decrypt =
// base64-decode, except the "__undecryptable__" sentinel which throws (driving
// the per-message undecryptable state).
function installStubCrypto() {
  const enc = (s: string) => btoa(unescape(encodeURIComponent(s)));
  const dec = (s: string) => decodeURIComponent(escape(atob(s)));
  const makeAccount = (idk: string, sgk: string) => ({
    identityKey: idk,
    signingKey: sgk,
    fingerprint: () => sgk,
    generateOneTimeKeys: (count: number) =>
      Array.from({ length: count }, (_, i) => ({ key_id: "k" + i, key: "otk" + i })),
    encryptFor: (_device: unknown, plaintext: string) => ({
      message_type: 0,
      ciphertext: enc(plaintext),
    }),
    decryptFrom: (_ik: string, _mt: number, ciphertext: string) => {
      if (ciphertext === "__undecryptable__") throw new Error("no session");
      return dec(ciphertext);
    },
    serialize: () => JSON.stringify({ idk, sgk }),
    dispose: () => {},
  });
  (window as unknown as { __VIDRA_E2EE_CRYPTO__: unknown }).__VIDRA_E2EE_CRYPTO__ = {
    create: async () => makeAccount("idk-self", "SGKSELFAAAABBBBCCCCDDDDEEEEFFFF00"),
    restore: async (pickle: string) => {
      const p = JSON.parse(pickle) as { idk: string; sgk: string };
      return makeAccount(p.idk, p.sgk);
    },
  };
}

// Restore the session on a hard navigation via the boot silent-refresh
// (+ /auth/me), so every test can `goto` straight to its target — deterministic,
// with no flaky login-form + client-nav chain. Mirrors e2e/session.spec.ts.
async function bootSignedIn(page: Page) {
  await page.addInitScript(installStubCrypto);
  await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: session }));
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: session.user }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
}

// Route the device-directory endpoints for a set-up-and-send flow.
async function routeDeviceEndpoints(page: Page) {
  await page.route(DEVICES, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        json: {
          id: "dev-1",
          user_id: "u1",
          device_name: "This browser",
          identity_key: "idk-self",
          signing_key: "SGKSELFAAAABBBBCCCCDDDDEEEEFFFF00",
          created_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        },
      });
    }
    return route.fulfill({ json: { devices: [] } });
  });
  await page.route(OTK_UPLOAD, (route) => route.fulfill({ json: { unclaimed: 30 } }));
  await page.route(OTK_COUNT, (route) => route.fulfill({ json: { count: 30 } }));
}

// Open the encrypted thread directly (boot-refresh restores the session; the ?to
// hint feeds the encrypted composer). No client-nav chain to flake on.
async function gotoEncryptedThread(page: Page) {
  await page.goto("/messages/enc1?to=u2");
  await expect(page.getByText("End-to-end encrypted")).toBeVisible();
}

// Land signed-in directly on a video's watch page. Rather than the flaky
// login-form + feed-card-click dance, restore the session on boot via a mocked
// cookie refresh (+ /auth/me), then navigate straight to the watch page — one
// deterministic navigation. `devices` decides whether the backend advertises E2EE.
async function signInToWatch(page: Page, devices: "advertised" | "absent") {
  await page.addInitScript(installStubCrypto);
  await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: session }));
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: session.user }));
  await page.route(FEED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(UNREAD, (route) => route.fulfill({ json: { unread_count: 0 } }));
  await page.route(DETAIL, (route) => route.fulfill({ json: videoDetail }));
  await page.route(ORIGINAL, (route) => route.abort());
  await page.route(V1_COMMENTS, (route) =>
    route.fulfill({ json: { comments: [bobComment()], limit: 20, offset: 0 } }),
  );
  await page.route(RATING, (route) => route.fulfill({ json: NO_RATING }));
  await page.route(SAVED, (route) =>
    route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
  );
  await page.route(DEVICES, (route) =>
    devices === "advertised"
      ? route.fulfill({ json: { devices: [] } })
      : route.fulfill({
          status: 404,
          json: { error: { code: "not_found", message: "no e2ee" } },
        }),
  );

  const e2eeProbe = page.waitForResponse(
    (res) => DEVICES.test(res.url()) && res.request().method() === "GET",
  );
  await page.goto("/videos/v1");
  await e2eeProbe;
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("nice video")).toBeVisible();
}

test("the encrypted affordance appears on a comment only when the backend advertises E2EE", async ({
  page,
}) => {
  await signInToWatch(page, "advertised");
  await expect(page.getByRole("button", { name: "Message" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Encrypted message" })).toBeVisible();
});

test("the encrypted affordance is hidden when the backend does not advertise E2EE", async ({
  page,
}) => {
  await signInToWatch(page, "absent");
  await expect(page.getByRole("button", { name: "Message" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Encrypted message" })).toHaveCount(0);

  // The same contract gate applies to the inbox composer: an older backend must
  // not get an encrypted-mode option that it cannot honor.
  await page.route(CONVERSATIONS, (route) =>
    route.fulfill({ json: { conversations: [], limit: 20, offset: 0 } }),
  );
  await page.getByRole("link", { name: "Messages" }).first().click();
  await page.getByRole("button", { name: "New message" }).click();
  const dialog = page.getByRole("dialog", { name: "New message" });
  await expect(dialog.getByLabel("End-to-end encrypted", { exact: true })).toHaveCount(0);
});

test("New message can start an encrypted thread without posting the draft as plaintext", async ({
  page,
}) => {
  await bootSignedIn(page);
  await routeDeviceEndpoints(page);
  await page.route(CONVERSATIONS, (route) =>
    route.fulfill({ json: { conversations: [], limit: 20, offset: 0 } }),
  );

  let startBody: unknown = null;
  await page.route(START_CONVERSATION, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    startBody = route.request().postDataJSON();
    return route.fulfill({
      json: {
        id: "enc1",
        encrypted: true,
        other_user_id: "u2",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  // Loading the encrypted thread is a GET. No POST to its messages endpoint may
  // happen until the user explicitly presses Send in that thread.
  let messagePosts = 0;
  await page.route(ENC_MESSAGES, (route) => {
    if (route.request().method() === "POST") {
      messagePosts += 1;
      return route.fulfill({
        json: {
          conversation_id: "enc1",
          envelope_count: 1,
          created_at: new Date().toISOString(),
        },
      });
    }
    return route.fulfill({ json: { envelopes: [], limit: 20, offset: 0 } });
  });

  await page.goto("/messages");
  await page.getByRole("button", { name: "New message" }).click();
  const dialog = page.getByRole("dialog", { name: "New message" });
  const encrypted = dialog.getByLabel("End-to-end encrypted", { exact: true });
  await expect(encrypted).toBeVisible();

  await dialog.getByLabel("Username").fill("bob");
  await dialog.getByLabel("Message").fill("meet at the west gate");
  await encrypted.check();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled();

  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/messages\/enc1\?to=u2$/);
  expect(startBody).toEqual({ recipient_username: "bob", encrypted: true });
  expect(messagePosts).toBe(0);

  // First encrypted use still performs device setup. The modal draft remains
  // client-side throughout and is handed to the encrypted composer afterward.
  await expect(page.getByRole("heading", { name: "Set up encryption on this device" })).toBeVisible();
  await page.getByLabel("Device name").fill("This browser");
  await page.getByRole("button", { name: "Set up this device" }).click();
  await expect(page.getByLabel("Write an encrypted message")).toHaveValue(
    "meet at the west gate",
  );
  expect(messagePosts).toBe(0);
});

test("the inbox flags an encrypted conversation with a lock and no preview", async ({ page }) => {
  await bootSignedIn(page);
  await page.route(CONVERSATIONS, (route) =>
    route.fulfill({ json: { conversations: [encryptedSummary()], limit: 20, offset: 0 } }),
  );
  await page.goto("/messages");
  await expect(page.getByText("Bob Builder")).toBeVisible();
  await expect(page.getByText("Encrypted conversation")).toBeVisible();
  await expect(page.getByLabel("Encrypted conversation")).toBeVisible();
});

test("first encrypted use runs the device setup flow, then reveals the composer", async ({
  page,
}) => {
  await bootSignedIn(page);
  await routeDeviceEndpoints(page);
  await page.route(ENC_MESSAGES, (route) =>
    route.fulfill({ json: { envelopes: [], limit: 20, offset: 0 } }),
  );

  await gotoEncryptedThread(page);

  // Lock header + honest limitation copy are shown up front.
  await expect(page.getByText("End-to-end encrypted")).toBeVisible();
  // No device yet → the setup flow appears (not the composer).
  await expect(page.getByRole("heading", { name: "Set up encryption on this device" })).toBeVisible();

  const register = page.waitForRequest(
    (req) => /\/e2ee\/devices$/.test(req.url()) && req.method() === "POST",
  );
  await page.getByLabel("Device name").fill("This browser");
  await page.getByRole("button", { name: "Set up this device" }).click();
  await register;

  // After setup the encrypted composer is available.
  await expect(page.getByLabel("Write an encrypted message")).toBeVisible();
  await expect(page.getByLabel("Disappearing messages timer")).toBeVisible();
});

test("an inbound encrypted message decrypts, and an unreadable one shows the undecryptable state", async ({
  page,
}) => {
  await bootSignedIn(page);
  await routeDeviceEndpoints(page);
  await page.route(USER_DEVICES, (route) =>
    route.fulfill({
      json: {
        devices: [
          {
            id: "dev-bob",
            user_id: "u2",
            device_name: "Bob phone",
            identity_key: "idk-bob",
            signing_key: "SGKBOB0000111122223333444455556677",
            created_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  const now = new Date().toISOString();
  await page.route(ENC_MESSAGES, (route) =>
    route.fulfill({
      json: {
        envelopes: [
          {
            id: "env-2",
            conversation_id: "enc1",
            sender_user_id: "u2",
            sender_device_id: "dev-bob",
            recipient_device_id: "dev-1",
            message_type: 0,
            ciphertext: "__undecryptable__",
            created_at: now,
          },
          {
            id: "env-1",
            conversation_id: "enc1",
            sender_user_id: "u2",
            sender_device_id: "dev-bob",
            recipient_device_id: "dev-1",
            message_type: 0,
            ciphertext: btoa("hello from bob"),
            created_at: now,
          },
        ],
        limit: 20,
        offset: 0,
      },
    }),
  );

  await gotoEncryptedThread(page);
  // Complete device setup so the envelopes can be decrypted on this device.
  await page.getByLabel("Device name").fill("This browser");
  await page.getByRole("button", { name: "Set up this device" }).click();

  await expect(page.getByText("hello from bob")).toBeVisible();
  await expect(page.getByText("Message can’t be decrypted on this device")).toBeVisible();
});

test("sending an encrypted message with a disappearing timer fans out with expires_in_seconds", async ({
  page,
}) => {
  await bootSignedIn(page);
  await routeDeviceEndpoints(page);
  await page.route(CLAIM, (route) => {
    const forPeer = /\/users\/u2\//.test(route.request().url());
    return route.fulfill({
      json: {
        user_id: forPeer ? "u2" : "u1",
        claims: forPeer
          ? [
              {
                device_id: "dev-bob",
                identity_key: "idk-bob",
                signing_key: "SGKBOB",
                one_time_key: { key_id: "k0", key: "otk0" },
              },
            ]
          : [],
      },
    });
  });

  await page.route(ENC_MESSAGES, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        json: { conversation_id: "enc1", envelope_count: 1, created_at: new Date().toISOString() },
      });
    }
    return route.fulfill({ json: { envelopes: [], limit: 20, offset: 0 } });
  });

  await gotoEncryptedThread(page);
  await page.getByLabel("Device name").fill("This browser");
  await page.getByRole("button", { name: "Set up this device" }).click();
  await expect(page.getByLabel("Write an encrypted message")).toBeVisible();

  await page.getByLabel("Disappearing messages timer").selectOption("1d");
  await page.getByLabel("Write an encrypted message").fill("meet at noon");
  const send = page.waitForRequest(
    (req) => ENC_MESSAGES.test(req.url()) && req.method() === "POST",
  );
  await page.getByRole("button", { name: "Send" }).click();
  const sentBody = (await send).postDataJSON() as { sender_device_id: string; expires_in_seconds: number; envelopes: unknown[] };

  expect(sentBody).toMatchObject({ sender_device_id: "dev-1", expires_in_seconds: 86400 });
  expect(sentBody.envelopes.length).toBeGreaterThan(0);
  // Optimistically rendered (my own message is not stored for my current device).
  await expect(page.getByText("meet at noon")).toBeVisible();
});

test("the devices settings page lists a device and removes it", async ({ page }) => {
  await bootSignedIn(page);
  await page.route(DEVICES, (route) =>
    route.fulfill({
      json: {
        devices: [
          {
            id: "dev-1",
            user_id: "u1",
            device_name: "Ada laptop",
            identity_key: "idk-self",
            signing_key: "SGKSELFAAAABBBBCCCCDDDD",
            created_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  let deleted = false;
  await page.route(DEVICE_DELETE, (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });

  await page.goto("/settings/devices");
  await expect(page.getByText("Ada laptop")).toBeVisible();
  // Safety number is rendered (grouped signing key).
  await expect(page.getByText("SGKS ELFA AAAB", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Remove device Ada laptop" }).click();
  await page.getByRole("button", { name: "Confirm remove" }).click();
  await expect(page.getByText("Ada laptop")).toBeHidden();
  expect(deleted).toBe(true);
});
