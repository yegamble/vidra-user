"use client";

import { createContext, useContext, useMemo } from "react";

import { SOFTWARE_NAME, platformLabel } from "@/lib/software-brand";

// The client half of the white-label seam (lib/software-brand.ts). One decision
// — "may this deployment say the software's name?" — travels from the RSC
// instance snapshot to every client component through this context, wired ONCE
// in app/layout.tsx. Client components must not re-fetch /instance for it and
// must not receive it as a prop threaded through intermediate components.
//
// Server components skip the context entirely and call hideSoftwareName() on
// their own snapshot; both halves read the same field, so the two can never
// disagree about one render.
//
// The default is `hidden: false` — the same SHOW-by-default rule the pure seam
// documents. Concretely: a component test that renders a consumer without this
// provider, and the mocked Playwright suite (whose server reads have no backend
// to answer them), both keep today's behavior unchanged.

type SoftwareBrand = { hidden: boolean };

const SoftwareBrandContext = createContext<SoftwareBrand>({ hidden: false });

export function SoftwareBrandProvider({
  hidden,
  children,
}: {
  hidden: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ hidden }), [hidden]);
  return (
    <SoftwareBrandContext.Provider value={value}>{children}</SoftwareBrandContext.Provider>
  );
}

/** True when this instance is white-labelled. For non-prose decisions (filenames, whole blocks). */
export function useSoftwareBrandHidden(): boolean {
  return useContext(SoftwareBrandContext).hidden;
}

/** The software name to render, or null when it must not be said. */
export function useSoftwareName(): string | null {
  return useSoftwareBrandHidden() ? null : SOFTWARE_NAME;
}

/**
 * The subject for a sentence about the platform: "Vidra" or a neutral label.
 *
 * Pass `{ sentenceStart: false }` when the label is NOT the first word of its
 * sentence — the neutral form is a common noun phrase and would otherwise render
 * as a mid-sentence capital. See platformLabel() in lib/software-brand.ts.
 */
export function usePlatformLabel(options?: { sentenceStart?: boolean }): string {
  return platformLabel(useSoftwareBrandHidden(), options);
}
