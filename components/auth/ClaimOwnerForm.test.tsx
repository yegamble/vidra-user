// @vitest-environment jsdom
//
// The first-run owner wizard: the claim itself (session established through the
// login seam), the three error answers the backend can give, and the guard that
// keeps a claimed server out of the wizard.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { routerReplace, routerPush, claimOwnerMock, getInstanceCachedMock, invalidateMock } =
  vi.hoisted(() => ({
    routerReplace: vi.fn(),
    routerPush: vi.fn(),
    claimOwnerMock: vi.fn(),
    getInstanceCachedMock: vi.fn(),
    invalidateMock: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));

vi.mock("@/components/auth/AuthProvider", () => ({
  useSession: () => ({ status: "anon", claimOwner: claimOwnerMock }),
}));

vi.mock("@/lib/api/instance-platform", () => ({
  getInstanceCached: getInstanceCachedMock,
  invalidateInstanceCache: invalidateMock,
}));

import { ApiError } from "@/lib/api";
import {
  OWNER_CLAIM_CLI_COMMAND,
  OWNER_CLAIM_INVALID_CODE,
  OWNER_CLAIM_LOG_COMMAND,
} from "@/lib/owner-claim";

import { ClaimOwnerForm } from "./ClaimOwnerForm";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // jsdom keeps one location across tests; a fragment left by one case would
  // prefill the next.
  window.history.replaceState(null, "", "/");
  routerReplace.mockReset();
  routerPush.mockReset();
  claimOwnerMock.mockReset();
  getInstanceCachedMock.mockReset();
  invalidateMock.mockReset();
});

/** The server is still waiting — the wizard's normal condition. */
function pendingInstance() {
  getInstanceCachedMock.mockResolvedValue({ owner_claim_pending: true });
}

