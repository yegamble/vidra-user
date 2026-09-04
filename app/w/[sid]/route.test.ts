import { describe, expect, it, vi, beforeEach } from "vitest";

import type { Video } from "@/lib/api";

const mocks = vi.hoisted(() => ({ getPublicVideoByLegacyUUID: vi.fn() }));
vi.mock("@/lib/video.server", () => ({
  getPublicVideoByLegacyUUID: mocks.getPublicVideoByLegacyUUID,
}));

import { GET } from "./route";

// The real short-uuid encoding of 3caf7bea-…, from the package PeerTube uses.
const PT_SID = "8uCPfDJ7ApQgMVqaKzEyPW";
const PT_UUID = "3caf7bea-5ceb-4959-81a0-b44d184e897c";
const VIDRA_ID = "9c9de5e8-0a1e-484a-b099-e80766180a6d";
const CODE = "abcdefghijk";

function req(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

describe("GET /w/[sid]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a PeerTube shortUUID to the imported video and redirects", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue({ id: VIDRA_ID, short_code: CODE } as Video);

    const res = await GET(req(`https://tube.example/w/${PT_SID}`), {
      params: Promise.resolve({ sid: PT_SID }),
    });

    // Resolved by the SOURCE uuid the sid decodes to, not by the sid itself.
    expect(mocks.getPublicVideoByLegacyUUID).toHaveBeenCalledWith(PT_UUID);
    expect(res.status).toBe(302);
    // ...and lands on the CANONICAL short code — one hop, not two via the uuid.
    expect(res.headers.get("location")).toBe(`/v/${CODE}`);
  });

  it("carries the query string, so a shared ?t= start time survives", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue({ id: VIDRA_ID, short_code: CODE } as Video);
    const res = await GET(req(`https://tube.example/w/${PT_SID}?t=90`), {
      params: Promise.resolve({ sid: PT_SID }),
    });
    expect(res.headers.get("location")).toBe(`/v/${CODE}?t=90`);
  });

  it("404s a sid that is not a PeerTube shortUUID, without asking the backend", async () => {
    for (const bad of ["nope", "", "8uCPfDJ7ApQgMVqaKzEyP", "8uCPfDJ7ApQgMVqaKzEyPW0"]) {
      const res = await GET(req(`https://tube.example/w/${bad}`), {
        params: Promise.resolve({ sid: bad }),
      });
      expect(res.status).toBe(404);
    }
    expect(mocks.getPublicVideoByLegacyUUID).not.toHaveBeenCalled();
  });

  it("404s when no video claims that source uuid", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue(null);
    const res = await GET(req(`https://tube.example/w/${PT_SID}`), {
      params: Promise.resolve({ sid: PT_SID }),
    });
    expect(res.status).toBe(404);
  });

  // Still 302: a 301 is cached by browsers and CDNs indefinitely, and /v/{code}
  // has not yet served a request in production. The 301 is spent only once the
  // flip is on beta cleanly.
  it("redirects temporarily, not permanently", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue({ id: VIDRA_ID, short_code: CODE } as Video);
    const res = await GET(req(`https://tube.example/w/${PT_SID}`), {
      params: Promise.resolve({ sid: PT_SID }),
    });
    expect(res.status).not.toBe(301);
    expect(res.status).toBe(302);
  });

  // A video with no code (an older row, or one core did not send it for) still
  // reaches its watch page by uuid.
  it("falls back to the uuid form when the resolved video has no code", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue({ id: VIDRA_ID } as Video);
    const res = await GET(req(`https://tube.example/w/${PT_SID}`), {
      params: Promise.resolve({ sid: PT_SID }),
    });
    expect(res.headers.get("location")).toBe(`/videos/${VIDRA_ID}`);
  });
});
