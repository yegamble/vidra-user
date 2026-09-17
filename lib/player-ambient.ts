import { useSyncExternalStore } from "react";

const KEY = "vidra.player.ambient";
const EVENT = "vidra:ambient";
let fallback = true;
let storageWriteFailed = false;
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}
function read() {
  // A readable old value must not undo a toggle whose write hit a storage limit.
  if (storageWriteFailed) return fallback;
  try { return sessionStorage.getItem(KEY) !== "0"; }
  catch { return fallback; }
}
export function useAmbientMode() { return useSyncExternalStore(subscribe, read, () => true); }
export function toggleAmbientMode() {
  fallback = !read();
  try {
    sessionStorage.setItem(KEY, fallback ? "1" : "0");
    storageWriteFailed = false;
  } catch { storageWriteFailed = true; }
  window.dispatchEvent(new Event(EVENT));
}
