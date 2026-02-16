import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Video } from "../types";
import type { ContextMenuState } from "../components/video-library/types";

const CONTEXT_MENU_REOPEN_DELAY_MS = 145;
const CONTEXT_MENU_RECENT_CLOSE_WINDOW_MS = 220;
const CONTEXT_MENU_VIEWPORT_MARGIN = 8;
const CONTEXT_MENU_ESTIMATED_WIDTH = 240;
const CONTEXT_MENU_ESTIMATED_HEIGHT = 340;

function getSafeContextMenuPosition(x: number, y: number) {
  const maxX = window.innerWidth - CONTEXT_MENU_ESTIMATED_WIDTH - CONTEXT_MENU_VIEWPORT_MARGIN;
  const maxY = window.innerHeight - CONTEXT_MENU_ESTIMATED_HEIGHT - CONTEXT_MENU_VIEWPORT_MARGIN;
  return {
    x: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(x, maxX)),
    y: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(y, maxY)),
  };
}

export function useContextMenuState() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    video: null,
  });
  const contextMenuReopenTimerRef = useRef<number | null>(null);
  const lastContextMenuCloseAtRef = useRef(0);

  const closeContextMenu = useCallback(() => {
    if (contextMenuReopenTimerRef.current !== null) {
      window.clearTimeout(contextMenuReopenTimerRef.current);
      contextMenuReopenTimerRef.current = null;
    }
    setContextMenu((prev) => {
      if (prev.visible) {
        lastContextMenuCloseAtRef.current = Date.now();
      }
      return { ...prev, visible: false };
    });
  }, []);

  const openContextMenu = useCallback(
    (e: ReactMouseEvent, video: Video) => {
      e.preventDefault();
      const now = Date.now();
      const recentlyClosed =
        now - lastContextMenuCloseAtRef.current < CONTEXT_MENU_RECENT_CLOSE_WINDOW_MS;

      if (contextMenuReopenTimerRef.current !== null) {
        window.clearTimeout(contextMenuReopenTimerRef.current);
        contextMenuReopenTimerRef.current = null;
      }

      if (contextMenu.visible || recentlyClosed) {
        closeContextMenu();
        const nextPosition = getSafeContextMenuPosition(e.clientX, e.clientY);
        contextMenuReopenTimerRef.current = window.setTimeout(() => {
          setContextMenu({
            visible: true,
            x: nextPosition.x,
            y: nextPosition.y,
            video,
          });
          contextMenuReopenTimerRef.current = null;
        }, CONTEXT_MENU_REOPEN_DELAY_MS);
        return;
      }

      const nextPosition = getSafeContextMenuPosition(e.clientX, e.clientY);
      setContextMenu({
        visible: true,
        x: nextPosition.x,
        y: nextPosition.y,
        video,
      });
    },
    [contextMenu.visible, closeContextMenu]
  );

  useEffect(() => {
    return () => {
      if (contextMenuReopenTimerRef.current !== null) {
        window.clearTimeout(contextMenuReopenTimerRef.current);
      }
    };
  }, []);

  return {
    contextMenu,
    openContextMenu,
    closeContextMenu,
  };
}
