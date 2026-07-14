// Balanced ABR defaults for a heterogeneous, federated audience. A recent
// server-origin measurement avoids hls.js's very low cold-start default on a
// known-fast connection, while a short TTL and network-quality caps keep stale
// estimates from overriding Save-Data or a newly constrained connection.

export const HLS_ABR_DEFAULT_ESTIMATE = 5_000_000;
export const HLS_BANDWIDTH_STORAGE_KEY = "vidra:hls-bandwidth-estimate:v1";
export const HLS_BANDWIDTH_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const MIN_ESTIMATE = 100_000;
const MAX_ESTIMATE = 100_000_000;

export interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export interface HlsLevelLike {
  height?: number;
}

type EstimateStorage = Pick<Storage, "getItem" | "setItem">;

function localEstimateStorage(): EstimateStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredBandwidthEstimate(
  storage: EstimateStorage | null = localEstimateStorage(),
  now = Date.now(),
): number {
  if (!storage) return HLS_ABR_DEFAULT_ESTIMATE;
  try {
    const parsed = JSON.parse(storage.getItem(HLS_BANDWIDTH_STORAGE_KEY) ?? "null") as {
      bitsPerSecond?: unknown;
      measuredAt?: unknown;
    } | null;
    if (
      !parsed ||
      typeof parsed.bitsPerSecond !== "number" ||
      !Number.isFinite(parsed.bitsPerSecond) ||
      parsed.bitsPerSecond < MIN_ESTIMATE ||
      parsed.bitsPerSecond > MAX_ESTIMATE ||
      typeof parsed.measuredAt !== "number" ||
      now - parsed.measuredAt < 0 ||
      now - parsed.measuredAt > HLS_BANDWIDTH_MAX_AGE_MS
    ) {
      return HLS_ABR_DEFAULT_ESTIMATE;
    }
    return parsed.bitsPerSecond;
  } catch {
    return HLS_ABR_DEFAULT_ESTIMATE;
  }
}

export function storeBandwidthEstimate(
  bitsPerSecond: number,
  storage: EstimateStorage | null = localEstimateStorage(),
  measuredAt = Date.now(),
): void {
  if (
    !storage ||
    !Number.isFinite(bitsPerSecond) ||
    bitsPerSecond < MIN_ESTIMATE ||
    bitsPerSecond > MAX_ESTIMATE
  ) {
    return;
  }
  try {
    storage.setItem(
      HLS_BANDWIDTH_STORAGE_KEY,
      JSON.stringify({ bitsPerSecond: Math.round(bitsPerSecond), measuredAt }),
    );
  } catch {
    // Storage can be unavailable or full. ABR continues with its in-memory EWMA.
  }
}

export function browserNetworkInformation(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/** Whether optional media should avoid spending bytes on this connection. */
export function shouldConserveData(connection?: NetworkInformationLike): boolean {
  if (!connection) return false;
  const effectiveType = connection.effectiveType?.toLowerCase();
  return (
    connection.saveData === true ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    effectiveType === "3g"
  );
}

/**
 * Return the hls.js level index to use as autoLevelCapping, or null when the
 * browser reports no constrained-network signal. Manual quality picks remain
 * available; this limits Auto only.
 */
export function autoLevelCapForNetwork(
  levels: readonly HlsLevelLike[],
  connection?: NetworkInformationLike,
): number | null {
  if (!connection) return null;
  const effectiveType = connection.effectiveType?.toLowerCase();
  const maxHeight =
    connection.saveData === true || effectiveType === "slow-2g" || effectiveType === "2g"
      ? 480
      : effectiveType === "3g"
        ? 720
        : null;
  if (maxHeight === null) return null;

  const ranked = levels
    .map((level, index) => ({ index, height: level.height }))
    .filter((level): level is { index: number; height: number } =>
      typeof level.height === "number" && level.height > 0,
    )
    .sort((a, b) => a.height - b.height);
  if (ranked.length === 0) return null;
  const withinCap = ranked.filter((level) => level.height <= maxHeight);
  return (withinCap[withinCap.length - 1] ?? ranked[0]).index;
}
