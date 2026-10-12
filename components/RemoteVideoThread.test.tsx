// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RemoteVideoComment } from "@/lib/api";

import { RemoteVideoThread } from "./RemoteVideoThread";

afterEach(cleanup);

describe("RemoteVideoThread bodies are untrusted federated text", () => {
  it("renders a markdown link as a safe anchor and keeps a javascript: link inert", () => {
    const comment = {
      id: "m1",
      local: false,
      author_name: "ada",
      author_domain: "peer.example",
      actor_url: "https://peer.example/accounts/ada",
      object_url: "https://peer.example/notes/m1",
      body: "[ok](https://e.test/a) and [bad](javascript:alert(1)) <img src=x onerror=alert(1)>",
      edited: false,
      created_at: "2026-09-05T10:00:00Z",
    } as RemoteVideoComment;
    const { container } = render(<RemoteVideoThread comments={[comment]} />);
    const link = screen.getByRole("link", { name: "ok" });
    expect(link.getAttribute("href")).toBe("https://e.test/a");
    expect(link.getAttribute("rel")).toBe("nofollow noopener noreferrer ugc");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });
});
