// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendTestMail: vi.fn() }));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, sendTestMail: mocks.sendTestMail },
  };
});

import { MailTestCard } from "./MailTestCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CONFIGURE = { name: "Configure email →" };

describe("MailTestCard", () => {
  it("reports acceptance as a promise to try, not as delivery", async () => {
    mocks.sendTestMail.mockResolvedValue({});
    render(<MailTestCard />);
    fireEvent.click(screen.getByRole("button", { name: "Send test message" }));
    await waitFor(() =>
      expect(screen.getByText("Handed to the relay")).toBeTruthy(),
    );
    expect(screen.getByText(/not proof of\s+delivery/)).toBeTruthy();
  });

  it("offers the way out of a dead end only where that is somewhere else", () => {
    const { unmount } = render(
      <MailTestCard configureHref="/admin/config/email" />,
    );
    expect(screen.getByRole("link", CONFIGURE).getAttribute("href")).toBe(
      "/admin/config/email",
    );
    unmount();

    // On the mail configuration page itself the link would point at the page
    // the reader is already on.
    render(<MailTestCard />);
    expect(screen.queryByRole("link", CONFIGURE)).toBeNull();
  });
});
