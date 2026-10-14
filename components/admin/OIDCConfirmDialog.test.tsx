// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OIDCConfirmDialog } from "./OIDCConfirmDialog";

afterEach(cleanup);

function setup(run: (pw: string) => Promise<string | null>) {
  render(<OIDCConfirmDialog title="Delete" body="Body" submitLabel="Go" run={run} onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText("Confirm with your password"), { target: { value: "pw" } });
  fireEvent.click(screen.getByRole("button", { name: "Go" }));
}

describe("OIDCConfirmDialog", () => {
  it("hands the password to run once and shows the failure inline", async () => {
    const run = vi.fn().mockResolvedValue("Nope.");
    setup(run);
    expect(await screen.findByText("Nope.")).toBeTruthy();
    expect(run).toHaveBeenCalledWith("pw");
    // The proof does not linger in the box after the attempt.
    expect((screen.getByLabelText("Confirm with your password") as HTMLInputElement).value).toBe("");
  });

  it("stays quiet on success", async () => {
    const run = vi.fn().mockResolvedValue(null);
    setup(run);
    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
