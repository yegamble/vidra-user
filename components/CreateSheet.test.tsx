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

  it("renders a dialog named 'Create' with the four entry rows", () => {
    render(<CreateSheet open onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Create" })).toBeTruthy();

    const upload = screen.getByRole("link", { name: /Upload video/ });
    const golive = screen.getByRole("link", { name: /Go live/ });
    const newChannel = screen.getByRole("link", { name: /New channel/ });
    const studio = screen.getByRole("link", { name: /Open Studio/ });

    // Each primary row deep-links into the studio surface that auto-opens the
    // flow; New channel opens the create dialog; Open Studio is the dashboard.
    expect(upload.getAttribute("href")).toBe("/studio/content?upload=1");
    expect(golive.getAttribute("href")).toBe("/studio/live?new=1");
    expect(newChannel.getAttribute("href")).toBe("/studio/channel?create=1");
    expect(studio.getAttribute("href")).toBe("/studio");
  });

  it("closes when a row is chosen (dismiss on navigate)", () => {
    const onClose = vi.fn();
    render(<CreateSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole("link", { name: /Upload video/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape (inherited Modal behavior)", () => {
    const onClose = vi.fn();
    render(<CreateSheet open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
