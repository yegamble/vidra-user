import { describe, expect, it } from "vitest";

import {
  backendOperations,
  findApiRequestCalls,
  normalize,
} from "@/scripts/check-contract.mjs";

// scripts/check-contract.mjs is wired into contract-ci and `npm run check:contract`.
// It is the only thing standing between a hand-written wrapper and a verb the backend
// never implemented, so the detector itself needs tests: a guard that silently stops
// detecting is worse than no guard, because the green tick keeps arriving.
//
// The shapes below are taken from real call sites in lib/api/*.ts. The one that matters
// most is "shape E" — path and `method:` on different lines — because that is the
// majority of the corpus (98 of ~160 explicit-method calls) and it is exactly what a
// line-scoped regex, the idiom the path half of this script uses, gets wrong.

describe("backendOperations", () => {
  const spec = [
    "openapi: 3.0.0",
    "paths:",
    "  /api/v1/videos:",
    "    get:",
    "      summary: list",
    "    post:",
    "      summary: create",
    "  /api/v1/videos/{id}:",
    "    get:",
    "      summary: one",
    "    delete:",
    "      summary: remove",
    "components:",
    "  schemas:",
    "    Video:",
    "      type: object",
  ].join("\n");

  it("maps each path to the set of methods the spec defines for it", () => {
    const ops = backendOperations(spec);
    expect([...ops.get("/api/v1/videos")].sort()).toEqual(["GET", "POST"]);
    expect([...ops.get("/api/v1/videos/{}")].sort()).toEqual(["DELETE", "GET"]);
  });

  it("stops at the next top-level key, so schema names are never read as paths", () => {
    const ops = backendOperations(spec);
    expect([...ops.keys()]).toEqual(["/api/v1/videos", "/api/v1/videos/{}"]);
  });

  it("normalizes path params so {id} and ${encodeURIComponent(id)} compare equal", () => {
    expect(normalize("/api/v1/videos/{videoId}")).toBe("/api/v1/videos/{}");
    expect(normalize("/api/v1/videos/${encodeURIComponent(id)}")).toBe("/api/v1/videos/{}");
  });
});

describe("findApiRequestCalls", () => {
  it("reads a single-line call (shape C)", () => {
    const src = `apiRequest<T>("/api/v1/auth/mfa/totp", { method: "POST" })`;
    expect(findApiRequestCalls(src, "auth.ts")).toMatchObject([
      { norm: "/api/v1/auth/mfa/totp", method: "POST" },
    ]);
  });

  it("treats an omitted method as GET, because client.ts defaults it (shape B)", () => {
    const src = `apiRequest<T>("/api/v1/auth/mfa", { signal })`;
    expect(findApiRequestCalls(src, "auth.ts")).toMatchObject([
      { norm: "/api/v1/auth/mfa", method: "GET" },
    ]);
  });

  it("reads a method on a LATER line than the path (shape E) — the regression case", () => {
    const src = [
      `apiRequest<AuthResponse>("/api/v1/setup/claim-owner", {`,
      `  method: "POST",`,
      `  body: { cookie_mode: true },`,
      `})`,
    ].join("\n");
    expect(findApiRequestCalls(src, "auth.ts")).toMatchObject([
      { norm: "/api/v1/setup/claim-owner", method: "POST" },
    ]);
  });

  it("reads the sub-variant where a leading newline puts the path on line 2", () => {
    const src = [
      `apiRequest<PlaybackSession>(`,
      "  `/api/v1/videos/${encodeURIComponent(id)}/playback-session`,",
      `  { method: "POST", token, signal },`,
      `)`,
    ].join("\n");
    expect(findApiRequestCalls(src, "endpoints.ts")).toMatchObject([
      { norm: "/api/v1/videos/{}/playback-session", method: "POST" },
    ]);
  });

  it("is not unbalanced by braces inside a path template", () => {
    const src = [
      "apiRequest<T>(",
      "  `/api/v1/videos/${encodeURIComponent(id)}/passwords/${encodeURIComponent(pw)}`,",
      `  { method: "DELETE" },`,
      `)`,
    ].join("\n");
    expect(findApiRequestCalls(src, "endpoints.ts")).toMatchObject([
      { norm: "/api/v1/videos/{}/passwords/{}", method: "DELETE" },
    ]);
  });

  it("resolves a path held in a local const one hop back", () => {
    const src = [
      "const path = `/api/v1/conversations/${encodeURIComponent(id)}/attachments`;",
      `if (!opts?.onProgress) {`,
      `  return apiRequest<T>(path, { method: "POST", body: form });`,
      `}`,
    ].join("\n");
    expect(findApiRequestCalls(src, "endpoints.ts")).toMatchObject([
      { norm: "/api/v1/conversations/{}/attachments", method: "POST" },
    ]);
  });

  it("skips client.ts's own function declaration — a definition is not a call site", () => {
    const src = `export async function apiRequest<T>(path: string, opts: RequestOptions = {}) {}`;
    expect(findApiRequestCalls(src, "client.ts")).toEqual([]);
  });

  it("finds every call in a file, not just the first", () => {
    const src = [
      `apiRequest<T>("/api/v1/a", { method: "POST" });`,
      `apiRequest<T>("/api/v1/b");`,
      `apiRequest<T>("/api/v1/c", { method: "DELETE" });`,
    ].join("\n");
    const calls = findApiRequestCalls(src, "endpoints.ts");
    expect(calls.map((c) => `${c.method} ${c.norm}`)).toEqual([
      "POST /api/v1/a",
      "GET /api/v1/b",
      "DELETE /api/v1/c",
    ]);
  });

  it("reports the call's line number so a failure is navigable", () => {
    const src = ["", "", `apiRequest<T>("/api/v1/a", { method: "POST" });`].join("\n");
    expect(findApiRequestCalls(src, "endpoints.ts")[0].line).toBe(3);
  });

  // Documented limit, asserted so it changes deliberately rather than by accident:
  // a path built by concatenation truncates at the first literal run. The checker sees
  // a valid prefix and stays silent. Out of scope — catching it needs a type-aware pass,
  // and no call site in lib/api/*.ts is written this way today.
  it("truncates a concatenated path to its literal prefix (known blind spot)", () => {
    const src = `apiRequest<T>("/api/v1/videos/" + id + "/bogus", { method: "POST" })`;
    expect(findApiRequestCalls(src, "endpoints.ts")).toMatchObject([
      { norm: "/api/v1/videos", method: "POST" },
    ]);
  });
});

describe("the two halves agree on the live client", () => {
  it("flags a method the spec does not define for that path", () => {
    const ops = backendOperations(
      ["paths:", "  /api/v1/videos/{id}:", "    get:", "      summary: one"].join("\n"),
    );
    const calls = findApiRequestCalls(
      ["apiRequest<T>(`/api/v1/videos/${id}`, {", `  method: "PUT",`, "})"].join("\n"),
      "endpoints.ts",
    );
    const wrong = calls.filter(
      (c) => c.norm && ops.has(c.norm) && !ops.get(c.norm).has(c.method),
    );
    expect(wrong).toHaveLength(1);
    expect(wrong[0].method).toBe("PUT");
  });
});
