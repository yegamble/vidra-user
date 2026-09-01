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
const INSTANCE = /\/api\/v1\/instance$/;
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
  const makeAccount = (idk: string, sgk: string, established: string[]) => {
    // Outbound sessions, by peer identity key. Establishing one consumes the
    // claimed one-time key; afterwards the session is reused and no key is
    // needed — the real Olm behaviour the engine's claim-avoidance relies on.
    const sessions = new Set(established);
    return {
      identityKey: idk,
      signingKey: sgk,
      fingerprint: () => sgk,
      generateOneTimeKeys: (count: number) =>
        Array.from({ length: count }, (_, i) => ({ key_id: "k" + i, key: "otk" + i })),
      hasOutboundSession: (identityKey: string) => sessions.has(identityKey),
      encryptFor: (
        device: { identity_key: string; one_time_key: unknown },
        plaintext: string,
      ) => {
        if (!sessions.has(device.identity_key)) {
          // No session and no key left → unreachable, reported as skipped.
          if (!device.one_time_key) return null;
          sessions.add(device.identity_key);
        }
        return { message_type: 0, ciphertext: enc(plaintext) };
      },
      decryptFrom: (_ik: string, _mt: number, ciphertext: string) => {
        if (ciphertext === "__undecryptable__") throw new Error("no session");
        return dec(ciphertext);
      },
      serialize: () => JSON.stringify({ idk, sgk, sessions: [...sessions] }),
      dispose: () => {},
    };
  };
  (window as unknown as { __VIDRA_E2EE_CRYPTO__: unknown }).__VIDRA_E2EE_CRYPTO__ = {
    create: async () => makeAccount("idk-self", "SGKSELFAAAABBBBCCCCDDDDEEEEFFFF00", []),
    restore: async (pickle: string) => {
      const p = JSON.parse(pickle) as { idk: string; sgk: string; sessions?: string[] };
      return makeAccount(p.idk, p.sgk, p.sessions ?? []);
    },
  };
}

// Restore the session on a hard navigation via the boot silent-refresh
// (+ /auth/me), so every test can `goto` straight to its target — deterministic,
// with no flaky login-form + client-nav chain. Mirrors e2e/session.spec.ts.
// E2EE availability comes from the PUBLIC instance document: core discloses
// features.messaging_e2ee (the operator's messaging_e2ee_enabled switch AND
// messaging_enabled AND the service wired at boot), and the contract is explicit
// that this flag — not a probe of GET /e2ee/devices, which cannot tell an
// operator policy decision from a transport failure — is the authoritative signal.
async function routeInstance(page: Page, e2ee: boolean) {
  await page.route(INSTANCE, (route) =>
    route.fulfill({
      json: {
        name: "Vidra",
        federation_enabled: true,
        features: { messaging: true, messaging_e2ee: e2ee, live: false, downloads: true },
      },
    }),
  );
}

async function bootSignedIn(page: Page) {
  await page.addInitScript(installStubCrypto);
  await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: session }));
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: session.user }));
  await routeInstance(page, true);
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

// One row of the peer's PUBLIC device directory (GET /users/{id}/e2ee/devices).
// The engine reads this before claiming — the lookup consumes no prekeys, so it
// can tell "device we already have a session with" from "device we must claim
// for" and only spend keys on the latter.
function peerDevice(id: string, suffix: string) {
  return {
    id,
    user_id: "u2",
    device_name: id,
    identity_key: `idk-${suffix}`,
    signing_key: `SGK${suffix.toUpperCase()}0000111122223333444455556677`,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };
}

/**
 * Route the peer's device directory plus the claim endpoint, and count the
 * claims so a test can assert one was NOT made. `exhausted` names devices whose
 * prekey pool is empty (the claim returns a null key for them), which is how a
 * device becomes unreachable and lands in `skipped`.
 */
