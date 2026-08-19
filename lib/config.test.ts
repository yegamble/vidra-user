import { afterEach, describe, expect, it, vi } from "vitest";

// lib/config resolves its exports at module-evaluation time, so every case
// stubs the environment first and re-imports a fresh copy. These run under the
// node environment, i.e. they cover the SERVER-side resolution by default —
// browser-side cases stub a `window` global to reach the branch that consults
// the runtime-injected config (see app/runtime-config.js/route.ts).
async function loadConfig(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./config");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiBaseUrl (server side)", () => {
  it("defaults to http://localhost:8080 outside production (dev/test need no env)", async () => {
    const config = await loadConfig({});
    expect(config.apiBaseUrl).toBe("http://localhost:8080");
    expect(config.internalApiBaseUrl).toBe("http://localhost:8080");
  });

  it("defaults to same-origin relative ('') in production", async () => {
    const config = await loadConfig({ NODE_ENV: "production" });
    expect(config.apiBaseUrl).toBe("");
    // Server fetches still need an absolute URL.
    expect(config.internalApiBaseUrl).toBe("http://localhost:8080");
    expect(config.absoluteApiBaseUrl()).toBe("http://localhost:8080");
  });

  it("honours the build/dev override NEXT_PUBLIC_API_BASE_URL and trims trailing slashes", async () => {
    const config = await loadConfig({ NEXT_PUBLIC_API_BASE_URL: "https://api.example.com/" });
    expect(config.apiBaseUrl).toBe("https://api.example.com");
  });

  it("prefers the runtime PUBLIC_API_BASE_URL over the build-time value", async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_API_BASE_URL: "https://baked.example.com",
      PUBLIC_API_BASE_URL: "https://runtime.example.com",
    });
    expect(config.apiBaseUrl).toBe("https://runtime.example.com");
  });

  it("treats empty values as unset (an unconfigured build arg must not stick)", async () => {
    const config = await loadConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_BASE_URL: "",
      PUBLIC_API_BASE_URL: "",
    });
    expect(config.apiBaseUrl).toBe("");
  });
});

describe("internalApiBaseUrl", () => {
  it("reads the runtime API_BASE_URL for server-only calls", async () => {
    const config = await loadConfig({ NODE_ENV: "production", API_BASE_URL: "http://api:8080/" });
    expect(config.internalApiBaseUrl).toBe("http://api:8080");
    expect(config.absoluteApiBaseUrl()).toBe("http://api:8080");
    // The browser-facing base stays same-origin — the internal DNS name must
    // never leak into emitted URLs.
    expect(config.apiBaseUrl).toBe("");
  });

  it("lets the historical INTERNAL_API_BASE_URL win over API_BASE_URL", async () => {
    const config = await loadConfig({
      API_BASE_URL: "http://wrong:8080",
      INTERNAL_API_BASE_URL: "http://api:8080",
    });
    expect(config.internalApiBaseUrl).toBe("http://api:8080");
  });

  it("falls back to the public base when only that is configured (hairpin)", async () => {
    const config = await loadConfig({
      NODE_ENV: "production",
      PUBLIC_API_BASE_URL: "https://api.example.com",
    });
    expect(config.internalApiBaseUrl).toBe("https://api.example.com");
  });
});

// Runtime replacement for the old publish-container.yml release gate: the
// origin is runtime config now, so malformed values must be caught here — a
// schemeless base makes `new URL()` throw in lib/api/client.ts on every call.
describe("apiBaseUrl validation", () => {
  it("drops a schemeless PUBLIC_API_BASE_URL for same-origin ('') and logs loudly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = await loadConfig({
      NODE_ENV: "production",
      PUBLIC_API_BASE_URL: "api.example.com",
    });
    expect(config.apiBaseUrl).toBe("");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("PUBLIC_API_BASE_URL"));
  });

  it("drops a schemeless NEXT_PUBLIC_API_BASE_URL the same way", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = await loadConfig({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_BASE_URL: "api.example.com",
    });
    expect(config.apiBaseUrl).toBe("");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("NEXT_PUBLIC_API_BASE_URL"));
  });

  it("keeps a loopback origin but warns (the old gate rejected these at release)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = await loadConfig({
      NODE_ENV: "production",
      PUBLIC_API_BASE_URL: "http://127.0.0.1:8080",
    });
    expect(config.apiBaseUrl).toBe("http://127.0.0.1:8080");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("loopback"));
  });

  it("accepts a well-formed https origin silently", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = await loadConfig({
      NODE_ENV: "production",
      PUBLIC_API_BASE_URL: "https://api.example.com",
    });
    expect(config.apiBaseUrl).toBe("https://api.example.com");
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("apiBaseUrl (browser side)", () => {
  it("warns in production when the runtime-config script failed to load (global absent)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", {});
    const config = await loadConfig({ NODE_ENV: "production" });
    expect(config.apiBaseUrl).toBe("");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/runtime-config.js"));
  });

  it("stays silent when the script loaded with the same-origin default (global present, empty)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", { __VIDRA_RUNTIME_CONFIG__: { apiBaseUrl: "" } });
    const config = await loadConfig({ NODE_ENV: "production" });
    expect(config.apiBaseUrl).toBe("");
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays silent outside production builds (next dev loads the script late)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("window", {});
    const config = await loadConfig({});
    expect(config.apiBaseUrl).toBe("http://localhost:8080");
    expect(warn).not.toHaveBeenCalled();
  });
});
