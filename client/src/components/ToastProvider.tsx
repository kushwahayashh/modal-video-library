import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface Toast {
  id: number;
  variant: "success" | "error" | "status";
  title?: string;
  message?: string;
  detail?: string;
  progress?: number | null;
}

export interface ToastActions {
  pushToast: (t: Omit<Toast, "id"> & { dismissAfterMs?: number }) => number;
  updateToast: (id: number, patch: Partial<Omit<Toast, "id">>) => void;
  removeToast: (id: number) => void;
}

const ActionsCtx = createContext<ToastActions | null>(null);
const StateCtx = createContext<Toast[]>([]);

export const useToast = () => {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error("useToast requires ToastProvider");
  return ctx;
};

export const useToastState = () => useContext(StateCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const removeToast = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((input: Omit<Toast, "id"> & { dismissAfterMs?: number }) => {
    const { dismissAfterMs, ...toast } = input;
    const id = ++idRef.current;
    const ms = dismissAfterMs ?? (toast.variant !== "status" ? 3500 : undefined);
    setToasts((p) => [...p, { ...toast, id }]);
    if (ms != null) {
      timers.current.set(id, setTimeout(() => {
        timers.current.delete(id);
        setToasts((p) => p.filter((t) => t.id !== id));
      }, ms));
    }
    return id;
  }, []);

  const updateToast = useCallback((id: number, patch: Partial<Omit<Toast, "id">>) => {
    setToasts((p) => {
      const i = p.findIndex((t) => t.id === id);
      if (i === -1) return p;
      const cur = p[i];
      const keys = Object.keys(patch) as (keyof typeof patch)[];
      if (keys.every((k) => cur[k] === patch[k])) return p;
      const next = [...p];
      next[i] = { ...cur, ...patch };
      return next;
    });
  }, []);

  useEffect(() => () => {
    for (const timer of timers.current.values()) {
      clearTimeout(timer);
    }
    timers.current.clear();
  }, []);

  const actions = useMemo<ToastActions>(() => ({
    pushToast,
    updateToast,
    removeToast,
  }), [pushToast, updateToast, removeToast]);

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={toasts}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}
