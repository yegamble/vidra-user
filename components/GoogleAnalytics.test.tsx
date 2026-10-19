// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GoogleAnalytics } from "./GoogleAnalytics";

const mocks = vi.hoisted(() => ({ pathname: "/", sync: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/google-analytics", () => ({
  analyticsPage: (path: string) => path === "/" || path.startsWith("/videos/") ? "/" : null,
  syncGoogleAnalytics: mocks.sync,
}));
const key = "vidra.analytics-consent";
const props = { enabled: true, measurementId: "G-TEST1234", nonce: "test-nonce" };
function choose(label: "Accept" | "Decline") {
  if (!screen.queryByRole("button", { name: label })) fireEvent.click(screen.getByRole("button", { name: "Analytics preferences" }));
  fireEvent.click(screen.getByRole("button", { name: label }));
}
beforeEach(() => { localStorage.clear(); mocks.pathname = "/"; mocks.sync.mockReset(); });
afterEach(() => {
  cleanup(); vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "doNotTrack"); Reflect.deleteProperty(navigator, "globalPrivacyControl");
});
it("renders safely on the server without reading storage or starting analytics", () => {
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("unavailable"); });
  expect(renderToString(<GoogleAnalytics {...props} />)).toBe("");
  expect(read).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
});
it.each([null, "unknown", '"granted"'])("never grants consent from unknown raw storage %s", value => {
  if (value !== null) localStorage.setItem(key, value);
  render(<GoogleAnalytics {...props} />);
  expect(screen.getByRole("region", { name: "Optional analytics" })).toBeTruthy();
  expect(mocks.sync.mock.calls.every(call => call[0] === null)).toBe(true);
});
it.each([[false, "G-TEST1234", "/"], [true, "", "/"], [true, "UA-1234", "/"], [true, "G-X<script>", "/"], [true, "G-TEST1234", "/messages/private"]] as const)("does nothing when disabled, invalid or private (%s, %s, %s)", (enabled, measurementId, pathname) => {
  localStorage.setItem(key, "granted"); mocks.pathname = pathname;
  render(<GoogleAnalytics {...props} enabled={enabled} measurementId={measurementId} />);
  expect(screen.queryByRole("region")).toBeNull(); expect(screen.queryByRole("button")).toBeNull();
  expect(mocks.sync.mock.calls.every(call => call[0] === null)).toBe(true);
});
it.each([["Accept", "granted"], ["Decline", "denied"]] as const)("persists an explicit %s choice", (label, choice) => {
  render(<GoogleAnalytics {...props} />); choose(label);
  expect(localStorage.getItem(key)).toBe(choice);
  expect(mocks.sync).toHaveBeenLastCalledWith(choice === "granted" ? props.measurementId : null, "/", props.nonce);
});
it("disables immediately before persisting withdrawal", () => {
  localStorage.setItem(key, "granted"); render(<GoogleAnalytics {...props} />);
  expect(mocks.sync).toHaveBeenLastCalledWith(props.measurementId, "/", props.nonce);
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
    expect(mocks.sync).toHaveBeenLastCalledWith(null, "/", props.nonce);
    write.call(this, name, value);
  });
  choose("Decline"); expect(localStorage.getItem(key)).toBe("denied");
});
it("fails closed when storage cannot be read", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  render(<GoogleAnalytics {...props} />);
  expect(mocks.sync.mock.calls.every(call => call[0] === null)).toBe(true);
});
it("does not activate when an explicit grant cannot be persisted", () => {
  render(<GoogleAnalytics {...props} />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  choose("Accept"); expect(mocks.sync.mock.calls.every(call => call[0] === null)).toBe(true);
});
it("synchronizes actual stored choices across tabs and handles clearing storage", () => {
  render(<GoogleAnalytics {...props} />);
  act(() => { localStorage.setItem(key, "granted"); window.dispatchEvent(new StorageEvent("storage", { key })); });
  expect(mocks.sync).toHaveBeenLastCalledWith(props.measurementId, "/", props.nonce);
  act(() => { localStorage.setItem(key, "denied"); window.dispatchEvent(new StorageEvent("storage", { key })); });
  expect(mocks.sync).toHaveBeenLastCalledWith(null, "/", props.nonce);
  act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent("storage", { key: null })); });
  expect(screen.getByRole("region", { name: "Optional analytics" })).toBeTruthy();
});
it.each([["doNotTrack", "1"], ["globalPrivacyControl", true]])("honors %s without showing a prompt or using saved grants", (name, value) => {
  Object.defineProperty(navigator, name, { configurable: true, value }); localStorage.setItem(key, "granted");
  render(<GoogleAnalytics {...props} />);
  expect(screen.queryByRole("button")).toBeNull(); expect(mocks.sync.mock.calls.every(call => call[0] === null)).toBe(true);
});
it("disables on private routes and config changes, resuming only on eligible routes", () => {
  localStorage.setItem(key, "granted"); const view = render(<GoogleAnalytics {...props} />);
  mocks.pathname = "/settings"; view.rerender(<GoogleAnalytics {...props} />);
  expect(mocks.sync).toHaveBeenLastCalledWith(null, "/settings", props.nonce);
  mocks.pathname = "/videos/public"; view.rerender(<GoogleAnalytics {...props} />);
  expect(mocks.sync).toHaveBeenLastCalledWith(props.measurementId, mocks.pathname, props.nonce);
  view.rerender(<GoogleAnalytics {...props} enabled={false} />);
  expect(mocks.sync).toHaveBeenLastCalledWith(null, mocks.pathname, props.nonce);
});
it("does not reset an active visit during StrictMode replay or unchanged rerenders", () => {
  localStorage.setItem(key, "granted"); const view = render(<StrictMode><GoogleAnalytics {...props} /></StrictMode>);
  const first = mocks.sync.mock.calls.findIndex(call => call[0] === props.measurementId);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(mocks.sync.mock.calls.slice(first).every(call => call[0] === props.measurementId)).toBe(true);
  mocks.sync.mockClear(); view.rerender(<StrictMode><GoogleAnalytics {...props} /></StrictMode>);
  expect(mocks.sync).not.toHaveBeenCalled();
});
