"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const StaffDocument = createContext(false);

export function useStaffDocument() {
  return useContext(StaffDocument);
}

function isStaffPath(pathname: string | null) {
  return /^\/(?:admin|moderation|mod)(?:\/|$)/.test(pathname ?? "");
}

// Instance scripts can register listeners or start vendor code that outlives
// the page where it was loaded. Crossing the staff boundary needs a fresh JS
// document even when the Next router, history, or a prefetched link is used.
export function StaffDocumentBoundary({ isolateScripts, children }: { isolateScripts: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const staff = isStaffPath(pathname);
  const [initialStaff] = useState(staff);
  const crossed = isolateScripts && staff !== initialStaff;

  useLayoutEffect(() => {
    if (!isolateScripts) return;
    if (crossed) {
      window.location.reload();
      return;
    }
    function followAcrossBoundary(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
          event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") ||
          (link.target && link.target.toLowerCase() !== "_self")) return;
      if (link.origin === window.location.origin && isStaffPath(link.pathname) !== staff) {
        // Let the browser follow the anchor. A Next Link would otherwise replace
        // its default action with an in-document push.
        event.stopPropagation();
      }
    }
    document.addEventListener("click", followAcrossBoundary, true);
    return () => document.removeEventListener("click", followAcrossBoundary, true);
  }, [crossed, isolateScripts, staff]);

  // History or programmatic navigation can reach this branch without a click.
  // Mount the destination's children only in the new document.
  return crossed ? null : <StaffDocument.Provider value={staff}>{children}</StaffDocument.Provider>;
}