function fillWizard({ confirm = "supersecret" }: { confirm?: string } = {}) {
  fireEvent.change(screen.getByLabelText("Setup token"), { target: { value: "s3tup-token" } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ada" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "supersecret" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: confirm } });
}

function submitWizard() {
  fireEvent.click(screen.getByRole("button", { name: "Create the owner account" }));
}

describe("ClaimOwnerForm", () => {
  it("redeems the token and lands on the signed-in confirmation", async () => {
    pendingInstance();
    claimOwnerMock.mockResolvedValue(undefined);
    render(<ClaimOwnerForm />);

    fillWizard();
    submitWizard();

    await waitFor(() => expect(claimOwnerMock).toHaveBeenCalled());
    expect(claimOwnerMock.mock.calls[0][0]).toEqual({
      token: "s3tup-token",
      username: "ada",
      email: "ada@example.test",
      password: "supersecret",
    });
    // The claim's session comes back through the same seam as a login, so the
    // wizard ends signed in — no bounce through the credentials form.
    expect(await screen.findByText("Your server is ready")).toBeTruthy();
    expect(screen.getByText(/You are signed in as ada/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open your server settings" })).toBeTruthy();
    // The cached instance document said "waiting"; that answer is now wrong.
    expect(invalidateMock).toHaveBeenCalled();
  });

  it("gives both reasons a 403 can mean — a rotated token or a claimed server", async () => {
    pendingInstance();
    claimOwnerMock.mockRejectedValue(
      new ApiError({
        status: 403,
        code: OWNER_CLAIM_INVALID_CODE,
        message: "invalid setup token",
      }),
    );
    render(<ClaimOwnerForm />);

    fillWizard();
    submitWizard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("That setup token was not accepted.");
    expect(alert.textContent).toContain("new setup token every time it restarts");
    // The same 403 answers an ALREADY-CLAIMED server, where the log command
    // prints nothing: the other cause, and its way out, are in the lede.
    expect(alert.textContent).toContain("already has an owner");
    expect(within(alert).getByRole("link", { name: "sign in" }).getAttribute("href")).toBe(
      "/login",
    );
    // The command is the production invocation, not the bare one that would
    // pick up the dev override on a prod host.
    expect(alert.textContent).toContain(OWNER_CLAIM_LOG_COMMAND);
    expect(alert.textContent).toContain("--env-file env/production.env");
    // The CLI that prints a ready, prefilled link is offered first; the log
    // command stays for hosts whose CLI predates it.
    expect(alert.textContent).toContain(OWNER_CLAIM_CLI_COMMAND);
    expect(alert.textContent!.indexOf(OWNER_CLAIM_CLI_COMMAND)).toBeLessThan(
      alert.textContent!.indexOf(OWNER_CLAIM_LOG_COMMAND),
    );
  });

  it("points a conflict at signing in instead", async () => {
    pendingInstance();
    claimOwnerMock.mockRejectedValue(
      new ApiError({ status: 409, code: "conflict", message: "username already taken" }),
    );
    render(<ClaimOwnerForm />);

    fillWizard();
    submitWizard();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Someone finished setting up this server first.");
    expect(screen.getAllByRole("link", { name: "sign in" }).length).toBeGreaterThan(0);
  });

  it("shows validation problems against their own fields", async () => {
    pendingInstance();
    claimOwnerMock.mockRejectedValue(
      new ApiError({
        status: 422,
        code: "validation_failed",
        message: "validation failed",
        fields: [
          { field: "username", message: "must be at least 3 characters" },
          { field: "password", message: "must be at least 8 characters" },
        ],
      }),
    );
    render(<ClaimOwnerForm />);

    fillWizard();
    submitWizard();

    expect(await screen.findByText("must be at least 3 characters")).toBeTruthy();
    expect(screen.getByText("must be at least 8 characters")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("catches a mistyped confirmation before calling the server", async () => {
    pendingInstance();
    render(<ClaimOwnerForm />);

    fillWizard({ confirm: "supersecrets" });
    submitWizard();

    expect(await screen.findByText("Both passwords need to match.")).toBeTruthy();
    expect(claimOwnerMock).not.toHaveBeenCalled();
  });

  it.each([
    ["says the server already has an owner", { owner_claim_pending: false }],
    // A backend that predates the claim flow never sends the field; the shared
    // predicate reads that as "not waiting", and so must this guard.
    ["does not report a first-run state at all", {}],
  ])("leaves for home when the live instance %s", async (_label, doc) => {
    getInstanceCachedMock.mockResolvedValue(doc);
    render(<ClaimOwnerForm />);
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/"));
  });

  it("keeps the wizard when the instance document cannot be read", async () => {
    getInstanceCachedMock.mockRejectedValue(new Error("offline"));
    render(<ClaimOwnerForm />);
    await waitFor(() => expect(getInstanceCachedMock).toHaveBeenCalled());
    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Setup token")).toBeTruthy();
  });

  it("leads with the reason when a turned-away signup sent the visitor here", async () => {
    pendingInstance();
    render(<ClaimOwnerForm fromSignup />);
    expect(screen.getByText(/Sign-ups are on hold until this server has an owner/)).toBeTruthy();
  });

  // `vidra claim` prints <origin>/setup/claim#token=<token>. A fragment — not a
  // query string — because a fragment is never sent to the server, so the
  // token stays out of access logs and Referer headers.
  describe("setup token from the link fragment", () => {
    const tokenField = () => screen.getByLabelText("Setup token") as HTMLInputElement;

    it("prefills the token from #token=, URL-decoded, and says so", async () => {
      pendingInstance();
      window.history.replaceState(null, "", "/setup/claim#token=ab%2Bc%2Fd%3D");
      render(<ClaimOwnerForm />);

      await waitFor(() => expect(tokenField().value).toBe("ab+c/d="));
      expect(screen.getByText("Setup token filled in from your link.")).toBeTruthy();
    });

    it("keeps the prefilled token editable and does not submit on its own", async () => {
      pendingInstance();
      window.history.replaceState(null, "", "/setup/claim#token=from-link");
      render(<ClaimOwnerForm />);

      await waitFor(() => expect(tokenField().value).toBe("from-link"));
      fireEvent.change(tokenField(), { target: { value: "typed-instead" } });
      expect(tokenField().value).toBe("typed-instead");
      expect(claimOwnerMock).not.toHaveBeenCalled();
    });

    it("clears the fragment from the address bar, keeping path and query", async () => {
      pendingInstance();
      window.history.replaceState(null, "", "/setup/claim?from=signup#token=from-link");
      const replace = vi.spyOn(window.history, "replaceState");
      render(<ClaimOwnerForm />);

      await waitFor(() => expect(tokenField().value).toBe("from-link"));
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace.mock.calls[0][2]).toBe("/setup/claim?from=signup");
      expect(window.location.hash).toBe("");
      expect(window.location.pathname + window.location.search).toBe("/setup/claim?from=signup");
    });

    it("ignores a ?token= query string and leaves the URL alone", async () => {
      pendingInstance();
      window.history.replaceState(null, "", "/setup/claim?token=from-query");
      const replace = vi.spyOn(window.history, "replaceState");
      render(<ClaimOwnerForm />);

      await waitFor(() => expect(getInstanceCachedMock).toHaveBeenCalled());
      expect(tokenField().value).toBe("");
      expect(screen.queryByText("Setup token filled in from your link.")).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    });

    it.each([
      ["an empty fragment", "#"],
      ["an empty token value", "#token="],
      ["a blank token value", "#token=%20%20"],
      ["a fragment without a token key", "#other=1"],
      ["a malformed percent-escape", "#token=%E0%A4%A"],
    ])("changes nothing for %s", async (_label, hash) => {
      pendingInstance();
      window.history.replaceState(null, "", `/setup/claim${hash}`);
      const replace = vi.spyOn(window.history, "replaceState");
      render(<ClaimOwnerForm />);

      await waitFor(() => expect(getInstanceCachedMock).toHaveBeenCalled());
      expect(tokenField().value).toBe("");
      expect(screen.queryByText("Setup token filled in from your link.")).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    });
  });
});
