import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../lib/utils";

type ToastTone = "success" | "error" | "info";

type Toast = {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  push: (title: string, options?: { message?: string; tone?: ToastTone }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100",
  error: "border-red-500/30 bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-100",
  info: "border-indigo-500/30 bg-white text-slate-900 dark:bg-ink-850 dark:text-slate-100",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (title: string, options?: { message?: string; tone?: ToastTone }) => {
      const id = nextId.current++;
      setToasts((current) => [
        ...current.slice(-3),
        { id, title, message: options?.message, tone: options?.tone ?? "info" },
      ]);
      window.setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex animate-slide-in items-start gap-3 rounded-xl border p-3.5 shadow-float backdrop-blur",
              TONE_STYLES[toast.tone],
            )}
            role="status"
          >
            <span className="mt-0.5">
              {toast.tone === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : toast.tone === "error" ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : (
                <Info className="h-4 w-4 text-indigo-500" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-5">{toast.title}</p>
              {toast.message ? (
                <p className="mt-0.5 line-clamp-2 text-xs opacity-80">{toast.message}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded p-0.5 opacity-50 transition hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
