"use client";
import { useSyncExternalStore } from "react";
import type { ConversationSummary } from "@/lib/api";
import { onE2EESessionChange } from "@/lib/e2ee/session";

const summaries = new Map<string, ConversationSummary>();
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };
onE2EESessionChange(() => { summaries.clear(); emit(); });
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function rememberConversations(userId: string, conversations: ConversationSummary[]) {
  for (const conversation of conversations) summaries.set(`${userId}:${conversation.id}`, conversation);
  emit();
}

/** Reuse the authenticated inbox's identity even before the peer sends a message. */
export function useConversationSummary(conversationId: string, userId?: string) {
  return useSyncExternalStore(subscribe, () => summaries.get(`${userId}:${conversationId}`) ?? null, () => null);
}
