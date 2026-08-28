// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Alert } from "./Alert";

afterEach(cleanup);

describe("Alert", () => {
  it("defaults to the danger tone and the assertive alert role", () => {
    render(<Alert>Could not save.</Alert>);
    const el = screen.getByRole("alert");
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("Could not save.");
    expect(el.className).toContain("border-danger-border");
    expect(el.className).toContain("bg-danger-surface");
    expect(el.className).toContain("text-danger");
  });

  // A confirmation must not interrupt a screen reader mid-sentence, so it is a
  // polite `status` — the distinction every hand-rolled copy had to remember.
  it("announces the success tone politely, with no border", () => {
    render(<Alert variant="success">Saved.</Alert>);
    const el = screen.getByRole("status");
    expect(el.className).toContain("bg-success/15");
    expect(el.className).toContain("text-success");
    expect(el.className).not.toContain("border");
  });

  // "It worked, but not the way you asked" is neither red nor green: it keeps
  // the assertive role (it must interrupt) with the amber /15 fill.
  it("announces the warning tone assertively, with no border", () => {
    render(<Alert variant="warning">Downgraded to a dry run.</Alert>);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("bg-warning/15");
    expect(el.className).toContain("text-warning");
    expect(el.className).not.toContain("border");
  });

  it("renders as a div for block content", () => {
    render(
      <Alert as="div">
        <p>Line one</p>
      </Alert>,
    );
    expect(screen.getByRole("alert").tagName).toBe("DIV");
  });

  it("keeps the shared padding and appends additive classes", () => {
    render(<Alert className="flex flex-col gap-2">Nope</Alert>);
    const el = screen.getByRole("alert");
    expect(el.className).toContain("px-3.5");
    expect(el.className).toContain("py-2.5");
    expect(el.className).toContain("flex flex-col gap-2");
  });

  it("forwards arbitrary attributes such as data hooks", () => {
    render(<Alert data-testid="signup-error">Nope</Alert>);
    expect(screen.getByTestId("signup-error")).toBeTruthy();
  });
});
