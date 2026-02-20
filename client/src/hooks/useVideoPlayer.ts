import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface SpriteCue {
  startTime: number;
  endTime: number;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UseVideoPlayerOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  spriteVttUrl?: string;
  spriteImageUrl?: string;
}

const CONTROLS_HIDE_DELAY_MS = 2500;
const VOLUME_STORAGE_KEY = "videolib-volume";
const PLAYBACK_RATE_STORAGE_KEY = "videolib-playback-rate";

function parseTimestamp(ts: string): number {
  const parts = ts.trim().split(":");
  const seconds = parseFloat(parts.pop() || "0");
  const minutes = parseInt(parts.pop() || "0", 10);
  const hours = parseInt(parts.pop() || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseVtt(text: string, spriteImageUrl?: string): SpriteCue[] {
  const cues: SpriteCue[] = [];
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;

    const [startStr, endStr] = timeLine.split("-->");
    const startTime = parseTimestamp(startStr);
    const endTime = parseTimestamp(endStr);

    const urlLine = lines[lines.indexOf(timeLine) + 1];
    if (!urlLine) continue;

    const hashIndex = urlLine.indexOf("#xywh=");
    if (hashIndex === -1) continue;

    const coords = urlLine.substring(hashIndex + 6).split(",").map(Number);
    if (coords.length < 4) continue;

    const url = spriteImageUrl || urlLine.substring(0, hashIndex).trim();

    cues.push({
      startTime,
      endTime,
      url,
      x: coords[0],
      y: coords[1],
      w: coords[2],
      h: coords[3],
    });
  }

  return cues;
}

function readStoredNumber(key: string, fallback: number): number {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) {
      const num = parseFloat(val);
      if (!isNaN(num)) return num;
    }
  } catch {
    // localStorage unavailable
  }
  return fallback;
}

export function useVideoPlayer({ videoRef, spriteVttUrl, spriteImageUrl }: UseVideoPlayerOptions) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolumeState] = useState(() => readStoredNumber(VOLUME_STORAGE_KEY, 1));
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(() =>
    readStoredNumber(PLAYBACK_RATE_STORAGE_KEY, 1)
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [spriteCues, setSpriteCues] = useState<SpriteCue[]>([]);

  const controlsTimerRef = useRef<number | null>(null);

  // Parse VTT file
  useEffect(() => {
    if (!spriteVttUrl) {
      setSpriteCues([]);
      return;
    }

    let cancelled = false;

    fetch(spriteVttUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch VTT: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setSpriteCues(parseVtt(text, spriteImageUrl));
        }
      })
      .catch(() => {
        if (!cancelled) setSpriteCues([]);
      });

    return () => {
      cancelled = true;
    };
  }, [spriteVttUrl, spriteImageUrl]);

  // Apply stored volume and playback rate to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.playbackRate = playbackRate;
  }, [videoRef, volume, playbackRate]);

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const syncDuration = () => {
      const value = Number.isFinite(video.duration) ? video.duration : 0;
      setDuration(value > 0 ? value : 0);
    };
    const onLoadedMetadata = () => syncDuration();
    const onDurationChange = () => syncDuration();
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onVolumeChange = () => {
      setVolumeState(video.volume);
      setMuted(video.muted);
    };
    const onProgress = () => {
      const mediaDuration = Number.isFinite(video.duration) ? video.duration : 0;
      if (video.buffered.length > 0 && mediaDuration > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1) / mediaDuration);
      } else {
        setBuffered(0);
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("progress", onProgress);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("progress", onProgress);
    };
  }, [videoRef]);

  // Controls auto-hide
  const playingRef = useRef(false);
  playingRef.current = playing;

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);

  const pauseControlsHide = useCallback(() => {
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
    setShowControls(true);
  }, []);

  const resumeControlsHide = useCallback(() => {
    if (!playingRef.current) return;
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
      controlsTimerRef.current = null;
    }, CONTROLS_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!playing) {
      resetControlsTimer();
      return;
    }

    const startHideTimer = () => {
      if (controlsTimerRef.current !== null) {
        window.clearTimeout(controlsTimerRef.current);
      }
      controlsTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
        controlsTimerRef.current = null;
      }, CONTROLS_HIDE_DELAY_MS);
    };

    startHideTimer();

    const container = containerRef.current;
    if (!container) return;

    const onInteraction = () => {
      setShowControls(true);
      startHideTimer();
    };

    container.addEventListener("mousemove", onInteraction);
    container.addEventListener("pointerdown", onInteraction);
    container.addEventListener("touchstart", onInteraction, { passive: true });

    return () => {
      container.removeEventListener("mousemove", onInteraction);
      container.removeEventListener("pointerdown", onInteraction);
      container.removeEventListener("touchstart", onInteraction);
      if (controlsTimerRef.current !== null) {
        window.clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
      }
    };
  }, [playing, resetControlsTimer]);

  // Fullscreen change listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  // Actions
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setShowControls(true);
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef]);

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video) return;
      const mediaDuration = Number.isFinite(video.duration) ? video.duration : duration;
      if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return;

      const target = Math.max(0, Math.min(time, mediaDuration));
      setCurrentTime(target);

      try {
        const fastSeek = (video as HTMLMediaElement & { fastSeek?: (t: number) => void }).fastSeek;
        if (typeof fastSeek === "function") {
          fastSeek.call(video, target);
        }
      } catch {
        // Ignore and fallback to currentTime assignment.
      }

      video.currentTime = target;
      if (playing && video.paused) {
        void video.play().catch(() => {});
      }
    },
    [videoRef, duration, playing]
  );

  const setVolume = useCallback(
    (v: number) => {
      const video = videoRef.current;
      if (!video) return;
      const clamped = Math.max(0, Math.min(1, v));
      video.volume = clamped;
      if (clamped > 0 && video.muted) {
        video.muted = false;
      }
      try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
      } catch {
        // localStorage unavailable
      }
    },
    [videoRef]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.playbackRate = rate;
      setPlaybackRateState(rate);
      try {
        localStorage.setItem(PLAYBACK_RATE_STORAGE_KEY, String(rate));
      } catch {
        // localStorage unavailable
      }
    },
    [videoRef]
  );

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (document.fullscreenElement === container) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  const getSpriteForTime = useCallback(
    (time: number): SpriteCue | null => {
      for (const cue of spriteCues) {
        if (time >= cue.startTime && time < cue.endTime) return cue;
      }
      return null;
    },
    [spriteCues]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case " ": {
          e.preventDefault();
          togglePlay();
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const video = videoRef.current;
          if (video) seek(video.currentTime - 5);
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const video = videoRef.current;
          if (video) seek(video.currentTime + 5);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const video = videoRef.current;
          if (video) setVolume(video.volume + 0.1);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const video = videoRef.current;
          if (video) setVolume(video.volume - 0.1);
          break;
        }
        case "m":
        case "M": {
          e.preventDefault();
          toggleMute();
          break;
        }
        case "f":
        case "F": {
          e.preventDefault();
          toggleFullscreen();
          break;
        }
      }
    };

    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
    };
  }, [videoRef, togglePlay, seek, setVolume, toggleMute, toggleFullscreen]);

  // Cleanup controls timer on unmount
  useEffect(() => {
    return () => {
      if (controlsTimerRef.current !== null) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, []);

  return {
    playing,
    currentTime,
    duration,
    buffered,
    volume,
    muted,
    playbackRate,
    isFullscreen,
    showControls,
    togglePlay,
    seek,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
    containerRef,
    spriteCues,
    getSpriteForTime,
    pauseControlsHide,
    resumeControlsHide,
  };
}
