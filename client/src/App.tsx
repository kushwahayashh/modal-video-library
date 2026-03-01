import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { IconFolderOpen, IconSearch, IconSearchOff, IconX } from "@tabler/icons-react";
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [watchProgress, setWatchProgress] = useState<Record<string, { currentTime: number; duration: number }>>({});
  const { pushToast: pushToastRaw } = useToast();
  const pushToast = useCallback((message: string, variant: "error" | "success" = "error") => {
    pushToastRaw({ variant, message });
  }, [pushToastRaw]);
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

  const fetchWatchProgress = useCallback(() => {
    fetch("/api/watch-progress")
      .then((r) => r.ok ? r.json() : {})
      .then((data) => {
        if (data && typeof data === "object") setWatchProgress(data as Record<string, { currentTime: number; duration: number }>);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchWatchProgress();
  }, [fetchWatchProgress]);

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

  useEffect(() => {
    if (!selectedVideo?.hasSprites) return;

    fetch(`/api/sprites/${selectedVideo.id}/vtt`, { cache: "force-cache" }).catch(() => {});
    const preloader = new Image();
    preloader.src = `/api/sprites/${selectedVideo.id}/image`;

    return () => {
      preloader.src = "";
    };
  }, [selectedVideo]);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedVideo(null);
      closeTimerRef.current = null;
      fetchWatchProgress();
    }, 300);
  }, [fetchWatchProgress]);

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
  const hasOpenModal = (modalVisible && !!selectedVideo) || !!actionModal || processesModalOpen;

  useEffect(() => {
    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousScrollLockOffset = documentElement.style.getPropertyValue("--scroll-lock-offset");

    if (hasOpenModal) {
      const scrollbarWidth = Math.max(0, window.innerWidth - documentElement.clientWidth);
      body.style.paddingRight = scrollbarWidth > 0 ? `${scrollbarWidth}px` : previousBodyPaddingRight;
      documentElement.style.setProperty("--scroll-lock-offset", `${scrollbarWidth}px`);
      body.style.overflow = "hidden";
      documentElement.style.overflow = "hidden";
    } else {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      if (previousScrollLockOffset) {
        documentElement.style.setProperty("--scroll-lock-offset", previousScrollLockOffset);
      } else {
        documentElement.style.removeProperty("--scroll-lock-offset");
      }
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      if (previousScrollLockOffset) {
        documentElement.style.setProperty("--scroll-lock-offset", previousScrollLockOffset);
      } else {
        documentElement.style.removeProperty("--scroll-lock-offset");
      }
    };
  }, [hasOpenModal]);

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
      if (e.key === "/" && !hasOpenModal) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVideo, closeModal, actionModal, processesModalOpen, hasOpenModal]);

  return (
    <div className={`app${hasOpenModal ? " modal-open" : ""}`}>
      <nav className="nav">
        <div className="container nav-content">
          <a className="nav-logo" href="/cf">
            VIDEO<span>LIB</span>
          </a>

          <div className="nav-search-wrapper">
            <IconSearch size={18} className={`nav-search-icon${isSearchPending ? " searching" : ""}`} />
            <input
              ref={searchInputRef}
              type="text"
              className="nav-search"
              placeholder="Search videos…  /"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="nav-search-clear"
                onClick={() => { setSearch(""); searchInputRef.current?.focus(); }}
                aria-label="Clear search"
              >
                <IconX size={16} />
              </button>
            )}

          </div>

          <div className="nav-right">
            {activeSpriteJobs.length > 0 && (
              <button className="nav-btn nav-process-btn" onClick={() => setProcessesModalOpen(true)}>
                Processes
                <span className="nav-process-count">{activeSpriteJobs.length}</span>
              </button>
            )}
            <a href="/terminal" target="_blank" rel="noopener noreferrer" className="nav-btn nav-btn-terminal">Terminal</a>
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
              <IconSearchOff className="empty-icon" aria-hidden="true" />
              <h2>No results</h2>
              <p>No videos match your search</p>
            </div>
          ) : videos.length === 0 ? (
            <div className="empty">
              <IconFolderOpen className="empty-icon" aria-hidden="true" />
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
                watchProgress={watchProgress}
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
