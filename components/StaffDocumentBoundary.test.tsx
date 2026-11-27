// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffDocumentBoundary, useStaffDocument } from "./StaffDocumentBoundary";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
afterEach(cleanup);

function Links({ onClick }: { onClick: () => void }) {
  const staff = useStaffDocument();
  return <a href="/moderation/quarantine" data-staff={String(staff)} onClick={onClick}>
    <span>Open queue</span>
  </a>;
}

describe("staff document navigation", () => {
  it.each([
    ["/videos", true, false, false],
    ["/mod/jobs", true, true, true],
    ["/admin/users", true, true, true],
    ["/moderation", true, true, true],
    ["/about/instance/moderation", true, false, false],
    ["/moderator", true, false, false],
    ["/videos", false, true, false],
  ] as const)("handles links from %s with operator scripts %s", (pathname, isolateScripts, usesRouter, staff) => {
    route.pathname = pathname;
    const onClick = vi.fn();
    const { getByText } = render(<StaffDocumentBoundary isolateScripts={isolateScripts}>
      <Links onClick={onClick} />
    </StaffDocumentBoundary>);
    const label = getByText("Open queue");
    expect(label.closest("a")?.dataset.staff).toBe(String(staff));
    // Suppress jsdom's anchor default after our capture handler. A real
    // browser performs its native document navigation in this case.
    document.addEventListener("click", event => event.preventDefault(), { capture: true, once: true });
    label.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(usesRouter ? 1 : 0);
  });
});
