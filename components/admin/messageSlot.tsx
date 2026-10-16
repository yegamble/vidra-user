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
