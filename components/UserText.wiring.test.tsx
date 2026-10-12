// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserText, safeUserUrl } from "./UserText";

vi.mock("react-markdown", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-markdown")>();
  return { ...mod, default: vi.fn(mod.default) };
});

afterEach(cleanup);

// Each URL layer must hold on its own: removing either one must fail a test
// (the DOM alone cannot tell them apart, since both drop the same links).
describe("UserText URL layers are independently wired", () => {
  it("passes safeUserUrl as urlTransform and drops dangerous hrefs in the `a` renderer", () => {
    render(<UserText text="[x](https://e.test)" variant="comment" />);
    const props = vi.mocked(ReactMarkdown).mock.calls.at(-1)![0] as ComponentProps<typeof ReactMarkdown>;
    expect(props.urlTransform).toBe(safeUserUrl);

    const A = props.components!.a as (p: { href?: string; children?: string }) => React.ReactElement;
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//e.test", "irc://h/c", undefined]) {
      const c = render(<div>{A({ href, children: "lbl" })}</div>).container;
      expect(c.querySelector("a")).toBeNull();
      expect(c.textContent).toBe("lbl");
    }
  });
});

describe("UserText error boundary is wired", () => {
  it("falls back to the raw text when the markdown render throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = vi.mocked(ReactMarkdown).getMockImplementation()!;
    // Persistent (React retries a failed render once before the boundary takes it).
    vi.mocked(ReactMarkdown).mockImplementation(() => {
      throw new Error("boom");
    });
    const c = render(<UserText text="raw **text**" variant="comment" />).container;
    vi.mocked(ReactMarkdown).mockImplementation(original);
    spy.mockRestore();
    expect(c.textContent).toBe("raw **text**");
  });
});
