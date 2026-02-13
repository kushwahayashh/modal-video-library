import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToastState, type Toast } from "./ToastProvider";
import "./ToastStack.css";

type Phase = "enter" | "open" | "exit";

export default function ToastStack() {
  const toast = useToastState();
  const [rendered, setRendered] = useState<Toast | null>(null);
  const [phase, setPhase] = useState<Phase>("enter");
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderedRef = useRef<Toast | null>(null);

  useEffect(() => {
    renderedRef.current = rendered;
  }, [rendered]);

  useEffect(() => () => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!toast) {
      if (!renderedRef.current) return;
      setPhase("exit");
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => {
        setRendered(null);
        exitTimerRef.current = null;
      }, 180);
      return;
    }

    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    setRendered(toast);
    setPhase("enter");
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, [toast]);

  if (!rendered) return null;

  return createPortal(
    <div className="toast-vp" role="status" aria-live="polite">
      <div className={`toast-card ${rendered.variant}`} data-phase={phase}>
        <div className="toast-msg">{rendered.message}</div>
      </div>
    </div>,
    document.body
  );
}
