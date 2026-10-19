// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { loadVast, trackVast } from "./vast-client";

const signal = () => new AbortController().signal;
const inline = `<VAST><Ad><InLine><Impression>/inline-i</Impression><Error>/inline-e</Error><Creatives><Creative><Linear><Duration>00:00:20</Duration><TrackingEvents><Tracking event="start">/inline-start</Tracking></TrackingEvents><VideoClicks><ClickTracking>/inline-click</ClickTracking></VideoClicks><MediaFiles><MediaFile type="video/mp4">/ad.mp4</MediaFile></MediaFiles></Linear></Creative></Creatives></InLine></Ad></VAST>`;
const wrapper = (next: string, name = "outer", skip = 5) => `<VAST><Ad><Wrapper><VASTAdTagURI>${next}</VASTAdTagURI><Impression>/${name}-i</Impression><Error>/${name}-e</Error><Creatives><Creative><Linear skipoffset="${skip}"><Duration>00:00:20</Duration><TrackingEvents><Tracking event="start">/${name}-start</Tracking></TrackingEvents><VideoClicks><ClickThrough>/${name}-landing</ClickThrough><ClickTracking>/${name}-click</ClickTracking></VideoClicks></Linear></Creative></Creatives></Wrapper></Ad></VAST>`;
const xml = (body: string, headers?: HeadersInit) => new Response(body, { headers });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

it("loads real nested XML and merges ordered wrapper beacons and nearest linear metadata", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(xml(wrapper("/nested")))
    .mockResolvedValueOnce(xml(wrapper("inline.xml", "inner", 7))).mockResolvedValueOnce(xml(inline));
  vi.stubGlobal("fetch", fetcher);
  const ad = await loadVast("https://ads.test/tag", signal());
  expect(ad).toMatchObject({ mediaUrl: "https://ads.test/ad.mp4", duration: 20, skipAfter: 7,
    clickThrough: "https://ads.test/inner-landing",
    impressions: ["outer", "inner", "inline"].map(n => `https://ads.test/${n}-i`),
    errors: ["outer", "inner", "inline"].map(n => `https://ads.test/${n}-e`),
    clickTracking: ["outer", "inner", "inline"].map(n => `https://ads.test/${n}-click`),
    tracking: { start: ["outer", "inner", "inline"].map(n => `https://ads.test/${n}-start`) } });
  expect(fetcher.mock.calls.map(call => call[0])).toEqual([
    "https://ads.test/tag", "https://ads.test/nested", "https://ads.test/inline.xml",
  ]);
  for (const [, options] of fetcher.mock.calls) {
    expect(options).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
    expect(options.headers).toBeUndefined();
  }
});

it("uses the redirected document URL to resolve relative wrapper tags", async () => {
  const redirected = xml(wrapper("next.xml"));
  Object.defineProperty(redirected, "url", { value: "https://cdn.test/folder/tag" });
  const fetcher = vi.fn().mockResolvedValueOnce(redirected).mockResolvedValueOnce(xml(inline));
  vi.stubGlobal("fetch", fetcher);
  expect(await loadVast("https://ads.test/tag", signal())).not.toBeNull();
  expect(fetcher.mock.calls[1][0]).toBe("https://cdn.test/folder/next.xml");
});

it("rejects wrapper cycles even when fragments differ", async () => {
  const fetcher = vi.fn().mockResolvedValue(xml(wrapper("/tag#again")));
  vi.stubGlobal("fetch", fetcher);
  expect(await loadVast("https://ads.test/tag", signal())).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([3, 4])("bounds wrapper hops (%i)", async (hops) => {
  let count = 0;
  const fetcher = vi.fn(async () => xml(count++ < hops ? wrapper(`/tag${count}`) : inline));
  vi.stubGlobal("fetch", fetcher);
  const ad = await loadVast("https://ads.test/tag0", signal());
  expect(ad === null).toBe(hops === 4);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it.each(["declared", "streamed"])("rejects XML above 1 MiB (%s)", async (kind) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(kind === "declared"
    ? xml(inline, { "Content-Length": "1048577" }) : xml(" ".repeat(1048577))));
  expect(await loadVast("https://ads.test/tag", signal())).toBeNull();
});

it.each([new Response("no", { status: 503 }), xml("<not-vast/>"), new Error("CORS")])(
  "fails open on bad responses and transport failures", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => response instanceof Error
      ? Promise.reject(response) : Promise.resolve(response)));
    expect(await loadVast("https://ads.test/tag", signal())).toBeNull();
  });

it("enforces one total deadline even if fetch never settles", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => {
    setTimeout(() => resolve(xml(wrapper("/slow"))), 5000);
  })).mockImplementation(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const pending = loadVast("https://ads.test/tag", signal());
  await vi.advanceTimersByTimeAsync(6000);
  expect(await pending).toBeNull();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("fails open immediately on caller abort and never fetches pre-aborted requests", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetcher);
  const pending = loadVast("https://ads.test/tag", controller.signal);
  controller.abort();
  expect(await pending).toBeNull();
  expect(await loadVast("https://ads.test/tag", controller.signal)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("expands raw/encoded beacon macros without auth, credentials, or referrer", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
  const fetcher = vi.fn().mockRejectedValue(new Error("tracking blocked"));
  vi.stubGlobal("fetch", fetcher);
  expect(() => trackVast(["javascript:alert(1)", "https://ads.test/pixel?e=%5BERRORCODE%5D&c=[CACHEBUSTING]&t=[TIMESTAMP]"], 402)).not.toThrow();
  const [url, options] = fetcher.mock.calls[0];
  expect(new URL(url).searchParams.get("e")).toBe("402");
  expect(new URL(url).searchParams.get("c")).toMatch(/^\d{8}$/);
  expect(new URL(url).searchParams.get("t")).toBe("2026-01-02T03:04:05.000Z");
  expect(options).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer", mode: "no-cors" });
  expect(options.headers).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await Promise.resolve();
});
