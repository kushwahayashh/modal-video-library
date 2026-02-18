import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { FolderOpen, Search, SearchX } from "lucide-react";
import Plyr from "plyr";
import "plyr/dist/plyr.css";
import "./App.css";
import type { Video } from "./types";
import { useSpriteProgress, type SpriteProgressJob } from "./hooks/useSpriteProgress";
import { useVideoLibraryData } from "./hooks/useVideoLibraryData";
import { useContextMenuState } from "./hooks/useContextMenuState";
import { useToast } from "./components/ToastProvider";
import ContextMenu from "./components/video-library/ContextMenu";
import VirtualizedVideoGrid from "./components/video-library/VirtualizedVideoGrid";
import VideoPlayerModal from "./components/video-library/VideoPlayerModal";
import VideoActionModal from "./components/video-library/VideoActionModal";
import ProcessesModal from "./components/video-library/ProcessesModal";
import type { ActionModalType, VideoProperties } from "./components/video-library/types";

function App() {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionModal, setActionModal] = useState<ActionModalType>(null);
  const [actionModalClosing, setActionModalClosing] = useState(false);
  const [actionVideo, setActionVideo] = useState<Video | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [videoProps, setVideoProps] = useState<VideoProperties | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [processesModalOpen, setProcessesModalOpen] = useState(false);
  const { pushToast: pushToastRaw } = useToast();
  const pushToast = useCallback((message: string, variant: "error" | "success" = "error") => {
    pushToastRaw({ variant, message });
  }, [pushToastRaw]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const playerVideoIdRef = useRef<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenuState();
  const {
    videos,
    setVideos,
    loading,
    loadingMore,
    hasMore,
    videosError,
    placeholderImages,
    placeholdersLoading,
    thumbnailOverrides,
    setThumbnailOverrides,
    fetchVideos,
    loadMoreVideos,
    updateThumbnailOverride,
  } = useVideoLibraryData({
    onThumbnailSaveError: (message) => pushToast(message),
    searchQuery: debouncedSearch,
  });
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search]);

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

  const hasActiveSearch = debouncedSearch.length > 0;
  const isSearchPending = search.trim() !== debouncedSearch;

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

  return (
    <div className="app">
      <nav className="nav">
        <div className="container nav-content">
          <a className="nav-logo" href="/cf">
            VIDEO<span>LIB</span>
          </a>

          <div className="nav-search-wrapper">
            <Search size={18} className={`nav-search-icon${isSearchPending ? " searching" : ""}`} />
            <input
              type="text"
              className="nav-search"
              placeholder="Search videos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="nav-right">
            {activeSpriteJobs.length > 0 && (
              <button className="nav-btn nav-process-btn" onClick={() => setProcessesModalOpen(true)}>
                Processes
                <span className="nav-process-count">{activeSpriteJobs.length}</span>
              </button>
            )}
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
          ) : hasActiveSearch && videos.length === 0 ? (
            <div className="empty">
              <SearchX className="empty-icon" aria-hidden="true" />
              <h2>No results</h2>
              <p>No videos match your search</p>
            </div>
          ) : videos.length === 0 ? (
            <div className="empty">
              <FolderOpen className="empty-icon" aria-hidden="true" />
              <h2>No videos yet</h2>
              <p>Upload or download videos to get started</p>
            </div>
          ) : (
            <>
              <VirtualizedVideoGrid
                videos={videos}
                onVideoClick={openModal}
                onVideoContextMenu={openContextMenu}
                placeholderImages={placeholderImages}
                thumbnailOverrides={thumbnailOverrides}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => {
                  void loadMoreVideos();
                }}
              />
              {loadingMore && (
                <div className="video-grid-load-more">Loading more videos...</div>
              )}
            </>
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
