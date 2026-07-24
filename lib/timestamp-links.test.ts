import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { linkifyTimestamps, parseTimestampToken } from "./timestamp-links";

// The tokenizer returns a flat ReactNode[] of plain strings + <a> elements. These
// helpers inspect that structure directly (no DOM/render needed — the suite runs
// in the node environment) so the grammar, clamping, and click semantics are all
// asserted on the pure output.
type Anchor = {
  type: string;
  props: {
    href: string;
    children: string;
    onClick?: (event: unknown) => void;
    "data-timestamp-seconds": number;
  };
};

function anchors(nodes: ReactNode[]): Anchor[] {
  return nodes.filter((n) => isValidElement(n)) as unknown as Anchor[];
}
function plainText(nodes: ReactNode[]): string {
  return nodes.map((n) => (typeof n === "string" ? n : (n as Anchor).props.children)).join("");
}

describe("parseTimestampToken", () => {
  it.each([
    ["0:05", 5],
    ["12:34", 754],
    ["1:02:03", 3723],
    ["0:00", 0],
    ["59:59", 3599],
    ["12:00:00", 43200],
  ])("parses %s to %i seconds", (token, seconds) => {
    expect(parseTimestampToken(token)).toBe(seconds);
  });

  it.each(["61:99", "9:5", "1:60", "1:02:60", "1:99:00", "abc"])(
    "rejects the malformed token %s",
    (token) => {
      expect(parseTimestampToken(token)).toBeNull();
    },
  );
});

describe("linkifyTimestamps grammar", () => {
  it("linkifies mm:ss with the raw token as text and ?t=<seconds> as href", () => {
    const nodes = linkifyTimestamps("Skip to 0:05 now");
    const a = anchors(nodes);
    expect(a).toHaveLength(1);
    expect(a[0].type).toBe("a");
    expect(a[0].props.children).toBe("0:05");
    expect(a[0].props.href).toBe("?t=5");
    expect(a[0].props["data-timestamp-seconds"]).toBe(5);
    // The surrounding prose is preserved verbatim.
    expect(plainText(nodes)).toBe("Skip to 0:05 now");
  });

  it("linkifies the h:mm:ss form", () => {
    const a = anchors(linkifyTimestamps("chapter 1:02:03 here"));
    expect(a).toHaveLength(1);
    expect(a[0].props.children).toBe("1:02:03");
    expect(a[0].props.href).toBe("?t=3723");
  });

  it("finds multiple timestamps on one line", () => {
    const nodes = linkifyTimestamps("intro 0:05 and outro 12:34 done");
    const a = anchors(nodes);
    expect(a.map((x) => x.props.children)).toEqual(["0:05", "12:34"]);
    expect(a.map((x) => x.props.href)).toEqual(["?t=5", "?t=754"]);
    expect(plainText(nodes)).toBe("intro 0:05 and outro 12:34 done");
  });

  it("linkifies a timestamp hugged by punctuation without swallowing it", () => {
    const nodes = linkifyTimestamps("(see 1:23). Then more.");
    const a = anchors(nodes);
    expect(a).toHaveLength(1);
    expect(a[0].props.children).toBe("1:23");
    // The '(' before and ').' after stay as plain-text runs.
    expect(nodes[0]).toBe("(see ");
    expect(nodes[2]).toBe("). Then more.");
  });

  it.each([
    ["nothing to see here", "no timestamp"],
    ["61:99 is not a time", "seconds out of range"],
    ["9:5 is a ratio", "single-digit seconds"],
    ["1234:56 is a big number", "digits before the token"],
    ["1:02:03:04 is over-long", "trailing colon run"],
    ["call 555:1234", "no valid seconds field"],
  ])("leaves %s untouched (%s)", (text) => {
    const nodes = linkifyTimestamps(text);
    expect(anchors(nodes)).toHaveLength(0);
    expect(nodes).toEqual([text]);
  });

  it("handles timestamps at the very start and end of the string", () => {
    expect(anchors(linkifyTimestamps("0:30 to start")).map((a) => a.props.href)).toEqual(["?t=30"]);
    expect(anchors(linkifyTimestamps("ends at 0:30")).map((a) => a.props.href)).toEqual(["?t=30"]);
  });

  it("returns a single run for empty input", () => {
    expect(linkifyTimestamps("")).toEqual([""]);
  });
});

describe("linkifyTimestamps duration clamp", () => {
  it("drops a token that resolves beyond a known duration", () => {
    // 2:00 = 120s > 100s duration → plain text; 1:00 = 60s stays a link.
    const nodes = linkifyTimestamps("far 2:00 near 1:00", { durationSeconds: 100 });
    expect(anchors(nodes).map((a) => a.props.children)).toEqual(["1:00"]);
    expect(plainText(nodes)).toBe("far 2:00 near 1:00");
  });

  it("keeps a token exactly at the duration boundary", () => {
    expect(anchors(linkifyTimestamps("end 1:40", { durationSeconds: 100 }))).toHaveLength(1);
  });

  it("linkifies every valid token when the duration is unknown", () => {
    for (const duration of [null, undefined, 0, -1]) {
      const a = anchors(linkifyTimestamps("way out 99:59", { durationSeconds: duration }));
      expect(a).toHaveLength(1);
      expect(a[0].props.href).toBe("?t=5999");
    }
  });
});

describe("linkifyTimestamps click semantics", () => {
  function fakeEvent(overrides: Record<string, unknown> = {}) {
    return {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      ...overrides,
    };
  }

  it("is a plain link (no onClick) when no seek handler is given", () => {
    const a = anchors(linkifyTimestamps("plain 0:05 link"));
    expect(a[0].props.onClick).toBeUndefined();
    expect(a[0].props.href).toBe("?t=5");
  });

  it("seeks in place on an unmodified left click and prevents navigation", () => {
    const onSeek = vi.fn();
    const a = anchors(linkifyTimestamps("go 0:30", { onSeek }));
    const event = fakeEvent();
    a[0].props.onClick?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onSeek).toHaveBeenCalledWith(30);
  });

  it.each([
    ["metaKey", { metaKey: true }],
    ["ctrlKey", { ctrlKey: true }],
    ["middle button", { button: 1 }],
  ])("leaves the href to the browser on a %s click (open in new tab)", (_label, overrides) => {
    const onSeek = vi.fn();
    const a = anchors(linkifyTimestamps("go 0:30", { onSeek }));
    const event = fakeEvent(overrides);
    a[0].props.onClick?.(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("keys anchors uniquely, honoring a keyPrefix so blocks never collide", () => {
    const nodes = linkifyTimestamps("0:05 and 0:10", { keyPrefix: "c-42" });
    const keys = anchors(nodes).map((a) => (a as unknown as { key: string }).key);
    expect(keys).toEqual(["c-42-0", "c-42-1"]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
