import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "path";
import fs from "fs";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true, routerOptions: { maxParamLength: 500 } });

await app.register(cors, { origin: true });

await app.register(websocket);

const clientBuildPath = path.join(__dirname, "../../client/dist");
try {
  await app.register(fastifyStatic, {
    root: clientBuildPath,
    prefix: "/",
  });
} catch (e) {
  // Client not built yet, that's fine for dev
}

function toBase64Url(str) {
  return Buffer.from(str).toString("base64url");
}
function fromBase64Url(b64) {
  return Buffer.from(b64, "base64url").toString("utf-8");
}

const DATA_DIR = process.env.DATA_DIR || "/data";
const VIDEOS_DIR = path.join(DATA_DIR, "videos");
const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");

[VIDEOS_DIR, THUMBNAILS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      // Ignore if can't create (might not have /data locally)
    }
  }
});

let cloudflareUrl = null;

const durationCache = new Map();

async function fileExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function getVideoDuration(filePath) {
  try {
    const stats = await fsp.stat(filePath);
    const cacheKey = `${filePath}:${stats.mtimeMs}`;
    if (durationCache.has(cacheKey)) {
      return durationCache.get(cacheKey);
    }

    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { timeout: 10000 });

    const seconds = parseFloat(stdout.trim());
    if (isNaN(seconds)) {
      durationCache.set(cacheKey, null);
      return null;
    }

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    let duration;
    if (hrs > 0) {
      duration = `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      duration = `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    durationCache.set(cacheKey, duration);
    return duration;
  } catch (e) {
    return null;
  }
}

function isPathSafe(targetPath) {
  const resolvedData = path.resolve(DATA_DIR);
  const resolved = path.resolve(DATA_DIR, targetPath);
  return resolved === resolvedData || resolved.startsWith(resolvedData + path.sep);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

app.get("/api/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString(), cloudflareUrl };
});

app.post("/api/cf-url", async (request, reply) => {
  const { url } = request.body || {};
  if (!url || !url.includes("trycloudflare.com")) {
    return reply.status(400).send({ error: "Invalid Cloudflare URL" });
  }
  cloudflareUrl = url.trim();
  console.log("Cloudflare URL set:", cloudflareUrl);
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

app.get("/cf", async (request, reply) => {
  if (!cloudflareUrl) {
    return reply.status(404).send({ error: "Cloudflare URL not set. Tunnel not running?" });
  }
  return reply.redirect(cloudflareUrl);
});

app.get("/api/videos", async () => {
  const videos = [];

  try {
    if (await fileExists(VIDEOS_DIR)) {
      const files = await fsp.readdir(VIDEOS_DIR);
      const videoExtensions = [".mp4", ".mkv", ".avi", ".webm", ".mov"];

      const entries = [];
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (videoExtensions.includes(ext)) {
          const filePath = path.join(VIDEOS_DIR, file);
          const stats = await fsp.stat(filePath);
          entries.push({ file, ext, filePath, stats });
        }
      }

      const durations = await Promise.all(
        entries.map((e) => getVideoDuration(e.filePath))
      );

      for (let i = 0; i < entries.length; i++) {
        const { file, ext, stats } = entries[i];
        videos.push({
          id: toBase64Url(file),
          title: path.basename(file, ext),
          filename: file,
          size: formatBytes(stats.size),
          sizeBytes: stats.size,
          createdAt: stats.birthtime,
          thumbnail: null,
          duration: durations[i],
        });
      }
    }
  } catch (e) {
    console.error("Error reading videos:", e);
  }

  videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { videos, total: videos.length };
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

  return {
    id,
    title: path.basename(filename, ext),
    filename,
    size: formatBytes(stats.size),
    sizeBytes: stats.size,
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
    duration: await getVideoDuration(filePath),
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

  const newFilename = sanitizedName + ext;
  const newPath = path.join(VIDEOS_DIR, newFilename);

  if ((await fileExists(newPath)) && newPath !== oldPath) {
    return reply.status(409).send({ error: "A file with that name already exists" });
  }

  try {
    await fsp.rename(oldPath, newPath);
    const newId = toBase64Url(newFilename);
    return { success: true, id: newId, filename: newFilename };
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
    return { success: true };
  } catch (e) {
    console.error("Error deleting video:", e);
    return reply.status(500).send({ error: "Failed to delete video" });
  }
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

  const mimeTypes = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
  };

  const contentType = mimeTypes[ext] || "video/mp4";
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
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
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

  if (!isPathSafe(subPath)) {
    return reply.status(403).send({ error: "Access denied" });
  }

  const targetDir = path.resolve(DATA_DIR, subPath);

  if (!(await fileExists(targetDir))) {
    return reply.status(404).send({ error: "Directory not found" });
  }

  try {
    const entries = await fsp.readdir(targetDir, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
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
      })
    );

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

  if (!isPathSafe(oldPath) || !isPathSafe(newPath)) {
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

  if (!isPathSafe(targetPath)) {
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

app.get("/ws/terminal", { websocket: true }, (socket, req) => {
  const shell = process.env.SHELL || "/bin/bash";
  const cwd = fs.existsSync(DATA_DIR) ? DATA_DIR : process.cwd();

  let proc = null;
  let isAlive = true;

  const send = (type, data = {}) => {
    if (isAlive && socket.readyState === 1) {
      try {
        socket.send(JSON.stringify({ type, ...data }));
      } catch (e) {
        // Ignore send errors
      }
    }
  };

  const cleanup = () => {
    isAlive = false;
    if (proc) {
      try {
        proc.kill();
        proc.terminal?.close();
      } catch (e) {
        // Already dead
      }
      proc = null;
    }
  };

  try {
    proc = Bun.spawn([shell], {
      cwd: cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        LANG: process.env.LANG || "en_US.UTF-8",
      },
      terminal: {
        cols: 80,
        rows: 24,
        data(terminal, data) {
          send("output", { data: typeof data === "string" ? data : new TextDecoder().decode(data) });
        },
      },
    });
  } catch (e) {
    send("error", { message: "Failed to spawn shell: " + e.message });
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
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case "input":
          if (typeof msg.data === "string") {
            proc.terminal.write(msg.data);
          }
          break;

        case "resize":
          const cols = Math.max(1, Math.min(500, parseInt(msg.cols) || 80));
          const rows = Math.max(1, Math.min(200, parseInt(msg.rows) || 24));
          try {
            proc.terminal.resize(cols, rows);
          } catch (e) {
            // Ignore resize errors
          }
          break;

        case "ping":
          send("pong");
          break;
      }
    } catch (e) {
      // Ignore parse errors
    }
  });

  socket.on("close", cleanup);
  socket.on("error", cleanup);
});

app.get("/terminal", async (request, reply) => {
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
    await app.listen({ port: 3000, host: "0.0.0.0" });
    console.log("Server running at http://localhost:3000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
