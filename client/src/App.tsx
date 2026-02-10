import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search, Play, Download, Trash2, Edit3, Copy, Info, X, LayoutGrid, Check, Image } from "lucide-react";
// @ts-expect-error plyr types export both default and namespace which confuses bundler resolution
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import "./App.css";
import { formatBytes, formatDate } from "./utils";
import type { Video } from "./types";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  video: Video | null;
}

type ActionModalType = "rename" | "delete" | "properties" | "thumbnail" | null;

function getStablePlaceholder(videoId: string, placeholders: string[]): string | null {
  if (placeholders.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < videoId.length; i += 1) {
    hash = (hash * 31 + videoId.charCodeAt(i)) >>> 0;
  }
  return placeholders[hash % placeholders.length] || null;
}

function saveThumbnailToServer(videoId: string, imageUrl: string) {
  fetch("/api/thumbnail-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, imageUrl }),
  }).catch(() => {});
}

interface VideoProperties extends Video {
  modifiedAt?: string;
  resolution?: string;
  videoCodec?: string;
  videoBitrate?: string;
  framerate?: string;
  pixelFormat?: string;
  audioCodec?: string;
  audioBitrate?: string;
  audioChannels?: string;
  sampleRate?: string;
  container?: string;
  totalBitrate?: string;
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
    { id: "sprites", label: state.video?.hasSprites ? "Regenerate Sprites" : "Generate Sprites", icon: LayoutGrid },
    { id: "thumbnail", label: "Change Thumbnail", icon: Image },
    { id: "delete", label: "Delete", icon: Trash2, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: state.x, top: state.y }}
    >
      {menuItems.map((item) => (
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
      ))}
    </div>
  );
}

interface VideoCardProps {
  video: Video;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent, video: Video) => void;
  placeholderImages: string[];
  thumbnailOverrides: Record<string, string>;
}

