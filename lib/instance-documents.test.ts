import { describe, expect, it } from "vitest";

import {
  CUSTOM_JS_CONFIRM_PHRASE,
  INSTANCE_DOCUMENT_CAPS,
  describeDocumentSize,
  documentByteSize,
  isDocumentOverCap,
} from "./instance-documents";

describe("instance document caps", () => {
  it("mirror the backend store exactly (100 KiB homepage, 200 KiB css/js)", () => {
    expect(INSTANCE_DOCUMENT_CAPS.homepage).toBe(102400);
    expect(INSTANCE_DOCUMENT_CAPS.custom_css).toBe(204800);
    expect(INSTANCE_DOCUMENT_CAPS.custom_js).toBe(204800);
  });
});

describe("documentByteSize", () => {
  it("counts UTF-8 bytes, not characters (the backend's unit)", () => {
    expect(documentByteSize("")).toBe(0);
    expect(documentByteSize("abc")).toBe(3);
    expect(documentByteSize("é")).toBe(2); // 2-byte codepoint
    expect(documentByteSize("👋")).toBe(4); // 4-byte emoji
  });
});

describe("isDocumentOverCap", () => {
  it("flags only bodies strictly over the cap", () => {
    expect(isDocumentOverCap("a".repeat(10), 10)).toBe(false); // at cap: fine
    expect(isDocumentOverCap("a".repeat(11), 10)).toBe(true);
    // Multibyte content trips the BYTE cap before the character count does.
    expect(isDocumentOverCap("é".repeat(6), 10)).toBe(true); // 12 bytes, 6 chars
  });
});

describe("describeDocumentSize", () => {
  it("renders a live byte counter against the cap", () => {
    expect(describeDocumentSize("", INSTANCE_DOCUMENT_CAPS.homepage)).toBe("0 KB of 100 KB");
    expect(describeDocumentSize("a".repeat(1024), INSTANCE_DOCUMENT_CAPS.homepage)).toBe(
      "1 KB of 100 KB",
    );
    expect(describeDocumentSize("a".repeat(1536), INSTANCE_DOCUMENT_CAPS.custom_css)).toBe(
      "1.5 KB of 200 KB",
    );
  });
});

describe("CUSTOM_JS_CONFIRM_PHRASE", () => {
  it("is the documented typed-confirmation phrase", () => {
    expect(CUSTOM_JS_CONFIRM_PHRASE).toBe("run this code");
  });
});
