// W0 design-parity capture harness (backport programme W0.1).
//
// Screenshots one or more app "areas" in every combination of viewport
// (mobile + desktop) and theme (light + dark) into
// `.ralph/design-review/w0/<area>/<viewport>-<theme>.png` — the git-ignored
// evidence folder each W0 slice attaches before/after to its fix_plan note.
//
// It is a DEV tool, never part of `npm run ci` (it lives under scripts/, so the
// no-console lint rule and tsc's *.ts globs both skip it — same as the other
// .mjs scripts). No real backend is required: each area installs its own
// `page.route` mocks (identical technique to the mocked e2e specs), and any
// other /api/v1/* call is aborted so the page renders its signed-out/empty
// state instead of hanging on a refused connection.
//
// Evidence hygiene: those aborted /api/v1/* calls legitimately log console
// errors, which light up Next's dev-tools "Issues" indicator — a `<nextjs-portal>`
// overlay that renders ON the page and even overlaps the mobile bottom tab bar,
// polluting the evidence. We keep the abort fallback (it is what drops pages to
// their empty/signed-out state — never faking product data) and instead HIDE the
// dev overlay at capture time (hideDevOverlay below). This is scoped entirely to
// the harness — a developer's normal `npm run dev` keeps its indicator untouched.
//
// Theme note: the app follows `prefers-color-scheme` when no theme is pinned
// (lib/theme.ts default "system" sets no data-theme attribute), so emulating
// the color scheme per browser context is all that's needed to flip every
// `light-dark()` token — no localStorage manipulation.
//
// Usage:
//   E2E_PORT=3181 npm run dev                       # start the app (any port)
//   DESIGN_BASE_URL=http://localhost:3181 npm run design:shots            # all areas
//   DESIGN_BASE_URL=http://localhost:3181 npm run design:shots -- home    # one area
//   DESIGN_FULLPAGE=1 ... npm run design:shots       # capture full scroll height
//
// Add an area: extend AREAS below with { path, mock } — the mock installs the
// route stubs that area needs (registered after the abort fallback, so they win).

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const PORT = process.env.E2E_PORT ?? process.env.PORT ?? "3000";
const BASE_URL = (process.env.DESIGN_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
// Evidence root defaults to the W0 dir; a later wave points it at its own dir
// (e.g. DESIGN_REVIEW_DIR=.ralph/design-review/w1) without forking the harness.
const OUT_ROOT = process.env.DESIGN_REVIEW_DIR ?? path.join(".ralph", "design-review", "w0");
const FULL_PAGE = process.env.DESIGN_FULLPAGE === "1";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];
const THEMES = /** @type {const} */ (["light", "dark"]);

// ---- sample fixtures (illustrative only — never real user data) --------------

function sampleVideo(id, title, opts = {}) {
  return {
    id,
    channel_id: opts.channelId ?? "c1",
    title,
    description: "",
    privacy: "public",
    state: "published",
    created_at: new Date(Date.now() - (opts.ageDays ?? 1) * 86_400_000).toISOString(),
    views: opts.views ?? 0,
    has_thumbnail: false,
    duration_seconds: opts.duration,
    channel_handle: opts.handle ?? "grade-house",
    channel_display_name: opts.channel ?? "Grade House",
    // Real feed/card field (vidra-core P19): drives the IPFS thumbnail badge.
    // Illustrative pin state — omitted (⇒ no badge) unless the fixture opts in.
    ...(opts.ipfsPinned ? { ipfs_pinned: true } : {}),
  };
}

const SAMPLE_FEED = {
  videos: [
    sampleVideo("v1", "Late-night color grading session", { views: 1200, duration: 1830, ageDays: 0 }),
    sampleVideo("v2", "Shooting the Alps on medium format — a field diary", {
      views: 128_000, duration: 1456, ageDays: 2, handle: "aurora-lab", channel: "Aurora Lab",
      ipfsPinned: true,
    }),
    sampleVideo("v3", "Building a federated video pipeline in Go", {
      views: 42_000, duration: 1083, ageDays: 5, handle: "north-loop", channel: "North Loop",
    }),
    sampleVideo("v4", "Monochrome grading — the luxury look, by hand", { views: 96_000, duration: 1900, ageDays: 7, ipfsPinned: true }),
    sampleVideo("v5", "The quiet web: why federation matters", {
      views: 210_000, duration: 742, ageDays: 21, handle: "field-notes", channel: "Field Notes",
    }),
    sampleVideo("v6", "Printing silver gelatin at home — full darkroom setup", {
      views: 64_000, duration: 1671, ageDays: 30, handle: "aurora-lab", channel: "Aurora Lab",
      ipfsPinned: true,
    }),
  ],
  sort: "recent",
  limit: 20,
  offset: 0,
};

const SAMPLE_VIDEO_CONFIG = { categories: [], languages: [], licenses: [] };

// A signed-in session for shell captures. restoreSession() does a silent
// POST /auth/refresh on boot; success then reads GET /auth/me — mocking both
// lands the shell authed (so the sidebar FOLLOWING group and the account menu
// render) without any UI login flow. Illustrative data only.
const SAMPLE_USER = {
  id: "u1",
  username: "boss",
  email: "boss@example.test",
  role: "user",
  email_verified: true,
  display_name: "Mara",
  bio: "",
  created_at: new Date().toISOString(),
};

const SAMPLE_AUTH = {
  token: "design-shots-access",
  refresh_token: "design-shots-refresh",
  token_type: "Bearer",
  expires_in: 900,
  user: SAMPLE_USER,
};

function sampleFollowedChannel(id, handle, displayName) {
  return {
    id,
    owner_id: `${id}-owner`,
    handle,
    display_name: displayName,
    description: "",
    follower_count: 1200,
    created_at: new Date().toISOString(),
    has_avatar: false,
    has_banner: false,
    followed_at: new Date().toISOString(),
  };
}

const SAMPLE_FOLLOWING = {
  channels: [
    sampleFollowedChannel("ch1", "grade_house", "Grade House"),
    sampleFollowedChannel("ch2", "north_loop", "North Loop"),
    sampleFollowedChannel("ch3", "field_notes", "Field Notes"),
  ],
  limit: 15,
  offset: 0,
};

