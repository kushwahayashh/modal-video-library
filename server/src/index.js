import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";
import { createThumbMapStore } from "./lib/thumb-map.js";
import { createVideoAddedMapStore } from "./lib/video-added-map.js";
import { createWatchProgressStore } from "./lib/watch-progress-map.js";
import { createSpriteService } from "./lib/sprite-generation.js";
import { fileExists } from "./lib/files.js";
import { registerVideoRoutes } from "./routes/videos.js";
import { registerSpriteRoutes } from "./routes/sprites.js";
import { registerTerminalRoutes } from "./routes/terminal.js";

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
const PLACEHOLDERS_DIR = path.resolve(
  process.env.PLACEHOLDERS_DIR || path.join(__dirname, "../../images")
);
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
const { readVideoAddedMap, updateVideoAddedMap } = createVideoAddedMapStore(DATA_DIR);
const { readWatchProgress, updateWatchProgress } = createWatchProgressStore(DATA_DIR);
const { spriteJobs, runSpriteGeneration, isJobRunning } = createSpriteService({
  spritesDir: SPRITES_DIR,
  fileExists,
});

async function listPlaceholderImageUrls() {
  try {
    const entries = await fsp.readdir(PLACEHOLDERS_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && PLACEHOLDER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => `/api/placeholder-images/${encodeURIComponent(entry.name)}`)
      .sort();
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
