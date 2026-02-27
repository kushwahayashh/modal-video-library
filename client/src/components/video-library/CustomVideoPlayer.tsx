import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { IconPlayerPlayFilled, IconPlayerPauseFilled, IconMaximize, IconMinimize, IconGauge, IconPlayerTrackPrevFilled, IconPlayerTrackNextFilled, IconVolume, IconVolume2, IconVolumeOff } from "@tabler/icons-react";
import { useVideoPlayer, type SpriteCue } from "../../hooks/useVideoPlayer";

interface CustomVideoPlayerProps {
  videoId: string;
  hasSprites?: boolean;
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
const BIG_PLAY_ICON_SIZE = 44;
const CONTROL_ICON_SIZE = 26;

function FillModeIcon({ fill, size }: { fill: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {fill ? (
        <rect x="7.25" y="7.25" width="9.5" height="9.5" rx="1.2" fill="currentColor" />
      ) : (
        <rect x="7.25" y="7.25" width="9.5" height="9.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      )}
    </svg>
  );
}



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

export default function CustomVideoPlayer({ videoId, hasSprites }: CustomVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

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
  } = useVideoPlayer({ videoRef, videoId, spriteVttUrl, spriteImageUrl });

  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [fillToEdge, setFillToEdge] = useState(false);
  const [spritePreview, setSpritePreview] = useState<SpritePreview | null>(null);
  const [spriteImageReady, setSpriteImageReady] = useState(false);
  const spriteHoverRef = useRef<SpriteHover | null>(null);
  const spriteTimerRef = useRef<number | null>(null);
  const spriteHideTimerRef = useRef<number | null>(null);
  const isScrubbingRef = useRef(false);

  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showSpeedMenu]);

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
    seek(currentTime + delta);
  }, [currentTime, seek]);

  const playedPercent = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = buffered * 100;

  const volumeLevel: 0 | 1 | 2 = muted || volume === 0 ? 0 : volume < 0.5 ? 1 : 2;

  const spriteScale = SPRITE_SCALE;
  const progressWidth = progressRef.current?.clientWidth ?? 0;
  const spritePreviewWidth = spritePreview ? spritePreview.cue.w * spriteScale : 0;
  const spriteEdge = Math.max(SPRITE_MIN_EDGE, spritePreviewWidth / 2);
  const previewLeft = spritePreview
    ? Math.max(spriteEdge, Math.min(spritePreview.x, Math.max(spriteEdge, progressWidth - spriteEdge)))
    : 0;

  return (
    <div
      ref={containerRef}
      className={`vp-container ${fillToEdge ? "vp-fit-cover" : ""} ${showControls || !playing ? "" : "vp-hide-cursor"}`}
      tabIndex={0}
      onPointerDown={() => containerRef.current?.focus()}
    >
      <video ref={videoRef} onClick={togglePlay} playsInline preload="metadata">
        <source src={`/api/stream/${videoId}`} type="video/mp4" />
      </video>

      {!playing && (
      <button className="vp-big-play" onClick={togglePlay} aria-label="Play">
          <IconPlayerPlayFilled size={BIG_PLAY_ICON_SIZE} fill="currentColor" strokeWidth={0} />
      </button>
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
            <button className="vp-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? (
                <IconPlayerPauseFilled size={CONTROL_ICON_SIZE} fill="currentColor" strokeWidth={0} />
              ) : (
                <IconPlayerPlayFilled size={CONTROL_ICON_SIZE} fill="currentColor" strokeWidth={0} />
              )}
            </button>

            <button className="vp-btn" onClick={() => handleSeekStep(-5)} aria-label="Seek backward 5 seconds" title="Back 5 seconds">
              <IconPlayerTrackPrevFilled size={CONTROL_ICON_SIZE} />
            </button>

            <button className="vp-btn" onClick={() => handleSeekStep(5)} aria-label="Seek forward 5 seconds" title="Forward 5 seconds">
              <IconPlayerTrackNextFilled size={CONTROL_ICON_SIZE} />
            </button>

            <div className="vp-volume-group" onWheel={handleVolumeWheel}>
              <button className="vp-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
                {volumeLevel === 0 ? <IconVolumeOff size={CONTROL_ICON_SIZE} /> : volumeLevel === 1 ? <IconVolume size={CONTROL_ICON_SIZE} /> : <IconVolume2 size={CONTROL_ICON_SIZE} />}
              </button>
              <div
                className="vp-volume-slider-wrap"
                onPointerDown={(e) => {
                  const track = e.currentTarget;
                  const update = (clientX: number) => {
                    const rect = track.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                    setVolume(ratio);
                  };
                  update(e.clientX);
                  track.setPointerCapture(e.pointerId);
                  const onMove = (ev: PointerEvent) => update(ev.clientX);
                  const onUp = () => {
                    track.removeEventListener("pointermove", onMove);
                    track.removeEventListener("pointerup", onUp);
                  };
                  track.addEventListener("pointermove", onMove);
                  track.addEventListener("pointerup", onUp);
                }}
              >
                <div className="vp-volume-track">
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
                aria-label={`Playback speed ${playbackRate}x`}
                title={`Playback speed ${playbackRate}x`}
              >
                <IconGauge size={CONTROL_ICON_SIZE - 2} />
              </button>
              {showSpeedMenu && (
                <div className="vp-speed-menu">
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                    <button
                      key={rate}
                      className={`vp-speed-option ${rate === playbackRate ? "active" : ""}`}
                      onClick={() => {
                        setPlaybackRate(rate);
                        setShowSpeedMenu(false);
                      }}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className={`vp-btn ${fillToEdge ? "vp-btn-active" : ""}`}
              onClick={() => setFillToEdge((prev) => !prev)}
              aria-label={fillToEdge ? "Fit video in frame" : "Fill video to edges"}
              title={fillToEdge ? "Fit video in frame" : "Fill video to edges"}
              aria-pressed={fillToEdge}
            >
              <FillModeIcon fill={fillToEdge} size={CONTROL_ICON_SIZE - 1} />
            </button>

            <button className="vp-btn" onClick={toggleFullscreen} aria-label="Fullscreen">
              {isFullscreen ? (
                <IconMinimize size={CONTROL_ICON_SIZE} />
              ) : (
                <IconMaximize size={CONTROL_ICON_SIZE} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
