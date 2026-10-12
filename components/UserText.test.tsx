// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserText } from "./UserText";

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

  it("comments allow links and emphasis but not lists or code blocks", () => {
    const c = html("**b** [l](https://e.test)\n\n- one", "comment");
    expect(c.querySelector("strong")).toBeTruthy();
    expect(c.querySelector("a")).toBeTruthy();
    expect(c.querySelector("ul, li")).toBeNull();
    expect(c.textContent).toContain("one");
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
