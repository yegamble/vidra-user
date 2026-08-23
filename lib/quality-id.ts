// The engine-neutral identity of a selectable playback quality.
//
// Nothing outside an engine adapter may key quality off an engine's own handle.
// hls.js's level INDEX is a position in a list hls.js re-sorts by its own private
// preference (height ascending, then its codec ranking — utils/codecs.ts — with
// average bitrate only as the final tiebreak), so the same rendition has a
// different index depending on which other renditions the master happens to
// carry. A DASH manifest has no such number at all, and native HLS exposes no
// selection handle whatsoever. An index is therefore a pointer into one engine's
// scratch array, not an identity.
//
// A QualityId is minted by the adapter from what the MANIFEST says, so the menu,
// the durable per-user preference and the ABR cap can all speak the same
// language whichever engine is playing.

/**
 * QualityId names one selectable rendition:
 *
 * - `height` — the rendition height in pixels. Manifest-authoritative: every
 *   variant carries `RESOLUTION=WxH`, and it is what the user actually picks
 *   ("720p"), so it is the only REQUIRED axis.
 * - `codecFamily` — the codec family the rendition belongs to (hls.js's
 *   `Level.codecSet`: the 4-char video and audio codec prefixes, e.g.
 *   "avc1,mp4a" / "hvc1,mp4a" / "av01,mp4a"). A multi-codec master carries the
 *   same ladder several times over and ABR never crosses families — that is
 *   DASH AdaptationSet semantics, not an hls.js quirk — so the family is part of
 *   the identity, not decoration. Optional because a level list carrying no
 *   codec info at all (a mock, a minimal master) still has to fit.
 * - `repId` — the representation number, when the tree names its variants that
 *   way. A CMAF tree's variant playlists are `media_<rep>.m3u8` and that same
 *   integer is the DASH `<Representation id>`, which makes it the one truly
 *   stable cross-engine handle where it exists. It does NOT exist for the
 *   MPEG-TS back catalog (`720p/playlist.m3u8`) or PeerTube pass-through trees,
 *   so it is optional and nothing may require it — it only ever sharpens a
 *   match that height + family already makes.
 */
export interface QualityId {
  height: number;
  codecFamily?: string;
  repId?: number;
}

/**
 * The adaptive (ABR-chooses) selection. This is the sentinel that replaces
 * hls.js's `AUTO_LEVEL = -1`: "auto" is a real state of the PLAYER, not a
 * position in some engine's level array.
 */
export const AUTO_QUALITY = "auto";
export type AutoQuality = typeof AUTO_QUALITY;

/** What the player is set to: a specific rendition, or adaptive. */
export type QualitySelection = QualityId | AutoQuality;

export function isAutoQuality(selection: QualitySelection): selection is AutoQuality {
  return selection === AUTO_QUALITY;
}

// The canonical string form's field separator. It cannot collide with a codec
// family (comma-joined 4-char codec names) or a decimal rep number.
const SEP = "|";

/**
 * qualityKey renders the canonical string form of a selection. This is the value
 * that crosses into the DOM: the menu entry's value, the React key, and the
 * cheap equality test for two selections. It is stable for a given rendition —
 * unlike an index it does not move when the master gains or loses a variant.
 *
 * Shape: `"auto"`, or `<height>p` followed by the optional axes in a fixed
 * order — `"1080p"`, `"1080p|hvc1,mp4a"`, `"1080p|hvc1,mp4a|r4"`, `"1080p|r4"`.
 */
export function qualityKey(selection: QualitySelection): string {
  if (isAutoQuality(selection)) return AUTO_QUALITY;
  let key = `${selection.height}p`;
  if (selection.codecFamily) key += SEP + selection.codecFamily;
  if (selection.repId !== undefined) key += `${SEP}r${selection.repId}`;
  return key;
}

/**
 * parseQualityKey is qualityKey's inverse — it exists so the canonical form is
 * a genuine serialization (round-trippable) rather than a display string, which
 * is what lets a key be handed through an opaque carrier (a DOM value, a menu
 * item, later a URL fragment) and come back as the same identity. Returns null
 * for anything that is not a canonical key.
 */
export function parseQualityKey(key: string): QualitySelection | null {
  if (key === AUTO_QUALITY) return AUTO_QUALITY;
  const parts = key.split(SEP);
  const height = /^(\d+)p$/.exec(parts[0]);
  if (!height) return null;
  const id: QualityId = { height: Number(height[1]) };
  if (id.height <= 0) return null;
  for (const part of parts.slice(1)) {
    const rep = /^r(\d+)$/.exec(part);
    if (rep) {
      if (id.repId !== undefined) return null;
      id.repId = Number(rep[1]);
    } else {
      if (part === "" || id.codecFamily !== undefined || id.repId !== undefined) return null;
      id.codecFamily = part;
    }
  }
  return id;
}

/** Whether two selections name the same rendition (canonical-form equality). */
export function sameQuality(a: QualitySelection | null, b: QualitySelection | null): boolean {
  if (a === null || b === null) return false;
  return qualityKey(a) === qualityKey(b);
}

/**
 * heightOfQualityPreference reads the pixel height out of the durable per-user
 * preference wire format (`"auto"` or `^[0-9]{2,4}p$`, validated server-side in
 * vidra-core internal/playersettings). Returns null for "auto" and for anything
 * that is not a rung — the caller then stays adaptive rather than guessing.
 */
export function heightOfQualityPreference(preference: string): number | null {
  const match = /^(\d{2,4})p$/.exec(preference);
  if (!match) return null;
  const height = Number(match[1]);
  return height > 0 ? height : null;
}

/**
 * repIdFromUri derives the representation number from a variant playlist URI
 * when the tree names its variants the CMAF way (`media_<rep>.m3u8` — the
 * muxer's own naming, and the same integer DASH uses as `<Representation id>`).
 * Query strings, fragments and the leading directories are stripped first
 * because an engine reports the RESOLVED absolute URL. Anything else — the
 * MPEG-TS ladder's `720p/playlist.m3u8`, a PeerTube pass-through tree — has no
 * such number, and undefined is the correct, expected answer there.
 */
export function repIdFromUri(uri?: string): number | undefined {
  if (!uri) return undefined;
  const path = uri.split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf("/") + 1);
  const match = /^media_(\d+)\.m3u8$/.exec(name);
  return match ? Number(match[1]) : undefined;
}
