// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { apiBaseUrl } from "@/lib/config";
import type {
  InstanceConfigSnapshot,
  InstanceCustomizationBlock,
} from "@/lib/instance-config.server";

import { InstanceCustomization } from "./InstanceCustomization";

// Built from the W6 contract block (every field optional), cast to the full
// snapshot the layout passes.
function snapshot(customization: InstanceCustomizationBlock) {
  return { customization } as InstanceConfigSnapshot;
}

const HASH = "a".repeat(64);

const stylesheet = () =>
  document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href*="custom.css"]');
const script = (container: HTMLElement) =>
  container.querySelector<HTMLScriptElement>('script[src*="custom.js"]') ??
  document.querySelector<HTMLScriptElement>('script[src*="custom.js"]');
const accentStyle = (container: HTMLElement) =>
  container.querySelector('[data-testid="accent-override"]') ??
  document.querySelector('[data-testid="accent-override"]');

afterEach(() => {
  cleanup();
  // React hoists <link precedence> into document.head; scrub between tests.
  document.head.innerHTML = "";
});

describe("InstanceCustomization", () => {
  it("renders nothing without a snapshot (backend unreachable / pre-W1)", () => {
    const { container } = render(<InstanceCustomization instance={null} />);
    expect(container.innerHTML).toBe("");
    expect(stylesheet()).toBeNull();
  });

  it("renders nothing while no hash or color is set", () => {
    const { container } = render(
      <InstanceCustomization instance={snapshot({ css_hash: "", js_hash: "", primary_color: "" })} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("injects the hash-busted stylesheet link when a css_hash exists", () => {
    render(<InstanceCustomization instance={snapshot({ css_hash: HASH })} />);
    const link = stylesheet();
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe(
      `${apiBaseUrl}/api/v1/instance/custom.css?v=${HASH}`,
    );
  });

  it("injects the deferred external script when a js_hash exists", () => {
    const { container } = render(<InstanceCustomization instance={snapshot({ js_hash: HASH })} />);
    const tag = script(container);
    expect(tag).not.toBeNull();
    expect(tag!.getAttribute("src")).toBe(`${apiBaseUrl}/api/v1/instance/custom.js?v=${HASH}`);
    expect(tag!.hasAttribute("defer")).toBe(true);
    // External-file delivery only — never inline code (architecture note 6).
    expect(tag!.textContent).toBe("");
  });

  it("injects both tags when both hashes exist", () => {
    // A DIFFERENT hash from the single-tag tests: React's stylesheet
    // hoisting dedupes by href per document, so a reused href would be
    // swallowed after the head scrub between tests.
    const other = "b".repeat(64);
    const { container } = render(
      <InstanceCustomization instance={snapshot({ css_hash: other, js_hash: other })} />,
    );
    expect(
      document.querySelector(`link[rel="stylesheet"][href*="${other}"]`),
    ).not.toBeNull();
    expect(script(container)).not.toBeNull();
  });

  it("refuses malformed hashes (no surprising URLs)", () => {
    const { container } = render(
      <InstanceCustomization
        instance={snapshot({ css_hash: "../../etc", js_hash: "abc?v=1&x=" })}
      />,
    );
    expect(container.innerHTML).toBe("");
    expect(stylesheet()).toBeNull();
  });

  it("overrides the accent token pair when a valid primary color is set", () => {
    const { container } = render(
      <InstanceCustomization instance={snapshot({ primary_color: "#1d4ed8" })} />,
    );
    const style = accentStyle(container);
    expect(style).not.toBeNull();
    // Token-level override: --accent plus its computed label ink, never rules.
    expect(style!.textContent).toBe(":root{--accent:#1d4ed8;--accent-fg:#ffffff;}");
  });

  it("refuses a malformed primary color (CSS injection guard)", () => {
    const { container } = render(
      <InstanceCustomization
        instance={snapshot({ primary_color: "red;}body{display:none}" })}
      />,
    );
    expect(accentStyle(container)).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});
