import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ToastVariant = "success" | "error" | "warning";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  addToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, variant }]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [toasts]);

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:w-80">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={[
              "rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur",
              toast.variant === "success" && "border-accent-lime/40 bg-bg-card text-text-primary",
              toast.variant === "error" && "border-accent-red/40 bg-bg-card text-text-primary",
              toast.variant === "warning" && "border-accent-yellow/40 bg-bg-card text-text-primary",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
