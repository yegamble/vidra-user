/**
 * The limit/offset window every paginated vidra list endpoint accepts. The
 * request-side counterpart of the `PageMeta` the responses compose in, and
 * spelled out once here rather than re-typed inline at two dozen endpoint
 * signatures — where a typo (`ofset`) would have been a silently ignored query
 * param rather than a compile error.
 *
 * Both fields are optional: omitting them asks the backend for its own default
 * page, which is the right request for a surface with no pager.
 */
export interface PageParams {
  limit?: number;
  offset?: number;
}

/**
 * The `query` fragment for a paged request. `undefined` entries are dropped by
 * the request builder, so an unset field sends no param at all rather than
 * `limit=undefined`.
 *
 * Spread it alongside an endpoint's own filters:
 *
 *   query: { q: params.q, ...pageQuery(params) }
 */
export function pageQuery(params: PageParams): { limit?: number; offset?: number } {
  return { limit: params.limit, offset: params.offset };
}

/**
 * The page size a surface asks for when it wants the WHOLE list in one request
 * and renders no pager — the settings lists, the block/mute lists, a video's
 * comments. 100 is the backend's maximum accepted limit (see `use-list-query`'s
 * clamp), so this is "as much as can be asked for", not a tuning knob.
 *
 * It is deliberately NOT the default page size: a list that grows past 100 rows
 * needs a real pager, and the constant exists partly so those call sites are
 * greppable when that day comes.
 */
export const FULL_LIST_LIMIT = 100;
