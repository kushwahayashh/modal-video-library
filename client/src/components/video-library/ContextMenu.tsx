import { useEffect, useRef } from "react";
import { Play, Download, Trash2, Edit3, Copy, Info, LayoutGrid, Image } from "lucide-react";
import type { Video } from "../../types";
import type { ContextMenuState } from "./types";

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onAction: (action: string, video: Video) => void;
}

export default function ContextMenu({ state, onClose, onAction }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.visible) return;

    const handleClickOutside = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => onClose();
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [state.visible, onClose]);

  useEffect(() => {
    if (!state.visible || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = state.x;
    let adjustedY = state.y;

    if (state.x + rect.width > viewportWidth - 8) {
      adjustedX = viewportWidth - rect.width - 8;
    }
    if (state.y + rect.height > viewportHeight - 8) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    if (adjustedX !== state.x || adjustedY !== state.y) {
      menu.style.left = `${adjustedX}px`;
      menu.style.top = `${adjustedY}px`;
    }
  }, [state.visible, state.x, state.y]);

  if (!state.visible || !state.video) return null;

  const menuItems = [
    { id: "play", label: "Play", icon: Play },
    { id: "download", label: "Download", icon: Download },
    { id: "copy-link", label: "Copy Link", icon: Copy },
    { id: "rename", label: "Rename", icon: Edit3 },
    { id: "info", label: "Properties", icon: Info },
    { id: "sprites", label: state.video.hasSprites ? "Regenerate Sprites" : "Generate Sprites", icon: LayoutGrid },
    { id: "thumbnail", label: "Change Thumbnail", icon: Image },
    { id: "delete", label: "Delete", icon: Trash2, danger: true },
  ];

  return (
    <div ref={menuRef} className="context-menu" style={{ left: state.x, top: state.y }}>
      {menuItems.map((item) => (
        <button
          key={item.id}
          className={`context-menu-item ${item.danger ? "danger" : ""}`}
          onClick={() => {
            onAction(item.id, state.video!);
            onClose();
          }}
        >
          <item.icon size={16} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
