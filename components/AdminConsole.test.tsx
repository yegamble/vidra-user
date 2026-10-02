// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Queues badge is the only place an operator learns that work is waiting.
// With registration_require_approval on, applicants wait silently unless the
// badge counts them, and a badge fetched once on mount goes stale the moment
// the admin acts on the queue it counts.

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const nav = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const session = vi.hoisted(() => ({ user: null as { id: string; username: string; role: string } | null }));
vi.mock("@/components/auth/AuthProvider", () => ({ useSession: () => ({ user: session.user }) }));

const getReports = vi.hoisted(() => vi.fn());
const getRegistrationRequests = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { getReports, getRegistrationRequests } }));

import { AdminConsole } from "./AdminConsole";

const page = (total: number) => ({ total, limit: 1, offset: 0, reports: [], requests: [] });
const queuesLink = () => screen.getByRole("link", { name: /^Queues/ });
const registrationLink = () => screen.getByRole("link", { name: /^Registration/ });
// The pill's description lives in `title`; its text is the number alone, so the
// count appears once in the DOM and no label/text query matches the description.
const pill = (link: HTMLElement) => link.querySelector<HTMLElement>("span[title]");
const badge = (link: HTMLElement) => pill(link)?.title ?? "";

beforeEach(() => {
  session.user = { id: "u1", username: "boss", role: "admin" };
  nav.pathname = "/admin";
  getReports.mockResolvedValue(page(2));
  getRegistrationRequests.mockResolvedValue(page(1));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminConsole count badges", () => {
  it("gives each destination its own count, reading only `total`", async () => {
    render(<AdminConsole />);
    await waitFor(() => expect(badge(queuesLink())).toContain("2 open reports"));
    expect(badge(registrationLink())).toContain("1 sign-up waiting for approval");
    // The reports badge never absorbs sign-ups: its page lists only reports.
    expect(badge(queuesLink())).not.toContain("sign-up");
    expect(pill(queuesLink())?.textContent).toBe("2");
    expect(queuesLink().querySelector("[aria-label], .sr-only")).toBeNull();
    expect(getReports).toHaveBeenCalledWith({ status: "open", limit: 1 }, expect.any(AbortSignal));
    expect(getRegistrationRequests).toHaveBeenCalledWith(
      { status: "pending", limit: 1 },
      expect.any(AbortSignal),
    );
  });

  it("keeps the other badge when one read fails", async () => {
    getReports.mockRejectedValue(new Error("boom"));
    render(<AdminConsole />);
    await waitFor(() => expect(badge(registrationLink())).toContain("1 sign-up waiting"));
    expect(badge(queuesLink())).not.toContain("open report");

    cleanup();
    getReports.mockResolvedValue(page(2));
    getRegistrationRequests.mockRejectedValue(new Error("boom"));
    render(<AdminConsole />);
    await waitFor(() => expect(badge(queuesLink())).toContain("2 open reports"));
    expect(badge(registrationLink())).not.toContain("sign-up waiting");
  });

  it("refetches when the pathname changes", async () => {
    const { rerender } = render(<AdminConsole />);
    await waitFor(() => expect(badge(registrationLink())).toContain("1 sign-up waiting"));
    getRegistrationRequests.mockResolvedValue(page(0));

    nav.pathname = "/admin/registration-requests";
    rerender(<AdminConsole />);

    await waitFor(() => expect(badge(registrationLink())).not.toContain("sign-up waiting"));
    expect(badge(queuesLink())).toContain("2 open reports");
    expect(getReports).toHaveBeenCalledTimes(2);
    expect(getRegistrationRequests).toHaveBeenCalledTimes(2);
  });

  it("makes no queue reads for a role that cannot see registrations", () => {
    // The endpoint is requireRole(admin) in vidra-core; a moderator calling it
    // would draw a 403 on every navigation.
    session.user = { id: "u2", username: "mod", role: "moderator" };
    render(<AdminConsole />);
    expect(getRegistrationRequests).not.toHaveBeenCalled();
    expect(getReports).not.toHaveBeenCalled();
  });
});
