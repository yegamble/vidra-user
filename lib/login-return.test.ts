import { describe, expect, it } from "vitest";
import { safeLoginReturn } from "./login-return";

describe("safeLoginReturn", () => {
  it.each(["/", "/videos/v1?playlist=p1&t=32#comments", "/search?q=two%20words", "/videos/caf%C3%A9"])(
    "preserves a local destination: %s", (value) => expect(safeLoginReturn(value)).toBe(value),
  );
  it.each([
    undefined, null, ["/videos/v1"], "", "https://outside.example/video", "//outside.example", "javascript:alert(1)",
    "/\\outside.example", "/%5Coutside.example", "/%2Foutside.example", "/one/..//outside.example",
    "/\toutside.example", "/%0aoutside.example", "/bad%",
  ].map((value) => ({ value })))("falls back home for an invalid destination: $value", ({ value }) => {
    expect(safeLoginReturn(value)).toBe("/");
  });
});
