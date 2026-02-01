import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search, Play, Download, Trash2, Edit3, Copy, Info } from "lucide-react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import "./App.css";
import type { Video } from "./types";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  video: Video | null;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onAction: (action: string, video: Video) => void;
}

function ContextMenu({ state, onClose, onAction }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state.visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleScroll = () => onClose();
    const handleKeyDown = (e: KeyboardEvent) => {
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
    { id: "delete", label: "Delete", icon: Trash2, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: state.x, top: state.y }}
    >
      {menuItems.map((item) =>
        item.divider ? (
          <div key={item.id} className="context-menu-divider" />
        ) : (
          <button
            key={item.id}
            className={`context-menu-item ${item.danger ? "danger" : ""}`}
            onClick={() => {
              onAction(item.id, state.video!);
              onClose();
            }}
          >
            {item.icon && <item.icon size={16} />}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
}

interface VideoCardProps {
  video: Video;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent, video: Video) => void;
}

function VideoCard({ video, onClick, onContextMenu }: VideoCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, video);
  };

  return (
    <div ref={cardRef} className="video-card" onClick={onClick} onContextMenu={handleContextMenu}>
      <div className="video-thumbnail">
        {isVisible ? (
          video.thumbnail ? (
            <img src={video.thumbnail} alt={video.title} loading="lazy" />
          ) : (
            <div className="video-placeholder"></div>
          )
        ) : (
          <div className="video-placeholder skeleton"></div>
        )}
        {video.duration && <div className="video-duration">{video.duration}</div>}
      </div>
      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <p className="video-meta">{video.size || "Unknown size"}</p>
      </div>
    </div>
  );
}

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    video: null,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);

  const openContextMenu = (e: React.MouseEvent, video: Video) => {
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      video,
    });
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleContextAction = useCallback((action: string, video: Video) => {
    switch (action) {
      case "play":
        openModal(video);
        break;
      case "download":
        window.open(`/api/stream/${video.id}?download=1`, "_blank");
        break;
      case "copy-link":
        navigator.clipboard.writeText(`${window.location.origin}/api/stream/${video.id}`);
        break;
      case "rename":
      case "info":
      case "delete":
        console.log(`Action: ${action}`, video);
        break;
    }
  }, []);

  const openModal = (video: Video) => {
    setSelectedVideo(video);
    setTimeout(() => setModalVisible(true), 10);
  };

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      setSelectedVideo(null);
    }, 300);
  }, []);

  // ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedVideo) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVideo, closeModal]);

  useEffect(() => {
    if (selectedVideo && videoRef.current && !playerRef.current) {
      playerRef.current = new Plyr(videoRef.current, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
        keyboard: { focused: true, global: true },
      });
    }
  }, [selectedVideo]);

  useEffect(() => {
    fetch("/api/videos")
      .then((r) => r.json())
      .then((data) => {
        setVideos(data.videos || []);
        setLoading(false);
      })
      .catch(() => {
        setVideos([]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="app">
      <nav className="nav">
        <div className="container nav-content">
          <div className="nav-logo">
            VIDEO<span>LIB</span>
          </div>

          <div className="nav-search-wrapper">
            <Search size={18} className="nav-search-icon" />
            <input
              type="text"
              className="nav-search"
              placeholder="Search videos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="nav-right">
            <Link to="/manager" className="nav-btn">Manager</Link>
            <a href="/terminal" target="_blank" rel="noopener noreferrer" className="nav-btn">Terminal</a>
            <button className="nav-btn">Upload</button>
          </div>
        </div>
      </nav>

      <main className="main">
        <div className="container">
          {loading ? (
            <div className="video-grid">
              {[...Array(18)].map((_, i) => (
                <div key={i} className="skeleton-card" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📁</div>
              <h2>No videos yet</h2>
              <p>Upload or download videos to get started</p>
            </div>
          ) : (
            <div className="video-grid">
              {videos
                .filter((v) => v.title.toLowerCase().includes(search.toLowerCase()))
                .map((video) => (
                <VideoCard key={video.id} video={video} onClick={() => openModal(video)} onContextMenu={openContextMenu} />
              ))}
            </div>
          )}
        </div>
      </main>

      <ContextMenu state={contextMenu} onClose={closeContextMenu} onAction={handleContextAction} />

      {selectedVideo && (
        <div className={`modal-overlay ${modalVisible ? 'visible' : ''}`} onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">{selectedVideo.title}</div>
            <div className="modal-player">
              <video ref={videoRef} playsInline>
                <source src={`/api/stream/${selectedVideo.id}`} type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
