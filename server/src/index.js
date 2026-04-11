import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createJsonMapStore } from "./lib/json-map-store.js";
import { createSpriteService } from "./lib/sprite-generation.js";
import { fileExists } from "./lib/files.js";
import { registerVideoRoutes } from "./routes/videos.js";
import { registerSpriteRoutes } from "./routes/sprites.js";
import { registerTerminalRoutes } from "./routes/terminal.js";
import { registerFileRoutes } from "./routes/files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false, routerOptions: { maxParamLength: 500 } });

await app.register(cors, { origin: true });
await app.register(websocket);
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 50 } });

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

// Use persistent volume if available, fallback to local repo directory for local dev
let defaultPlaceholders = path.join(DATA_DIR, "thumbnails");
if (DATA_DIR === "/data" && !fs.existsSync("/data")) {
  defaultPlaceholders = path.join(__dirname, "../../images");
}
const PLACEHOLDERS_DIR = path.resolve(
  process.env.PLACEHOLDERS_DIR || defaultPlaceholders
);
const PLACEHOLDER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_SCAN_CONCURRENCY = Math.max(
  1,
  Math.min(16, parseInt(process.env.VIDEO_SCAN_CONCURRENCY || "6", 10) || 6)
);

[VIDEOS_DIR, SPRITES_DIR, PLACEHOLDERS_DIR].forEach((dir) => {
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

const { read: readThumbMap, update: updateThumbMap } = createJsonMapStore(DATA_DIR, "thumbnail-map.json");
const { read: readVideoAddedMap, update: updateVideoAddedMap } = createJsonMapStore(DATA_DIR, "video-added-map.json");
const { read: readWatchProgress, update: updateWatchProgress } = createJsonMapStore(DATA_DIR, "watch-progress-map.json");
const { spriteJobs, runSpriteGeneration, isJobRunning, cancelJob } = createSpriteService({
  spritesDir: SPRITES_DIR,
  fileExists,
});

async function listPlaceholderImageUrls() {
  try {
    const entries = await fsp.readdir(PLACEHOLDERS_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && PLACEHOLDER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .sort((a, b) => b.name.localeCompare(a.name)) // Sort descending so newest (by timestamp prefix) is first
      .map((entry) => `/api/placeholder-images/${encodeURIComponent(entry.name)}`);
  } catch {
    return [];
  }
}

let cloudflareUrl = null;
let lastActivityAt = Date.now();
const terminalState = { connectionCount: 0 };

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
    terminalConnectionCount: terminalState.connectionCount,
    activeSpriteJobs,
  };
});

app.get("/api/placeholder-images", async () => {
  return { images: await listPlaceholderImageUrls() };
});

app.post("/api/placeholder-images/upload", async (request, reply) => {
  const parts = request.parts();
  const uploaded = [];

  try {
    await fsp.mkdir(PLACEHOLDERS_DIR, { recursive: true });
  } catch { /* already exists */ }

  for await (const part of parts) {
    if (part.type !== "file" || !part.filename) continue;

    const ext = path.extname(part.filename).toLowerCase();
    if (!PLACEHOLDER_EXTENSIONS.has(ext)) {
      // Drain and skip unsupported file types
      await part.toBuffer();
      continue;
    }

    const buffer = await part.toBuffer();
    const timestamp = Date.now().toString(36).padStart(10, "0"); // Sortable timestamp
    const uniqueId = crypto.randomBytes(3).toString("hex");
    const safeName = part.filename
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const finalName = `${timestamp}-${uniqueId}-${safeName}`;
    const destPath = path.join(PLACEHOLDERS_DIR, finalName);

    await fsp.writeFile(destPath, buffer);
    uploaded.push(`/api/placeholder-images/${encodeURIComponent(finalName)}`);
  }

  if (uploaded.length === 0) {
    return reply.status(400).send({ error: "No valid image files uploaded" });
  }

  return { uploaded };
});

app.delete("/api/placeholder-images/:filename", async (request, reply) => {
  const { filename } = request.params;
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.startsWith(".")) {
    return reply.status(400).send({ error: "Invalid filename" });
  }

  const filePath = path.join(PLACEHOLDERS_DIR, filename);
  try {
    await fsp.unlink(filePath);
    
    // Scrub deleted image from thumbnail-map.json so overrides aren't left dangling
    await updateThumbMap((map) => {
      const targetUrl = `/api/placeholder-images/${encodeURIComponent(filename)}`;
      let changed = false;
      for (const [vid, url] of Object.entries(map)) {
        if (url === targetUrl) {
          delete map[vid];
          changed = true;
        }
      }
      return map; // Will only write if we actually modified something
    });

    return { success: true };
  } catch (err) {
    if (err.code === "ENOENT") {
      return reply.status(404).send({ error: "File not found" });
    }
    return reply.status(500).send({ error: "Failed to delete file" });
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

app.get("/api/watch-progress", async () => {
  return await readWatchProgress();
});

registerVideoRoutes(app, {
  VIDEOS_DIR,
  SPRITES_DIR,
  VIDEO_SCAN_CONCURRENCY,
  readThumbMap,
  updateThumbMap,
  readVideoAddedMap,
  updateVideoAddedMap,
  readWatchProgress,
  updateWatchProgress,
  listPlaceholderImageUrls,
  touchActivity,
  spriteJobs,
  cancelJob,
});

registerSpriteRoutes(app, {
  VIDEOS_DIR,
  SPRITES_DIR,
  spriteJobs,
  runSpriteGeneration,
  isJobRunning,
});

registerTerminalRoutes(app, {
  DATA_DIR,
  touchActivity,
  terminalState,
});

registerFileRoutes(app, { DATA_DIR });

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
