// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlainTextBoundary, UserText, safeUserUrl } from "./UserText";

afterEach(cleanup);

function html(text: string, variant: "description" | "comment" = "description") {
  return render(<UserText text={text} variant={variant} />).container;
}

describe("UserText: markdown + links", () => {
  it("renders markdown links as safe external anchors", () => {
    const a = html("[docs](https://example.test/a?b=1)").querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://example.test/a?b=1");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("nofollow noopener noreferrer ugc");
    expect(a.textContent).toBe("docs");
  });

  it("linkifies bare URLs and www hosts", () => {
    const links = html("see https://example.test/x and www.example.org.").querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("https://example.test/x");
    expect(links[1].getAttribute("href")).toBe("http://www.example.org");
  });

  it("allows mailto", () => {
    expect(html("[me](mailto:a@b.test)").querySelector("a")!.getAttribute("href")).toBe("mailto:a@b.test");
  });

  it("renders emphasis, lists and code in descriptions", () => {
    const c = html("**b** *i*\n\n- one\n- two\n\n`x`");
    expect(c.querySelector("strong")).toBeTruthy();
    expect(c.querySelector("em")).toBeTruthy();
    expect(c.querySelectorAll("li")).toHaveLength(2);
    expect(c.querySelector("code")).toBeTruthy();
  });

  it("comments allow links, emphasis and lists but not code blocks", () => {
    const c = html("**b** [l](https://e.test)\n\n- one\n\n`x`", "comment");
    expect(c.querySelector("strong")).toBeTruthy();
    expect(c.querySelector("a")).toBeTruthy();
    expect(c.querySelector("li")).toBeTruthy();
    expect(c.querySelector("code, pre")).toBeNull();
    expect(c.textContent).toContain("x");
  });

  it("keeps single newlines visible for plain text", () => {
    const p = html("line one\nline two").querySelector("p")!;
    expect(p.textContent).toBe("line one\nline two");
    expect(p.className).toContain("whitespace-pre-wrap");
  });
});

describe("UserText: XSS", () => {
  const dangerous = (c: HTMLElement) => {
    expect(c.querySelector("script, img, iframe, svg, style, object, form, input")).toBeNull();
    for (const el of Array.from(c.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.startsWith("on")).toBe(false);
        if (attr.name === "href" || attr.name === "src") {
          expect(attr.value).toMatch(/^(https?:|mailto:|http:\/\/www\.|\?t=)/i);
        }
      }
    }
  };

  it.each(["description", "comment"] as const)("never emits raw HTML (%s)", (v) => {
    const c = html(
      '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)" onclick="x()">h</a><iframe src=//e></iframe>',
      v,
    );
    dangerous(c);
  });

  it.each([
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x]( javascript:alert(1))",
    "[x](java\tscript:alert(1))",
    "[x](javascript&#58;alert(1))",
    "[x](&#106;avascript:alert(1))",
    "[x](&#x6A;avascript&colon;alert(1))",
    "[x](data:text/html;base64,PHNjcmlwdD4=)",
    "[x](vbscript:msgbox(1))",
    "[x](//evil.test/x)",
    "[x](/relative)",
    "[x](file:///etc/passwd)",
    "[x][r]\n\n[r]: javascript:alert(1)",
    "<javascript:alert(1)>",
    "[[nested](javascript:alert(1))](https://ok.test)",
    "[x](https://ok.test \"t\" onmouseover=\"alert(1)\")",
  ])("drops unsafe link %j", (src) => {
    const c = html(src);
    dangerous(c);
  });

  it("keeps the label of a dropped link as text", () => {
    const c = html("[click me](javascript:alert(1))");
    expect(c.querySelector("a")).toBeNull();
    expect(c.textContent).toBe("click me");
  });

  it("escapes entities instead of decoding them into markup", () => {
    const c = html("&lt;script&gt;alert(1)&lt;/script&gt; &amp; <b>x</b>");
    expect(c.querySelector("script, b")).toBeNull();
    expect(c.textContent).toContain("<script>alert(1)</script> &");
  });

  it.each(["description", "comment"] as const)("renders no images (%s)", (v) => {
    const c = html("![a](https://e.test/i.png) <img src=https://e.test/i.png>", v);
    expect(c.querySelector("img")).toBeNull();
  });

  it("does not turn headings, tables or task lists into elements", () => {
    const c = html("# h\n\n| a |\n| - |\n| 1 |\n\n- [x] t");
    expect(c.querySelector("h1, table, input")).toBeNull();
  });
});

