import { splitTimestamps } from "@/lib/timestamp-links";

// Tree plugins for components/UserText.tsx. Loose node shape on purpose: these
// run on untrusted markdown, so they only ever read `type`/`children`/`value`.
interface Node {
  type: string;
  children?: Node[];
  value?: string;
  identifier?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
}

/** Block/inline nesting beyond this is flattened to text (stack-safety bound). */
export const MAX_NESTING = 12;

// Iterative on purpose: this runs on the subtree that is too deep to recurse.
function collectText(root: Node): string {
  const out: string[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (typeof n.value === "string") out.push(n.value);
    if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return out.join("");
}

function bound(nodes: Node[], depth: number): Node[] {
  const result: Node[] = [];
  for (const node of nodes) {
    // Footnotes would leak a "Footnotes" label and back-arrows; keep the source text.
    if (node.type === "footnoteReference") {
      result.push({ type: "text", value: `[^${node.identifier ?? ""}]` });
    } else if (node.type === "footnoteDefinition") {
      result.push({
        type: "paragraph",
        children: [{ type: "text", value: `[^${node.identifier ?? ""}]: ` }],
      });
      result.push(...bound(node.children ?? [], depth + 1));
    } else if (!node.children) {
      result.push(node);
    } else if (depth >= MAX_NESTING) {
      result.push({ type: "text", value: collectText(node) });
    } else {
      node.children = bound(node.children, depth + 1);
      result.push(node);
    }
  }
  return result;
}

/** remark: cap nesting depth and neutralise footnotes before remark-rehype runs. */
export function remarkBoundTree() {
  return (tree: Node) => {
    tree.children = bound(tree.children ?? [], 1);
  };
}

/**
 * rehype: turn (h:)mm:ss tokens in text nodes into `a` elements tagged with
 * `dataTimestampSeconds` (no href — the renderer builds it, so the URL
 * allowlist never sees it). Text under `skip` tags is left alone.
 */
export function rehypeTimestamps(options: { durationSeconds?: number | null; skip: string[] }) {
  const walk = (node: Node) => {
    if (!node.children) return;
    if (node.type === "element" && options.skip.includes(node.tagName ?? "")) return;
    const next: Node[] = [];
    for (const child of node.children) {
      if (child.type !== "text" || typeof child.value !== "string") {
        walk(child);
        next.push(child);
        continue;
      }
      for (const seg of splitTimestamps(child.value, options.durationSeconds)) {
        next.push(
          typeof seg === "string"
            ? { type: "text", value: seg }
            : {
                type: "element",
                tagName: "a",
                properties: { dataTimestampSeconds: seg.seconds },
                children: [{ type: "text", value: seg.token }],
              },
        );
      }
    }
    node.children = next;
  };
  return (tree: Node) => walk(tree);
}

// Markdown parsing cost is superlinear in delimiter structure, and the watch
// description is rendered on the server on every uncached view. So parse cost is
// bounded up front: a body above ANY budget below skips the parser and renders as
// plain text (with safe bare-URL links and timestamps; see UserText).
export const MAX_PARSE_BYTES = 3000;
export const MAX_DELIMITERS = 256;

// 100+ consecutive structure markers (measured: ~2,000 bytes of "- " blocks the
// thread for seconds) — also catches long runs of characters not counted below.
const MARKER_RUN_RE = /(?:[>*_~`+\-\[\]()!<\\#]\s*|\d{1,3}[.)]\s+){100}/;
const DELIMITER_RE = /[*_~`\[\]|<>]/g;
// Well-formed bare http(s) URL runs only: scheme + characters legal in a URL
// (no brackets, parens, `*`, backtick, `|`, `<`, `>`, whitespace). Imported
// PeerTube text is URL-heavy and `_` is legal in URLs, so these runs are
// not counted as delimiters; anything that breaks the run (any structural
// character) ends the exemption, and the byte cap and marker-run check above
// still apply to the whole body.
const URL_RUN_RE = /https?:\/\/[\w\-.~:/?#@!$&'+,;=%]+/gi;
const LIST_MARKER_RE = /^[ \t]*(?:[-+]|\d{1,9}[.)])[ \t]/gm;

export function exceedsParseBudget(text: string): boolean {
  if (text.length > MAX_PARSE_BYTES) return true; // UTF-16 units <= UTF-8 bytes; exact check below
  if (new TextEncoder().encode(text).length > MAX_PARSE_BYTES) return true;
  const delimiters = (text.replace(URL_RUN_RE, "").match(DELIMITER_RE)?.length ?? 0) + (text.match(LIST_MARKER_RE)?.length ?? 0);
  return delimiters > MAX_DELIMITERS || MARKER_RUN_RE.test(text);
}
