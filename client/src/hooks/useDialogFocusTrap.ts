import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function isVisible(el: HTMLElement) {
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => isVisible(el) && !el.hasAttribute("aria-hidden")
  );
}

interface UseDialogFocusTrapOptions {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
}

export function useDialogFocusTrap({ active, containerRef }: UseDialogFocusTrapOptions) {
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const previousFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusInitial = () => {
      const firstFocusable = getFocusableElements(container)[0];
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        container.focus();
      }
    };

    const rafId = window.requestAnimationFrame(focusInitial);

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey) {
        if (!activeEl || !container.contains(activeEl) || activeEl === first) {
          e.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeEl || !container.contains(activeEl) || activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocused && document.contains(previousFocused)) {
        previousFocused.focus();
      }
    };
  }, [active, containerRef]);
}