describe("UserText: timestamps", () => {
  it("renders seek links inside markdown paragraphs and emphasis", () => {
    const onSeek = vi.fn();
    const c = render(
      <UserText text={"intro at 1:23\n\n**2:00** bold"} variant="description" onSeek={onSeek} durationSeconds={600} />,
    ).container;
    const ts = c.querySelectorAll("a[data-timestamp-seconds]");
    expect(ts).toHaveLength(2);
    fireEvent.click(ts[0]);
    expect(onSeek).toHaveBeenCalledWith(83);
  });

  it("leaves out-of-duration tokens as text", () => {
    const c = render(<UserText text="at 9:59" variant="comment" durationSeconds={60} />).container;
    expect(c.querySelector("a")).toBeNull();
    expect(c.textContent).toBe("at 9:59");
  });

  it("does not re-link timestamps inside a link label", () => {
    const c = html("[at 1:23](https://e.test)");
    expect(c.querySelectorAll("a")).toHaveLength(1);
  });
});

describe("UserText: robustness", () => {
  it.each(["description", "comment"] as const)("renders 5000 nested quote markers without throwing (%s)", (v) => {
    const c = html(">".repeat(5000) + " x", v);
    expect(c.textContent).toContain("x");
  });

  it("renders deeply nested lists and emphasis without throwing", () => {
    const t0 = Date.now();
    const c = html("- ".repeat(2500) + "deep");
    expect(c.textContent).toContain("deep");
    expect(html("*".repeat(2500) + "e" + "*".repeat(2400)).textContent).toContain("e");
    expect(html("[".repeat(2500) + "e").textContent).toContain("e");
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("flattens nesting beyond the depth bound (below the plain-text guard)", () => {
    const c = html(">".repeat(60) + " x");
    expect(c.querySelectorAll("blockquote").length).toBeLessThanOrEqual(12);
    expect(c.textContent).toContain("x");
  });

  it("stays fast on alternating marker patterns", () => {
    const t0 = Date.now();
    html("> 1. ".repeat(1000) + "x");
    html("*_".repeat(2500) + "x");
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("falls back to plain text when a render throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom(): never {
      throw new Error("boom");
    }
    const c = render(
      <PlainTextBoundary text={"raw **text**"}>
        <Boom />
      </PlainTextBoundary>,
    ).container;
    spy.mockRestore();
    expect(c.textContent).toBe("raw **text**");
  });
});

describe("UserText: structure", () => {
  it("does not nest a seek link inside an external link", () => {
    const c = html("[**1:23**](https://e.test)");
    expect(c.querySelectorAll("a")).toHaveLength(1);
    expect(c.querySelector("a a")).toBeNull();
  });

  it("keeps numbered lists and their seek links in comments", () => {
    const c = render(
      <UserText text={"1. 0:00 intro\n2. 1:23 topic"} variant="comment" durationSeconds={600} />,
    ).container;
    expect(c.querySelector("ol")).toBeTruthy();
    expect(c.querySelectorAll("li")).toHaveLength(2);
    expect(c.querySelectorAll("a[data-timestamp-seconds]")).toHaveLength(2);
  });

  it("links timestamps in headings but not in code", () => {
    const c = render(
      <UserText text={"# at 1:23\n\n`2:00`"} variant="description" durationSeconds={600} />,
    ).container;
    expect(c.querySelectorAll("a[data-timestamp-seconds]")).toHaveLength(1);
  });

  it("keeps heading text (setext) as visible text", () => {
    expect(html("text\n---").textContent).toContain("text");
  });

  it("uses newline text, not <br>, for hard breaks", () => {
    const c = html("a  \nb");
    expect(c.querySelector("br")).toBeNull();
    expect(c.textContent).toBe("a\nb");
  });

  it("mailto links do not open a new tab", () => {
    const a = html("[m](mailto:a@b.test)").querySelector("a")!;
    expect(a.getAttribute("target")).toBeNull();
  });

  it("does not leak footnote chrome", () => {
    const c = html("hi[^1]\n\n[^1]: note");
    expect(c.textContent).not.toContain("Footnotes");
    expect(c.textContent).not.toContain("\u21A9");
    expect(c.querySelector("sup, section")).toBeNull();
  });
});

describe("safeUserUrl", () => {
  it.each([
    ["https://e.test/a", "https://e.test/a"],
    ["HTTP://E.test", "HTTP://E.test"],
    ["  https://e.test ", "https://e.test"],
    ["mailto:a@b.test", "mailto:a@b.test"],
  ])("accepts %j", (input, out) => expect(safeUserUrl(input)).toBe(out));

  it.each([
    "javascript:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "data:text/html,x",
    "vbscript:x", "file:///etc/passwd", "//evil.test", "/rel", "?t=5", "irc://h/c", "xmpp:a@b",
    "https:", "", "ftp://h/x", "\u0000https://e.test",
  ])("rejects %j", (input) => expect(safeUserUrl(input)).toBe(""));

  it("rejects non-strings", () => {
    expect(safeUserUrl(undefined)).toBe("");
    expect(safeUserUrl(null)).toBe("");
  });
});
