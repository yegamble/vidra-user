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

const updateContentPreferences = vi.fn();
vi.mock("@/lib/api", () => ({
  errorMessage: (_err: unknown, fallback: string) => fallback,
  api: { updateContentPreferences: (...a: unknown[]) => updateContentPreferences(...a) },
}));

import { hydrateContentPreferences, resetContentPreferences } from "@/lib/content-preferences";
import { ContentSettingsView } from "./ContentSettingsView";

const SELECT_LABEL = "Show sensitive videos";

beforeEach(() => {
  sessionStatus = "authed";
  sessionUser = { id: "u1", sensitive_content_policy: undefined };
  instancePolicy = "display";
});

afterEach(() => {
  cleanup();
  resetContentPreferences();
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

describe("ContentSettingsView per-kind policies", () => {
  it("shows each kind's saved override, defaulting to 'Same as above'", () => {
    hydrateContentPreferences({ sensitive_flag_policies: { violent: "blur" }, preferred_languages: [] });
    render(<ContentSettingsView />);
    expect((screen.getByLabelText("Violent or graphic") as HTMLSelectElement).value).toBe("blur");
    expect((screen.getByLabelText("Sexual content") as HTMLSelectElement).value).toBe("");
  });

  it("PUTs the full map with the changed kind and adopts the server's answer", async () => {
    hydrateContentPreferences({ sensitive_flag_policies: { violent: "blur" }, preferred_languages: [] });
    updateContentPreferences.mockResolvedValue({
      sensitive_flag_policies: { violent: "blur", sex: "hide" },
      preferred_languages: [],
    });
    render(<ContentSettingsView />);
    fireEvent.change(screen.getByLabelText("Sexual content"), { target: { value: "hide" } });
    await waitFor(() =>
      expect(updateContentPreferences).toHaveBeenCalledWith({
        sensitive_flag_policies: { violent: "blur", sex: "hide" },
      }),
    );
    await waitFor(() =>
      expect((screen.getByLabelText("Sexual content") as HTMLSelectElement).value).toBe("hide"),
    );
  });

  it("choosing 'Same as above' sends an empty string to inherit", async () => {
    hydrateContentPreferences({ sensitive_flag_policies: { sex: "hide" }, preferred_languages: [] });
    updateContentPreferences.mockResolvedValue({ sensitive_flag_policies: {}, preferred_languages: [] });
    render(<ContentSettingsView />);
    fireEvent.change(screen.getByLabelText("Sexual content"), { target: { value: "" } });
    await waitFor(() =>
      expect(updateContentPreferences).toHaveBeenCalledWith({ sensitive_flag_policies: { sex: "" } }),
    );
  });

  it("keeps the old value and says so when the save fails", async () => {
    hydrateContentPreferences({ sensitive_flag_policies: { sex: "blur" }, preferred_languages: [] });
    updateContentPreferences.mockRejectedValue(new Error("boom"));
    render(<ContentSettingsView />);
    fireEvent.change(screen.getByLabelText("Sexual content"), { target: { value: "hide" } });
    expect(await screen.findByText("Could not save that change.")).toBeTruthy();
    expect((screen.getByLabelText("Sexual content") as HTMLSelectElement).value).toBe("blur");
  });
});
