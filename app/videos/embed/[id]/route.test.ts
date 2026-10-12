import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Video } from "@/lib/api";

const mocks = vi.hoisted(() => ({ getPublicVideoByLegacyUUID: vi.fn() }));
vi.mock("@/lib/video.server", () => ({
  getPublicVideoByLegacyUUID: mocks.getPublicVideoByLegacyUUID,
}));

import { GET } from "./route";

const PT_SID = "8uCPfDJ7ApQgMVqaKzEyPW";
const PT_UUID = "3caf7bea-5ceb-4959-81a0-b44d184e897c";
const VIDRA_ID = "9c9de5e8-0a1e-484a-b099-e80766180a6d";

const call = (id: string, qs = "") =>
  GET(new Request(`https://tube.example/videos/embed/${id}${qs}`) as unknown as Parameters<typeof GET>[0], {
    params: Promise.resolve({ id }),
  });

describe("GET /videos/embed/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves a PeerTube uuid and redirects to /embed/{id}, mapping start to t and carrying options", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue({ id: VIDRA_ID } as Video);
    const res = await call(PT_UUID, "?start=90&autoplay=1&muted=1");
    expect(mocks.getPublicVideoByLegacyUUID).toHaveBeenCalledWith(PT_UUID);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/embed/${VIDRA_ID}?t=90&autoplay=1&muted=1`);
  });

  it("also accepts a PeerTube shortUUID", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: VIDRA_ID } as Video);
    const res = await call(PT_SID);
    expect(mocks.getPublicVideoByLegacyUUID).toHaveBeenLastCalledWith(PT_UUID);
    expect(res.headers.get("location")).toBe(`/embed/${VIDRA_ID}`);
  });

  // Privacy is the target's job: an id core will not resolve publicly still
  // goes to /embed/{id}, which applies the embed privacy rules itself.
  it("hands an unresolved id to /embed unchanged, never to the home page", async () => {
    mocks.getPublicVideoByLegacyUUID.mockResolvedValue(null);
    const res = await call("not-found-id");
    expect(res.headers.get("location")).toBe("/embed/not-found-id");
  });
});
