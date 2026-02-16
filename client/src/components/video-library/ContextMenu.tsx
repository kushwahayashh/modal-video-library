import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Play, Download, Trash2, Edit3, Copy, Info, LayoutGrid, Image } from "lucide-react";
import type { Video } from "../../types";
import type { ContextMenuState } from "./types";

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onAction: (action: string, video: Video) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: typeof Play;
  danger?: boolean;
  dividerBefore?: boolean;
}

const VIEWPORT_MARGIN = 8;
const CLOSE_ANIMATION_MS = 140;

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getMenuPosition(anchorX: number, anchorY: number, menuWidth: number, menuHeight: number) {
  const maxX = window.innerWidth - menuWidth - VIEWPORT_MARGIN;
  const maxY = window.innerHeight - menuHeight - VIEWPORT_MARGIN;
  return {
    x: clamp(anchorX, VIEWPORT_MARGIN, maxX),
    y: clamp(anchorY, VIEWPORT_MARGIN, maxY),
  };
}

export default function ContextMenu({ state, onClose, onAction }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeTimerRef = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [anchor, setAnchor] = useState({ x: state.x, y: state.y });
  const [position, setPosition] = useState({ x: state.x, y: state.y });
  const [activeVideo, setActiveVideo] = useState<Video | null>(state.video);
  const [activeIndex, setActiveIndex] = useState(0);

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!activeVideo) return [];
    return [
      { id: "play", label: "Play", icon: Play },
      { id: "download", label: "Download", icon: Download },
      { id: "copy-link", label: "Copy Link", icon: Copy },
      { id: "rename", label: "Rename", icon: Edit3, dividerBefore: true },
      { id: "info", label: "Properties", icon: Info },
      {
        id: "sprites",
        label: activeVideo.hasSprites ? "Regenerate Sprites" : "Generate Sprites",
        icon: LayoutGrid,
      },
      { id: "thumbnail", label: "Change Thumbnail", icon: Image },
      { id: "delete", label: "Delete", icon: Trash2, danger: true, dividerBefore: true },
    ];
  }, [activeVideo]);

  useEffect(() => {
    if (state.visible && state.video) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setActiveVideo(state.video);
      setAnchor({ x: state.x, y: state.y });
      setPosition({ x: state.x, y: state.y });
      setMenuOpen(true);
      setIsClosing(false);
      return;
    }

    if (!state.visible && menuOpen) {
      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
        setMenuOpen(false);
        setIsClosing(false);
        closeTimerRef.current = null;
      }, CLOSE_ANIMATION_MS);
    }
  }, [state.visible, state.video, state.x, state.y, menuOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current) return;

    let rafId: number | null = null;

    const updatePosition = () => {
      if (!menuRef.current) return;
      const rect = menuRef.current.getBoundingClientRect();
      const nextPosition = getMenuPosition(anchor.x, anchor.y, rect.width, rect.height);
      setPosition((prev) =>
        prev.x === nextPosition.x && prev.y === nextPosition.y ? prev : nextPosition
      );
    };

    updatePosition();
    rafId = window.requestAnimationFrame(updatePosition);

    const observer = new ResizeObserver(updatePosition);
    observer.observe(menuRef.current);

    window.addEventListener("resize", updatePosition);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [menuOpen, anchor.x, anchor.y, menuItems]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, menuItems.length);
  }, [menuItems.length]);

  useEffect(() => {
    if (!state.visible || menuItems.length === 0) return;
    setActiveIndex(0);
  }, [state.visible, menuItems.length, activeVideo?.id]);

  useEffect(() => {
    if (!state.visible) return;
    itemRefs.current[activeIndex]?.focus();
  }, [state.visible, activeIndex]);

  useEffect(() => {
    if (!state.visible) return;

    const handleClickOutside = (e: globalThis.PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => onClose();
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [state.visible, onClose]);

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!menuItems.length) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % menuItems.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(menuItems.length - 1);
        break;
      case "Tab":
        onClose();
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  if (!menuOpen || !activeVideo || menuItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className={`context-menu ${isClosing ? "closing" : ""}`}
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={`Actions for ${activeVideo.title}`}
      aria-hidden={isClosing}
      onKeyDown={handleMenuKeyDown}
    >
      {menuItems.map((item, index) => (
        <div key={item.id}>
          {item.dividerBefore ? <div className="context-menu-divider" role="separator" /> : null}
          <button
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={index === activeIndex ? 0 : -1}
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            onMouseEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => {
              onAction(item.id, activeVideo);
              onClose();
            }}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
