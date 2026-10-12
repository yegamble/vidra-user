import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("legacy PeerTube redirects", () => {
  it("maps /c/ and /a/ to channels and users, leaving name@host alone", async () => {
    const rules = await nextConfig.redirects!();
    const find = (s: string) => rules.find((r) => r.source.startsWith(s))!;
    expect(find("/c/").destination).toBe("/channels/:handle");
    expect(find("/a/").destination).toBe("/users/:name");
    // The [^@]+ constraint is what keeps a remote handle out.
    expect(new RegExp(`^${find("/c/").source.replace(":handle", "")}$`).test("/c/a@remote.example")).toBe(false);
  });
});
