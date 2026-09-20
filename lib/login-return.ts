/** Keep login navigation local, including after URL normalization/decoding. */
export function safeLoginReturn(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://login-return.invalid");
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== "https://login-return.invalid" || path.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(path)) return "/";
    return value;
  } catch {
    return "/";
  }
}
