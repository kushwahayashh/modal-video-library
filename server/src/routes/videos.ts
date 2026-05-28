import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import {
  VIDEO_EXTENSIONS,
  VIDEO_MIME_TYPES,
  toBase64Url,
  fromBase64Url,
  safeResolve,
  getVideoDuration,
  getVideoMetadata,
} from "../lib/video-utils.js";
import { fileExists, formatBytes } from "../lib/files.js";
import { parseRangeHeader } from "../lib/http-range.js";

function fallbackAddedAt(stat) {
  const candidates = [stat.mtimeMs, stat.ctimeMs, stat.birthtimeMs].filter(
    (ms) => Number.isFinite(ms) && ms > 0
  );
  const ts = candidates.length > 0 ? candidates[0] : Date.now();
  return new Date(ts).toISOString();
}

function normalizeNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function pickStablePlaceholder(seed, placeholders) {
  if (placeholders.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return placeholders[hash % placeholders.length] || null;
}

function resolveStoredThumbnail(value, placeholderImageSet) {
  const stored = normalizeNonEmptyString(value);
  if (!stored) return null;
  if (stored.startsWith("/api/placeholder-images/")) {
    return placeholderImageSet.has(stored) ? stored : null;
  }
  return stored;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  const workerCount = Math.min(concurrency, items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = currentIndex;
      currentIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

export function registerVideoRoutes(app, deps) {
  const {
    VIDEOS_DIR,
    SPRITES_DIR,
    VIDEO_SCAN_CONCURRENCY,
    libraryStore,
    listPlaceholderImageUrls,
    touchActivity,
    cancelJob,
  } = deps;

  async function syncVideoIndex() {
    if (!(await fileExists(VIDEOS_DIR))) {
      libraryStore.deleteMissingVideos(`missing:${Date.now()}`);
      return;
    }

    const placeholderImages = await listPlaceholderImageUrls();
    const placeholderImageSet = new Set(placeholderImages);
    const scanId = new Date().toISOString();

    const entries = await fsp.readdir(VIDEOS_DIR, { recursive: true });
    await mapWithConcurrency(entries, VIDEO_SCAN_CONCURRENCY, async (relPath) => {
      try {
        const ext = path.extname(relPath).toLowerCase();
        if (!VIDEO_EXTENSIONS.has(ext)) return;

        const filePath = path.join(VIDEOS_DIR, relPath);
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) return;

        const normalizedPath = relPath.split(path.sep).join("/");
        const videoId = toBase64Url(normalizedPath);
        const existingVideo = libraryStore.getVideo(videoId);
        const addedAt = existingVideo?.addedAt || fallbackAddedAt(stat);

        const storedThumbnailRaw = normalizeNonEmptyString(libraryStore.getThumbnail(videoId));
        const storedThumbnail = resolveStoredThumbnail(storedThumbnailRaw, placeholderImageSet);
        const thumbnail = storedThumbnail || pickStablePlaceholder(videoId, placeholderImages);
        if (thumbnail && storedThumbnailRaw !== thumbnail) {
          libraryStore.setThumbnail(videoId, thumbnail);
        }

        libraryStore.upsertVideo({
          id: videoId,
          title: path.basename(relPath, ext),
          filename: normalizedPath,
          size: formatBytes(stat.size),
          sizeBytes: stat.size,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
          addedAt,
          duration: await getVideoDuration(filePath),
          lastSeenAt: scanId,
        });
      } catch {
        // Ignore unreadable files during scan, matching previous best-effort behavior.
      }
    });

    libraryStore.deleteMissingVideos(scanId);
  }

  app.get("/api/videos", async (request) => {
    const query = request.query || {};
    const queryText = typeof query.q === "string" ? query.q.trim().toLowerCase() : "";
    const parsedLimit = Number.parseInt(
      typeof query.limit === "string" ? query.limit : "",
      10
    );
    const parsedOffset = Number.parseInt(
      typeof query.offset === "string" ? query.offset : "",
      10
    );
    const usePagination = Number.isFinite(parsedLimit) && parsedLimit > 0;
    const limit = usePagination ? Math.min(200, parsedLimit) : 0;
    const offset = usePagination
      ? Number.isFinite(parsedOffset) && parsedOffset > 0
        ? parsedOffset
        : 0
      : 0;

    try {
      await syncVideoIndex();
      const { videos, total } = libraryStore.listVideos({
        queryText,
        offset,
        limit,
      });
      const videosWithSprites = await mapWithConcurrency(
        videos,
        VIDEO_SCAN_CONCURRENCY,
        async (video) => ({
          ...video,
          hasSprites: await fileExists(path.join(SPRITES_DIR, video.id, "sprite.jpg")),
        })
      );

      if (!usePagination) {
        return { videos: videosWithSprites, total };
      }

      const pageVideos = videosWithSprites;
      const nextOffset = offset + pageVideos.length;
      const hasMore = nextOffset < total;
      return {
        videos: pageVideos,
        total,
        offset,
        limit,
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
      };
    } catch (e) {
      console.error("Error reading videos:", e);
      return { videos: [], total: 0 };
    }
  });

  app.get("/api/videos/:id", async (request, reply) => {
    const { id } = request.params;
    await syncVideoIndex();
    const filename = fromBase64Url(id);
    const filePath = safeResolve(VIDEOS_DIR, filename);
    if (!filePath) return reply.status(400).send({ error: "Invalid video ID" });

    if (!(await fileExists(filePath))) {
      return reply.status(404).send({ error: "Video not found" });
    }

    const stats = await fsp.stat(filePath);
    const ext = path.extname(filename);
    const [duration, metadata] = await Promise.all([
      getVideoDuration(filePath),
      getVideoMetadata(filePath),
    ]);

    return {
      id,
      title: path.basename(filename, ext),
      filename,
      size: formatBytes(stats.size),
      sizeBytes: stats.size,
      createdAt: stats.birthtime,
      addedAt: libraryStore.getVideo(id)?.addedAt || stats.ctime,
      modifiedAt: stats.mtime,
      duration,
      ...metadata,
    };
  });

  app.post("/api/videos/:id/rename", async (request, reply) => {
    const { id } = request.params;
    const { newName } = request.body;

    if (!newName || typeof newName !== "string") {
      return reply.status(400).send({ error: "newName is required" });
    }

    await syncVideoIndex();
    const oldFilename = fromBase64Url(id);
    const oldPath = safeResolve(VIDEOS_DIR, oldFilename);
    if (!oldPath) return reply.status(400).send({ error: "Invalid video ID" });

    if (!(await fileExists(oldPath))) {
      return reply.status(404).send({ error: "Video not found" });
    }

    const ext = path.extname(oldFilename);
    const sanitizedName = newName.replace(/[<>:"/\\|?*]/g, "").trim();
    if (!sanitizedName) {
      return reply.status(400).send({ error: "Invalid name" });
    }

    const subDir = path.dirname(oldFilename);
    const newRelPath = subDir === "." ? sanitizedName + ext : subDir + "/" + sanitizedName + ext;
    const newPath = path.join(VIDEOS_DIR, newRelPath);

    if ((await fileExists(newPath)) && newPath !== oldPath) {
      return reply.status(409).send({ error: "A file with that name already exists" });
    }

    try {
      await fsp.rename(oldPath, newPath);
      const newId = toBase64Url(newRelPath);

      const oldSpriteDir = path.join(SPRITES_DIR, id);
      const newSpriteDir = path.join(SPRITES_DIR, newId);
      if (await fileExists(oldSpriteDir)) {
        if (newSpriteDir !== oldSpriteDir && (await fileExists(newSpriteDir))) {
          await fsp.rm(newSpriteDir, { recursive: true, force: true });
        }
        await fsp.rename(oldSpriteDir, newSpriteDir);
        const vttPath = path.join(newSpriteDir, "sprite.vtt");
        if (await fileExists(vttPath)) {
          try {
            const vtt = await fsp.readFile(vttPath, "utf-8");
            const updated = vtt.replaceAll(
              `/api/sprites/${id}/image`,
              `/api/sprites/${newId}/image`
            );
            if (updated !== vtt) {
              await fsp.writeFile(vttPath, updated);
            }
          } catch (e) {
            console.warn("Failed to update sprite VTT after rename:", e);
          }
        }
      }

      if (newId !== id) {
        libraryStore.renameVideo(id, newId, newRelPath);

        if (deps.spriteJobs?.has(id)) {
           deps.cancelJob(id);
        }
      }

      return { success: true, id: newId, filename: newRelPath };
    } catch (e) {
      console.error("Error renaming video:", e);
      return reply.status(500).send({ error: "Failed to rename video" });
    }
  });

  app.delete("/api/videos/:id", async (request, reply) => {
    const { id } = request.params;
    await syncVideoIndex();
    const filename = fromBase64Url(id);
    const filePath = safeResolve(VIDEOS_DIR, filename);
    if (!filePath) return reply.status(400).send({ error: "Invalid video ID" });

    if (!(await fileExists(filePath))) {
      return reply.status(404).send({ error: "Video not found" });
    }

    try {
      await fsp.unlink(filePath);

      const spriteDir = path.join(SPRITES_DIR, id);
      if (await fileExists(spriteDir)) {
        await fsp.rm(spriteDir, { recursive: true, force: true });
      }

      libraryStore.deleteVideo(id);

      if (deps.cancelJob) {
        deps.cancelJob(id);
      } else if (deps.spriteJobs) {
        deps.spriteJobs.delete(id);
      }

      return { success: true };
    } catch (e) {
      console.error("Error deleting video:", e);
      return reply.status(500).send({ error: "Failed to delete video" });
    }
  });

  app.get("/api/videos/:id/progress", async (request) => {
    const { id } = request.params;
    return libraryStore.getProgress(id);
  });

  app.post("/api/videos/:id/progress", async (request, reply) => {
    const { id } = request.params;
    const { currentTime, duration } = request.body || {};

    if (typeof currentTime !== "number" || typeof duration !== "number") {
      return reply.status(400).send({ error: "currentTime and duration required" });
    }

    if (duration > 0 && currentTime / duration >= 0.95) {
      libraryStore.removeProgress(id);
    } else {
      libraryStore.setProgress(id, currentTime, duration);
    }
    return { success: true };
  });

  app.get("/api/stream/:id", async (request, reply) => {
    const { id } = request.params;
    const filename = fromBase64Url(id);
    const filePath = safeResolve(VIDEOS_DIR, filename);
    if (!filePath) return reply.status(400).send({ error: "Invalid video ID" });

    if (!(await fileExists(filePath))) {
      return reply.status(404).send({ error: "Video not found" });
    }

    const stats = await fsp.stat(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = VIDEO_MIME_TYPES[ext] || "video/mp4";
    const isDownload = request.query.download !== undefined;

    const baseName = path.basename(filename);
    const asciiFallback = baseName.replace(/[^\x20-\x7E]+/g, "_").replace(/"/g, "'");
    const dispositionType = isDownload ? "attachment" : "inline";
    const contentDisposition = `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(baseName)}`;

    if (isDownload) {
      reply.headers({
        "Content-Disposition": contentDisposition,
        "Content-Length": stats.size,
        "Content-Type": "application/octet-stream",
      });
      return fs.createReadStream(filePath);
    }

    const range = request.headers.range;

    if (range) {
      const parsedRange = parseRangeHeader(range, stats.size);
      if (!parsedRange) {
        return reply.status(416).headers({
          "Content-Range": `bytes */${stats.size}`,
          "Accept-Ranges": "bytes",
        }).send({ error: "Invalid Range header" });
      }
      const { start, end } = parsedRange;
      const chunkSize = end - start + 1;

      reply.status(206).headers({
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      });

      return fs.createReadStream(filePath, { start, end });
    }

    reply.headers({
      "Content-Length": stats.size,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Disposition": contentDisposition,
    });

    return fs.createReadStream(filePath);
  });
}
