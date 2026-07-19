"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { api } from "@/lib/api";
import type { Channel } from "@/lib/api";

// The persisted "which channel is the studio scoped to" selection. The studio is
// scoped to ONE current channel (YouTube model); this survives reloads and tab
// changes, validated against the live channel list on load (a deleted channel
// falls back to channels[0]).
const STORAGE_KEY = "vidra.studio.channel";

type StudioLoad = "loading" | "error" | "ready";

type StudioContextValue = {
  /** Load state of the channel list. */
  status: StudioLoad;
  /** All channels the caller can act in (owned today; owner+editor once the backend lands). */
  channels: Channel[];
  /** The handle of the channel the studio is currently scoped to (""" when zero channels). */
  currentHandle: string;
  /** The resolved current channel object, or null when the caller has no channels. */
  currentChannel: Channel | null;
  /** Switch the current channel (persisted; ignored for an unknown handle). */
  setCurrentHandle: (handle: string) => void;
  /** Re-fetch the channel list (after create/delete/edit elsewhere). */
  reload: () => void;
  /** Optimistic list mutators so a create/edit/delete reflects without a round-trip. */
  addChannel: (channel: Channel) => void;
  updateChannel: (channel: Channel) => void;
  removeChannel: (id: string) => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(handle: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, handle);
  } catch {
    // Private-mode / disabled storage: the selection just won't persist.
  }
}

// StudioProvider loads the caller's channels once for the whole studio shell and
// owns the persistent "current channel" selection. Every studio surface consumes
// it (via useStudio) instead of each maintaining its own channel <select>.
export function StudioProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StudioLoad>("loading");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [currentHandle, setCurrentHandleState] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  // Whether the persisted selection has been applied yet — so a reload preserves
  // the current selection instead of snapping back to channels[0].
  const resolvedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyChannels(controller.signal)
      .then((res) => {
        const list = res.channels;
        setChannels(list);
        setStatus("ready");
        // Resolve the current handle: keep the existing selection if it still
        // exists, else the persisted one if valid, else channels[0].
        setCurrentHandleState((prev) => {
          const stored = resolvedRef.current ? prev : readStored();
          resolvedRef.current = true;
          if (stored && list.some((c) => c.handle === stored)) return stored;
          return list[0]?.handle ?? "";
        });
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const setCurrentHandle = useCallback((handle: string) => {
    setCurrentHandleState((prev) => {
      // Guard against an unknown handle (the caller only ever passes list
      // handles, but keep the state honest); persist the accepted choice.
      writeStored(handle);
      return handle || prev;
    });
  }, []);

  const reload = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const addChannel = useCallback((channel: Channel) => {
    setChannels((list) => [channel, ...list]);
    // A first channel becomes the current one automatically.
    setCurrentHandleState((prev) => {
      if (prev) return prev;
      writeStored(channel.handle);
      return channel.handle;
    });
  }, []);

  const updateChannel = useCallback((channel: Channel) => {
    setChannels((list) => list.map((c) => (c.id === channel.id ? channel : c)));
  }, []);

  const removeChannel = useCallback((id: string) => {
    setChannels((list) => {
      const next = list.filter((c) => c.id !== id);
      setCurrentHandleState((prev) => {
        if (next.some((c) => c.handle === prev)) return prev;
        const fallback = next[0]?.handle ?? "";
        writeStored(fallback);
        return fallback;
      });
      return next;
    });
  }, []);

  const currentChannel = useMemo(
    () => channels.find((c) => c.handle === currentHandle) ?? null,
    [channels, currentHandle],
  );

  const value = useMemo<StudioContextValue>(
    () => ({
      status,
      channels,
      currentHandle,
      currentChannel,
      setCurrentHandle,
      reload,
      addChannel,
      updateChannel,
      removeChannel,
    }),
    [
      status,
      channels,
      currentHandle,
      currentChannel,
      setCurrentHandle,
      reload,
      addChannel,
      updateChannel,
      removeChannel,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

// useStudio reads the studio channel context. Throws when used outside the
// provider (a programming error) so surfaces never silently render channel-less.
export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error("useStudio must be used within a StudioProvider");
  }
  return ctx;
}