async function routePeerKeys(
  page: Page,
  devices: { id: string; suffix: string }[],
  opts: { exhausted?: string[] } = {},
) {
  const exhausted = new Set(opts.exhausted ?? []);
  const rows = devices.map((d) => peerDevice(d.id, d.suffix));
  const claims: string[] = [];
  await page.route(USER_DEVICES, (route) => route.fulfill({ json: { devices: rows } }));
  await page.route(CLAIM, (route) => {
    const url = route.request().url();
    const forPeer = /\/users\/u2\//.test(url);
    claims.push(forPeer ? "u2" : "u1");
    return route.fulfill({
      json: {
        user_id: forPeer ? "u2" : "u1",
        claims: forPeer
          ? rows.map((d) => ({
              device_id: d.id,
              identity_key: d.identity_key,
              signing_key: d.signing_key,
              one_time_key: exhausted.has(d.id) ? null : { key_id: "k0", key: "otk0" },
            }))
          : [],
      },
    });
  });
  return claims;
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
// deterministic navigation. `e2ee` decides what the instance document discloses.
async function signInToWatch(page: Page, e2ee: "available" | "unavailable") {
  await page.addInitScript(installStubCrypto);
  await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: session }));
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: session.user }));
  await routeInstance(page, e2ee === "available");
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
  // The device directory stays routed for the flows that genuinely use it, and
  // is counted here: deciding availability must cost NO request of its own.
  let deviceProbes = 0;
  await page.route(DEVICES, (route) => {
    if (route.request().method() === "GET") deviceProbes += 1;
    return route.fulfill({ json: { devices: [] } });
  });

  const disclosure = page.waitForResponse(
    (res) => INSTANCE.test(res.url()) && res.request().method() === "GET",
  );
  await page.goto("/videos/v1");
  await disclosure;
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
  await expect(page.getByText("nice video")).toBeVisible();
  return () => deviceProbes;
}

