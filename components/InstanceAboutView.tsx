"use client";

import { useEffect, useState } from "react";

import { ProtocolBadge } from "@/components/ProtocolBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { InstanceResponse } from "@/lib/api";

// InstanceAboutView is the /about surface: the public instance document
// (GET /instance) — name, description, software, registration policy, contact
// and policy links — plus the instance-level protocol label: ProtocolBadge
// reads `federation_enabled`, closing the Wave A gap where the instance-wide
// "ActivityPub / Local only" labeling had no contract field to stand on.
export function InstanceAboutView() {
  const [instance, setInstance] = useState<InstanceResponse | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then(setInstance)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [reloadKey]);

  if (error) {
    return (
      <ErrorState
        message="Could not load this instance's details."
        onRetry={() => {
          setError(false);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  if (instance === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading instance details" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{instance.name}</h1>
          <ProtocolBadge protocol={instance.federation_enabled ? "activitypub" : "local"} />
        </div>
        {instance.description ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{instance.description}</p>
        ) : null}
      </header>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Federation</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {instance.federation_enabled
            ? "This instance federates over ActivityPub: public videos and channels here can be followed and watched from other instances, and remote content can appear in local feeds."
            : "This instance does not federate — everything published here stays on this server."}
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Registration</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {instance.registration_enabled
            ? instance.registration_requires_approval
              ? "Open — new accounts require administrator approval."
              : "Open — anyone can create an account."
            : "Closed — this instance is not accepting new accounts."}
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Software</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {instance.software.name} v{instance.software.version}
        </p>
      </section>

      {instance.contact_email || instance.terms_url || instance.privacy_url ? (
        <section className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Contact and policies
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {instance.contact_email ? (
              <li>
                <a
                  href={`mailto:${instance.contact_email}`}
                  className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {instance.contact_email}
                </a>
              </li>
            ) : null}
            {instance.terms_url ? (
              <li>
                <a
                  href={instance.terms_url}
                  className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Terms of service
                </a>
              </li>
            ) : null}
            {instance.privacy_url ? (
              <li>
                <a
                  href={instance.privacy_url}
                  className="text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Privacy policy
                </a>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
