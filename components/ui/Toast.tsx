"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

export type ToastVariant = "info" | "success" | "error";

export type ToastOptions = {
  message: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms (default 5000). Pass 0 to keep until dismissed. */
  durationMs?: number;
};

type ToastRecord = ToastOptions & { id: number; variant: ToastVariant };

type ToastApi = {
  /** Show a toast; returns its id (rarely needed). */
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * useToast returns `{ toast, dismiss }`. Must be called under a
 * `<ToastProvider>`. `toast({ message, variant })` enqueues a transient,
 * screen-reader-announced notification.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}

const VARIANT_STYLE: Record<ToastVariant, string> = {
  info: "border-border bg-surface text-fg",
  success: "border-success/40 bg-surface text-fg",
  error: "border-danger/40 bg-surface text-fg",
};

/**
 * ToastProvider — hosts the toast queue and renders the live region. Errors are
 * announced assertively (`role="alert"` / `aria-live="assertive"`); info and
 * success politely. Toasts auto-dismiss and are individually dismissible.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((tst) => tst.id !== id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      const record: ToastRecord = { variant: "info", ...opts, id };
      setToasts((current) => [...current, record]);
      const duration = opts.durationMs ?? 5000;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4">
        {toasts.map((tst) => (
          <div
            key={tst.id}
            role={tst.variant === "error" ? "alert" : "status"}
            aria-live={tst.variant === "error" ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg",
              VARIANT_STYLE[tst.variant],
            )}
          >
            <span className="flex-1">{tst.message}</span>
            <IconButton
              label={t("common.dismiss")}
              size="sm"
              onClick={() => dismiss(tst.id)}
              className="-my-1 -mr-1"
            >
              <CloseIcon size={16} />
            </IconButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
