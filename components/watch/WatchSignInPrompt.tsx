"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LinkButton } from "@/components/ui/LinkButton";
import { Modal } from "@/components/ui/Modal";

const WatchSignInContext = createContext<((action: string) => void) | null>(null);
/** Optional so shared controls keep their existing behavior outside watch pages. */
export const useWatchSignIn = () => useContext(WatchSignInContext);

export function WatchSignInProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<{ action: string; href: string } | null>(null);
  function request(action: string) {
    const returnTo = window.location.pathname + window.location.search + window.location.hash;
    setPrompt({ action, href: `/login?return_to=${encodeURIComponent(returnTo)}` });
  }
  return <WatchSignInContext.Provider value={request}>
    {children}
    {prompt ? createPortal(<Modal title={`Sign in to ${prompt.action}`} onClose={() => setPrompt(null)}>
      <p className="mb-5 text-sm text-fg-muted">You’ll return to this video after signing in.</p>
      <LinkButton href={prompt.href}>Sign in</LinkButton>
    </Modal>, document.body) : null}
  </WatchSignInContext.Provider>;
}
