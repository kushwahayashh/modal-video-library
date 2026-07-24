import "./CustomVideoPlayer.css";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { IconPlayerPlayFilled, IconPlayerPauseFilled, IconMaximize, IconMinimize, IconBrandSpeedtest, IconRewindBackward5, IconRewindForward5, IconVolume, IconVolume2, IconVolumeOff, IconSelectAll, IconX } from "@tabler/icons-react";
import { useVideoPlayer, type SpriteCue } from "../../hooks/useVideoPlayer";
import PlayerContextMenu, { type PlayerContextMenuState } from "./PlayerContextMenu";
import { formatBytes, buildStreamUrl } from "../../utils";
import type { VideoProperties } from "./types";
import type { Video } from "../../types";
import VideoActionModal from "./VideoActionModal";

interface CustomVideoPlayerProps {
  videoId?: string;
  hasSprites?: boolean;
  /** Signed token used to build shareable (password-free) copy/download links. */
  shareToken?: string;
  /** When set, play this URL directly instead of the library stream endpoint. */
  streamSrc?: string;
}

interface SpriteHover {
  time: number;
  x: number;
  cue: SpriteCue;
}

interface SpritePreview extends SpriteHover {
  visible: boolean;
}

interface ProgressPoint {
  time: number;
  x: number;
}

const SPRITE_HOVER_DELAY = 180;
const SPRITE_HIDE_DELAY = 120;
const SPRITE_SCALE = 0.92;
const SPRITE_MIN_EDGE = 28;
const CONTROL_ICON_SIZE = 26;
const FLASH_ICON_SIZE = 52;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = s.toString().padStart(2, "0");
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}

