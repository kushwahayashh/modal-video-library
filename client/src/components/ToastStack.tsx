import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToastState, type Toast } from "./ToastProvider";
import "./ToastStack.css";

type Phase = "enter" | "open" | "exit";
interface Entry { toast: Toast; phase: Phase }

export default function ToastStack() {
  const toasts = useToastState();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const exitTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => () => {
    for (const timer of exitTimers.current.values()) {
      clearTimeout(timer);
    }
    exitTimers.current.clear();
  }, []);

  useEffect(() => {
    const ids = new Set(toasts.map((t) => t.id));

    setEntries((prev) => {
      const map = new Map(prev.map((e) => [e.toast.id, e]));
      const next: Entry[] = [];

      for (const toast of toasts) {
        const ex = map.get(toast.id);
        next.push({ toast, phase: ex ? (ex.phase === "exit" ? "open" : ex.phase) : "enter" });
      }
      for (const e of prev) {
        if (!ids.has(e.toast.id) && e.phase !== "exit") {
          next.push({ ...e, phase: "exit" });
          if (!exitTimers.current.has(e.toast.id)) {
            exitTimers.current.set(e.toast.id, setTimeout(() => {
              exitTimers.current.delete(e.toast.id);
              setEntries((p) => p.filter((x) => x.toast.id !== e.toast.id));
            }, 350));
          }
        }
      }
      return next;
    });
  }, [toasts]);

  useEffect(() => {
    if (!entries.some((e) => e.phase === "enter")) return;
    const raf = requestAnimationFrame(() =>
      setEntries((p) => p.map((e) => e.phase === "enter" ? { ...e, phase: "open" } : e))
    );
    return () => cancelAnimationFrame(raf);
  }, [entries]);

  const live = entries.filter((e) => e.phase !== "exit");
  const latest = live[live.length - 1];
  const older = live.slice(0, -1);
  const hiddenCount = older.length;

  return createPortal(
    <div
      className={`toast-vp${entries.length === 0 ? " empty" : ""}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      role="log"
      aria-live="polite"
    >
      {hiddenCount > 0 && (
        <div className={`toast-history${expanded ? " open" : ""}`}>
          {older.map((e, i) => (
            <div key={e.toast.id} className="toast-hist-item" style={{ transitionDelay: expanded ? `${i * 40}ms` : "0ms" }}>
              <Card toast={e.toast} phase={e.phase} />
            </div>
          ))}
        </div>
      )}

      {latest && (
        <div className="toast-anchor">
          <Card key={latest.toast.id} toast={latest.toast} phase={latest.phase} />
          {hiddenCount > 0 && (
            <span className={`toast-badge${expanded ? "" : " show"}`}>+{hiddenCount}</span>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}

function Card({ toast, phase }: { toast: Toast; phase: Phase }) {
  return (
    <div className={`toast-card ${toast.variant}`} data-phase={phase}>
      {toast.title && <div className="toast-title">{toast.title}</div>}
      {toast.message && <div className="toast-msg">{toast.message}</div>}
      {toast.detail && <div className="toast-detail">{toast.detail}</div>}
      {toast.progress != null && (
        <div className="toast-bar">
          <div className="toast-bar-fill" style={{ transform: `scaleX(${toast.progress / 100})` }} />
        </div>
      )}
    </div>
  );
}