// Authed-shell route mocks shared by the watch/channel areas: restoreSession()
// POSTs /auth/refresh on boot, then reads /auth/me; mocking both lands the shell
// signed in (so the FOLLOWING sidebar, account menu, comment composer, rating,
// and Follow affordance all render) with no UI login flow. Illustrative only.
async function mockAuthedShell(page) {
  await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: SAMPLE_AUTH }));
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: SAMPLE_USER }));
  await page.route(/\/api\/v1\/me\/subscriptions(\?|$)/, (route) =>
    route.fulfill({ json: SAMPLE_FOLLOWING }),
  );
  await page.route(/\/api\/v1\/me\/notifications\/unread-count$/, (route) =>
    route.fulfill({ json: { unread_count: 3 } }),
  );
}

// Full taxonomy so the watch page's category/language/license chips resolve to
// human labels instead of raw ids.
const SAMPLE_VIDEO_CONFIG_FULL = {
  categories: [{ id: "film", label: "Film & Animation" }],
  languages: [{ id: "en", label: "English" }],
  licenses: [{ id: "cc-by", label: "CC BY" }],
  privacies: [{ id: "public", label: "Public" }],
};

// A watch-page detail (GET /videos/{id}) — carries channel identity, taxonomy,
// tags and a description so the whole metadata block renders.
const SAMPLE_DETAIL = {
  id: "v1",
  remote: false,
  channel_id: "c1",
  channel_handle: "grade-house",
  channel_display_name: "Grade House",
  title: "Late-night color grading session — the luxury monochrome look, by hand",
  description:
    "A calm, unhurried walkthrough of the exact grade behind the last three films: " +
    "how the highlights roll off, where the shadows get their split-tone, and why I " +
    "keep the whole thing on a calibrated panel in a dark room.\n\nChapters in the pinned comment.",
  privacy: "public",
  state: "published",
  created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  views: 128_000,
  has_thumbnail: false,
  has_storyboard: false,
  duration_seconds: 1456,
  width: 3840,
  height: 2160,
  category: "film",
  language: "en",
  license: "cc-by",
  tags: ["colorgrading", "monochrome", "filmmaking"],
  // Transcoded HLS ladder so the bespoke player's quality selector renders in the
  // capture (W1.U1). The master playlist is mocked below; segments are aborted
  // (we screenshot chrome, not frames), so the video stays paused and its custom
  // overlay controls are pinned visible.
  hls_url: "/api/v1/videos/v1/hls/master.m3u8",
  renditions: [
    { height: 1080, width: 1920 },
    { height: 720, width: 1280 },
    { height: 480, width: 854 },
  ],
};

// A synthetic 3-rung master playlist so hls.js parses a real ladder and the
// quality menu lists Auto + 1080p/720p/480p in the watch capture.
const SAMPLE_HLS_MASTER = [
  "#EXTM3U",
  "#EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1920x1080",
  "1080p/playlist.m3u8",
  "#EXT-X-STREAM-INF:BANDWIDTH=1540000,RESOLUTION=1280x720",
  "720p/playlist.m3u8",
  "#EXT-X-STREAM-INF:BANDWIDTH=968000,RESOLUTION=854x480",
  "480p/playlist.m3u8",
  "",
].join("\n");

const SAMPLE_HLS_VARIANT = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:4",
  "#EXT-X-MEDIA-SEQUENCE:0",
  "#EXTINF:4.0,",
  "seg_00000.ts",
  "#EXT-X-ENDLIST",
  "",
].join("\n");

const SAMPLE_COMMENTS = {
  comments: [
    {
      id: "cm1",
      video_id: "v1",
      author_id: "a1",
      author_username: "aurora",
      author_display_name: "Aurora Lab",
      body: "The roll-off on the highlights here is gorgeous — what are you starting from before the split-tone?",
      created_at: new Date(Date.now() - 3_600_000).toISOString(),
    },
    {
      id: "cm2",
      video_id: "v1",
      author_id: "a2",
      author_username: "northloop",
      author_display_name: "North Loop",
      body: "Saved. The section on toning the shadows without muddying skin tones finally made it click.",
      created_at: new Date(Date.now() - 7_200_000).toISOString(),
    },
  ],
  limit: 100,
  offset: 0,
};

const SAMPLE_RATING = { like_count: 3400, dislike_count: 12, my_rating: "like" };

const SAMPLE_CHANNEL = {
  id: "c1",
  owner_id: "u9",
  handle: "grade-house",
  display_name: "Grade House",
  description:
    "Color grading, monochrome craft, and the quiet luxury of getting an image exactly " +
    "right. New sessions most weeks.",
  follower_count: 48_200,
  created_at: new Date(Date.now() - 400 * 86_400_000).toISOString(),
  has_avatar: false,
  has_banner: false,
};

// All owned by grade-house, so every card reads the same channel (channel-page
// realism). channel_id "c1" matches the detail's, so they also fill the watch
// page's related rail.
const SAMPLE_CHANNEL_VIDEOS = {
  videos: [
    sampleVideo("cv1", "Monochrome grading — the luxury look, by hand", { views: 96_000, duration: 1900, ageDays: 7 }),
    sampleVideo("cv2", "Split-toning shadows without muddying skin tones", { views: 54_000, duration: 1122, ageDays: 12 }),
    sampleVideo("cv3", "Building a print-first grade for silver gelatin", { views: 31_000, duration: 1671, ageDays: 20 }),
    sampleVideo("cv4", "Why I grade on a calibrated OLED in a dark room", { views: 77_000, duration: 843, ageDays: 33 }),
    sampleVideo("cv5", "The quiet web: archiving your masters on IPFS", { views: 22_000, duration: 742, ageDays: 46 }),
    sampleVideo("cv6", "A field diary: shooting the Alps on medium format", { views: 128_000, duration: 1456, ageDays: 60 }),
  ],
};

// A search-results payload (GET /videos/search) — the search surface is a dense
// thumbnail-left row list, so this reuses the feed's illustrative videos.
const SAMPLE_SEARCH = { query: "grading", videos: SAMPLE_FEED.videos, limit: 20, offset: 0 };

