import { useState, useEffect, useRef, useCallback, type MouseEvent } from "react";
import { IconSearch, IconSearchOff, IconCircleXFilled, IconFolderOpenFilled } from "@tabler/icons-react";
import "./App.css";
import type { Video } from "./types";
import { buildStreamUrl } from "./utils";
import { useSpriteProgress, type SpriteProgressJob } from "./hooks/useSpriteProgress";
import { useVideoLibraryData } from "./hooks/useVideoLibraryData";
import { useContextMenuState } from "./hooks/useContextMenuState";
import { useActionModal } from "./hooks/useActionModal";
import { useVideoActions } from "./hooks/useVideoActions";
import { toast } from "sonner";
import ContextMenu from "./components/video-library/ContextMenu";
import VirtualizedVideoGrid from "./components/video-library/VirtualizedVideoGrid";
import VideoPlayerModal from "./components/video-library/VideoPlayerModal";
import StreamModal from "./components/video-library/StreamModal";
import VideoActionModal from "./components/video-library/VideoActionModal";
import ProcessesModal from "./components/video-library/ProcessesModal";
import ThumbnailBrowserModal from "./components/video-library/ThumbnailBrowserModal";
import FileManager from "./components/file-manager/FileManager";
import DownloadsPage from "./components/downloads/DownloadsPage";

