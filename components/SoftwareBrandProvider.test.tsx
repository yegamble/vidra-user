// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SoftwareBrandProvider,
  usePlatformLabel,
  useSoftwareBrandHidden,
  useSoftwareName,
} from "./SoftwareBrandProvider";

function Probe() {
  return (
    <ul>
      <li data-testid="hidden">{String(useSoftwareBrandHidden())}</li>
      <li data-testid="name">{useSoftwareName() ?? "(none)"}</li>
      <li data-testid="label">{usePlatformLabel()}</li>
      <li data-testid="label-mid">{usePlatformLabel({ sentenceStart: false })}</li>
    </ul>
  );
}

const read = (id: string) => screen.getByTestId(id).textContent;

afterEach(cleanup);

describe("SoftwareBrandProvider", () => {
  it("defaults to SHOWING the software name with no provider at all", () => {
    // Every component test of an untouched component renders without the
    // provider; the default must therefore be today's behavior.
    render(<Probe />);
    expect(read("hidden")).toBe("false");
    expect(read("name")).toBe("Vidra");
    expect(read("label")).toBe("Vidra");
    // A proper noun is unchanged by position.
    expect(read("label-mid")).toBe("Vidra");
  });

  it("shows the software name when the provider reports hidden=false", () => {
    render(
      <SoftwareBrandProvider hidden={false}>
        <Probe />
      </SoftwareBrandProvider>,
    );
    expect(read("name")).toBe("Vidra");
    expect(read("label")).toBe("Vidra");
  });

  it("withholds the name and neutralizes prose when the provider reports hidden=true", () => {
    render(
      <SoftwareBrandProvider hidden>
        <Probe />
      </SoftwareBrandProvider>,
    );
    expect(read("hidden")).toBe("true");
    expect(read("name")).toBe("(none)");
    expect(read("label")).toBe("This platform");
    // The hook forwards the position through to the seam, so a consumer whose
    // label lands mid-sentence gets the lowercase form.
    expect(read("label-mid")).toBe("this platform");
    expect(document.body.textContent).not.toMatch(/vidra/i);
  });
});
