import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

// Lives under lib/ because vitest only includes lib/**, app/** and components/**.
describe("legacy PeerTube redirects", () => {
  it("maps /c/ and /a/ to channels and users, only for a bare local name", async () => {
    const rules = await nextConfig.redirects!();
    const find = (s: string) => rules.find((r) => r.source.startsWith(s))!;
    expect(find("/c/").destination).toBe("/channels/:handle");
    expect(find("/a/").destination).toBe("/users/:name");
    for (const [prefix, param] of [["/c/", ":handle"], ["/a/", ":name"]] as const) {
      const re = new RegExp(`^${find(prefix).source.replace(param, "")}$`);
      expect(re.test(`${prefix}ada`)).toBe(true);
      // name@host may be a REMOTE actor; a sub-path is not a channel/account page.
      expect(re.test(`${prefix}ada@remote.example`)).toBe(false);
      expect(re.test(`${prefix}ada/videos`)).toBe(false);
    }
  });
});
