"use client";

import { useState } from "react";

import { LockIcon } from "@/components/e2ee/LockIcon";
import { ApiError } from "@/lib/api";
import { getEngine, type LocalDevice } from "@/lib/e2ee/engine";

// DeviceSetup runs the first-encrypted-use flow on THIS browser: name the device,
// create the Olm account, publish its public keys, and seed one-time prekeys. The
// account is device-bound (pickled in IndexedDB) — the honest limitation copy
// (§1) makes clear a new device cannot read earlier messages.
export function DeviceSetup({ onReady }: { onReady: (device: LocalDevice) => void }) {
  const [name, setName] = useState("This browser");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setup() {
    const trimmed = name.trim();
    if (trimmed === "") return;
    setBusy(true);
    setError(null);
    try {
      const engine = await getEngine();
      const device = await engine.setupDevice(trimmed);
      onReady(device);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 422) {
        setError("You've reached the device limit. Remove a device in Settings → Devices first.");
      } else {
        setError("Could not set up encryption on this device. Please try again.");
      }
    }
  }

  return (
    <section className="flex max-w-md flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
        <LockIcon className="h-4 w-4" />
        <h2 className="text-base font-semibold">Set up encryption on this device</h2>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Encrypted messages are locked to the devices you set up. Give this browser a name so you can
        recognise it later. Messages sent before this device existed can&rsquo;t be read here.
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void setup();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="e2ee-device-name" className="text-sm font-medium">
          Device name
        </label>
        <input
          id="e2ee-device-name"
          name="e2ee-device-name"
          type="text"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || name.trim() === ""}
          className="self-start rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Setting up…" : "Set up this device"}
        </button>
      </form>
    </section>
  );
}
