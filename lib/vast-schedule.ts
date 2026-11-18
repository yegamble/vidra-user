// No repeated mid-roll starts this close to the end of the content.
const MIDROLL_TAIL_GUARD_SECONDS = 60;

type BreakQuery = {
  /** Content position of the first mid-roll, in seconds. */
  first: number;
  /** Seconds of content between repeats; 0 means a single mid-roll. */
  interval: number;
  duration: number;
  time: number;
  stopAt: number | null;
  /** Highest slot already consumed, -1 when none. */
  lastSlot: number;
};

/** The mid-roll slot to consume at `time`, or null. Slot k sits at first + k * interval. */
export function dueBreakSlot({ first, interval, duration, time, stopAt, lastSlot }: BreakQuery): number | null {
  if (!Number.isFinite(first) || first < 0 || !(time >= first)) return null;
  if (stopAt !== null && time >= stopAt) return null;
  const step = Number.isFinite(interval) && interval > 0 ? interval : 0;
  const valid = (slot: number) => {
    const point = first + slot * step;
    if (!(point < duration)) return false;
    if (stopAt !== null && point >= stopAt) return false;
    return step === 0 || point <= duration - MIDROLL_TAIL_GUARD_SECONDS;
  };
  // Only the latest point counts, so a seek past several plays one break.
  let slot = step > 0 ? Math.floor((time - first) / step) : 0;
  while (slot > lastSlot && !valid(slot)) slot--;
  return slot > lastSlot ? slot : null;
}
