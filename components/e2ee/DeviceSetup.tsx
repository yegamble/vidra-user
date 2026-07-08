"use client";

import { useState } from "react";

import { LockIcon } from "@/components/icons";
import { ApiError, errorMessage } from "@/lib/api";
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
        setError(errorMessage(err, "Could not set up encryption on this device. Please try again."));
      }
    }
  }

  return (
    <section className="flex max-w-md flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex items-center gap-2 text-fg">
        <LockIcon size={16} />
        <h2 className="text-[15px] font-bold tracking-tight">Set up encryption on this device</h2>
      </div>
      <p className="text-sm text-fg-muted">
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
        <label htmlFor="e2ee-device-name" className="text-sm font-semibold text-fg">
          Device name
        </label>
        <input
          id="e2ee-device-name"
          name="e2ee-device-name"
          type="text"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="focus-ring rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-muted"
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || name.trim() === ""}
          className="focus-ring self-start rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {busy ? "Setting up…" : "Set up this device"}
        </button>
      </form>
    </section>
  );
}
