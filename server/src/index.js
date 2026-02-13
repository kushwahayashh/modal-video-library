import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";
import { createThumbMapStore } from "./lib/thumb-map.js";
import { createSpriteService } from "./lib/sprite-generation.js";
import { fileExists, isPathSafe, formatBytes } from "./lib/files.js";
import { parseRangeHeader } from "./lib/http-range.js";
import {
  VIDEO_EXTENSIONS,
  VIDEO_MIME_TYPES,
  toBase64Url,
  fromBase64Url,
  getVideoDuration,
  getVideoMetadata,
} from "./lib/video-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false, routerOptions: { maxParamLength: 500 } });

await app.register(cors, { origin: true });
await app.register(websocket);

const clientBuildPath = path.join(__dirname, "../../client/dist");
try {
  await app.register(fastifyStatic, {
    root: clientBuildPath,
    prefix: "/",
  });
} catch {
  // Client not built yet, that's fine for dev
}

const DATA_DIR = process.env.DATA_DIR || "/data";
const VIDEOS_DIR = path.join(DATA_DIR, "videos");
const SPRITES_DIR = path.join(DATA_DIR, "sprites");
const PLACEHOLDERS_DIR = path.join(__dirname, "../../images");
const PLACEHOLDER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_SCAN_CONCURRENCY = Math.max(
  1,
  Math.min(16, parseInt(process.env.VIDEO_SCAN_CONCURRENCY || "6", 10) || 6)
);

[VIDEOS_DIR, SPRITES_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Ignore if can't create (might not have /data locally)
    }
  }
});

try {
  await app.register(fastifyStatic, {
    root: PLACEHOLDERS_DIR,
    prefix: "/api/placeholder-images/",
    decorateReply: false,
  });
} catch {
  // Images folder might be missing; ignore
}

const { readThumbMap, updateThumbMap } = createThumbMapStore(DATA_DIR);
const { spriteJobs, runSpriteGeneration, isJobRunning } = createSpriteService({
  spritesDir: SPRITES_DIR,
  fileExists,
});

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

let cloudflareUrl = null;
let lastActivityAt = Date.now();
let terminalConnectionCount = 0;

const touchActivity = () => {
  lastActivityAt = Date.now();
};

app.addHook("onRequest", async (request) => {
  // Do not count watchdog polling as user activity.
  if (
    request.url.startsWith("/api/runtime/status") &&
    request.headers["x-idle-watchdog"] === "1"
  ) {
    return;
  }
  touchActivity();
});

app.get("/api/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString(), cloudflareUrl };
});

app.get("/api/runtime/status", async () => {
  let activeSpriteJobs = 0;
  for (const job of spriteJobs.values()) {
    if (job?.status === "extracting" || job?.status === "tiling") {
      activeSpriteJobs++;
    }
  }
  return {
    lastActivityAt,
    terminalConnectionCount,
    activeSpriteJobs,
  };
});

app.get("/api/placeholder-images", async () => {
  try {
    const entries = await fsp.readdir(PLACEHOLDERS_DIR, { withFileTypes: true });
    const images = entries
      .filter((entry) => entry.isFile() && PLACEHOLDER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => `/api/placeholder-images/${encodeURIComponent(entry.name)}`)
      .sort();
    return { images };
  } catch {
    return { images: [] };
  }
});

app.get("/api/thumbnail-map", async () => readThumbMap());

app.post("/api/thumbnail-map", async (request, reply) => {
  const { videoId, imageUrl } = request.body || {};

  if (
    typeof videoId !== "string" ||
    typeof imageUrl !== "string" ||
    !videoId.trim() ||
    !imageUrl.trim()
  ) {
    return reply.status(400).send({ error: "videoId and imageUrl required" });
  }

  await updateThumbMap((map) => {
    map[videoId.trim()] = imageUrl.trim();
    return map;
  });
  return { success: true };
});