test("the encrypted affordance appears on a comment only when the instance discloses E2EE", async ({
  page,
}) => {
  const deviceProbes = await signInToWatch(page, "available");
  // The comment's contact actions now live behind a "Comment actions" menu
  // (portaled to <body>, so menuitems are looked up at page level).
  const commentRow = page.locator("li", { hasText: "nice video" });
  await commentRow.getByRole("button", { name: "Comment actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Message", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Encrypted message" })).toBeVisible();
  // The answer came off the document the app already fetches, not off a probe.
  expect(deviceProbes()).toBe(0);
});

test("the encrypted affordance is hidden when the instance discloses E2EE unavailable", async ({
  page,
}) => {
  const deviceProbes = await signInToWatch(page, "unavailable");
  // Open the comment's overflow menu: Message stays (messaging itself is on),
  // but with E2EE disclosed unavailable the encrypted option is absent.
  const commentRow = page.locator("li", { hasText: "nice video" });
  await commentRow.getByRole("button", { name: "Comment actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Message", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Encrypted message" })).toHaveCount(0);
  expect(deviceProbes()).toBe(0);

  // The same gate applies to the inbox composer: an instance that cannot honor
  // encrypted mode must not be offered the option.
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
  const claims = await routePeerKeys(page, [{ id: "dev-bob", suffix: "bob" }]);

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
  await expect(page.getByText("meet at noon")).toBeVisible();
  // Establishing the session cost exactly one claim against the peer.
  expect(claims).toEqual(["u2"]);

  // A SECOND message reuses that session. Claiming again would burn another of
  // the peer's single-use prekeys for nothing — about thirty sends drained the
  // pool, after which a genuinely new device of theirs could never start a
  // session. No claim may be made here.
  await page.getByLabel("Write an encrypted message").fill("and again");
  const resend = page.waitForRequest(
    (req) => ENC_MESSAGES.test(req.url()) && req.method() === "POST",
  );
  await page.getByRole("button", { name: "Send" }).click();
  const resent = (await resend).postDataJSON() as { envelopes: unknown[] };
  expect(resent.envelopes.length).toBeGreaterThan(0);
  expect(claims).toEqual(["u2"]);

  // …and it SURVIVES a remount. The fan-out never addresses an envelope to the
  // sending device, and the backend returns only self-addressed envelopes — so
  // the GET above stays empty (as this route mock faithfully returns) and the
  // message can only come back from this device's own sent-message store.
  await page.reload();
  await expect(page.getByLabel("Write an encrypted message")).toBeVisible();
  await expect(page.getByText("meet at noon")).toBeVisible();
});

test("a send that cannot reach every device says so instead of looking clean", async ({ page }) => {
  await bootSignedIn(page);
  await routeDeviceEndpoints(page);
  // Bob has two devices; the second has no unused prekeys left, and we have no
  // session with it — so it cannot be encrypted for and will never get this.
  await routePeerKeys(
    page,
    [
      { id: "dev-bob", suffix: "bob" },
      { id: "dev-bob-2", suffix: "bob2" },
    ],
    { exhausted: ["dev-bob-2"] },
  );
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

  await page.getByLabel("Write an encrypted message").fill("half delivered");
  const send = page.waitForRequest(
    (req) => ENC_MESSAGES.test(req.url()) && req.method() === "POST",
  );
  await page.getByRole("button", { name: "Send" }).click();
  const body = (await send).postDataJSON() as { envelopes: unknown[] };

  // The send is NOT blocked — one device did receive it…
  expect(body.envelopes).toHaveLength(1);
  await expect(page.getByText("half delivered")).toBeVisible();
  // …and the partial delivery is stated rather than swallowed.
  const notice = page.getByRole("status").filter({ hasText: "Encrypted for 1 of 2 devices" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("no unused keys left");

  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toHaveCount(0);
});

test("a sender with no inbound messages keeps a working composer without the ?to hint", async ({
  page,
}) => {
  await bootSignedIn(page);
  await routeDeviceEndpoints(page);
  await routePeerKeys(page, [{ id: "dev-bob", suffix: "bob" }]);
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

  await page.getByLabel("Write an encrypted message").fill("west gate at six");
  const first = page.waitForRequest(
    (req) => ENC_MESSAGES.test(req.url()) && req.method() === "POST",
  );
  await page.getByRole("button", { name: "Send" }).click();
  await first;
  await expect(page.getByText("west gate at six")).toBeVisible();

  // Re-open the thread the way the inbox links to it: with NO ?to hint. The server
  // returns a sender none of its own envelopes, so there is nothing INBOUND to
  // infer the peer from — only the recipient recorded alongside the sent message
  // keeps this composer alive instead of stranding it on "Waiting…".
  await page.goto("/messages/enc1");
  await expect(page.getByText("west gate at six")).toBeVisible();
  await expect(page.getByLabel("Write an encrypted message")).toBeVisible();
  await expect(page.getByText("Waiting for the other device")).toHaveCount(0);

  // The recovered recipient is real, not just truthy: the next send still fans out.
  await page.getByLabel("Write an encrypted message").fill("bring the map");
  const second = page.waitForRequest(
    (req) => ENC_MESSAGES.test(req.url()) && req.method() === "POST",
  );
  await page.getByRole("button", { name: "Send" }).click();
  const body = (await second).postDataJSON() as { envelopes: unknown[] };
  expect(body.envelopes.length).toBeGreaterThan(0);
  await expect(page.getByText("bring the map")).toBeVisible();
});

// The thread loads the newest 100 envelopes. Everything older used to be
// unreachable forever — the client only ever sent limit/offset. These build the
// two pages the keyset cursor walks. Newest first, matching the API.
function historyEnvelope(n: number) {
  return {
    id: `env-${String(n).padStart(3, "0")}`,
    conversation_id: "enc1",
    sender_user_id: "u2",
    sender_device_id: "dev-bob",
    recipient_device_id: "dev-1",
    message_type: 0,
    // Older n = older message; all comfortably in the past so a live send sorts last.
    created_at: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
    ciphertext: btoa(`message ${n}`),
  };
}

test("the encrypted thread pages back through history beyond the first 100", async ({ page }) => {
  await bootSignedIn(page);
  await routeDeviceEndpoints(page);
  await routePeerKeys(page, [{ id: "dev-bob", suffix: "bob" }]);

  // Two FULL pages (100 each → more probably exists), then an empty one.
  const newest = Array.from({ length: 100 }, (_, i) => historyEnvelope(200 - i));
  const older = Array.from({ length: 100 }, (_, i) => historyEnvelope(100 - i));

  // The POST response's created_at is what lands in the outbox, so this decides
  // where a sent message sits in history — see the windowing assertions below.
  let sentAt = new Date().toISOString();
  const cursors: (string | null)[] = [];
  await page.route(ENC_MESSAGES, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        json: { conversation_id: "enc1", envelope_count: 1, created_at: sentAt },
      });
    }
    const before = new URL(route.request().url()).searchParams.get("before_id");
    cursors.push(before);
    const envelopes = before === null ? newest : before === "env-101" ? older : [];
    return route.fulfill({ json: { envelopes, limit: 100, offset: 0 } });
  });

  await gotoEncryptedThread(page);
  await page.getByLabel("Device name").fill("This browser");
  await page.getByRole("button", { name: "Set up this device" }).click();

  // The first page is present; the page before it is not yet.
  await expect(page.getByText("message 200", { exact: true })).toBeVisible();
  await expect(page.getByText("message 101", { exact: true })).toBeVisible();
  await expect(page.getByText("message 100", { exact: true })).toHaveCount(0);

  // Two sends that bracket the loaded window: one now (inside any window) and one
  // dated before the oldest history that will ever be paged in.
  const composer = page.getByLabel("Write an encrypted message");
  const send = page.getByRole("button", { name: "Send" });
  await composer.fill("sent just now");
  await send.click();
  await expect(page.getByText("sent just now")).toBeVisible();
  // The composer clears only once the send has settled — wait for that before
  // typing the next one, or the second click lands on a still-busy button.
  await expect(composer).toHaveValue("");

  sentAt = new Date(Date.UTC(2019, 0, 1)).toISOString();
  await composer.fill("sent long ago");
  await send.click();
  await expect(page.getByText("sent long ago")).toBeVisible();
  await expect(composer).toHaveValue("");

  const earlier = page.getByRole("button", { name: "Show earlier messages" });
  await expect(earlier).toBeVisible();
  await earlier.click();

  // The older page merged in above the loaded window…
  await expect(page.getByText("message 100", { exact: true })).toBeVisible();
  await expect(page.getByText("message 1", { exact: true })).toBeVisible();
  await expect(page.getByText("message 200", { exact: true })).toBeVisible();
  // …fetched with the keyset cursor: the OLDEST envelope we already held.
  expect(cursors).toContain("env-101");
  // Still a full page, so there may be more.
  await expect(earlier).toBeVisible();

  // Our own messages are bounded to the loaded window. The outbox holds the whole
  // conversation, so without this the 2019 message would float at the very top of
  // the thread — above history that has not been paged in yet — as if it were the
  // oldest thing said. The recent one is inside the window and stays.
  await expect(page.getByText("sent long ago")).toHaveCount(0);
  await expect(page.getByText("sent just now")).toBeVisible();

  // Page again: an empty page means history is exhausted, the affordance retires…
  await earlier.click();
  await expect(earlier).toHaveCount(0);
  // …and with no unloaded history left there is no boundary to respect, so the
  // 2019 message belongs again.
  await expect(page.getByText("sent long ago")).toBeVisible();
  await expect(page.getByText("sent just now")).toBeVisible();
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
