// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const updateProfile = vi.fn(() => Promise.resolve());
let sessionUser: Record<string, unknown> | null;
let sessionStatus: string;
vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: sessionStatus, user: sessionUser, updateProfile }),
}));

let instancePolicy: string | null;
vi.mock("@/lib/use-sensitive-policy", () => ({
  useInstanceSensitivePolicy: () => instancePolicy,
}));

vi.mock("@/lib/api", () => ({
  errorMessage: (_err: unknown, fallback: string) => fallback,
}));

import { ContentSettingsView } from "./ContentSettingsView";

const SELECT_LABEL = "Show sensitive videos";

beforeEach(() => {
  sessionStatus = "authed";
  sessionUser = { id: "u1", sensitive_content_policy: undefined };
  instancePolicy = "display";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContentSettingsView", () => {
  it("labels the inherit option with the current instance policy", () => {
    instancePolicy = "warn";
    render(<ContentSettingsView />);
    expect(
      screen.getByRole("option", { name: "Use instance default (Warn before playing)" }),
    ).toBeTruthy();
  });

  it("reflects the user's current override as the selected value", () => {
    sessionUser = { id: "u1", sensitive_content_policy: "blur" };
    render(<ContentSettingsView />);
    expect((screen.getByLabelText(SELECT_LABEL) as HTMLSelectElement).value).toBe("blur");
  });

  it("defaults to inherit ('') when the account has no override", () => {
    render(<ContentSettingsView />);
    expect((screen.getByLabelText(SELECT_LABEL) as HTMLSelectElement).value).toBe("");
  });

  it("PATCHes the chosen policy and shows a saved status", async () => {
    render(<ContentSettingsView />);
    fireEvent.change(screen.getByLabelText(SELECT_LABEL), { target: { value: "hide" } });
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ sensitive_content_policy: "hide" }),
    );
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });

  it("clears the override to inherit by sending an empty string", async () => {
    sessionUser = { id: "u1", sensitive_content_policy: "blur" };
    render(<ContentSettingsView />);
    fireEvent.change(screen.getByLabelText(SELECT_LABEL), { target: { value: "" } });
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ sensitive_content_policy: "" }),
    );
  });

  it("reverts the selection and reports an error when the save fails", async () => {
    updateProfile.mockRejectedValueOnce(new Error("nope"));
    render(<ContentSettingsView />);
    const select = screen.getByLabelText(SELECT_LABEL) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "warn" } });
    await waitFor(() => expect(select.value).toBe("")); // reverted
    expect(screen.getByText("Could not save that change.")).toBeTruthy();
  });

  it("prompts to sign in when the session has ended", () => {
    sessionStatus = "anon";
    sessionUser = null;
    render(<ContentSettingsView />);
    expect(screen.getByText("Sign in to manage your content settings")).toBeTruthy();
  });
});
