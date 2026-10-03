// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAuditLog: vi.fn() }));

vi.mock("next/navigation", async () => (await import("@/lib/test-navigation")).navigationMock);
vi.mock("@/components/RoleGate", () => ({
  RoleGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/api", () => ({
  api: { getAuditLog: mocks.getAuditLog },
  errorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { AdminAuditLogView } from "@/components/AdminAuditLogView";
import { navigation } from "@/lib/test-navigation";

const OCCURRED_AT = "2026-07-10T14:30:00Z";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    schema_version: 1,
    domain: "admin",
    action: "admin.settings.update",
    result: "success",
    actor_kind: "user",
    actor_username: "mona",
    occurred_at: OCCURRED_AT,
    ...overrides,
  };
}

function respond(entries: unknown[]) {
  mocks.getAuditLog.mockResolvedValue({ entries, total: entries.length, limit: 20, offset: 0 });
}

beforeEach(() => {
  navigation.reset("/admin/audit-log");
  mocks.getAuditLog.mockReset();
});

afterEach(() => cleanup());

describe("AdminAuditLogView", () => {
  it("renders a change as field: before → after", async () => {
    respond([
      entry({
        changes: [{ field: "setting.registration_enabled", before: "false", after: "true" }],
      }),
    ]);
    render(<AdminAuditLogView />);

    const list = await screen.findByRole("list", { name: "Changes" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe("setting.registration_enabled: false → true");
  });

  it("names a value-less change as changed and never invents a value", async () => {
    // The server records no values for secret / free-text settings: both sides
    // are omitted. Anything rendered after the field name would be fabricated.
    respond([entry({ changes: [{ field: "setting.smtp_password" }] })]);
    render(<AdminAuditLogView />);

    const list = await screen.findByRole("list", { name: "Changes" });
    expect(within(list).getByRole("listitem").textContent).toBe("setting.smtp_password: changed");
    expect(list.textContent).not.toContain("→");
  });

  it("labels an absent side as not set rather than printing an empty value", async () => {
    respond([entry({ changes: [{ field: "setting.site_tagline", after: "Hello" }] })]);
    render(<AdminAuditLogView />);

    const list = await screen.findByRole("list", { name: "Changes" });
    expect(within(list).getByRole("listitem").textContent).toBe(
      "setting.site_tagline: (not set) → Hello",
    );
  });

  it("truncates a long value visually and keeps the full text in a title", async () => {
    const long = "x".repeat(200);
    respond([entry({ changes: [{ field: "setting.motd", before: "short", after: long }] })]);
    render(<AdminAuditLogView />);

    const list = await screen.findByRole("list", { name: "Changes" });
    const full = within(list).getByTitle(long);
    expect(full.textContent).toContain("…");
    expect(full.textContent!.length).toBeLessThan(long.length);
  });

  it("omits the changes list when an entry has none", async () => {
    respond([entry()]);
    render(<AdminAuditLogView />);

    await screen.findByText("admin.settings.update");
    expect(screen.queryByRole("list", { name: "Changes" })).toBeNull();
  });

  it("shows the target, linking a video and leaving other types as plain text", async () => {
    respond([
      entry({ id: "a", resource_type: "video", resource_id: "vid-123" }),
      entry({ id: "b", resource_type: "user", resource_id: "user-456" }),
    ]);
    render(<AdminAuditLogView />);

    const link = await screen.findByRole("link", { name: "vid-123" });
    expect(link.getAttribute("href")).toBe("/videos/vid-123");
    expect(screen.getByText(/Target:\s*user\s*user-456/)).toBeTruthy();
    // The user route is keyed by username; the audit row only has the id.
    expect(screen.queryByRole("link", { name: "user-456" })).toBeNull();
  });

  it("shows the absolute timestamp as a machine-readable <time>", async () => {
    respond([entry()]);
    const { container } = render(<AdminAuditLogView />);

    await screen.findByText("admin.settings.update");
    const time = container.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(OCCURRED_AT);
    expect(time?.getAttribute("title")).toBe(OCCURRED_AT);
    expect(time?.textContent).toContain("2026");
  });
});
