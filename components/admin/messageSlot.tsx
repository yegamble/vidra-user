import { Fragment, type ReactNode } from "react";

/**
 * A placeholder value that never occurs in real copy. Pass it as a message var
 * where the sentence needs a styled node (an emphasised username) mid-text,
 * then feed the translated string to `withSlot`. Keeps the sentence one
 * translatable unit while the markup stays in the component.
 */
export const SLOT = "\u0001";

export function withSlot(text: string, node: ReactNode): ReactNode {
  const [before, ...rest] = text.split(SLOT);
  return (
    <>
      {before}
      {rest.map((part, i) => (
        <Fragment key={i}>
          {node}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** Placeholder for the NAMED slot `name`; pass it as a message var, then `withSlots`. */
export function slot(name: string): string {
  return `\u0001${name}\u0002`;
}

/** `withSlot` for a sentence with several styled nodes, keyed by slot name. */
export function withSlots(text: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = text.split(/\u0001(\w+)\u0002/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? <Fragment key={i}>{part}</Fragment> : <Fragment key={i}>{nodes[part]}</Fragment>,
      )}
    </>
  );
}
