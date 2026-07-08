// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  BellIcon,
  HeartIcon,
  IpfsIcon,
  LockIcon,
  PlayIcon,
  SearchIcon,
} from "./index";

afterEach(cleanup);

describe("icon set", () => {
  it("is decorative by default (aria-hidden, no role/name)", () => {
    const { container } = render(<SearchIcon />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(svg.getAttribute("aria-label")).toBeNull();
    // Decorative icons carry no <title>.
    expect(svg.querySelector("title")).toBeNull();
  });

  it("becomes an image with an accessible name when labeled", () => {
    const { container } = render(<BellIcon label="Notifications" />);
    const svg = container.querySelector("svg")!;
    // A labeled icon is exposed to AT: role=img + aria-label + a matching <title>.
    expect(svg.getAttribute("aria-hidden")).toBeNull();
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Notifications");
    expect(svg.querySelector("title")?.textContent).toBe("Notifications");
  });

  it("defaults to 1.8 stroke width and honors an override", () => {
    const { container: def } = render(<SearchIcon />);
    expect(def.querySelector("svg")!.getAttribute("stroke-width")).toBe("1.8");

    const { container: bumped } = render(<SearchIcon strokeWidth={2.4} />);
    expect(bumped.querySelector("svg")!.getAttribute("stroke-width")).toBe("2.4");
  });

  it("maps size to width & height", () => {
    const { container } = render(<SearchIcon size={30} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("30");
    expect(svg.getAttribute("height")).toBe("30");
  });

  it("renders filled glyphs with fill=currentColor stroke=none", () => {
    const { container } = render(<PlayIcon />);
    const path = container.querySelector("path")!;
    expect(path.getAttribute("fill")).toBe("currentColor");
    expect(path.getAttribute("stroke")).toBe("none");
  });

  it("inherits color via currentColor on the outline", () => {
    const { container } = render(<HeartIcon />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("fill")).toBe("none");
  });

  it("LockIcon is the shared design lock", () => {
    // The former components/e2ee/LockIcon folded into the shared set — it renders
    // as a standard outline icon here.
    const { container } = render(<LockIcon size={14} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("width")).toBe("14");
  });

  it("IpfsIcon keeps its bespoke 12×14 viewBox and aspect", () => {
    const { container } = render(<IpfsIcon size={14} label="Stored on IPFS" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 12 14");
    expect(svg.getAttribute("height")).toBe("14");
    // width tracks the 12:14 aspect (14 * 12/14 = 12).
    expect(svg.getAttribute("width")).toBe("12");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelector("title")?.textContent).toBe("Stored on IPFS");
  });
});
