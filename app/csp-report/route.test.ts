import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

import { POST, resetCspReportBudget } from "./route";

const post = (body: string, type: string) =>
  POST(
    new Request("http://vidra.test/csp-report", {
      method: "POST",
      body,
      headers: { "content-type": type },
    }),
  );

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetCspReportBudget();
  warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /csp-report", () => {
  it("logs a legacy report-uri report as one redacted line and answers 204", async () => {
    const res = await post(
      JSON.stringify({
        "csp-report": {
          "document-uri": "https://vidra.test/reset-password/confirm?token=SECRET",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://evil.example/x.js?session=SECRET",
          disposition: "enforce",
        },
      }),
      "application/csp-report",
    );
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("csp violation", {
      directive: "script-src-elem",
      blocked: "https://evil.example",
      document: "/reset-password/confirm",
      disposition: "enforce",
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET");
  });

  it("logs each Reporting API csp-violation and keeps keyword sources", async () => {
    const res = await post(
      JSON.stringify([
        {
          type: "csp-violation",
          body: {
            documentURL: "https://vidra.test/w/abc#t=1",
            effectiveDirective: "script-src-elem",
            blockedURL: "inline",
            disposition: "report",
          },
        },
        { type: "deprecation", body: { message: "ignored" } },
      ]),
      "application/reports+json",
    );
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual({
      directive: "script-src-elem",
      blocked: "inline",
      document: "/w/abc",
      disposition: "report",
    });
  });

  it("refuses a body over 8 KiB without logging it", async () => {
    const res = await post("x".repeat(8 * 1024 + 1), "application/csp-report");
    expect(res.status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores malformed JSON", async () => {
    expect((await post("{nope", "application/csp-report")).status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });

  it("caps log lines per minute so an unauthenticated flood cannot fill the logs", async () => {
    const one = JSON.stringify({ "csp-report": { "effective-directive": "img-src" } });
    for (let i = 0; i < 150; i++) await post(one, "application/csp-report");
    expect(warn).toHaveBeenCalledTimes(100);
  });
});
