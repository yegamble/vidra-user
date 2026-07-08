// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

afterEach(cleanup);

describe("Button", () => {
  it("renders as a button with its label and defaults to type=button", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    // Defaulting to type=button means a Button dropped into a form never
    // accidentally submits it.
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("applies the primary variant token classes by default", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.className).toContain("bg-accent");
    expect(btn.className).toContain("focus-ring");
  });

  it("applies the danger variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-danger");
  });

  it("applies the tonal variant (borderless muted fill)", () => {
    render(<Button variant="tonal">Share</Button>);
    const btn = screen.getByRole("button", { name: "Share" });
    expect(btn.className).toContain("bg-surface-muted");
    expect(btn.className).not.toContain("border");
  });

  it("applies the danger-outline variant (hairline outline + danger text)", () => {
    render(<Button variant="danger-outline">Remove</Button>);
    const btn = screen.getByRole("button", { name: "Remove" });
    expect(btn.className).toContain("border-danger/45");
    expect(btn.className).toContain("text-danger");
    expect(btn.className).toContain("bg-transparent");
  });

  it("fires onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Click" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Nope" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("honors an explicit submit type", () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole("button", { name: "Submit" }).getAttribute("type")).toBe("submit");
  });
});