app.post("/api/cf-url", async (request, reply) => {
  const { url } = request.body || {};
  if (!url || !url.includes("trycloudflare.com")) {
    return reply.status(400).send({ error: "Invalid Cloudflare URL" });
  }
  cloudflareUrl = url.trim();
  return { success: true, url: cloudflareUrl };
});

app.get("/api/cf-url", async (request, reply) => {
  if (!cloudflareUrl) {
    return reply.status(404).send({ error: "Cloudflare URL not set" });
  }

  if (request.query.redirect === "true") {
    return reply.redirect(cloudflareUrl);
  }

  return { url: cloudflareUrl };
});

app.get("/cf", async (_request, reply) => {
  if (!cloudflareUrl) {
    return reply.status(404).send({ error: "Cloudflare URL not set. Tunnel not running?" });
  }
  return reply.redirect(cloudflareUrl);
});

app.get("/api/videos", async () => {
  try {
    if (!(await fileExists(VIDEOS_DIR))) return { videos: [], total: 0 };

    const entries = await fsp.readdir(VIDEOS_DIR, { recursive: true });
    const videos = (await mapWithConcurrency(entries, VIDEO_SCAN_CONCURRENCY, async (relPath) => {
      try {
        const ext = path.extname(relPath).toLowerCase();
        if (!VIDEO_EXTENSIONS.has(ext)) return null;
        const filePath = path.join(VIDEOS_DIR, relPath);
        const stat = await fsp.stat(filePath);
        if (!stat.isFile()) return null;
        const duration = await getVideoDuration(filePath);
        const normalizedPath = relPath.split(path.sep).join("/");
        const videoId = toBase64Url(normalizedPath);
        return {
          id: videoId,
          title: path.basename(relPath, ext),
          filename: normalizedPath,
          size: formatBytes(stat.size),
          sizeBytes: stat.size,
          createdAt: stat.birthtime,
          thumbnail: null,
          duration,
          hasSprites: fs.existsSync(path.join(SPRITES_DIR, videoId, "sprite.jpg")),
        };
      } catch {
        return null;
      }
    })).filter(Boolean);

    videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { videos, total: videos.length };
  } catch (e) {
    console.error("Error reading videos:", e);
    return { videos: [], total: 0 };
  }
});

app.get("/api/videos/:id", async (request, reply) => {
  const { id } = request.params;
  const filename = fromBase64Url(id);
  const filePath = path.join(VIDEOS_DIR, filename);

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

  const oldFilename = fromBase64Url(id);
  const oldPath = path.join(VIDEOS_DIR, oldFilename);

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
      await updateThumbMap((thumbMap) => {
        if (thumbMap[id]) {
          thumbMap[newId] = thumbMap[id];
          delete thumbMap[id];
        }
        return thumbMap;
      });
    }

    return { success: true, id: newId, filename: newRelPath };
  } catch (e) {
    console.error("Error renaming video:", e);
    return reply.status(500).send({ error: "Failed to rename video" });
  }
});

app.delete("/api/videos/:id", async (request, reply) => {
  const { id } = request.params;
  const filename = fromBase64Url(id);
  const filePath = path.join(VIDEOS_DIR, filename);

  if (!(await fileExists(filePath))) {
    return reply.status(404).send({ error: "Video not found" });
  }

  try {
    await fsp.unlink(filePath);

    const spriteDir = path.join(SPRITES_DIR, id);
    if (await fileExists(spriteDir)) {
      await fsp.rm(spriteDir, { recursive: true, force: true });
    }

    await updateThumbMap((thumbMap) => {
      if (thumbMap[id]) {
        delete thumbMap[id];
      }
      return thumbMap;
    });

    spriteJobs.delete(id);

    return { success: true };
  } catch (e) {
    console.error("Error deleting video:", e);
    return reply.status(500).send({ error: "Failed to delete video" });
  }
});

