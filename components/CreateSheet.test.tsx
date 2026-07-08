// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/link needs the App Router context to render; in a bare RTL render we
// stub it to a plain <a> so the rows are real links with assertable hrefs and a
// working onClick (dismiss-on-navigate).
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      href={href}
      onClick={(e) => {
        // Prevent jsdom's unimplemented navigation; still run the real onClick
        // (dismiss-on-navigate).
        e.preventDefault();
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

import { CreateSheet } from "./CreateSheet";

afterEach(cleanup);

describe("CreateSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<CreateSheet open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a dialog named 'Create' with the three entry rows", () => {
    render(<CreateSheet open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Create" })).toBeTruthy();

    const upload = screen.getByRole("link", { name: /Upload a video/ });
    const golive = screen.getByRole("link", { name: /Go live/ });
    const studio = screen.getByRole("link", { name: /Open Studio/ });

    // Each row deep-links into the creator surfaces that exist today: upload and
    // live are anchors on /studio, Open Studio is the dashboard itself.
    expect(upload.getAttribute("href")).toBe("/studio#upload");
    expect(golive.getAttribute("href")).toBe("/studio#go-live");
    expect(studio.getAttribute("href")).toBe("/studio");
  });

  it("closes when a row is chosen (dismiss on navigate)", () => {
    const onClose = vi.fn();
    render(<CreateSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole("link", { name: /Upload a video/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape (inherited Modal behavior)", () => {
    const onClose = vi.fn();
    render(<CreateSheet open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
