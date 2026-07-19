import { cn } from "@/lib/cn";

// ProtocolRibbon — the tri-protocol identity gradient (ActivityPub violet →
// Bluesky blue → IPFS teal), Vidra's federation differentiator made visible.
// The gradient itself is defined ONCE in globals.css (`.protocol-ribbon`); this
// component is the single wrapper for its standalone placements.
//
// HARD CAP — exactly three sanctioned placements app-wide (design-system.md):
//   (a) under the header wordmark            → Header (Wave 0)
//   (b) the Network / about-network hero     → the Network screen agent (later)
//   (c) the top edge of federated-origin badges → the Badge `federated` variant
// Any other appearance is a review defect. Purely decorative: it renders
// aria-hidden and carries no accessible name.
//
// Default is a 2.5px full-width rounded rule; pass `className` to size/position
// it for a given placement (e.g. the Network hero divider, or an absolute
// top-edge strip on a badge).
export function ProtocolRibbon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("protocol-ribbon block h-[2.5px] w-full rounded-full", className)}
    />
  );
}
