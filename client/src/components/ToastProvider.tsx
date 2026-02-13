import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface Toast {
  id: number;
  variant: "success" | "error";
  message: string;
}

export interface ToastActions {
  pushToast: (t: Omit<Toast, "id"> & { dismissAfterMs?: number }) => number;
  removeToast: (id: number) => void;
}

const ActionsCtx = createContext<ToastActions | null>(null);
const StateCtx = createContext<Toast | null>(null);

export const useToast = () => {
  const ctx = useContext(ActionsCtx);
  if (!ctx) throw new Error("useToast requires ToastProvider");
  return ctx;
};

export const useToastState = () => useContext(StateCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const removeToast = useCallback((id: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast((current) => (current?.id === id ? null : current));
  }, []);

  const pushToast = useCallback((input: Omit<Toast, "id"> & { dismissAfterMs?: number }) => {
    const { dismissAfterMs, ...toast } = input;
    const id = ++idRef.current;
    const ms = dismissAfterMs ?? 2800;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setToast({ ...toast, id });
    timerRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
      timerRef.current = null;
    }, ms);

    return id;
  }, []);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const actions = useMemo<ToastActions>(() => ({
    pushToast,
    removeToast,
  }), [pushToast, removeToast]);

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={toast}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}
