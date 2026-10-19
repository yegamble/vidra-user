// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { rememberConversations, useConversationSummary } from "./conversation-cache";
import { setE2EEUser } from "@/lib/e2ee/session";
import type { ConversationSummary } from "@/lib/api";
afterEach(() => { cleanup(); setE2EEUser(null); });
it("shares peer identity with empty or encrypted threads and clears it on account changes", () => {
  setE2EEUser("a");
  const a = renderHook(() => useConversationSummary("c", "a"));
  const b = renderHook(() => useConversationSummary("c", "b"));
  const summary = { id: "c", other_user_id: "peer", other_display_name: "Maya" } as ConversationSummary;
  act(() => rememberConversations("a", [summary]));
  expect(a.result.current).toBe(summary);
  expect(b.result.current).toBeNull();
  act(() => setE2EEUser("b"));
  expect(a.result.current).toBeNull();
});
