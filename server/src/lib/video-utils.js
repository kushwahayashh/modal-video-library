import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fsp } from "fs";

const execFileAsync = promisify(execFile);

export const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".avi", ".webm", ".mov"]);
export const VIDEO_MIME_TYPES = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export function toBase64Url(str) {
  return Buffer.from(str).toString("base64url");
}

export function fromBase64Url(b64) {
  return Buffer.from(b64, "base64url").toString("utf-8");
}

const durationCache = new Map();
const DURATION_CACHE_MAX_ENTRIES = 2000;

function setDurationCache(key, value) {
  if (durationCache.has(key)) {
    durationCache.delete(key);
  }
  durationCache.set(key, value);

  if (durationCache.size > DURATION_CACHE_MAX_ENTRIES) {
    const oldestKey = durationCache.keys().next().value;
    if (oldestKey !== undefined) {
      durationCache.delete(oldestKey);
    }
  }
}

export async function getVideoDuration(filePath) {
  try {
    const stats = await fsp.stat(filePath);
    const cacheKey = `${filePath}:${stats.mtimeMs}`;
    if (durationCache.has(cacheKey)) {
      const value = durationCache.get(cacheKey);
      durationCache.delete(cacheKey);
      durationCache.set(cacheKey, value);
      return value;
    }

    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { timeout: 10000 });

    const seconds = parseFloat(stdout.trim());
    if (isNaN(seconds)) {
      setDurationCache(cacheKey, null);
      return null;
    }

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const duration = hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      : `${mins}:${secs.toString().padStart(2, "0")}`;

    setDurationCache(cacheKey, duration);
    return duration;
  } catch {
    return null;
  }
}

function formatBitrate(bps) {
  const n = parseFloat(bps);
  if (isNaN(n)) return null;
  if (n >= 1000000) {
    const val = (n / 1000000).toFixed(1);
    return val.endsWith(".0") ? `${val.slice(0, -2)} Mbps` : `${val} Mbps`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)} Kbps`;
  return `${n} bps`;
}

function formatChannels(ch) {
  const n = parseInt(ch, 10);
  if (n === 1) return "Mono";
  if (n === 2) return "Stereo";
  if (n === 6) return "5.1";
  if (n === 8) return "7.1";
  return String(n);
}

export async function getVideoMetadata(filePath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_format",
      "-show_streams",
      "-of", "json",
      filePath,
    ]);
    const probe = JSON.parse(stdout);
    const streams = probe.streams || [];
    const format = probe.format || {};
    const videoStream = streams.find((stream) => stream.codec_type === "video");
    const audioStream = streams.find((stream) => stream.codec_type === "audio");

    const meta = {};

    if (videoStream) {
      meta.resolution = `${videoStream.width}x${videoStream.height}`;
      meta.videoCodec = videoStream.codec_name;
      const vBitrate = videoStream.bit_rate || format.bit_rate;
      meta.videoBitrate = vBitrate ? formatBitrate(vBitrate) : null;
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
        meta.framerate = den ? `${(num / den).toFixed(2).replace(/\.?0+$/, "")} fps` : null;
      }
      meta.pixelFormat = videoStream.pix_fmt;
    }

    if (audioStream) {
      meta.audioCodec = audioStream.codec_name;
      meta.audioBitrate = audioStream.bit_rate ? formatBitrate(audioStream.bit_rate) : null;
      meta.audioChannels = audioStream.channels != null ? formatChannels(audioStream.channels) : null;
      meta.sampleRate = audioStream.sample_rate ? `${audioStream.sample_rate} Hz` : null;
    }

    meta.container = format.format_long_name || null;
    meta.totalBitrate = format.bit_rate ? formatBitrate(format.bit_rate) : null;

    return meta;
  } catch {
    return {};
  }
}
