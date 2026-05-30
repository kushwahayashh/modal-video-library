import "./ContextMenu.css";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconRewindBackward5,
  IconRewindForward5,
  IconRepeat,
  IconChartBar,
  IconCopy,
  IconDownload,
  IconInfoCircle,
} from "@tabler/icons-react";

export interface PlayerContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

interface PlayerContextMenuProps {
  state: PlayerContextMenuState;
  playing: boolean;
  loop: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onAction: (action: string) => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: typeof IconPlayerPlayFilled;
  stroke?: number;
  active?: boolean;
}

const VIEWPORT_MARGIN = 8;
const CLOSE_ANIMATION_MS = 140;
const MENU_ICON_SIZE = 18;

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getMenuPosition(
  anchorX: number,
  anchorY: number,
  menuWidth: number,
  menuHeight: number,
  container: HTMLElement | null
) {
  const width = container?.clientWidth ?? window.innerWidth;
  const height = container?.clientHeight ?? window.innerHeight;
  const maxX = width - menuWidth - VIEWPORT_MARGIN;
  const maxY = height - menuHeight - VIEWPORT_MARGIN;
  return {
    x: clamp(anchorX, VIEWPORT_MARGIN, maxX),
    y: clamp(anchorY, VIEWPORT_MARGIN, maxY),
  };
}

export default function PlayerContextMenu({ state, playing, loop, containerRef, onClose, onAction }: PlayerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeTimerRef = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [anchor, setAnchor] = useState({ x: state.x, y: state.y });
  const [position, setPosition] = useState({ x: state.x, y: state.y });
  const [activeIndex, setActiveIndex] = useState(0);

  const menuItems = useMemo<MenuItem[]>(
    () => [
      {
        id: "play-pause",
        label: playing ? "Pause" : "Play",
        icon: playing ? IconPlayerPauseFilled : IconPlayerPlayFilled,
      },
      { id: "back-5", label: "Back 5 seconds", icon: IconRewindBackward5, stroke: 2.5 },
      { id: "forward-5", label: "Forward 5 seconds", icon: IconRewindForward5, stroke: 2.5 },
      { id: "loop", label: "Loop", icon: IconRepeat, stroke: 2.5, active: loop },
      { id: "stats", label: "Stats for nerds", icon: IconChartBar, stroke: 2.5 },
      { id: "info", label: "Properties", icon: IconInfoCircle, stroke: 2.5 },
      { id: "copy-link", label: "Copy video URL", icon: IconCopy, stroke: 2.5 },
      { id: "download", label: "Download", icon: IconDownload, stroke: 2.5 },
    ],
    [playing, loop]
  );

  useEffect(() => {
    if (state.visible) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
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
  }, [state.visible, state.x, state.y, menuOpen]);

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
      const nextPosition = getMenuPosition(
        anchor.x,
        anchor.y,
        rect.width,
        rect.height,
        containerRef.current
      );
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
  }, [menuOpen, anchor.x, anchor.y, menuItems, containerRef]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, menuItems.length);
  }, [menuItems.length]);

  useEffect(() => {
    if (!state.visible || menuItems.length === 0) return;
    setActiveIndex(0);
  }, [state.visible, menuItems.length]);

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

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        // Prevent default so Escape doesn't also exit fullscreen.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown, true);
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
      default:
        break;
    }
  };

  if (!menuOpen || menuItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className={`context-menu ${isClosing ? "closing" : ""}`}
      style={{ position: "absolute", left: position.x, top: position.y }}
      role="menu"
      aria-label="Video player actions"
      aria-hidden={isClosing}
      onKeyDown={handleMenuKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menuItems.map((item, index) => (
        <div key={item.id}>
          {index > 0 ? <div className="context-menu-divider" role="separator" /> : null}
          <button
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="menuitem"
            aria-checked={item.active}
            tabIndex={index === activeIndex ? 0 : -1}
            className={`context-menu-item${item.active ? " context-menu-item--active" : ""}`}
            onMouseEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => {
              onAction(item.id);
              onClose();
            }}
          >
            <item.icon size={MENU_ICON_SIZE} stroke={item.stroke} />
            <span>{item.label}</span>
            {item.active && <span className="context-menu-item-tick" aria-hidden>✓</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
