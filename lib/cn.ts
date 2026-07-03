/**
 * cn joins conditional class name fragments into a single space-separated
 * string, dropping any falsy entries. A tiny, dependency-free stand-in for
 * `clsx` — enough for the component primitives' variant maps.
 *
 *   cn("btn", isActive && "btn-active", undefined) // => "btn btn-active"
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