// An instance document (GET /instance) — the login/signup surfaces read it for
// the configured OIDC providers (→ the "Continue with …" buttons + "or"
// divider) and the registration policy. Illustrative only.
function sampleInstance(opts = {}) {
  return {
    name: "Vidra",
    description: "",
    software: { name: "vidra", version: "0.1.0" },
    registration_enabled: opts.registrationEnabled ?? true,
    registration_requires_approval: opts.requiresApproval ?? false,
    oauth_providers: opts.providers ?? [],
    federation_enabled: false,
    terms_url: "",
    privacy_url: "",
    contact_email: "",
  };
}

// The signed-in creator's own channels (GET /me/channels) — one channel so the
// studio renders its list "table", upload form, and per-channel video list.
const SAMPLE_MY_CHANNELS = {
  channels: [
    {
      id: "c1",
      owner_id: "u1",
      handle: "grade-house",
      display_name: "Grade House",
      description: "Color grading, monochrome craft, and quiet-luxury imagery.",
      follower_count: 48_200,
      created_at: new Date(Date.now() - 400 * 86_400_000).toISOString(),
      has_avatar: false,
      has_banner: false,
    },
  ],
};

// The owner's video list (GET /channels/{handle}/videos) — a spread of states so
// the studio "Your videos" table shows every StateBadge variant + privacy.
const SAMPLE_STUDIO_VIDEOS = {
  videos: [
    { ...sampleVideo("sv1", "Late-night color grading session", { views: 1200, duration: 1830, ageDays: 1 }), state: "published", privacy: "public" },
    { ...sampleVideo("sv2", "Split-toning shadows without muddying skin tones", { views: 0, duration: 1122, ageDays: 0 }), state: "processing", privacy: "unlisted" },
    { ...sampleVideo("sv3", "Building a print-first grade for silver gelatin", { views: 0, duration: 1671, ageDays: 0 }), state: "draft", privacy: "private" },
    { ...sampleVideo("sv4", "Q&A — self-hosting your own instance", { views: 0, duration: 843, ageDays: 0 }), state: "scheduled", privacy: "public", publish_at: new Date(Date.now() + 3 * 86_400_000).toISOString() },
  ],
};

// A 30-day daily-views series (oldest first) for the stats chart.
function sampleDailyViews(peak) {
  const series = [];
  const start = Date.now() - 29 * 86_400_000;
  for (let i = 0; i < 30; i++) {
    series.push({
      day: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      views: Math.round(peak * (0.3 + 0.7 * Math.abs(Math.sin(i / 3)))),
    });
  }
  return series;
}

// Channel totals (GET /channels/{handle}/stats) for the creator-stats tiles.
const SAMPLE_CHANNEL_STATS = {
  views: 512_400,
  likes: 34_100,
  dislikes: 210,
  comments: 4_820,
  followers: 48_200,
  videos: 42,
  daily_views: sampleDailyViews(24_000),
};

