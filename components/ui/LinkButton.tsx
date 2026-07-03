import Link from "next/link";
import type { ComponentProps } from "react";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";

export type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * LinkButton — a Next `<Link>` styled as a button. Use for navigation that
 * should look like an action (e.g. "Create one", "Back to sign in"). Shares
 * `buttonClasses` with `<Button>` so a link-button and a real button are
 * visually identical.
 */
export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