function VideoCard({ video, onClick, onContextMenu, placeholderImages, thumbnailOverrides }: VideoCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const prevSrcRef = useRef<string | null>(null);

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

  const fallbackPlaceholder = getStablePlaceholder(video.id, placeholderImages);
  const imgSrc = video.thumbnail || thumbnailOverrides[video.id] || fallbackPlaceholder;

  if (imgSrc !== prevSrcRef.current) {
    prevSrcRef.current = imgSrc;
    if (imageLoaded) setImageLoaded(false);
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, video);
  };

  return (
    <div ref={cardRef} className="video-card" onClick={onClick} onContextMenu={handleContextMenu}>
      <div className="video-thumbnail">
        <div className="video-placeholder skeleton"></div>
        {isVisible && imgSrc && (
          <img
            src={imgSrc}
            alt=""
            loading="lazy"
            className={`video-thumb-img ${imageLoaded ? "loaded" : ""}`}
            onLoad={() => setImageLoaded(true)}
          />
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
  const [placeholderImages, setPlaceholderImages] = useState<string[]>([]);
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    video: null,
  });
  const [actionModal, setActionModal] = useState<ActionModalType>(null);
  const [actionVideo, setActionVideo] = useState<Video | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [videoProps, setVideoProps] = useState<VideoProperties | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [spriteProgress, setSpriteProgress] = useState<{
    videoId: string;
    title: string;
    status: string;
    current: number;
    total: number;
    error: string | null;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const hasVideoDetails = !!(
    videoProps?.resolution ||
    videoProps?.videoCodec ||
    videoProps?.videoBitrate ||
    videoProps?.framerate ||
    videoProps?.pixelFormat
  );
  const hasAudioDetails = !!(
    videoProps?.audioCodec ||
    videoProps?.audioBitrate ||
    videoProps?.audioChannels ||
    videoProps?.sampleRate
  );

  const updateThumbnailOverride = useCallback((videoId: string, imageUrl: string) => {
    setThumbnailOverrides((prev) => ({ ...prev, [videoId]: imageUrl }));
    saveThumbnailToServer(videoId, imageUrl);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/placeholder-images").then((r) => r.ok ? r.json() : { images: [] }),
      fetch("/api/thumbnail-map").then((r) => r.ok ? r.json() : {}),
    ]).then(([imgData, mapData]) => {
      if (!active) return;
      if (Array.isArray(imgData?.images)) setPlaceholderImages(imgData.images);
      if (mapData && typeof mapData === "object" && !Array.isArray(mapData)) {
        setThumbnailOverrides(mapData as Record<string, string>);
      }
    }).catch(() => {
      if (active) setPlaceholderImages([]);
    });
    return () => { active = false; };
  }, []);

  const fetchVideos = useCallback(() => {
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

  const openActionModal = (type: ActionModalType, video: Video) => {
    setActionVideo(video);
    setActionModal(type);
    if (type === "rename") {
      setRenameValue(video.title);
    } else if (type === "properties") {
      setVideoProps(null);
      fetch(`/api/videos/${video.id}`)
        .then((r) => r.json())
        .then((data) => setVideoProps(data))
        .catch(() => setVideoProps(video));
    }
  };

  const closeActionModal = () => {
    setActionModal(null);
    setActionVideo(null);
    setRenameValue("");
    setVideoProps(null);
    setActionLoading(false);
  };

  const confirmRename = async () => {
    if (!renameValue.trim() || !actionVideo) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/videos/${actionVideo.id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: renameValue.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to rename");
      }
      closeActionModal();
      fetchVideos();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!actionVideo) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/videos/${actionVideo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      closeActionModal();
      fetchVideos();
    } catch {
      alert("Failed to delete video");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") confirmRename();
    if (e.key === "Escape") closeActionModal();
  };

  const generateSprites = async (video: Video) => {
    try {
      const res = await fetch(`/api/videos/${video.id}/sprites`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate sprites");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to generate sprites");
    }
  };

  useEffect(() => {
    const pollProgress = async () => {
      try {
        const res = await fetch("/api/sprites/progress");
        if (!res.ok) return;
        const data = await res.json();
        const active = data.jobs.find(
          (j: { status: string }) => j.status === "extracting" || j.status === "tiling"
        );
        if (active) {
          setSpriteProgress(active);
        } else {
          if (spriteProgress) {
            const finished = data.jobs.find(
              (j: { status: string }) => j.status === "done" || j.status === "error"
            );
            if (finished?.status === "error") {
              alert(finished.error || "Sprite generation failed");
            }
            fetchVideos();
          }
          setSpriteProgress(null);
        }
      } catch {}
    };

    pollProgress();
    const interval = setInterval(pollProgress, 1000);
    return () => clearInterval(interval);
  }, [spriteProgress, fetchVideos]);

  const handleContextAction = (action: string, video: Video) => {
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
        openActionModal("rename", video);
        break;
      case "info":
        openActionModal("properties", video);
        break;
      case "sprites":
        generateSprites(video);
        break;
      case "thumbnail":
        setActionVideo(video);
        setActionModal("thumbnail");
        break;
      case "delete":
        openActionModal("delete", video);
        break;
    }
  };

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
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && selectedVideo) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVideo, closeModal]);

  useEffect(() => {
    if (selectedVideo && videoRef.current && !playerRef.current) {
      if (selectedVideo.hasSprites) {
        const existingTrack = videoRef.current.querySelector('track[kind="metadata"]');
        if (!existingTrack) {
          const track = document.createElement('track');
          track.kind = 'metadata';
          track.label = 'thumbnails';
          track.src = `/api/sprites/${selectedVideo.id}/vtt`;
          track.default = true;
          videoRef.current.appendChild(track);
        }
      }

      playerRef.current = new Plyr(videoRef.current, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
        keyboard: { focused: true, global: true },
        previewThumbnails: selectedVideo.hasSprites ? {
          enabled: true,
          src: `/api/sprites/${selectedVideo.id}/vtt`,
        } : { enabled: false },
      });
    }
  }, [selectedVideo]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

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
                <VideoCard
                  key={video.id}
                  video={video}
                  onClick={() => openModal(video)}
                  onContextMenu={openContextMenu}
                  placeholderImages={placeholderImages}
                  thumbnailOverrides={thumbnailOverrides}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <ContextMenu state={contextMenu} onClose={closeContextMenu} onAction={handleContextAction} />

      {spriteProgress && (
        <div className="sprite-toast">
          <div className="sprite-toast-title">{spriteProgress.title}</div>
          <div className="sprite-toast-detail">
            {spriteProgress.status === "extracting"
              ? `Extracting frames: ${spriteProgress.current}/${spriteProgress.total}`
              : "Tiling sprite sheet..."}
          </div>
          {spriteProgress.status === "extracting" && spriteProgress.total > 0 && (
            <div className="sprite-toast-bar">
              <div
                className="sprite-toast-bar-fill"
                style={{ width: `${Math.round((spriteProgress.current / spriteProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {selectedVideo && (
        <div className={`modal-overlay ${modalVisible ? 'visible' : ''}`} onClick={closeModal}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>{selectedVideo.title}</span>
              {selectedVideo.hasSprites && (
                <span className="sprite-badge">
                  <Check size={14} />
                  Sprite Available
                </span>
              )}
            </div>
            <div className="modal-player">
              <video ref={videoRef} playsInline>
                <source src={`/api/stream/${selectedVideo.id}`} type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      )}

      {actionModal && actionVideo && (
        <div className="action-modal-overlay" onClick={closeActionModal}>
          <div className={`action-modal ${actionModal === "thumbnail" ? "thumbnail-modal" : actionModal === "properties" ? "properties-modal" : ""}`} onClick={(e) => e.stopPropagation()}>
            <button className="action-modal-close" onClick={closeActionModal}>
              <X size={20} />
            </button>

            {actionModal === "rename" && (
              <>
                <div className="action-modal-title">Rename Video</div>
                <input
                  className="action-modal-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  autoFocus
                  placeholder="Enter new name"
                />
                <div className="action-modal-actions">
                  <button className="action-btn secondary" onClick={closeActionModal}>Cancel</button>
                  <button className="action-btn primary" onClick={confirmRename} disabled={actionLoading}>
                    {actionLoading ? "Renaming..." : "Rename"}
                  </button>
                </div>
              </>
            )}

            {actionModal === "delete" && (
              <>
                <div className="action-modal-title">Delete Video</div>
                <div className="action-modal-message">
                  Are you sure you want to delete <strong>"{actionVideo.title}"</strong>?
                  <br />
                  <span className="text-muted">This action cannot be undone.</span>
                </div>
                <div className="action-modal-actions">
                  <button className="action-btn secondary" onClick={closeActionModal}>Cancel</button>
                  <button className="action-btn danger" onClick={confirmDelete} disabled={actionLoading}>
                    {actionLoading ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </>
            )}

            {actionModal === "properties" && (
              <>
                <div className="prop-header">
                  <div className="prop-label">Properties</div>
                  <div className="prop-title">{actionVideo.title}</div>
                  <div className="prop-filename">{actionVideo.filename}</div>
                </div>
                <div className="prop-body">
                  {!videoProps ? (
                    <div className="prop-skeleton">
                      <div className="prop-summary-skel">
                        <div className="prop-skel-block" />
                        <div className="prop-skel-block" />
                        <div className="prop-skel-block" />
                        <div className="prop-skel-block" />
                      </div>
                      <div className="prop-section-skel-grid">
                        <div className="prop-section-skel" />
                        <div className="prop-section-skel" />
                      </div>
                      <div className="prop-meta-skel" />
                    </div>
                  ) : (
                    <div className="prop-content">
                      <div className="prop-summary">
                        <div className="prop-summary-item">
                          <span className="prop-summary-label">Size</span>
                          <span className="prop-summary-value">
                            {videoProps.sizeBytes ? formatBytes(videoProps.sizeBytes) : actionVideo.size || "—"}
                          </span>
                        </div>
                        <div className="prop-summary-item">
                          <span className="prop-summary-label">Duration</span>
                          <span className="prop-summary-value">{videoProps.duration || actionVideo.duration || "—"}</span>
                        </div>
                        <div className="prop-summary-item">
                          <span className="prop-summary-label">Container</span>
                          <span className="prop-summary-value">{videoProps.container || "—"}</span>
                        </div>
                        <div className="prop-summary-item">
                          <span className="prop-summary-label">Bitrate</span>
                          <span className="prop-summary-value">{videoProps.totalBitrate || "—"}</span>
                        </div>
                      </div>

                      {(hasVideoDetails || hasAudioDetails) ? (
                        <div className="prop-sections">
                          {hasVideoDetails && (
                            <div className="prop-section">
                              <div className="prop-section-title">Video</div>
                              <div className="prop-kv">
                                {videoProps.resolution && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Resolution</span>
                                    <span className="prop-kv-value">{videoProps.resolution}</span>
                                  </div>
                                )}
                                {videoProps.videoCodec && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Codec</span>
                                    <span className="prop-pill">{videoProps.videoCodec.toUpperCase()}</span>
                                  </div>
                                )}
                                {videoProps.framerate && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Framerate</span>
                                    <span className="prop-kv-value">{videoProps.framerate}</span>
                                  </div>
                                )}
                                {videoProps.videoBitrate && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Video bitrate</span>
                                    <span className="prop-kv-value">{videoProps.videoBitrate}</span>
                                  </div>
                                )}
                                {videoProps.pixelFormat && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Pixel format</span>
                                    <span className="prop-kv-value">{videoProps.pixelFormat}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          {hasAudioDetails && (
                            <div className="prop-section">
                              <div className="prop-section-title">Audio</div>
                              <div className="prop-kv">
                                {videoProps.audioCodec && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Codec</span>
                                    <span className="prop-pill">{videoProps.audioCodec.toUpperCase()}</span>
                                  </div>
                                )}
                                {videoProps.audioChannels && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Channels</span>
                                    <span className="prop-kv-value">{videoProps.audioChannels}</span>
                                  </div>
                                )}
                                {videoProps.sampleRate && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Sample rate</span>
                                    <span className="prop-kv-value">{videoProps.sampleRate}</span>
                                  </div>
                                )}
                                {videoProps.audioBitrate && (
                                  <div className="prop-kv-row">
                                    <span className="prop-kv-label">Audio bitrate</span>
                                    <span className="prop-kv-value">{videoProps.audioBitrate}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="prop-empty">No stream details available.</div>
                      )}

                      <div className="prop-meta">
                        <div className="prop-meta-row">
                          <span className="prop-meta-label">Created</span>
                          <span className="prop-meta-value">{formatDate(videoProps.createdAt || actionVideo.createdAt)}</span>
                        </div>
                        {videoProps.modifiedAt && (
                          <div className="prop-meta-row">
                            <span className="prop-meta-label">Modified</span>
                            <span className="prop-meta-value">{formatDate(videoProps.modifiedAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="action-modal-actions">
                  <button className="action-btn primary" onClick={closeActionModal}>Close</button>
                </div>
              </>
            )}

            {actionModal === "thumbnail" && (
              <>
                <div className="action-modal-title">Change Thumbnail</div>
                <div className="thumbnail-picker-grid">
                  {placeholderImages.map((img) => (
                    <button
                      key={img}
                      className={`thumbnail-picker-item ${thumbnailOverrides[actionVideo!.id] === img ? "active" : ""}`}
                      onClick={() => {
                        updateThumbnailOverride(actionVideo!.id, img);
                        closeActionModal();
                      }}
                    >
                      <img src={img} alt="" />
                    </button>
                  ))}
                </div>
                <div className="action-modal-actions">
                  <button className="action-btn secondary" onClick={closeActionModal}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