// A watch-history payload (GET /me/history): each card carries a resume position
// and a watched_at, so the grid renders the resume-progress bar + "Resume at m:ss".
const SAMPLE_HISTORY = {
  videos: [
    { ...sampleVideo("v1", "Late-night color grading session", { views: 1200, duration: 1830, ageDays: 0 }), position_seconds: 540, watched_at: new Date(Date.now() - 2 * 3_600_000).toISOString() },
    { ...sampleVideo("v2", "Shooting the Alps on medium format — a field diary", { views: 128_000, duration: 1456, ageDays: 2, handle: "aurora-lab", channel: "Aurora Lab" }), position_seconds: 0, watched_at: new Date(Date.now() - 26 * 3_600_000).toISOString() },
    { ...sampleVideo("v3", "Building a federated video pipeline in Go", { views: 42_000, duration: 1083, ageDays: 5, handle: "north-loop", channel: "North Loop" }), position_seconds: 300, watched_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    { ...sampleVideo("v4", "Monochrome grading — the luxury look, by hand", { views: 96_000, duration: 1900, ageDays: 7 }), position_seconds: 1200, watched_at: new Date(Date.now() - 8 * 86_400_000).toISOString() },
  ],
  limit: 20,
  offset: 0,
};

// A messaging thread (GET /conversations/{id}/messages) crafted to exercise the
// v2 thread view: a yesterday run + a today run + a Seen watermark, so the day
// header, the >60-min gap separator, other-party run avatars, and the quiet
// "Seen" all render. Newest-first, as the API returns. Illustrative only.
function sampleThread() {
  const now = Date.now();
  const at = (ms) => new Date(now - ms).toISOString();
  const peer = (id, body, ms) => ({
    id,
    conversation_id: "c1",
    sender_id: "u2",
    sender_username: "gradehouse",
    sender_display_name: "Grade House",
    body,
    created_at: at(ms),
  });
  const me = (id, body, ms) => ({
    id,
    conversation_id: "c1",
    sender_id: "u1",
    sender_username: "boss",
    sender_display_name: "Mara",
    body,
    created_at: at(ms),
  });
  return {
    // newest-first
    messages: [
      peer("m5", "Perfect — standing by for the stills.", 90 * 1000),
      me("m4", "Sending the stills over now.", 2 * 3600_000 - 60_000),
      me("m3", "Thank you — it took three passes to get the roll-off right.", 2 * 3600_000),
      peer("m2", "The highlights look incredible in motion.", 26 * 3600_000 - 90_000),
      peer("m1", "Morning! Did the grade land the way you wanted?", 26 * 3600_000),
    ],
    peer_last_read_message_id: "m4",
    limit: 50,
    offset: 0,
  };
}

const SAMPLE_INBOX = {
  conversations: [
    {
      id: "c1",
      updated_at: new Date(Date.now() - 90_000).toISOString(),
      encrypted: false,
      other_user_id: "u2",
      other_username: "gradehouse",
      other_display_name: "Grade House",
      last_message_body: "Perfect — standing by for the stills.",
      last_message_at: new Date(Date.now() - 90_000).toISOString(),
      unread_count: 1,
    },
    {
      id: "c2",
      updated_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      encrypted: false,
      other_user_id: "u3",
      other_username: "auroralab",
      other_display_name: "Aurora Lab",
      last_message_body: "Let's lock the shoot list this week.",
      last_message_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    },
    {
      id: "c3",
      updated_at: new Date(Date.now() - 40 * 3600_000).toISOString(),
      encrypted: true,
      other_user_id: "u4",
      other_username: "northloop",
      other_display_name: "North Loop",
      last_message_body: "",
      last_message_at: new Date(Date.now() - 40 * 3600_000).toISOString(),
    },
  ],
  limit: 20,
  offset: 0,
};

// A 1x1 PNG so mocked attachment bytes actually decode into an <img>; stretched
// object-cover it reads as a solid tile — enough to show the media grid mask,
// rounded corners, and single-image bound. Illustrative only.
const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwcHAAAAGEAMGDX2mUAAAAAElFTkSuQmCC";

// A messaging thread whose messages carry image attachments, to exercise the
// Messaging v2 part 2 media UX: a peer message with a 3-image grid and an own
// message with a single bounded image. Newest-first. Illustrative only.
function sampleMediaThread() {
  const now = Date.now();
  const at = (ms) => new Date(now - ms).toISOString();
  const img = (id, name) => ({
    id,
    kind: "image",
    content_type: "image/png",
    filename: name,
    size_bytes: 220_000,
  });
  return {
    messages: [
      {
        id: "m3",
        conversation_id: "c1",
        sender_id: "u1",
        sender_username: "boss",
        sender_display_name: "Mara",
        body: "Here's the reference frame I mentioned.",
        created_at: at(60_000),
        attachments: [img("a4", "reference.png")],
      },
      {
        id: "m2",
        conversation_id: "c1",
        sender_id: "u2",
        sender_username: "gradehouse",
        sender_display_name: "Grade House",
        body: "The three looks side by side:",
        created_at: at(4 * 60_000),
        attachments: [img("a1", "look-a.png"), img("a2", "look-b.png"), img("a3", "look-c.png")],
      },
      {
        id: "m1",
        conversation_id: "c1",
        sender_id: "u2",
        sender_username: "gradehouse",
        sender_display_name: "Grade House",
        body: "Morning! Sending the grade options now.",
        created_at: at(6 * 60_000),
      },
    ],
    peer_last_read_message_id: "m3",
    limit: 50,
    offset: 0,
  };
}

// A notifications list (GET /me/notifications) mixing types + read state so the
// icon chips, bold lead / muted rest copy, unread weighting and dots all render.
// Illustrative only.
const SAMPLE_NOTIFICATIONS = {
  notifications: [
    {
      id: "n1",
      type: "comment",
      read: false,
      created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      actor: { username: "auroralab", display_name: "Aurora Lab" },
      video_id: "v1",
      video_title: "Late-night color grading session",
    },
    {
      id: "n2",
      type: "message",
      read: false,
      created_at: new Date(Date.now() - 40 * 60_000).toISOString(),
      actor: { username: "gradehouse", display_name: "Grade House" },
      conversation_id: "c1",
    },
    {
      id: "n3",
      type: "follow",
      read: true,
      created_at: new Date(Date.now() - 6 * 3600_000).toISOString(),
      actor: { username: "northloop", display_name: "North Loop" },
      channel_handle: "grade-house",
      channel_display_name: "Grade House",
    },
    {
      id: "n4",
      type: "video_rejected",
      read: true,
      created_at: new Date(Date.now() - 28 * 3600_000).toISOString(),
      video_title: "Untitled draft",
    },
  ],
  unread_count: 2,
  limit: 20,
  offset: 0,
};

// ---- admin / moderation fixtures (W0.11) ------------------------------------

// A signed-in ADMIN session so the admin/moderation surfaces render their
// privileged bodies (RoleGate passes) instead of the "Administrators only" gate.
const SAMPLE_ADMIN_USER = { ...SAMPLE_USER, role: "admin" };
const SAMPLE_ADMIN_AUTH = { ...SAMPLE_AUTH, user: SAMPLE_ADMIN_USER };

async function mockAdminShell(page) {
  await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: SAMPLE_ADMIN_AUTH }));
  await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: SAMPLE_ADMIN_USER }));
  await page.route(/\/api\/v1\/me\/subscriptions(\?|$)/, (route) =>
    route.fulfill({ json: SAMPLE_FOLLOWING }),
  );
  await page.route(/\/api\/v1\/me\/notifications\/unread-count$/, (route) =>
    route.fulfill({ json: { unread_count: 0 } }),
  );
}

const SAMPLE_SYSTEM_STATUS = {
  status: "ok",
  software: {
    name: "vidra",
    version: "1.4.2",
    commit: "abc1234",
    build_date: "2026-07-01T00:00:00Z",
    go_version: "go1.26.2",
  },
  environment: "production",
  uptime_seconds: 21 * 86_400 + 3 * 3_600,
  components: {
    postgres: { status: "ok" },
    redis: { status: "ok" },
    object_storage: { status: "ok" },
  },
};

function sampleAdminUser(id, username, role, opts = {}) {
  return {
    id,
    username,
    email: opts.email ?? `${username}@example.test`,
    role,
    is_active: opts.active ?? true,
    email_verified: opts.verified ?? true,
    display_name: opts.display ?? username,
    created_at: new Date(Date.now() - (opts.ageDays ?? 120) * 86_400_000).toISOString(),
  };
}

const SAMPLE_ADMIN_USERS = {
  users: [
    sampleAdminUser("u1", "boss", "admin", { display: "Mara", ageDays: 180 }),
    sampleAdminUser("u2", "northloop", "moderator", { email: "noel@example.net", display: "North Loop", ageDays: 120 }),
    sampleAdminUser("u3", "gradehouse", "user", { email: "studio@gradehouse.tv", display: "Grade House", ageDays: 150 }),
    sampleAdminUser("u4", "fieldnotes", "user", { email: "ed@fieldnotes.blog", display: "Field Notes", ageDays: 60 }),
    sampleAdminUser("u5", "spam_account_291", "user", { email: "x91@tempmail.cc", active: false, verified: false, ageDays: 1 }),
  ],
  limit: 100,
  offset: 0,
};

