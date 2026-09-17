const LABELS: Record<string, string> = {
  ok: "OK",
  degraded: "Degraded",
  down: "Down",
  not_configured: "Not configured",
  paused: "Paused",
  pending: "Pending",
};

/** An intentional pause or pending setup is neither a failure nor a healthy probe. */
export function componentHealthPresentation(status: string) {
  const neutral = ["not_configured", "paused", "pending"].includes(status);
  return {
    label: LABELS[status] ?? status.replace(/_/g, " "),
    neutral,
    fault: status !== "ok" && !neutral,
  };
}
