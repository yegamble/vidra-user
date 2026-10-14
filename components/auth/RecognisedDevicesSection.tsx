"use client";

import { useEffect, useId, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { authApi, errorMessage } from "@/lib/api";
import type { RecognisedDevice } from "@/lib/api";

/**
 * RecognisedDevicesSection is the /settings/security front for the account's
 * recognised browsers and devices (GET/DELETE /auth/devices) and the
 * new-device sign-in email switch (PATCH /auth/security-prefs).
 *
 * A device is a coarse label ("Chrome on macOS") and two timestamps: the API
 * stores no IP address. "Forget" only removes the record, so the next sign-in
 * from that browser counts as new and mails the account. It does NOT end the
 * browser's session; the copy says so and points at "Sign out of all devices",
 * because sessions carry no device link.
 */
export function RecognisedDevicesSection() {
  const titleId = useId();
  const switchId = useId();
  const [devices, setDevices] = useState<RecognisedDevice[] | null>(null);
  const [emailOn, setEmailOn] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    (async () => {
      try {
        const res = await authApi.listDevices(ctl.signal);
        setDevices(res.devices);
        setEmailOn(res.new_device_email);
      } catch {
        if (!ctl.signal.aborted) setLoadFailed(true);
      }
    })();
    return () => ctl.abort();
  }, []);

  async function forget(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await authApi.forgetDevice(id);
      setDevices((cur) => (cur ?? []).filter((d) => d.id !== id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleEmail(next: boolean) {
    setError(null);
    setEmailOn(next);
    try {
      await authApi.updateSecurityPrefs({ new_device_email: next });
    } catch (err) {
      setEmailOn(!next);
      setError(errorMessage(err));
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-base font-semibold tracking-tight text-fg">
          Recognised devices
        </h2>
        <p className="text-sm text-fg-muted">
          Browsers you have signed in from. Signing in from one that is not on this list sends you
          an email. Forgetting a device only removes it from this list; to end its session use
          &ldquo;Sign out of all devices&rdquo; below.
        </p>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {loadFailed ? (
        <Alert>Your recognised devices could not be loaded. Try again later.</Alert>
      ) : devices === null ? (
        <Spinner />
      ) : devices.length === 0 ? (
        <p className="text-sm text-fg-muted">No devices recorded yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-fg">
                  {d.label}
                  {d.current ? (
                    <span className="ml-2 rounded-full bg-surface-strong px-2 py-0.5 text-xs font-semibold text-fg-muted">
                      This device
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-fg-muted">
                  Last signed in {new Date(d.last_seen_at).toLocaleDateString()}
                </span>
              </div>
              <button
                type="button"
                disabled={busyId === d.id}
                onClick={() => void forget(d.id)}
                aria-label={`Forget device ${d.label}`}
                className="focus-ring rounded-full border border-border-subtle px-3 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-strong disabled:opacity-60"
              >
                {busyId === d.id ? "Forgetting…" : "Forget"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={switchId} className="flex items-center gap-3 text-sm text-fg">
        <input
          id={switchId}
          type="checkbox"
          checked={emailOn}
          disabled={loadFailed}
          onChange={(e) => void toggleEmail(e.target.checked)}
          className="focus-ring h-4 w-4"
        />
        Email me when my account is signed in from a new device
      </label>
    </section>
  );
}