app.post("/api/videos/:id/sprites", async (request, reply) => {
  const { id } = request.params;
  const filename = fromBase64Url(id);
  const filePath = path.join(VIDEOS_DIR, filename);

  if (!(await fileExists(filePath))) {
    return reply.status(404).send({ error: "Video not found" });
  }

  if (isJobRunning(spriteJobs.get(id))) {
    return reply.status(409).send({ error: "Sprite generation already in progress" });
  }

  runSpriteGeneration(id, filename, filePath);
  return { success: true, message: "Sprite generation started" };
});

app.get("/api/sprites/progress", async () => {
  return { jobs: Array.from(spriteJobs.values(), (job) => ({ ...job })) };
});

app.get("/api/sprites/:id/image", async (request, reply) => {
  const { id } = request.params;
  const spritePath = path.join(SPRITES_DIR, id, "sprite.jpg");

  if (!(await fileExists(spritePath))) {
    return reply.status(404).send({ error: "Sprite not found" });
  }

  return reply.type("image/jpeg").send(fs.createReadStream(spritePath));
});

app.get("/api/sprites/:id/vtt", async (request, reply) => {
  const { id } = request.params;
  const vttPath = path.join(SPRITES_DIR, id, "sprite.vtt");

  if (!(await fileExists(vttPath))) {
    return reply.status(404).send({ error: "Sprite VTT not found" });
  }

  return reply.type("text/vtt").send(fs.createReadStream(vttPath));
});

app.get("/api/sprites/:id/status", async (request) => {
  const { id } = request.params;
  const spriteDir = path.join(SPRITES_DIR, id);
  const exists =
    (await fileExists(path.join(spriteDir, "sprite.jpg"))) &&
    (await fileExists(path.join(spriteDir, "sprite.vtt")));

  return { exists };
});

app.get("/api/stream/:id", async (request, reply) => {
  const { id } = request.params;
  const filename = fromBase64Url(id);
  const filePath = path.join(VIDEOS_DIR, filename);

  if (!(await fileExists(filePath))) {
    return reply.status(404).send({ error: "Video not found" });
  }

  const stats = await fsp.stat(filePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = VIDEO_MIME_TYPES[ext] || "video/mp4";
  const isDownload = request.query.download !== undefined;

  if (isDownload) {
    reply.headers({
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
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
    });

    return fs.createReadStream(filePath, { start, end });
  }

  reply.headers({
    "Content-Length": stats.size,
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
  });

  return fs.createReadStream(filePath);
});

app.get("/api/files", async (request, reply) => {
  const subPath = request.query.path || "";

  if (!isPathSafe(DATA_DIR, subPath)) {
    return reply.status(403).send({ error: "Access denied" });
  }

  const targetDir = path.resolve(DATA_DIR, subPath);
  if (!(await fileExists(targetDir))) {
    return reply.status(404).send({ error: "Directory not found" });
  }

  try {
    const entries = await fsp.readdir(targetDir, { withFileTypes: true });
    const items = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(targetDir, entry.name);
      const stats = await fsp.stat(fullPath);
      const relativePath = path.relative(DATA_DIR, fullPath);
      return {
        name: entry.name,
        path: relativePath,
        size: entry.isDirectory() ? 0 : stats.size,
        isFolder: entry.isDirectory(),
        modified: stats.mtime,
      };
    }));

    items.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  } catch (e) {
    console.error("Error listing files:", e);
    return reply.status(500).send({ error: "Failed to list files" });
  }
});

app.post("/api/files/rename", async (request, reply) => {
  const { oldPath, newPath } = request.body;

  if (!oldPath || !newPath) {
    return reply.status(400).send({ error: "oldPath and newPath are required" });
  }
  if (!isPathSafe(DATA_DIR, oldPath) || !isPathSafe(DATA_DIR, newPath)) {
    return reply.status(403).send({ error: "Access denied" });
  }

  const oldFullPath = path.resolve(DATA_DIR, oldPath);
  const newFullPath = path.resolve(DATA_DIR, newPath);

  if (!(await fileExists(oldFullPath))) {
    return reply.status(404).send({ error: "File or folder not found" });
  }

  try {
    await fsp.rename(oldFullPath, newFullPath);
    return { success: true };
  } catch (e) {
    console.error("Error renaming:", e);
    return reply.status(500).send({ error: "Failed to rename" });
  }
});

