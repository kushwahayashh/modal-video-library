import { useState, useEffect, useRef, useCallback, useMemo, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
// @ts-expect-error plyr types export both default and namespace which confuses bundler resolution
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
import { saveThumbnailToServer } from "./components/video-library/helpers";
import type { ActionModalType, ContextMenuState, VideoProperties } from "./components/video-library/types";

function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
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
  const { pushToast: pushToastRaw, updateToast, removeToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Plyr | null>(null);
  const closeTimerRef = useRef<number | null>(null);
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

  const pushToast = useCallback((message: string, variant: "error" | "success" = "error") => {
    pushToastRaw({ variant, message });
  }, [pushToastRaw]);

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

  const fetchVideos = useCallback(() => {
    fetch("/api/videos")
      .then((r) => r.ok ? r.json() : { videos: [] })
      .then((data) => {
        setVideos(Array.isArray(data.videos) ? data.videos : []);
      })
      .catch(() => {
        setVideos([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const openContextMenu = (e: ReactMouseEvent, video: Video) => {
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
    setActionModalClosing(false);
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
      pushToast(e instanceof Error ? e.message : "Failed to rename");
    } finally {
      setActionLoading(false);
    }
  }, [renameValue, actionVideo, pushToast, fetchVideos]);

  const confirmDelete = useCallback(async () => {
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
      pushToast("Failed to delete video");
    } finally {
      setActionLoading(false);
    }
  }, [actionVideo, pushToast, fetchVideos]);

  const handleRenameKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") confirmRename();
    if (e.key === "Escape") closeActionModal();
  };

  const generateSprites = useCallback(async (video: Video) => {
    try {
      const res = await fetch(`/api/videos/${video.id}/sprites`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate sprites");
      }
      pushToast(`Sprite generation started: ${video.title}`, "success");
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Failed to generate sprites");
    }
  }, [pushToast]);

  const handleSpriteJobSettled = useCallback((job: SpriteProgressJob) => {
    if (job.status === "error") {
      pushToast(job.error || "Sprite generation failed");
    } else if (job.status === "done") {
      pushToast(`Sprites ready: ${job.title}`, "success");
    }
    fetchVideos();
  }, [fetchVideos, pushToast]);

  const activeSpriteJobs = useSpriteProgress(handleSpriteJobSettled);
  const spriteToastIds = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const currentVideoIds = new Set(activeSpriteJobs.map((j) => j.videoId));

    for (const [videoId, toastId] of spriteToastIds.current) {
      if (!currentVideoIds.has(videoId)) {
        spriteToastIds.current.delete(videoId);
        removeToast(toastId);
      }
    }

    for (const job of activeSpriteJobs) {
      const detail = job.status === "extracting"
        ? `Extracting frames: ${job.current}/${job.total}`
        : "Tiling sprite sheet...";
      const progress = job.status === "extracting" && job.total > 0
        ? Math.round((job.current / job.total) * 100)
        : null;

      const existingId = spriteToastIds.current.get(job.videoId);
      if (existingId != null) {
        updateToast(existingId, { detail, progress });
      } else {
        const id = pushToastRaw({
          variant: "status",
          title: job.title,
          detail,
          progress,
        });
        spriteToastIds.current.set(job.videoId, id);
      }
    }
  }, [activeSpriteJobs, pushToastRaw, updateToast, removeToast]);

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
    () => videos.filter((v) => v.title.toLowerCase().includes(normalizedSearch)),
    [videos, normalizedSearch]
  );

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (actionModal) {
          closeActionModal();
        } else if (selectedVideo) {
          closeModal();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedVideo, closeModal, actionModal]);

  useEffect(() => {
    if (selectedVideo && videoRef.current && !playerRef.current) {
      if (selectedVideo.hasSprites) {
        const existingTrack = videoRef.current.querySelector('track[kind="metadata"]');
        if (!existingTrack) {
          const track = document.createElement("track");
          track.kind = "metadata";
          track.label = "thumbnails";
          track.src = `/api/sprites/${selectedVideo.id}/vtt`;
          track.default = true;
          videoRef.current.appendChild(track);
        }
      }

      playerRef.current = new Plyr(videoRef.current, {
        controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "fullscreen"],
        keyboard: { focused: true, global: true },
        previewThumbnails: selectedVideo.hasSprites ? {
          enabled: true,
          src: `/api/sprites/${selectedVideo.id}/vtt`,
        } : { enabled: false },
      });
    }
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
          <a className="nav-logo" href="/">
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
          updateThumbnailOverride(actionVideo.id, image);
          closeActionModal();
        }}
      />
    </div>
  );
}

export default App;
