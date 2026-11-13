import * as React from "react";
import { cn } from "../lib/utils";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: "default" | "success" | "error" | "warning";
}

interface ToastContextType {
  toasts: ToastMessage[];
  toast: (t: Omit<ToastMessage, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((t: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <div className="fixed bottom-0 right-0 z-50 flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px] pointer-events-none gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 shadow-lg transition-all animate-in slide-in-from-bottom-5",
              t.type === "error"
                ? "border-red-200 bg-red-50 text-red-900"
                : t.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : t.type === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-zinc-200 bg-white text-zinc-950",
            )}
          >
            <div className="grid gap-1">
              <p className="text-xs font-semibold">{t.title}</p>
              {t.description && <p className="text-xs opacity-90">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="rounded-md p-1 text-zinc-400 hover:text-zinc-900"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