function sampleReport(id, opts) {
  return {
    id,
    target_type: opts.type,
    reason: opts.reason,
    status: "open",
    moderator_note: "",
    created_at: new Date(Date.now() - opts.ageMin * 60_000).toISOString(),
    reporter: { username: opts.by },
    video_id: opts.videoId,
    video_title: opts.videoTitle,
    comment_body: opts.commentBody,
  };
}

const SAMPLE_REPORTS = {
  reports: [
    sampleReport("r1", { type: "video", reason: "Scam / misleading", ageMin: 25, by: "lena_k", videoId: "v1", videoTitle: "Get rich with this one trick" }),
    sampleReport("r2", { type: "comment", reason: "Harassment", ageMin: 120, by: "arno", commentBody: "Check my channel for the REAL secret, link in bio…" }),
    sampleReport("r3", { type: "video", reason: "Copyright", ageMin: 360, by: "printroom", videoId: "v2", videoTitle: "Free movies stream HD" }),
  ],
  limit: 100,
  offset: 0,
};

const SAMPLE_REGISTRATION_REQUESTS = {
  requests: [
    { id: "rr1", username: "printroom", email: "ella@risograph.studio", note: "I publish printmaking process videos, moving from YouTube.", status: "pending", created_at: new Date(Date.now() - 3_600_000).toISOString() },
    { id: "rr2", username: "slowcinema", email: "jb@slowcinema.org", note: "Archive of public-domain restorations.", status: "pending", created_at: new Date(Date.now() - 5 * 3_600_000).toISOString() },
    { id: "rr3", username: "dronezzz", email: "mk9@tempmail.cc", note: "", status: "pending", created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  ],
  limit: 100,
  offset: 0,
};

const SAMPLE_QUARANTINE = {
  videos: [
    { id: "q1", title: "Studio tour raw cut", privacy: "public", state: "quarantined", owner_username: "northloop", channel_display_name: "North Loop", channel_handle: "north-loop", created_at: new Date(Date.now() - 40 * 60_000).toISOString() },
    { id: "q2", title: "promo_final_FINAL.mp4", privacy: "unlisted", state: "quarantined", owner_username: "freestuff44", channel_display_name: "Free Stuff", channel_handle: "free-stuff", created_at: new Date(Date.now() - 3 * 3_600_000).toISOString() },
  ],
  limit: 100,
  offset: 0,
};

const SAMPLE_ADMIN_VIDEOS = {
  videos: [
    { id: "v1", title: "Get rich with this one trick", channel_handle: "spamlord", channel_display_name: "Spam Lord", views: 3, created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), privacy: "public", state: "published", blocked: false },
    { id: "v2", title: "Free movies stream HD", channel_handle: "mirrorbot", channel_display_name: "Mirror Bot", views: 12, created_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), privacy: "public", state: "published", blocked: true },
    { id: "v3", title: "Shooting the Alps on medium format", channel_handle: "aurora-lab", channel_display_name: "Aurora Lab", views: 128_000, created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), privacy: "public", state: "published", blocked: false },
    { id: "v4", title: "Winter light tests (HLS 4K)", channel_handle: "north-loop", channel_display_name: "North Loop", views: 0, created_at: new Date(Date.now() - 1 * 3_600_000).toISOString(), privacy: "unlisted", state: "processing", blocked: false },
  ],
  limit: 100,
  offset: 0,
};

const SAMPLE_ADMIN_COMMENTS = {
  comments: [
    { id: "cm1", author_username: "coldcaller", author_display_name: "Cold Caller", created_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), video_id: "v1", video_title: "Monochrome grading — the luxury look", body: "Check my channel for the REAL secret, link in bio…" },
    { id: "cm2", author_username: "arno", author_display_name: "Arno", created_at: new Date(Date.now() - 86_400_000).toISOString(), video_id: "v2", video_title: "The quiet web", body: "Would love a breakdown of the instance block policy." },
  ],
  limit: 100,
  offset: 0,
};

// ---- area registry -----------------------------------------------------------

