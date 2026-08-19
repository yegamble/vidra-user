import { afterEach, describe, expect, it, vi } from "vitest";

// The route reads lib/config, which resolves at module-evaluation time — so
// each case stubs the environment and imports a fresh copy.
async function loadRoute(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./route");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /runtime-config.js", () => {
  it("is force-dynamic so the body is never frozen at build time", async () => {
    const route = await loadRoute({});
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("serves the runtime PUBLIC_API_BASE_URL as executable JS", async () => {
    const route = await loadRoute({
      NODE_ENV: "production",
      PUBLIC_API_BASE_URL: "https://api.example.com",
    });
    const res = route.GET();
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await res.text()).toBe(
      'self.__VIDRA_RUNTIME_CONFIG__={"apiBaseUrl":"https://api.example.com"};',
    );
  });

  it("serves the same-origin default ('') when nothing is configured", async () => {
    const route = await loadRoute({ NODE_ENV: "production" });
    const res = route.GET();
    expect(await res.text()).toBe('self.__VIDRA_RUNTIME_CONFIG__={"apiBaseUrl":""};');
  });

  it("never serves a schemeless origin browsers would choke on — same-origin instead", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = await loadRoute({
      NODE_ENV: "production",
      PUBLIC_API_BASE_URL: "api.example.com",
    });
    const res = route.GET();
    expect(await res.text()).toBe('self.__VIDRA_RUNTIME_CONFIG__={"apiBaseUrl":""};');
    expect(error).toHaveBeenCalledWith(expect.stringContaining("PUBLIC_API_BASE_URL"));
  });
});
