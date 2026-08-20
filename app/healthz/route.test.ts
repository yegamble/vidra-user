import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as route from "./route";

describe("GET /healthz", () => {
  it("is force-dynamic so the probe reports the running server", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("answers 200 with a fixed body, synchronously", async () => {
    const res = route.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("imports nothing — frontend health must not depend on the api being up", () => {
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});
