import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Video } from "@/lib/api";

const mocks = vi.hoisted(() => ({ getPublicVideoByLegacyUUID: vi.fn() }));
vi.mock("@/lib/video.server", () => ({
  getPublicVideoByLegacyUUID: mocks.getPublicVideoByLegacyUUID,
}));

import { GET } from "./route";

const OWN_ID = "6f2a1c3d-4b5e-4f60-8a71-9c0d2e3f4a5b";
const PT_UUID = "3caf7bea-5ceb-4959-81a0-b44d184e897c";
const IMPORTED_ID = "9c9de5e8-0a1e-484a-b099-e80766180a6d";

function req(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

describe("GET /videos/watch/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends this instance's own legacy id to its watch page", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue({ id: OWN_ID } as Video);
    const res = await GET(req(`https://tube.example/videos/watch/${OWN_ID}`), {
      params: Promise.resolve({ id: OWN_ID }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/videos/${OWN_ID}`);
  });

  // The case the next.config rule got WRONG: a PeerTube uuid is not a Vidra id,
  // so rewriting it blindly to /videos/{that uuid} 404'd every imported link.
  it("maps an imported video's SOURCE uuid to the id Vidra minted", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue({ id: IMPORTED_ID } as Video);
    const res = await GET(req(`https://tube.example/videos/watch/${PT_UUID}`), {
      params: Promise.resolve({ id: PT_UUID }),
    });
    expect(res.headers.get("location")).toBe(`/videos/${IMPORTED_ID}`);
    expect(res.headers.get("location")).not.toBe(`/videos/${PT_UUID}`);
  });

  it("carries the query string", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue({ id: OWN_ID } as Video);
    const res = await GET(req(`https://tube.example/videos/watch/${OWN_ID}?t=5`), {
      params: Promise.resolve({ id: OWN_ID }),
    });
    expect(res.headers.get("location")).toBe(`/videos/${OWN_ID}?t=5`);
  });

  // Degrading to the old behaviour rather than 404ing matters: the mocked e2e
  // suite has no backend at all, and a private video's anonymous resolve fails
  // while its owner's client fetch succeeds.
  it("falls back to the id verbatim when the backend cannot resolve it", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue(null);
    const res = await GET(req(`https://tube.example/videos/watch/${OWN_ID}?t=5`), {
      params: Promise.resolve({ id: OWN_ID }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/videos/${OWN_ID}?t=5`);
  });
});