function App() {
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [processesModalOpen, setProcessesModalOpen] = useState(false);
  const [streamOpen, setStreamOpen] = useState(false);
  const [streamVisible, setStreamVisible] = useState(false);
  const streamCloseTimerRef = useRef<number | null>(null);
  const [thumbBrowserOpen, setThumbBrowserOpen] = useState(false);
  const [thumbBrowserClosing, setThumbBrowserClosing] = useState(false);
  const [fileManagerOpen, setFileManagerOpen] = useState(() => window.location.pathname === "/files");
  const [downloadsOpen, setDownloadsOpen] = useState(() => window.location.pathname === "/downloads");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [watchProgress, setWatchProgress] = useState<Record<string, { currentTime: number; duration: number }>>({});
  const closeTimerRef = useRef<number | null>(null);
  const libraryVersionRef = useRef<number | null>(null);
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
    addPlaceholderImages,
    removePlaceholderImage,
  } = useVideoLibraryData({
    onThumbnailSaveError: (message) => toast.error(message),
    searchQuery: debouncedSearch,
  });
  const {
    actionModal,
    actionModalClosing,
    actionVideo,
    renameValue,
    setRenameValue,
    videoProps,
    actionLoading,
    setActionLoading,
    hasVideoDetails,
    hasAudioDetails,
    openActionModal,
    closeActionModal,
    finalizeCloseActionModal,
  } = useActionModal();
  const { confirmRename, confirmDelete, generateSprites, handleRenameKeyDown } = useVideoActions({
    actionVideo,
    renameValue,
    setVideos,
    setSelectedVideo,
    setThumbnailOverrides,
    setActionLoading,
    closeActionModal,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    document.title = downloadsOpen ? "Downloads" : fileManagerOpen ? "Files" : "Video Library";
    const targetPath = downloadsOpen ? "/downloads" : fileManagerOpen ? "/files" : "/";
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ fileManager: fileManagerOpen, downloads: downloadsOpen }, "", targetPath);
    }
  }, [fileManagerOpen, downloadsOpen]);

  useEffect(() => {
    const onPopState = () => {
      setFileManagerOpen(window.location.pathname === "/files");
      setDownloadsOpen(window.location.pathname === "/downloads");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  const handleSpriteJobSettled = useCallback((job: SpriteProgressJob) => {
    if (job.status === "error") {
      toast.error(job.error || "Sprite generation failed");
    } else if (job.status === "done") {
      toast.success(`Sprites ready: ${job.title}`);
      setVideos((prev) =>
        prev.map((videoItem) =>
          videoItem.id === job.videoId ? { ...videoItem, hasSprites: true } : videoItem
        )
      );
      setSelectedVideo((prev) =>
        prev && prev.id === job.videoId ? { ...prev, hasSprites: true } : prev
      );
    }
  }, []);

  const { activeSpriteJobs, refresh: refreshSpriteProgress } = useSpriteProgress(handleSpriteJobSettled);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;

    const checkLibraryVersion = async () => {
      if (!active || fileManagerOpen || downloadsOpen) return;
      try {
        const res = await fetch("/api/videos/version");
        if (!res.ok) return;
        const data = await res.json();
        if (!Number.isFinite(data?.version)) return;

        const nextVersion = Number(data.version);
        if (libraryVersionRef.current === null) {
          libraryVersionRef.current = nextVersion;
          return;
        }

        if (libraryVersionRef.current !== nextVersion) {
          libraryVersionRef.current = nextVersion;
          await fetchVideos();
          fetchWatchProgress();
        }
      } catch {
        // Ignore transient polling errors.
      }
    };

    void checkLibraryVersion();
    timer = window.setInterval(checkLibraryVersion, 7000);
    window.addEventListener("focus", checkLibraryVersion);
    document.addEventListener("visibilitychange", checkLibraryVersion);

    return () => {
      active = false;
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener("focus", checkLibraryVersion);
      document.removeEventListener("visibilitychange", checkLibraryVersion);
    };
  }, [downloadsOpen, fetchVideos, fetchWatchProgress, fileManagerOpen]);

  useEffect(() => {
    if (processesModalOpen && activeSpriteJobs.length === 0) {
      setProcessesModalOpen(false);
    }
  }, [activeSpriteJobs.length, processesModalOpen]);

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

  const openStream = useCallback(() => {
    if (streamCloseTimerRef.current !== null) {
      window.clearTimeout(streamCloseTimerRef.current);
      streamCloseTimerRef.current = null;
    }
    setStreamOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setStreamVisible(true));
    });
  }, []);

  const closeStream = useCallback(() => {
    setStreamVisible(false);
    if (streamCloseTimerRef.current !== null) {
      window.clearTimeout(streamCloseTimerRef.current);
    }
    streamCloseTimerRef.current = window.setTimeout(() => {
      setStreamOpen(false);
      streamCloseTimerRef.current = null;
    }, 300);
  }, []);

  const handleContextAction = (action: string, video: Video) => {
    switch (action) {
      case "play":
        openModal(video);
        break;
      case "download":
        window.open(buildStreamUrl(video.id, { download: true, shareToken: video.shareToken }), "_blank");
        break;
      case "copy-link":
        navigator.clipboard.writeText(buildStreamUrl(video.id, { shareToken: video.shareToken, absolute: true }))
          .then(() => toast.success("Video link copied"))
          .catch(() => toast.error("Failed to copy video link"));
        break;
      case "rename":
        openActionModal("rename", video);
        break;
      case "info":
        openActionModal("properties", video);
        break;
      case "sprites":
        generateSprites(video).then(refreshSpriteProgress);
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
  const hasOpenModal = !!selectedVideo || !!actionModal || processesModalOpen || thumbBrowserOpen || streamOpen;

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
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (streamCloseTimerRef.current !== null) {
        window.clearTimeout(streamCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (thumbBrowserOpen) {
          setThumbBrowserClosing(true);
        } else if (streamOpen) {
          closeStream();
        } else if (processesModalOpen) {
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
  }, [selectedVideo, closeModal, actionModal, processesModalOpen, thumbBrowserOpen, streamOpen, closeStream, hasOpenModal]);

  if (downloadsOpen) {
    return <DownloadsPage onBack={() => setDownloadsOpen(false)} />;
  }

  if (fileManagerOpen) {
    return <FileManager onBack={() => setFileManagerOpen(false)} />;
  }

  const openDownloads = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    setDownloadsOpen(true);
  };

  const openFiles = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    setFileManagerOpen(true);
  };

  return (
    <div className={`app${hasOpenModal ? " modal-open" : ""}`}>
      <nav className="nav">
        <div className="container nav-content">
          <a className="nav-logo" href="/cf">
            VIDEO<span>LIB</span>
          </a>

          <div className="nav-search-wrapper">
            <IconSearch size={20} className={`nav-search-icon${isSearchPending ? " searching" : ""}`} stroke={2.5} />
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
                <IconCircleXFilled size={18} />
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
            <button className="nav-btn" onClick={openStream}>Stream</button>
            <button className="nav-btn" onClick={() => setThumbBrowserOpen(true)}>Thumbnails</button>
            <a href="/downloads" className="nav-btn nav-btn-terminal" onClick={openDownloads}>Downloads</a>
            <a href="/files" className="nav-btn nav-btn-terminal" onClick={openFiles}>Files</a>
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
                <IconFolderOpenFilled className="empty-icon" aria-hidden="true" />
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

      <StreamModal
        open={streamOpen}
        visible={streamVisible}
        onClose={closeStream}
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
          toast.success("Thumbnail updated");
          closeActionModal();
        }}
        onPlaceholderImagesAdded={addPlaceholderImages}
        onPlaceholderImageDeleted={removePlaceholderImage}
      />

      <ProcessesModal
        open={processesModalOpen}
        jobs={activeSpriteJobs}
        onClose={() => setProcessesModalOpen(false)}
      />

      <ThumbnailBrowserModal
        open={thumbBrowserOpen}
        closing={thumbBrowserClosing}
        placeholderImages={placeholderImages}
        placeholdersLoading={placeholdersLoading}
        onClose={() => setThumbBrowserClosing(true)}
        onClosed={() => {
          setThumbBrowserOpen(false);
          setThumbBrowserClosing(false);
        }}
        onPlaceholderImagesAdded={addPlaceholderImages}
        onPlaceholderImageDeleted={removePlaceholderImage}
      />
    </div>
  );
}

export default App;