/** @type {Record<string, { path: string, mock?: (page: import("@playwright/test").Page) => Promise<void>, act?: (page: import("@playwright/test").Page) => Promise<void> }>} */
const AREAS = {
  home: {
    path: "/",
    async mock(page) {
      // Feed endpoint but not its subpaths (/videos/search, /videos/config, /videos/{id}).
      await page.route(/\/api\/v1\/videos(\?|$)/, (route) => route.fulfill({ json: SAMPLE_FEED }));
      await page.route(/\/api\/v1\/videos\/config(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_VIDEO_CONFIG }),
      );
    },
  },
  // /trending shares the home feed's chip-led layout (backport W0.4): same
  // pill chips + secondary taxonomy filters + VideoFeed grid, Trending preselected.
  trending: {
    path: "/trending",
    async mock(page) {
      await page.route(/\/api\/v1\/videos(\?|$)/, (route) => route.fulfill({ json: SAMPLE_FEED }));
      await page.route(/\/api\/v1\/videos\/config(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_VIDEO_CONFIG }),
      );
    },
  },
  // Signed-in desktop app shell (backport W0.2): exercises the sidebar FOLLOWING
  // group (GET /me/subscriptions) and the header's bell-with-dot + account menu.
  shell: {
    path: "/",
    async mock(page) {
      await page.route(/\/api\/v1\/videos(\?|$)/, (route) => route.fulfill({ json: SAMPLE_FEED }));
      await page.route(/\/api\/v1\/videos\/config(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_VIDEO_CONFIG }),
      );
      await page.route(/\/api\/v1\/auth\/refresh$/, (route) => route.fulfill({ json: SAMPLE_AUTH }));
      await page.route(/\/api\/v1\/auth\/me$/, (route) => route.fulfill({ json: SAMPLE_USER }));
      await page.route(/\/api\/v1\/me\/subscriptions(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_FOLLOWING }),
      );
      await page.route(/\/api\/v1\/me\/notifications\/unread-count$/, (route) =>
        route.fulfill({ json: { unread_count: 3 } }),
      );
    },
  },
  // Watch page (backport W0.5): player chrome + title-first metadata block
  // (channel · views · age), action row, related rail, and comments. Authed so
  // the rating/comment affordances render. The <video>'s /original preload is
  // aborted (hermetic — we screenshot chrome, not playback).
  watch: {
    path: "/videos/v1",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/videos\/v1$/, (route) => route.fulfill({ json: SAMPLE_DETAIL }));
      await page.route(/\/api\/v1\/videos\/config(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_VIDEO_CONFIG_FULL }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/original/, (route) => route.abort());
      // HLS ladder so the quality selector renders; segments abort (chrome, not frames).
      await page.route(/\/api\/v1\/videos\/v1\/hls\/master\.m3u8$/, (route) =>
        route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: SAMPLE_HLS_MASTER }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/hls\/\d+p\/playlist\.m3u8$/, (route) =>
        route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: SAMPLE_HLS_VARIANT }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/hls\/\d+p\/seg_\d+\.ts$/, (route) => route.abort());
      await page.route(/\/api\/v1\/videos\/v1\/captions$/, (route) =>
        route.fulfill({ json: { captions: [] } }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/comments/, (route) =>
        route.fulfill({ json: SAMPLE_COMMENTS }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/rating/, (route) =>
        route.fulfill({ json: SAMPLE_RATING }),
      );
      // Same-channel listing feeds the related rail (RelatedVideos).
      await page.route(/\/api\/v1\/channels\/grade-house\/videos(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_CHANNEL_VIDEOS }),
      );
    },
  },
  // Embed player (backport W1.U1): the bespoke shell sized to fill the iframe
  // (same custom chrome as watch, minus theater) with the escape-hatch title link.
  // The HLS ladder is mocked so the quality selector renders; segments abort.
  embed: {
    path: "/embed/v1",
    async mock(page) {
      await page.route(/\/api\/v1\/videos\/v1$/, (route) => route.fulfill({ json: SAMPLE_DETAIL }));
      await page.route(/\/api\/v1\/videos\/v1\/original/, (route) => route.abort());
      await page.route(/\/api\/v1\/videos\/v1\/hls\/master\.m3u8$/, (route) =>
        route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: SAMPLE_HLS_MASTER }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/hls\/\d+p\/playlist\.m3u8$/, (route) =>
        route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: SAMPLE_HLS_VARIANT }),
      );
      await page.route(/\/api\/v1\/videos\/v1\/hls\/\d+p\/seg_\d+\.ts$/, (route) => route.abort());
    },
  },
  // Watch page — speed menu open (backport W1.U2 / PLAY-03): the player's
  // settings-cluster Speed menu opened over the media surface, showing the full
  // 0.25×–4× rate ladder as menuitemradio entries with 1× (the button now reads
  // "1×", not the old "Normal") checked. Reuses the watch mock; the act hook opens
  // the menu. The height-capped menu is scrollable, so it auto-scrolls to the
  // checked 1× — the extended rungs (2.5×–4×) sit just below the fold.
  "watch-speed": {
    path: "/videos/v1",
    async mock(page) {
      await AREAS.watch.mock(page);
    },
    async act(page) {
      await page.getByRole("button", { name: "Speed: 1×" }).click();
      await page.getByRole("menu", { name: "Playback speed" }).waitFor({ state: "visible" });
    },
  },
  // Channel page (backport W0.6): banner/avatar header, Follow affordance, sort
  // chips, and a home-consistent video grid. Authed so the Follow button (not
  // the signed-out prompt) renders.
  channel: {
    path: "/channels/grade-house",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/channels\/grade-house$/, (route) =>
        route.fulfill({ json: SAMPLE_CHANNEL }),
      );
      await page.route(/\/api\/v1\/channels\/grade-house\/videos(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_CHANNEL_VIDEOS }),
      );
    },
  },
  // Search results (backport W0.7): the dense thumbnail-left row list plus the
  // filter row. Public surface, so no authed shell needed.
  search: {
    path: "/search?q=grading",
    async mock(page) {
      await page.route(/\/api\/v1\/videos\/search/, (route) => route.fulfill({ json: SAMPLE_SEARCH }));
      await page.route(/\/api\/v1\/videos\/config(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_VIDEO_CONFIG }),
      );
    },
  },
  // Subscriptions feed (backport W0.7): the Remote-subscriptions affordance above
  // a home-consistent video grid of followed-channel videos. Auth-gated.
  subscriptions: {
    path: "/subscriptions",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/subscriptions\/videos(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_FEED }),
      );
      await page.route(/\/api\/v1\/me\/remote-follows(\?|$)/, (route) =>
        route.fulfill({ json: { follows: [], limit: 100, offset: 0 } }),
      );
    },
  },
  // Library / saved videos (backport W0.7): a home-consistent grid of saved
  // cards under the Library title + Playlists link. Auth-gated.
  library: {
    path: "/library",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/saved(\?|$)/, (route) => route.fulfill({ json: SAMPLE_FEED }));
    },
  },
  // Watch history (backport W0.7): a home-consistent grid of watched cards with
  // resume-progress bars, per-item resume/remove footers, and a clear-all
  // control. Auth-gated.
  history: {
    path: "/history",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/history(\?|$)/, (route) => route.fulfill({ json: SAMPLE_HISTORY }));
    },
  },
  // Studio (backport W0.8): the creator surface — channels "table", upload entry
  // point, and the "Your videos" list with state/privacy badges. Auth-gated.
  studio: {
    path: "/studio",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/channels$/, (route) => route.fulfill({ json: SAMPLE_MY_CHANNELS }));
      await page.route(/\/api\/v1\/videos\/config(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_VIDEO_CONFIG_FULL }),
      );
      await page.route(/\/api\/v1\/channels\/grade-house\/videos(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_STUDIO_VIDEOS }),
      );
      await page.route(/\/api\/v1\/channels\/grade-house\/live$/, (route) =>
        route.fulfill({ json: { live_streams: [] } }),
      );
    },
  },
  // Creator stats (backport W0.8): the totals stat tiles + 30-day chart, and the
  // per-video stats drill-in. Auth-gated.
  "studio-stats": {
    path: "/studio/stats",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/channels$/, (route) => route.fulfill({ json: SAMPLE_MY_CHANNELS }));
      await page.route(/\/api\/v1\/channels\/grade-house\/stats$/, (route) =>
        route.fulfill({ json: SAMPLE_CHANNEL_STATS }),
      );
      await page.route(/\/api\/v1\/channels\/grade-house\/videos(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_STUDIO_VIDEOS }),
      );
    },
  },
  // Account settings hub (backport W0.9): the grouped iOS-style settings rows,
  // profile form, data section, and danger zone. Auth-gated.
  settings: {
    path: "/settings",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/oauth-identities$/, (route) =>
        route.fulfill({ json: { identities: [] } }),
      );
      // 404 → the export card shows its idle "Request export" state.
      await page.route(/\/api\/v1\/me\/export$/, (route) =>
        route.fulfill({ status: 404, json: { error: { code: "not_found", message: "none" } } }),
      );
    },
  },
  // Messaging thread (backport W0.10 / Messaging v2): the thread-view core —
  // grouped runs, day/gap separators, other-party run avatars, quiet "Seen".
  // Authed so the thread (not the sign-in prompt) renders.
  messaging: {
    path: "/messages/c1",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/conversations(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_INBOX }),
      );
      await page.route(/\/api\/v1\/conversations\/c1\/messages(\?|$)/, (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        return route.fulfill({ json: sampleThread() });
      });
      await page.route(/\/api\/v1\/conversations\/c1\/read$/, (route) =>
        route.fulfill({ status: 204, body: "" }),
      );
      // Peer avatar probe (userAvatarUrl) — 404 → the initial-letter fallback.
      await page.route(/\/api\/v1\/users\/[^/]+\/avatar$/, (route) =>
        route.fulfill({ status: 404, body: "" }),
      );
    },
  },
  // Messaging inbox / rail (backport W0.10): conversation rows with avatars,
  // unread weighting + badge, encrypted lock glyph. Authed.
  "messaging-inbox": {
    path: "/messages",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/conversations(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_INBOX }),
      );
      await page.route(/\/api\/v1\/users\/[^/]+\/avatar$/, (route) =>
        route.fulfill({ status: 404, body: "" }),
      );
    },
  },
  // Messaging media (Messaging v2 part 2): a thread whose messages carry image
  // attachments — the bubble-less 3-image grid mask + a single bounded image.
  "messaging-media": {
    path: "/messages/c1",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/conversations(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_INBOX }),
      );
      await page.route(/\/api\/v1\/conversations\/c1\/messages(\?|$)/, (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        return route.fulfill({ json: sampleMediaThread() });
      });
      await page.route(/\/api\/v1\/conversations\/c1\/read$/, (route) =>
        route.fulfill({ status: 204, body: "" }),
      );
      await page.route(/\/api\/v1\/attachments\/[^/]+$/, (route) =>
        route.fulfill({ contentType: "image/png", body: Buffer.from(SAMPLE_PNG_BASE64, "base64") }),
      );
      await page.route(/\/api\/v1\/users\/[^/]+\/avatar$/, (route) =>
        route.fulfill({ status: 404, body: "" }),
      );
    },
  },
  // Notifications (backport W0.10): the full notifications list to template
  // language — round icon chips, bold lead / muted rest copy, unread weighting.
  notifications: {
    path: "/notifications",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/me\/notifications(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_NOTIFICATIONS }),
      );
    },
  },
  // Notifications bell popover (backport W0.10): the header disclosure panel —
  // recent items above a "See all notifications" footer. Opened via the act hook.
  "notifications-bell": {
    path: "/",
    async mock(page) {
      await mockAuthedShell(page);
      await page.route(/\/api\/v1\/videos(\?|$)/, (route) =>
        route.fulfill({ json: { videos: [], sort: "recent", limit: 20, offset: 0 } }),
      );
      await page.route(/\/api\/v1\/me\/notifications(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_NOTIFICATIONS }),
      );
    },
    async act(page) {
      await page.getByRole("button", { name: /Notifications/ }).first().click();
      await page.getByText("See all notifications").waitFor({ state: "visible" });
    },
  },
  // Auth — sign in (backport W0.12): the credentials form + the OAuth section
  // ("or" divider + one "Continue with …" pill per configured provider). Public
  // surface; the instance mock supplies two providers so the OAuth block renders.
  "auth-login": {
    path: "/login",
    async mock(page) {
      await page.route(/\/api\/v1\/instance$/, (route) =>
        route.fulfill({ json: sampleInstance({ providers: ["google", "github"] }) }),
      );
    },
  },
  // Auth — two-factor challenge (backport W0.12): the code-entry surface login
  // swaps to when credentials answer {mfa_required}. Reached by acting on the
  // login form (fill + submit) since it has no URL of its own.
  "auth-mfa": {
    path: "/login",
    async mock(page) {
      await page.route(/\/api\/v1\/instance$/, (route) =>
        route.fulfill({ json: sampleInstance({ providers: [] }) }),
      );
      await page.route(/\/api\/v1\/auth\/login$/, (route) =>
        route.fulfill({ json: { mfa_required: true, mfa_token: "design-shots-mfa" } }),
      );
    },
    async act(page) {
      await page.getByLabel("Email").fill("mira@example.test");
      await page.getByLabel("Password").fill("supersecret");
      await page.getByRole("button", { name: "Sign in" }).click();
      await page
        .getByRole("heading", { name: "Two-factor authentication" })
        .waitFor({ state: "visible" });
    },
  },
  // Auth — create account (backport W0.12): the signup form. The instance mock
  // enables registration WITH approval so the approval note + message field also
  // render, plus a provider for the OAuth block.
  "auth-signup": {
    path: "/signup",
    async mock(page) {
      await page.route(/\/api\/v1\/instance$/, (route) =>
        route.fulfill({
          json: sampleInstance({ providers: ["google"], requiresApproval: true }),
        }),
      );
    },
  },
  // Auth — request a reset link (backport W0.12): the enumeration-safe
  // password-reset request form. No API on mount.
  "auth-reset": {
    path: "/reset-password",
  },
  // Auth — choose a new password (backport W0.12): the reset-confirm form the
  // user reaches from the emailed link (a token in the URL renders the form).
  "auth-reset-confirm": {
    path: "/reset-password/confirm?token=design-shots-reset",
  },
  // Auth — verify email (backport W0.12): the confirm surface auto-submits the
  // token on mount; mocking a 204 shows the success state.
  "auth-verify": {
    path: "/verify-email/confirm?token=design-shots-verify",
    async mock(page) {
      await page.route(/\/api\/v1\/auth\/verify-email\/confirm$/, (route) =>
        route.fulfill({ status: 204, body: "" }),
      );
      await page.route(/\/api\/v1\/auth\/me$/, (route) =>
        route.fulfill({ status: 401, json: { error: { code: "unauthorized", message: "no" } } }),
      );
    },
  },
  // Admin — overview (backport W0.11): the /admin index — system summary, the
  // open-reports count, and the section list. Admin-shell so RoleGate passes.
  "admin-overview": {
    path: "/admin",
    async mock(page) {
      await mockAdminShell(page);
      await page.route(/\/api\/v1\/admin\/system$/, (route) => route.fulfill({ json: SAMPLE_SYSTEM_STATUS }));
      await page.route(/\/api\/v1\/admin\/reports(\?|$)/, (route) => route.fulfill({ json: SAMPLE_REPORTS }));
      await page.route(/\/api\/v1\/admin\/users(\?|$)/, (route) =>
        route.fulfill({ json: { users: [], limit: 100, offset: 0 } }),
      );
    },
  },
  // Admin — users (backport W0.11): the flagship account-management surface —
  // pill search toolbar + HIG user list with avatar, role/status pills.
  "admin-users": {
    path: "/admin/users",
    async mock(page) {
      await mockAdminShell(page);
      await page.route(/\/api\/v1\/admin\/users(\?|$)/, (route) => route.fulfill({ json: SAMPLE_ADMIN_USERS }));
    },
  },
  // Moderation — report queue (backport W0.11): filter chips + report panels with
  // kind/status pills and the resolve/block action row.
  "moderation-reports": {
    path: "/moderation",
    async mock(page) {
      await mockAdminShell(page);
      await page.route(/\/api\/v1\/admin\/reports(\?|$)/, (route) => route.fulfill({ json: SAMPLE_REPORTS }));
    },
  },
  // Admin — registration approval queue (backport W0.11): pending sign-up panels
  // with Approve / Deny.
  "admin-registration": {
    path: "/admin/registration-requests",
    async mock(page) {
      await mockAdminShell(page);
      await page.route(/\/api\/v1\/admin\/registration-requests(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_REGISTRATION_REQUESTS }),
      );
    },
  },
  // Moderation — quarantine queue (backport W0.11): held-upload panels with the
  // Approve / Reject decision row.
  "moderation-quarantine": {
    path: "/moderation/quarantine",
    async mock(page) {
      await mockAdminShell(page);
      await page.route(/\/api\/v1\/admin\/videos\/quarantined(\?|$)/, (route) =>
        route.fulfill({ json: SAMPLE_QUARANTINE }),
      );
    },
  },
  // Moderation — all videos (backport W0.11): searchable video list with
  // privacy/state/blocked pills and the block/unblock control.
  "moderation-videos": {
    path: "/moderation/videos",
    async mock(page) {
      await mockAdminShell(page);
      await page.route(/\/api\/v1\/admin\/videos(\?|$)/, (route) => route.fulfill({ json: SAMPLE_ADMIN_VIDEOS }));
    },
  },
  // Moderation — all comments (backport W0.11): searchable comment list with the
  // delete control.
  "moderation-comments": {
    path: "/moderation/comments",
    async mock(page) {
      await mockAdminShell(page);
      await page.route(/\/api\/v1\/admin\/comments(\?|$)/, (route) => route.fulfill({ json: SAMPLE_ADMIN_COMMENTS }));
    },
  },
};

