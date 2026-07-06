import type { ReactNode } from "react";

export function EmptyState({ title, message }: { title: string; message?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-lg font-semibold tracking-tight text-fg">{title}</p>
      {message ? <p className="max-w-sm text-sm text-fg-muted">{message}</p> : null}
    </div>
  );
}
