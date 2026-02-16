import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Search } from "lucide-react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import "./App.css";
import type { Video } from "./types";
import { useSpriteProgress, type SpriteProgressJob } from "./hooks/useSpriteProgress";
import { useToast } from "./components/ToastProvider";
import ContextMenu from "./components/video-library/ContextMenu";
import VideoCard from "./components/video-library/VideoCard";
import VideoPlayerModal from "./components/video-library/VideoPlayerModal";
import VideoActionModal from "./components/video-library/VideoActionModal";
import ProcessesModal from "./components/video-library/ProcessesModal";
import { saveThumbnailToServer } from "./components/video-library/helpers";
import type { ActionModalType, ContextMenuState, VideoProperties } from "./components/video-library/types";

const CONTEXT_MENU_REOPEN_DELAY_MS = 145;
const CONTEXT_MENU_RECENT_CLOSE_WINDOW_MS = 220;
const CONTEXT_MENU_VIEWPORT_MARGIN = 8;
const CONTEXT_MENU_ESTIMATED_WIDTH = 240;
const CONTEXT_MENU_ESTIMATED_HEIGHT = 340;

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [placeholderImages, setPlaceholderImages] = useState<string[]>([]);
  const [placeholdersLoading, setPlaceholdersLoading] = useState(true);
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<string, string>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    video: null,
  });
  const [actionModal, setActionModal] = useState<ActionModalType>(null);
  const [actionModalClosing, setActionModalClosing] = useState(false);
  const [actionVideo, setActionVideo] = useState<Video | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [videoProps, setVideoProps] = useState<VideoProperties | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [processesModalOpen, setProcessesModalOpen] = useState(false);
  const { pushToast: pushToastRaw } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const playerVideoIdRef = useRef<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const contextMenuReopenTimerRef = useRef<number | null>(null);
  const lastContextMenuCloseAtRef = useRef(0);
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

  const pushToast = useCallback((message: string, variant: "error" | "success" = "error") => {
    pushToastRaw({ variant, message });
  }, [pushToastRaw]);

  const getApiErrorMessage = useCallback((payload: unknown, fallback: string) => {
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string" &&
      (payload as { error: string }).error.trim()
    ) {
      return (payload as { error: string }).error.trim();
    }
    return fallback;
  }, []);

  const updateThumbnailOverride = useCallback(async (videoId: string, imageUrl: string) => {
    setThumbnailOverrides((prev) => ({ ...prev, [videoId]: imageUrl }));
    try {
      await saveThumbnailToServer(videoId, imageUrl);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to save thumbnail");
    }
  }, [pushToast]);

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
    }).finally(() => {
      if (active) setPlaceholdersLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const fetchVideos = useCallback(async () => {
    try {
      const res = await fetch("/api/videos");
      if (!res.ok) {
        throw new Error(`Failed to load videos (${res.status})`);
      }

      const payload: unknown = await res.json();
      const nextVideos =
        payload &&
        typeof payload === "object" &&
        "videos" in payload &&
        Array.isArray((payload as { videos?: unknown }).videos)
          ? ((payload as { videos: Video[] }).videos)
          : null;

      if (!nextVideos) {
        throw new Error("Invalid videos response");
      }

      setVideos(nextVideos);
      setVideosError(null);
    } catch (e) {
      setVideosError(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, []);

  const getSafeContextMenuPosition = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - CONTEXT_MENU_ESTIMATED_WIDTH - CONTEXT_MENU_VIEWPORT_MARGIN;
    const maxY = window.innerHeight - CONTEXT_MENU_ESTIMATED_HEIGHT - CONTEXT_MENU_VIEWPORT_MARGIN;
    return {
      x: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(x, maxX)),
      y: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(y, maxY)),
    };
  }, []);

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

  const openContextMenu = useCallback((e: ReactMouseEvent, video: Video) => {
    e.preventDefault();
    const now = Date.now();
    const recentlyClosed = now - lastContextMenuCloseAtRef.current < CONTEXT_MENU_RECENT_CLOSE_WINDOW_MS;

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
  }, [contextMenu.visible, closeContextMenu, getSafeContextMenuPosition]);

  useEffect(() => {
    return () => {
      if (contextMenuReopenTimerRef.current !== null) {
        window.clearTimeout(contextMenuReopenTimerRef.current);
      }
    };
  }, []);

  const openActionModal = (type: ActionModalType, video: Video) => {
    setActionModalClosing(false);
    setActionVideo(video);
    setActionModal(type);
    if (type === "rename") {
      setRenameValue(video.title);
    } else if (type === "properties") {
      setVideoProps(null);
      fetch(`/api/videos/${video.id}`)
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load properties");
          return r.json();
        })
        .then((data) => setVideoProps(data))
        .catch(() => setVideoProps(video));
    }
  };

  const closeActionModal = () => {
    if (!actionModal) return;
    setActionModalClosing(true);
  };

  const finalizeCloseActionModal = useCallback(() => {
    setActionModalClosing(false);
    setActionModal(null);
    setActionVideo(null);
    setRenameValue("");
    setVideoProps(null);
    setActionLoading(false);
  }, []);

  const confirmRename = useCallback(async () => {
    if (!renameValue.trim() || !actionVideo) return;
    setActionLoading(true);
    try {
      const trimmedName = renameValue.trim();
      const res = await fetch(`/api/videos/${actionVideo.id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: trimmedName }),
      });
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to rename"));
      }
      let newVideoId = actionVideo.id;
      if (
        payload &&
        typeof payload === "object" &&
        "id" in payload &&
        typeof (payload as { id?: unknown }).id === "string" &&
        (payload as { id: string }).id.trim()
      ) {
        newVideoId = (payload as { id: string }).id.trim();
      }
      let newFilename = actionVideo.filename;
      if (
        payload &&
        typeof payload === "object" &&
        "filename" in payload &&
        typeof (payload as { filename?: unknown }).filename === "string" &&
        (payload as { filename: string }).filename.trim()
      ) {
        newFilename = (payload as { filename: string }).filename.trim();
      }
      if (newVideoId !== actionVideo.id) {
        setThumbnailOverrides((prev) => {
          const currentThumb = prev[actionVideo.id];
          if (!currentThumb) return prev;
          if (prev[newVideoId] === currentThumb) return prev;
          return { ...prev, [newVideoId]: currentThumb };
        });
      }
      setVideos((prev) =>
        prev.map((videoItem) => {
          if (videoItem.id !== actionVideo.id) return videoItem;
          return {
            ...videoItem,
            id: newVideoId,
            filename: newFilename,
            title: trimmedName,
          };
        })
      );
      setSelectedVideo((prev) => {
        if (!prev || prev.id !== actionVideo.id) return prev;
        return {
          ...prev,
          id: newVideoId,
          filename: newFilename,
          title: trimmedName,
        };
      });
      pushToast(`Renamed: ${actionVideo.title}`, "success");
      closeActionModal();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setActionLoading(false);
    }
  }, [renameValue, actionVideo, pushToast, getApiErrorMessage]);

  const confirmDelete = useCallback(async () => {
    if (!actionVideo) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/videos/${actionVideo.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setVideos((prev) => prev.filter((videoItem) => videoItem.id !== actionVideo.id));
      setThumbnailOverrides((prev) => {
        if (!(actionVideo.id in prev)) return prev;
        const next = { ...prev };
        delete next[actionVideo.id];
        return next;
      });
      pushToast(`Deleted: ${actionVideo.title}`, "success");
      closeActionModal();
    } catch {
      pushToast("Failed to delete video");
    } finally {
      setActionLoading(false);
    }
  }, [actionVideo, pushToast]);

  const handleRenameKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") confirmRename();
    if (e.key === "Escape") closeActionModal();
  };

  const generateSprites = useCallback(async (video: Video) => {
    try {
      const res = await fetch(`/api/videos/${video.id}/sprites`, { method: "POST" });
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to generate sprites"));
      }
      pushToast(`Sprite generation started: ${video.title}`, "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to generate sprites");
    }
  }, [pushToast, getApiErrorMessage]);

  const handleSpriteJobSettled = useCallback((job: SpriteProgressJob) => {
    if (job.status === "error") {
      pushToast(job.error || "Sprite generation failed");
    } else if (job.status === "done") {
      pushToast(`Sprites ready: ${job.title}`, "success");
      setVideos((prev) =>
        prev.map((videoItem) =>
          videoItem.id === job.videoId ? { ...videoItem, hasSprites: true } : videoItem
        )
      );
      setSelectedVideo((prev) =>
        prev && prev.id === job.videoId ? { ...prev, hasSprites: true } : prev
      );
    }
  }, [pushToast]);

  const activeSpriteJobs = useSpriteProgress(handleSpriteJobSettled);

  const openModal = (video: Video) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSelectedVideo(video);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setModalVisible(true));
    });
  };

  const closeModal = useCallback(() => {
    setModalVisible(false);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      playerVideoIdRef.current = null;
      setSelectedVideo(null);
      closeTimerRef.current = null;
    }, 300);
  }, []);

  const handleContextAction = (action: string, video: Video) => {
    switch (action) {
      case "play":
        openModal(video);
        break;
      case "download":
        window.open(`/api/stream/${video.id}?download=1`, "_blank");
        break;
      case "copy-link":
        navigator.clipboard.writeText(`${window.location.origin}/api/stream/${video.id}`)
          .then(() => pushToast("Video link copied", "success"))
          .catch(() => pushToast("Failed to copy video link"));
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
        openActionModal("thumbnail", video);
        break;
      case "delete":
        openActionModal("delete", video);
        break;
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredVideos = useMemo(
    () =>
      videos
        .filter((v) => v.title.toLowerCase().includes(normalizedSearch))
        .sort(
          (a, b) =>
            new Date(b.addedAt || b.createdAt).getTime() - new Date(a.addedAt || a.createdAt).getTime()
        ),
    [videos, normalizedSearch]
  );

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (processesModalOpen) {
          setProcessesModalOpen(false);
        } else if (actionModal) {
          closeActionModal();
        } else if (selectedVideo) {
          closeModal();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVideo, closeModal, actionModal, processesModalOpen]);

  useEffect(() => {
    if (!selectedVideo || !videoRef.current) return;

    const videoEl = videoRef.current;
    const switchingVideo = playerVideoIdRef.current !== selectedVideo.id;

    if (playerRef.current && switchingVideo) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    Array.from(videoEl.querySelectorAll('track[kind="metadata"]')).forEach((track) => track.remove());

    if (selectedVideo.hasSprites) {
      const track = document.createElement("track");
      track.kind = "metadata";
      track.label = "thumbnails";
      track.src = `/api/sprites/${selectedVideo.id}/vtt`;
      track.default = true;
      videoEl.appendChild(track);
    }

    if (!playerRef.current) {
      playerRef.current = new Plyr(videoEl, {
        controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "fullscreen"],
        keyboard: { focused: true, global: true },
        previewThumbnails: selectedVideo.hasSprites ? {
          enabled: true,
          src: `/api/sprites/${selectedVideo.id}/vtt`,
        } : { enabled: false },
      });
    }

    playerVideoIdRef.current = selectedVideo.id;
  }, [selectedVideo]);

  useEffect(() => {
    if (!selectedVideo?.hasSprites) return;

    // Warm both VTT metadata and sprite image as soon as modal opens.
    fetch(`/api/sprites/${selectedVideo.id}/vtt`).catch(() => {});
    const preloader = new Image();
    preloader.src = `/api/sprites/${selectedVideo.id}/image`;

    return () => {
      preloader.src = "";
    };
  }, [selectedVideo]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return (
    <div className="app">
      <nav className="nav">
        <div className="container nav-content">
          <a className="nav-logo" href="/cf">
            VIDEO<span>LIB</span>
          </a>

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
            <button className="nav-btn nav-process-btn" onClick={() => setProcessesModalOpen(true)}>
              Processes
              {activeSpriteJobs.length > 0 && (
                <span className="nav-process-count">{activeSpriteJobs.length}</span>
              )}
            </button>
            <a href="/terminal" target="_blank" rel="noopener noreferrer" className="nav-btn">Terminal</a>
          </div>
        </div>
      </nav>

      <main className="main">
        <div className="container">
          {videosError && videos.length > 0 && (
            <div className="status-banner" role="status" aria-live="polite">
              <span className="status-banner-text">
                Couldn&apos;t refresh videos. Showing last loaded list.
              </span>
              <button type="button" className="status-banner-btn" onClick={() => void fetchVideos()}>
                Retry
              </button>
            </div>
          )}

          {loading ? (
            <div className="video-grid">
              {[...Array(18)].map((_, i) => (
                <div key={i} className="skeleton-card" />
              ))}
            </div>
          ) : videosError && videos.length === 0 ? (
            <div className="empty">
              <h2>Couldn&apos;t load videos</h2>
              <p>{videosError}</p>
              <button type="button" className="empty-retry-btn" onClick={() => void fetchVideos()}>
                Retry
              </button>
            </div>
          ) : videos.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📁</div>
              <h2>No videos yet</h2>
              <p>Upload or download videos to get started</p>
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🔍</div>
              <h2>No results</h2>
              <p>No videos match your search</p>
            </div>
          ) : (
            <div className="video-grid">
              {filteredVideos.map((video) => (
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

      <VideoPlayerModal
        selectedVideo={selectedVideo}
        modalVisible={modalVisible}
        videoRef={videoRef}
        onClose={closeModal}
      />

      <VideoActionModal
        actionModal={actionModal}
        closing={actionModalClosing}
        actionVideo={actionVideo}
        actionLoading={actionLoading}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onClose={closeActionModal}
        onClosed={finalizeCloseActionModal}
        onRenameKeyDown={handleRenameKeyDown}
        onConfirmRename={confirmRename}
        onConfirmDelete={confirmDelete}
        videoProps={videoProps}
        hasVideoDetails={hasVideoDetails}
        hasAudioDetails={hasAudioDetails}
        placeholderImages={placeholderImages}
        placeholdersLoading={placeholdersLoading}
        selectedThumbnail={actionVideo ? thumbnailOverrides[actionVideo.id] : undefined}
        onThumbnailSelect={(image) => {
          if (!actionVideo) return;
          void updateThumbnailOverride(actionVideo.id, image);
          pushToast("Thumbnail updated", "success");
          closeActionModal();
        }}
      />

      <ProcessesModal
        open={processesModalOpen}
        jobs={activeSpriteJobs}
        onClose={() => setProcessesModalOpen(false)}
      />
    </div>
  );
}

export default App;