// ---- capture -----------------------------------------------------------------

// Hide Next's dev-tools "Issues" overlay so it never appears in a capture. It
// mounts inside a `<nextjs-portal>` custom element (its shadow content only
// renders while the host is displayed), so hiding the host is sufficient; the
// `next-route-announcer` (a11y live region, visually hidden already) is left
// alone. Purely a screenshot-time cosmetic — no product code or data is touched.
async function hideDevOverlay(page) {
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" });
}

async function reachable(url) {
  try {
    await fetch(url, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(AREAS);
  const unknown = names.filter((n) => !AREAS[n]);
  if (unknown.length) {
    console.error(`Unknown area(s): ${unknown.join(", ")}. Known: ${Object.keys(AREAS).join(", ")}`);
    process.exit(1);
  }

  if (!(await reachable(BASE_URL))) {
    console.error(
      `Cannot reach ${BASE_URL}. Start the app first, e.g.:\n` +
        `  E2E_PORT=3181 npm run dev\n` +
        `then re-run with DESIGN_BASE_URL=http://localhost:3181 npm run design:shots`,
    );
    process.exit(1);
  }

  const browser = await chromium.launch();
  const written = [];
  try {
    for (const name of names) {
      const area = AREAS[name];
      const dir = path.join(OUT_ROOT, name);
      await mkdir(dir, { recursive: true });
      for (const viewport of VIEWPORTS) {
        for (const theme of THEMES) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 2,
            colorScheme: theme,
          });
          const page = await context.newPage();
          // Fallback FIRST so per-area mocks (registered after) take priority in
          // Playwright's last-registered-wins routing; anything unmocked aborts
          // instead of hanging on a refused backend connection.
          await page.route(/\/api\/v1\//, (route) => route.abort());
          if (area.mock) await area.mock(page);

          await page.goto(`${BASE_URL}${area.path}`, { waitUntil: "networkidle" });
          // Optional post-navigation interaction (e.g. drive the login form into
          // its MFA challenge state, which has no URL of its own).
          if (area.act) await area.act(page);
          // Suppress the dev-tools overlay AFTER any interaction (it re-mounts on
          // fresh console errors), immediately before the capture.
          await hideDevOverlay(page);
          const file = path.join(dir, `${viewport.name}-${theme}.png`);
          await page.screenshot({ path: file, fullPage: FULL_PAGE });
          written.push(file);
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`Captured ${written.length} screenshot(s) into ${OUT_ROOT}/:`);
  for (const file of written) console.log(`  ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