app.delete("/api/files/*", async (request, reply) => {
  const targetPath = request.params["*"];

  if (!isPathSafe(DATA_DIR, targetPath)) {
    return reply.status(403).send({ error: "Access denied" });
  }

  const fullPath = path.resolve(DATA_DIR, targetPath);
  if (!(await fileExists(fullPath))) {
    return reply.status(404).send({ error: "File or folder not found" });
  }

  try {
    await fsp.rm(fullPath, { recursive: true });
    return { success: true };
  } catch (e) {
    console.error("Error deleting:", e);
    return reply.status(500).send({ error: "Failed to delete" });
  }
});

app.get("/ws/terminal", { websocket: true }, (socket) => {
  const shell = process.env.SHELL || "/bin/bash";
  const cwd = fs.existsSync(DATA_DIR) ? DATA_DIR : process.cwd();
  const decoder = new TextDecoder();

  let proc = null;
  let isAlive = true;
  let cleaned = false;
  terminalConnectionCount++;
  touchActivity();

  const send = (type, data = {}) => {
    if (isAlive && socket.readyState === 1) {
      try {
        socket.send(JSON.stringify({ type, ...data }));
      } catch {
        // Ignore send errors
      }
    }
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    isAlive = false;
    terminalConnectionCount = Math.max(0, terminalConnectionCount - 1);
    touchActivity();
    if (proc) {
      try {
        proc.kill();
        proc.terminal?.close();
      } catch {
        // Already dead
      }
      proc = null;
    }
  };

  try {
    proc = Bun.spawn([shell], {
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        LANG: process.env.LANG || "en_US.UTF-8",
      },
      terminal: {
        cols: 80,
        rows: 24,
        data(_terminal, data) {
          send("output", { data: typeof data === "string" ? data : decoder.decode(data) });
        },
      },
    });
  } catch (e) {
    send("error", { message: `Failed to spawn shell: ${e.message}` });
    socket.close();
    return;
  }

  proc.exited.then((exitCode) => {
    send("exit", { code: exitCode });
    socket.close();
  });

  socket.on("message", (raw) => {
    if (!proc || !proc.terminal) return;

    try {
      const text = typeof raw === "string" ? raw : decoder.decode(raw);
      const msg = JSON.parse(text);

      switch (msg.type) {
        case "input":
          touchActivity();
          if (typeof msg.data === "string") proc.terminal.write(msg.data);
          break;
        case "resize": {
          touchActivity();
          const cols = Math.max(1, Math.min(500, parseInt(msg.cols, 10) || 80));
          const rows = Math.max(1, Math.min(200, parseInt(msg.rows, 10) || 24));
          try {
            proc.terminal.resize(cols, rows);
          } catch {
            // Ignore resize errors
          }
          break;
        }
        case "ping":
          touchActivity();
          send("pong");
          break;
      }
    } catch {
      // Ignore parse errors
    }
  });

  socket.on("close", cleanup);
  socket.on("error", cleanup);
});

app.get("/terminal", async (_request, reply) => {
  const terminalHtml = path.join(__dirname, "terminal.html");
  const content = await fsp.readFile(terminalHtml, "utf-8");
  return reply.type("text/html").send(content);
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/") || request.url.startsWith("/ws/")) {
    return reply.status(404).send({ error: "Not found" });
  }
  const indexHtml = path.join(clientBuildPath, "index.html");
  try {
    const content = await fsp.readFile(indexHtml, "utf-8");
    return reply.type("text/html").send(content);
  } catch {
    return reply.status(404).send({ error: "Not found" });
  }
});

const start = async () => {
  try {
    const port = Number(process.env.PORT || 3000);
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Server running on :${port}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to start server:", message);
    process.exit(1);
  }
};

if (process.env.NO_AUTO_LISTEN !== "1") {
  start();
}

export { app };
