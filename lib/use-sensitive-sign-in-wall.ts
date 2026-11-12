"use client";

import { useEffect, useState } from "react";

import { getInstanceCached } from "@/lib/api/instance-platform";

/**
 * Whether this instance asks for an account before showing sensitive videos
 * (`sensitive_anonymous_access: "sign_in"`). False until the shared instance
 * fetch lands and whenever it fails: this only chooses the wording of a prompt
 * the server has already decided to show, so guessing "no" is harmless.
 */
export function useSensitiveSignInWall(): boolean {
  const [wall, setWall] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getInstanceCached()
      .then((res) => {
        if (!cancelled) setWall(res.sensitive_anonymous_access === "sign_in");
      })
      .catch(() => {
        // No instance document: keep the members-only wording.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return wall;
}
