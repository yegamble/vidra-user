// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNotificationPrefs: vi.fn(),
  updateNotificationPrefs: vi.fn(),
  updateNotificationEmailPrefs: vi.fn(),
  session: { status: "authed", user: { id: "u1", email_verified: true } as { id: string; email_verified: boolean } },
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getNotificationPrefs: mocks.getNotificationPrefs,
      updateNotificationPrefs: mocks.updateNotificationPrefs,
      updateNotificationEmailPrefs: mocks.updateNotificationEmailPrefs,
    },
    errorMessage: (error: unknown) => (error instanceof Error ? error.message : "something went wrong"),
  };
});

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => mocks.session,
}));

import { NotificationPrefsView } from "./NotificationPrefsView";

const ALL_ON = { comment: true, comment_reply: true, follow: true, new_video: true };
const EMAIL_OFF = { comment: false, comment_reply: false, new_video: false };

function emailSwitch(label: string) {
  return screen.getByRole("switch", { name: `${label} email notifications` });
}

beforeEach(() => {
  mocks.session.user = { id: "u1", email_verified: true };
  mocks.getNotificationPrefs.mockResolvedValue({ prefs: ALL_ON, email: EMAIL_OFF });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NotificationPrefsView email column", () => {
  it("offers an email switch exactly for the types the server can email, off by default", async () => {
    render(<NotificationPrefsView />);
    await screen.findByRole("switch", { name: "Comments notifications" });

    for (const label of ["Comments", "Replies", "New videos"]) {
      expect(emailSwitch(label).getAttribute("aria-checked")).toBe("false");
    }
    // follow is in the in-app map but has no email delivery: no dead switch.
    expect(screen.getByRole("switch", { name: "New followers notifications" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "New followers email notifications" })).toBeNull();
  });

  it("PATCHes only the email map and adopts the server's answer", async () => {
    mocks.updateNotificationEmailPrefs.mockResolvedValue({
      prefs: ALL_ON,
      email: { ...EMAIL_OFF, new_video: true },
    });
    render(<NotificationPrefsView />);
    await screen.findByRole("switch", { name: "New videos email notifications" });

    fireEvent.click(emailSwitch("New videos"));

    await waitFor(() => expect(mocks.updateNotificationEmailPrefs).toHaveBeenCalledWith({ new_video: true }));
    expect(mocks.updateNotificationPrefs).not.toHaveBeenCalled();
    await waitFor(() => expect(emailSwitch("New videos").getAttribute("aria-checked")).toBe("true"));
  });

  it("disables a type's email switch while its in-app notification is off", async () => {
    mocks.getNotificationPrefs.mockResolvedValue({
      prefs: { ...ALL_ON, comment: false },
      email: { ...EMAIL_OFF, comment: true },
    });
    render(<NotificationPrefsView />);
    await screen.findByRole("switch", { name: "Comments email notifications" });

    expect((emailSwitch("Comments") as HTMLButtonElement).disabled).toBe(true);
    expect((emailSwitch("Replies") as HTMLButtonElement).disabled).toBe(false);
  });

  it("reverts a failed email change and says so", async () => {
    mocks.updateNotificationEmailPrefs.mockRejectedValue(new Error("Could not save"));
    render(<NotificationPrefsView />);
    await screen.findByRole("switch", { name: "Replies email notifications" });

    fireEvent.click(emailSwitch("Replies"));

    expect(await screen.findByText("Could not save")).toBeTruthy();
    expect(emailSwitch("Replies").getAttribute("aria-checked")).toBe("false");
  });

  it("tells an unverified user that email needs a verified address", async () => {
    mocks.session.user = { id: "u1", email_verified: false };
    render(<NotificationPrefsView />);
    await screen.findByRole("switch", { name: "Comments email notifications" });

    expect(screen.getByText(/verified email address/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /verify your address/i }).getAttribute("href")).toBe("/settings");
  });

  it("does not nag a verified user", async () => {
    render(<NotificationPrefsView />);
    await screen.findByRole("switch", { name: "Comments email notifications" });
    expect(screen.queryByRole("link", { name: /verify your address/i })).toBeNull();
  });

  it("renders no email column against a server that sends no email map", async () => {
    mocks.getNotificationPrefs.mockResolvedValue({ prefs: ALL_ON });
    render(<NotificationPrefsView />);
    await screen.findByRole("switch", { name: "Comments notifications" });
    expect(screen.queryByRole("switch", { name: /email notifications/ })).toBeNull();
  });
});