export default function CustomVideoPlayer({ videoId, hasSprites, shareToken, streamSrc }: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeTrackRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  // External streams have no library id, so the source comes from streamSrc.
  const sourceUrl = streamSrc ?? (videoId ? `/api/stream/${videoId}` : "");

  // Button refs for keyboard-shortcut press animations
  const btnPlayRef = useRef<HTMLButtonElement>(null);
  const btnSeekBackRef = useRef<HTMLButtonElement>(null);
  const btnSeekFwdRef = useRef<HTMLButtonElement>(null);
  const btnMuteRef = useRef<HTMLButtonElement>(null);
  const btnFullscreenRef = useRef<HTMLButtonElement>(null);

  const spriteVttUrl = hasSprites ? `/api/sprites/${videoId}/vtt` : undefined;
  const spriteImageUrl = hasSprites ? `/api/sprites/${videoId}/image` : undefined;

  const {
    playing,
    currentTime,
    duration,
    buffered,
    volume,
    muted,
    playbackRate,
    isFullscreen,
    showControls,
    containerRef,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
    getSpriteForTime,
    pauseControlsHide,
    resumeControlsHide,
    isRestoringProgress,
  } = useVideoPlayer({ videoRef, videoId, spriteVttUrl, spriteImageUrl });

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [fillToEdge, setFillToEdge] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [propertiesClosing, setPropertiesClosing] = useState(false);
  const [propertiesVideoMeta, setPropertiesVideoMeta] = useState<Video | null>(null);
  const [propertiesData, setPropertiesData] = useState<VideoProperties | null>(null);

  useEffect(() => {
    if (!showProperties) return;
    if (!videoId) return;
    setPropertiesData(null);
    let active = true;
    fetch(`/api/videos/${videoId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load properties");
        return r.json();
      })
      .then((data) => {
        if (active) {
          setPropertiesData(data);
          setPropertiesVideoMeta(data);
        }
      })
      .catch(() => {
        if (active) {
          const fallback: VideoProperties = {
            id: videoId,
            title: `Video (${videoId})`,
            filename: `stream_${videoId}.mp4`,
            size: "",
            duration: "",
            hasSprites: hasSprites || false,
          };
          setPropertiesData(fallback);
          setPropertiesVideoMeta(fallback);
        }
      });
    return () => {
      active = false;
    };
  }, [showProperties, videoId, hasSprites]);

  const closePropertiesModal = useCallback(() => {
    setPropertiesClosing(true);
  }, []);

  const finalizeClosePropertiesModal = useCallback(() => {
    setPropertiesClosing(false);
    setShowProperties(false);
    setPropertiesData(null);
    setPropertiesVideoMeta(null);
  }, []);

  const triggerPress = useCallback((btn: HTMLButtonElement) => {
    btn.classList.remove("vp-btn-pressing");
    void btn.offsetWidth; // force reflow to restart animation on rapid clicks
    btn.classList.add("vp-btn-pressing");
    const onEnd = () => {
      btn.classList.remove("vp-btn-pressing");
      btn.removeEventListener("animationend", onEnd);
    };
    btn.addEventListener("animationend", onEnd);
  }, []);

  const pressBtn = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    triggerPress(e.currentTarget);
  }, [triggerPress]);

  const pressBtnKey = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      triggerPress(e.currentTarget);
    }
  }, [triggerPress]);
  const [contextMenu, setContextMenu] = useState<PlayerContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const contextMenuJustClosedRef = useRef(false);
  const contextMenuCloseTimerRef = useRef<number | null>(null);
  const [spritePreview, setSpritePreview] = useState<SpritePreview | null>(null);
  const [spriteImageReady, setSpriteImageReady] = useState(false);
  const spriteHoverRef = useRef<SpriteHover | null>(null);
  const spriteTimerRef = useRef<number | null>(null);
  const spriteHideTimerRef = useRef<number | null>(null);
  const isScrubbingRef = useRef(false);
  const [scrubPercent, setScrubPercent] = useState<number | null>(null);
  const [playFlash, setPlayFlash] = useState<{ id: number; playing: boolean } | null>(null);
  const [seekFlash, setSeekFlash] = useState<{ id: number; dir: "back" | "fwd" } | null>(null);
  const flashCounterRef = useRef(0);

  const triggerSeekFlash = useCallback((dir: "back" | "fwd") => {
    const id = ++flashCounterRef.current;
    setSeekFlash({ id, dir });
    window.setTimeout(() => setSeekFlash((f) => f?.id === id ? null : f), 600);
  }, []);

  useEffect(() => {
    if (!showSpeedMenu) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [showSpeedMenu]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setFillToEdge((prev) => !prev);
      }
      // Seek buttons have no state to watch, so animate them from the keyboard handler
      if (e.key === "ArrowLeft") { triggerPress(btnSeekBackRef.current!); triggerSeekFlash("back"); }
      else if (e.key === "ArrowRight") { triggerPress(btnSeekFwdRef.current!); triggerSeekFlash("fwd"); }
    };
    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [containerRef, triggerPress, triggerSeekFlash]);

  // Animate play button whenever playing state changes (covers center-click, keyboard, button)
  const prevPlayingRef = useRef(playing);
  useEffect(() => {
    if (prevPlayingRef.current === playing) return;
    prevPlayingRef.current = playing;
    if (btnPlayRef.current) triggerPress(btnPlayRef.current);
    // Also flash the in-video overlay
    const id = ++flashCounterRef.current;
    setPlayFlash({ id, playing });
    const t = window.setTimeout(() => setPlayFlash((f) => f?.id === id ? null : f), 600);
    return () => window.clearTimeout(t);
  }, [playing, triggerPress]);

  // Animate mute button whenever muted state changes
  const prevMutedRef = useRef(muted);
  useEffect(() => {
    if (prevMutedRef.current === muted) return;
    prevMutedRef.current = muted;
    if (btnMuteRef.current) triggerPress(btnMuteRef.current);
  }, [muted, triggerPress]);

  // Animate fullscreen button whenever fullscreen state changes
  const prevFsRef = useRef(isFullscreen);
  useEffect(() => {
    if (prevFsRef.current === isFullscreen) return;
    prevFsRef.current = isFullscreen;
    if (btnFullscreenRef.current) triggerPress(btnFullscreenRef.current);
  }, [isFullscreen, triggerPress]);

  useEffect(() => {
    if (!spriteImageUrl) {
      setSpriteImageReady(false);
      return;
    }

    let cancelled = false;
    setSpriteImageReady(false);

    const image = new Image();
    image.onload = () => {
      if (!cancelled) setSpriteImageReady(true);
    };
    image.onerror = () => {
      if (!cancelled) setSpriteImageReady(false);
    };
    image.src = spriteImageUrl;

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [spriteImageUrl]);

  useEffect(() => {
    return () => {
      if (spriteTimerRef.current !== null) window.clearTimeout(spriteTimerRef.current);
      if (spriteHideTimerRef.current !== null) window.clearTimeout(spriteHideTimerRef.current);
      if (contextMenuCloseTimerRef.current !== null) window.clearTimeout(contextMenuCloseTimerRef.current);
    };
  }, []);

  const clearSpriteShowTimer = useCallback(() => {
    if (spriteTimerRef.current !== null) {
      window.clearTimeout(spriteTimerRef.current);
      spriteTimerRef.current = null;
    }
  }, []);

  const hideSpritePreview = useCallback((removeImmediately = false) => {
    clearSpriteShowTimer();
    if (spriteHideTimerRef.current !== null) {
      window.clearTimeout(spriteHideTimerRef.current);
      spriteHideTimerRef.current = null;
    }
    setSpritePreview((prev) => (prev ? { ...prev, visible: false } : null));
    if (removeImmediately) {
      setSpritePreview(null);
      return;
    }
    spriteHideTimerRef.current = window.setTimeout(() => {
      spriteHideTimerRef.current = null;
      setSpritePreview(null);
    }, SPRITE_HIDE_DELAY);
  }, [clearSpriteShowTimer]);

  const resolveProgressPoint = useCallback((clientX: number): ProgressPoint | null => {
    const bar = progressRef.current;
    const mediaDuration = duration || videoRef.current?.duration || 0;
    if (!bar || !Number.isFinite(mediaDuration) || mediaDuration <= 0) {
      return null;
    }
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = x / rect.width;
    if (isScrubbingRef.current) {
      setScrubPercent(ratio * 100);
    }
    return { time: ratio * mediaDuration, x };
  }, [duration]);

  const updateHoverPreview = useCallback((
    clientX: number,
    options?: { forceSpriteVisible?: boolean; applySeek?: boolean }
  ) => {
    const point = resolveProgressPoint(clientX);
    if (!point) return;

    if (options?.applySeek) {
      seek(point.time);
    }

    const cue = getSpriteForTime(point.time);
    if (!cue) {
      spriteHoverRef.current = null;
      hideSpritePreview();
      return;
    }

    if (!spriteImageReady) {
      hideSpritePreview(true);
      return;
    }

    const hover: SpriteHover = { time: point.time, x: point.x, cue };
    spriteHoverRef.current = hover;

    if (spriteHideTimerRef.current !== null) {
      window.clearTimeout(spriteHideTimerRef.current);
      spriteHideTimerRef.current = null;
    }

    if (options?.forceSpriteVisible) {
      clearSpriteShowTimer();
      setSpritePreview({ ...hover, visible: true });
      return;
    }

    setSpritePreview((prev) => (prev?.visible ? { ...hover, visible: true } : prev));
    if (spriteTimerRef.current === null) {
      spriteTimerRef.current = window.setTimeout(() => {
        spriteTimerRef.current = null;
        const current = spriteHoverRef.current;
        if (current) {
          setSpritePreview({ ...current, visible: true });
        }
      }, SPRITE_HOVER_DELAY);
    }
  }, [clearSpriteShowTimer, getSpriteForTime, hideSpritePreview, resolveProgressPoint, seek, spriteImageReady]);

  const clearProgressHover = useCallback(() => {
    spriteHoverRef.current = null;
    hideSpritePreview();
  }, [hideSpritePreview]);

  const handleProgressPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    isScrubbingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateHoverPreview(e.clientX, { forceSpriteVisible: true, applySeek: true });
  }, [updateHoverPreview]);

  const handleProgressPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    updateHoverPreview(e.clientX, {
      forceSpriteVisible: isScrubbingRef.current,
      applySeek: isScrubbingRef.current,
    });
  }, [updateHoverPreview]);

  const handleProgressPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    setScrubPercent(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    updateHoverPreview(e.clientX, { forceSpriteVisible: true, applySeek: true });
  }, [updateHoverPreview]);

  const handleProgressPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (isScrubbingRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    isScrubbingRef.current = false;
    setScrubPercent(null);
    clearProgressHover();
  }, [clearProgressHover]);

  const handleProgressPointerLeave = useCallback(() => {
    if (isScrubbingRef.current) return;
    clearProgressHover();
  }, [clearProgressHover]);

  const toggleSpeedMenu = useCallback((e: ReactMouseEvent) => {
    e.stopPropagation();
    setShowSpeedMenu((prev) => !prev);
  }, []);

  const handleVolumeWheel = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const step = e.deltaY < 0 ? 0.05 : -0.05;
    const currentVolume = videoRef.current?.volume ?? volume;
    setVolume(currentVolume + step);
  }, [setVolume, volume]);

  const handleSeekStep = useCallback((delta: number) => {
    const time = videoRef.current?.currentTime ?? 0;
    seek(time + delta);
    triggerSeekFlash(delta < 0 ? "back" : "fwd");
  }, [seek, triggerSeekFlash]);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => {
      if (prev.visible) {
        contextMenuJustClosedRef.current = true;
        if (contextMenuCloseTimerRef.current !== null) {
          window.clearTimeout(contextMenuCloseTimerRef.current);
        }
        contextMenuCloseTimerRef.current = window.setTimeout(() => {
          contextMenuJustClosedRef.current = false;
          contextMenuCloseTimerRef.current = null;
        }, 200);
      }
      return { ...prev, visible: false };
    });
  }, []);

  const handleContextMenu = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    const y = rect ? e.clientY - rect.top : e.clientY;

    if (contextMenuJustClosedRef.current) {
      closeContextMenu();
      return;
    }

    setContextMenu({ visible: true, x, y });
  }, [containerRef, closeContextMenu]);

  const [showStats, setShowStats] = useState(false);
  const [videoMeta, setVideoMeta] = useState({ width: 0, height: 0, loop: false, playbackRate: 1 });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const syncMeta = () => {
      setVideoMeta({
        width: video.videoWidth,
        height: video.videoHeight,
        loop: video.loop,
        playbackRate: video.playbackRate,
      });
    };
    video.addEventListener("loadedmetadata", syncMeta);
    video.addEventListener("ratechange", syncMeta);
    return () => {
      video.removeEventListener("loadedmetadata", syncMeta);
      video.removeEventListener("ratechange", syncMeta);
    };
  }, []);

  const handleContextMenuAction = useCallback((action: string) => {
    const video = videoRef.current;
    switch (action) {
      case "play-pause":
        togglePlay();
        break;
      case "back-5":
        handleSeekStep(-5);
        break;
      case "forward-5":
        handleSeekStep(5);
        break;
      case "loop":
        if (video) {
          video.loop = !video.loop;
          setVideoMeta((prev) => ({ ...prev, loop: video.loop }));
        }
        break;
      case "stats":
        setShowStats((prev) => !prev);
        break;
      case "info":
        setPropertiesVideoMeta({
          id: videoId ?? "",
          title: "Loading...",
          filename: "",
          size: "",
          duration: "",
          hasSprites: hasSprites || false,
        });
        setShowProperties(true);
        break;
      case "copy-link":
        void navigator.clipboard.writeText(
          streamSrc ? streamSrc : buildStreamUrl(videoId ?? "", { shareToken, absolute: true })
        );
        break;
      case "download":
        window.open(
          streamSrc ? streamSrc : buildStreamUrl(videoId ?? "", { download: true, shareToken }),
          "_blank"
        );
        break;
    }
  }, [togglePlay, handleSeekStep, videoId, hasSprites, shareToken, streamSrc]);

  const handleVolumePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();

    const wrap = e.currentTarget;
    const trackEl = volumeTrackRef.current;
    if (!trackEl) return;

    const pointerId = e.pointerId;
    const update = (clientX: number) => {
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setVolume(ratio);
    };

    update(e.clientX);

    let captured = false;
    const onMove = (ev: PointerEvent) => {
      if (!captured) {
        captured = true;
        wrap.classList.add("vp-volume-dragging");
        if (!wrap.hasPointerCapture(pointerId)) {
          wrap.setPointerCapture(pointerId);
        }
      }
      update(ev.clientX);
    };
    const cleanup = () => {
      if (captured && wrap.hasPointerCapture(pointerId)) {
        wrap.releasePointerCapture(pointerId);
      }
      wrap.classList.remove("vp-volume-dragging");
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", cleanup);
      wrap.removeEventListener("pointercancel", cleanup);
    };

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", cleanup);
    wrap.addEventListener("pointercancel", cleanup);
  }, [setVolume]);

  const playedPercent = scrubPercent !== null ? scrubPercent : (duration ? (currentTime / duration) * 100 : 0);
  const bufferedPercent = buffered * 100;

  const volumeLevel: 0 | 1 | 2 = muted || volume === 0 ? 0 : volume < 0.5 ? 1 : 2;

  const spriteScale = SPRITE_SCALE;
  const progressWidth = progressRef.current?.clientWidth ?? 0;
  const spritePreviewWidth = spritePreview ? spritePreview.cue.w * spriteScale : 0;
  const spriteEdge = Math.max(SPRITE_MIN_EDGE, spritePreviewWidth / 2);
  const previewLeft = spritePreview
    ? Math.max(spriteEdge, Math.min(spritePreview.x, Math.max(spriteEdge, progressWidth - spriteEdge)))
    : 0;

  const hasVideoDetails = !!(
    propertiesData?.resolution ||
    propertiesData?.videoCodec ||
    propertiesData?.videoBitrate ||
    propertiesData?.framerate ||
    propertiesData?.pixelFormat
  );
  const hasAudioDetails = !!(
    propertiesData?.audioCodec ||
    propertiesData?.audioBitrate ||
    propertiesData?.audioChannels ||
    propertiesData?.sampleRate
  );

  return (
    <div
      ref={containerRef}
      className={`vp-container ${fillToEdge ? "vp-fit-cover" : ""} ${showControls || !playing ? "" : "vp-hide-cursor"} ${isRestoringProgress ? "vp-loading-video" : ""}`}
      tabIndex={0}
      onPointerDown={() => containerRef.current?.focus()}
      onContextMenu={handleContextMenu}
    >
      <video ref={videoRef} onClick={() => {
        if (contextMenuJustClosedRef.current) return;
        togglePlay();
      }} playsInline preload="metadata">
        <source src={sourceUrl} />
      </video>

      {showStats && (
        <div className="vp-stats-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="vp-stats-header">
            <span>Stats for Nerds</span>
            <button className="vp-stats-close" onClick={() => setShowStats(false)}><IconX size={14} /></button>
          </div>
          <div className="vp-stats-row"><span>Resolution</span><span>{videoMeta.width}×{videoMeta.height}</span></div>
          <div className="vp-stats-row"><span>Duration</span><span>{formatTime(duration)}</span></div>
          <div className="vp-stats-row"><span>Current Time</span><span>{formatTime(currentTime)}</span></div>
          <div className="vp-stats-row"><span>Volume</span><span>{Math.round(volume * 100)}%</span></div>
          <div className="vp-stats-row"><span>Speed</span><span>{videoMeta.playbackRate}x</span></div>
          <div className="vp-stats-row"><span>Loop</span><span>{videoMeta.loop ? "On" : "Off"}</span></div>
          <div className="vp-stats-row"><span>Buffered</span><span>{Math.round(buffered * 100)}%</span></div>
        </div>
      )}

      {showProperties && (
        <VideoActionModal
          actionModal="properties"
          closing={propertiesClosing}
          actionVideo={propertiesVideoMeta}
          actionLoading={false}
          renameValue=""
          onRenameValueChange={() => {}}
          onClose={closePropertiesModal}
          onClosed={finalizeClosePropertiesModal}
          onRenameKeyDown={() => {}}
          onConfirmRename={() => {}}
          onConfirmDelete={() => {}}
          videoProps={propertiesData}
          hasVideoDetails={hasVideoDetails}
          hasAudioDetails={hasAudioDetails}
          placeholderImages={[]}
          placeholdersLoading={false}
          onThumbnailSelect={() => {}}
        />
      )}

      {playFlash && (
        <div key={playFlash.id} className="vp-center-flash">
          {playFlash.playing
            ? <IconPlayerPlayFilled size={FLASH_ICON_SIZE} fill="currentColor" strokeWidth={0} />
            : <IconPlayerPauseFilled size={FLASH_ICON_SIZE} fill="currentColor" strokeWidth={0} />}
        </div>
      )}

      {seekFlash && (
        <div key={seekFlash.id} className={`vp-seek-flash vp-seek-flash--${seekFlash.dir}`}>
          {seekFlash.dir === "back"
            ? <IconRewindBackward5 size={FLASH_ICON_SIZE} />
            : <IconRewindForward5 size={FLASH_ICON_SIZE} />}
        </div>
      )}

      <div
        className={`vp-controls ${showControls || !playing ? "vp-controls-visible" : ""}`}
        onMouseEnter={pauseControlsHide}
        onMouseLeave={resumeControlsHide}
      >
        <div
          ref={progressRef}
          className="vp-progress-area"
          onPointerDown={handleProgressPointerDown}
          onPointerMove={handleProgressPointerMove}
          onPointerUp={handleProgressPointerUp}
          onPointerCancel={handleProgressPointerCancel}
          onPointerLeave={handleProgressPointerLeave}
        >
          {spritePreview && spriteImageReady && (
            <div className={`vp-sprite-preview ${spritePreview.visible ? "vp-sprite-visible" : ""}`} style={{ left: previewLeft }}>
              <div
                className="vp-sprite-thumb-wrap"
                style={{
                  width: spritePreview.cue.w * spriteScale,
                  height: spritePreview.cue.h * spriteScale,
                }}
              >
                <div
                  className="vp-sprite-thumb"
                  style={{
                    backgroundImage: `url(${spritePreview.cue.url})`,
                    backgroundPosition: `-${spritePreview.cue.x}px -${spritePreview.cue.y}px`,
                    width: spritePreview.cue.w,
                    height: spritePreview.cue.h,
                    transform: `scale(${spriteScale})`,
                    transformOrigin: "top left",
                  }}
                />
                <span className="vp-sprite-time">{formatTime(spritePreview.time)}</span>
              </div>
            </div>
          )}
          <div className="vp-progress-bar">
            <div className="vp-progress-buffered" style={{ width: `${bufferedPercent}%` }} />
            <div className="vp-progress-played" style={{ width: `${playedPercent}%` }}>
              <div className="vp-progress-knob" />
            </div>
          </div>
        </div>

        <div className="vp-controls-row">
          <div className="vp-controls-left">
            <button ref={btnPlayRef} className="vp-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? (
                <IconPlayerPauseFilled size={CONTROL_ICON_SIZE} fill="currentColor" strokeWidth={0} />
              ) : (
                <IconPlayerPlayFilled size={CONTROL_ICON_SIZE} fill="currentColor" strokeWidth={0} />
              )}
            </button>

            <button ref={btnSeekBackRef} className="vp-btn" onClick={() => handleSeekStep(-5)} onPointerDown={pressBtn} onKeyDown={pressBtnKey} aria-label="Seek backward 5 seconds" title="Back 5 seconds">
              <IconRewindBackward5 size={CONTROL_ICON_SIZE} />
            </button>

            <button ref={btnSeekFwdRef} className="vp-btn" onClick={() => handleSeekStep(5)} onPointerDown={pressBtn} onKeyDown={pressBtnKey} aria-label="Seek forward 5 seconds" title="Forward 5 seconds">
              <IconRewindForward5 size={CONTROL_ICON_SIZE} />
            </button>

            <div className="vp-volume-group" onWheel={handleVolumeWheel}>
              <button ref={btnMuteRef} className="vp-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
                {volumeLevel === 0 ? <IconVolumeOff size={CONTROL_ICON_SIZE} /> : volumeLevel === 1 ? <IconVolume size={CONTROL_ICON_SIZE} /> : <IconVolume2 size={CONTROL_ICON_SIZE} />}
              </button>
              <div
                className="vp-volume-slider-wrap"
                onPointerDown={handleVolumePointerDown}
              >
                <div ref={volumeTrackRef} className="vp-volume-track">
                  <div className="vp-volume-fill" style={{ width: `${(muted ? 0 : volume) * 100}%` }}>
                    <div className="vp-volume-knob" />
                  </div>
                </div>
              </div>
            </div>

            <span className="vp-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="vp-controls-right">
            <div ref={speedMenuRef} className="vp-speed-group">
              <button
                className="vp-btn vp-speed-btn"
                onClick={toggleSpeedMenu}
                onPointerDown={pressBtn}
                onKeyDown={pressBtnKey}
                aria-label={`Playback speed ${playbackRate}x`}
                title={`Playback speed ${playbackRate}x`}
              >
                <IconBrandSpeedtest size={CONTROL_ICON_SIZE - 2} />
              </button>
              {showSpeedMenu && (
                <div className="vp-speed-menu">
                  <span className="vp-speed-header">Speed</span>
                  <div className="vp-speed-divider" role="separator" />
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate, i) => (
                    <div key={rate}>
                      {i > 0 && <div className="vp-speed-divider" role="separator" />}
                      <button
                        className={`vp-speed-option ${rate === playbackRate ? "active" : ""}`}
                        onClick={() => {
                          setPlaybackRate(rate);
                          setShowSpeedMenu(false);
                        }}
                      >
                        {rate}x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              className={`vp-btn ${fillToEdge ? "vp-btn-active" : ""}`}
              onClick={() => setFillToEdge((prev) => !prev)}
              onPointerDown={pressBtn}
              onKeyDown={pressBtnKey}
              aria-label={fillToEdge ? "Fit video in frame" : "Fill video to edges"}
              title={fillToEdge ? "Fit video in frame" : "Fill video to edges"}
              aria-pressed={fillToEdge}
            >
              <IconSelectAll size={CONTROL_ICON_SIZE - 1} />
            </button>

            <button ref={btnFullscreenRef} className="vp-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
              {isFullscreen ? (
                <IconMinimize size={CONTROL_ICON_SIZE} />
              ) : (
                <IconMaximize size={CONTROL_ICON_SIZE} />
              )}
            </button>
          </div>
        </div>
      </div>

      <PlayerContextMenu
        state={contextMenu}
        playing={playing}
        loop={videoMeta.loop}
        containerRef={containerRef}
        onClose={closeContextMenu}
        onAction={handleContextMenuAction}
      />
    </div>
  );
}
