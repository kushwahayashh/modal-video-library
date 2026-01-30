import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import pty from "node-pty";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Enable CORS for development
await app.register(cors, { origin: true });

// Register WebSocket plugin
await app.register(websocket);

// Serve static client build in production
const clientBuildPath = path.join(__dirname, "../../client/dist");
try {
  await app.register(fastifyStatic, {
    root: clientBuildPath,
    prefix: "/",
  });
} catch (e) {
  // Client not built yet, that's fine for dev
}

// Data directory (Modal volume or local)
const DATA_DIR = process.env.DATA_DIR || "/data";
const VIDEOS_DIR = path.join(DATA_DIR, "videos");
const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");

// Ensure directories exist
[VIDEOS_DIR, THUMBNAILS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      // Ignore if can't create (might not have /data locally)
    }
  }
});

// Health check
app.get("/api/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Get all videos
app.get("/api/videos", async () => {
  const videos = [];

  try {
    if (fs.existsSync(VIDEOS_DIR)) {
      const files = fs.readdirSync(VIDEOS_DIR);
      const videoExtensions = [".mp4", ".mkv", ".avi", ".webm", ".mov"];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (videoExtensions.includes(ext)) {
          const filePath = path.join(VIDEOS_DIR, file);
          const stats = fs.statSync(filePath);

          videos.push({
            id: Buffer.from(file).toString("base64"),
            title: path.basename(file, ext),
            filename: file,
            size: formatBytes(stats.size),
            sizeBytes: stats.size,
            createdAt: stats.birthtime,
            thumbnail: null,
            duration: getVideoDuration(filePath),
          });
        }
      }
    }
  } catch (e) {
    console.error("Error reading videos:", e);
  }

  // Sort by newest first
  videos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { videos, total: videos.length };
});

// Get single video info
app.get("/api/videos/:id", async (request, reply) => {
  const { id } = request.params;
  const filename = Buffer.from(id, "base64").toString("utf-8");
  const filePath = path.join(VIDEOS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return reply.status(404).send({ error: "Video not found" });
  }

  const stats = fs.statSync(filePath);
  const ext = path.extname(filename);

  return {
    id,
    title: path.basename(filename, ext),
    filename,
    size: formatBytes(stats.size),
    sizeBytes: stats.size,
    createdAt: stats.birthtime,
  };
});

// Stream video
app.get("/api/stream/:id", async (request, reply) => {
  const { id } = request.params;
  const filename = Buffer.from(id, "base64").toString("utf-8");
  const filePath = path.join(VIDEOS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return reply.status(404).send({ error: "Video not found" });
  }

  const stats = fs.statSync(filePath);
  const ext = path.extname(filename).toLowerCase();

  const mimeTypes = {
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
  };

  const contentType = mimeTypes[ext] || "video/mp4";

  // Handle range requests for video seeking
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

// Helper functions
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getVideoDuration(filePath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf-8", timeout: 10000 }
    );
    const seconds = parseFloat(result.trim());
    if (isNaN(seconds)) return null;

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  } catch (e) {
    return null;
  }
}

// File manager helper - check path is within DATA_DIR
function isPathSafe(targetPath) {
  const resolved = path.resolve(DATA_DIR, targetPath);
  return resolved.startsWith(path.resolve(DATA_DIR));
}

// List files and folders
app.get("/api/files", async (request, reply) => {
  const subPath = request.query.path || "";

  if (!isPathSafe(subPath)) {
    return reply.status(403).send({ error: "Access denied" });
  }

  const targetDir = path.resolve(DATA_DIR, subPath);

  if (!fs.existsSync(targetDir)) {
    return reply.status(404).send({ error: "Directory not found" });
  }

  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    const items = entries.map((entry) => {
      const fullPath = path.join(targetDir, entry.name);
      const stats = fs.statSync(fullPath);
      const relativePath = path.relative(DATA_DIR, fullPath);
      return {
        name: entry.name,
        path: relativePath,
        size: entry.isDirectory() ? 0 : stats.size,
        isFolder: entry.isDirectory(),
        modified: stats.mtime,
      };
    });

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

// Rename file or folder
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

  if (!fs.existsSync(oldFullPath)) {
    return reply.status(404).send({ error: "File or folder not found" });
  }

  try {
    fs.renameSync(oldFullPath, newFullPath);
    return { success: true };
  } catch (e) {
    console.error("Error renaming:", e);
    return reply.status(500).send({ error: "Failed to rename" });
  }
});

// Delete file or folder
app.delete("/api/files/:path", async (request, reply) => {
  const targetPath = request.params.path;

  if (!isPathSafe(targetPath)) {
    return reply.status(403).send({ error: "Access denied" });
  }

  const fullPath = path.resolve(DATA_DIR, targetPath);

  if (!fs.existsSync(fullPath)) {
    return reply.status(404).send({ error: "File or folder not found" });
  }

  try {
    fs.rmSync(fullPath, { recursive: true });
    return { success: true };
  } catch (e) {
    console.error("Error deleting:", e);
    return reply.status(500).send({ error: "Failed to delete" });
  }
});

// WebSocket terminal handler
app.get("/ws/terminal", { websocket: true }, (socket, req) => {
  const shell = process.env.SHELL || "/bin/bash";
  const cwd = fs.existsSync(DATA_DIR) ? DATA_DIR : process.cwd();

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: cwd,
    env: { ...process.env, TERM: "xterm-256color" },
  });

  ptyProcess.onData((data) => {
    try {
      socket.send(JSON.stringify({ type: "output", data }));
    } catch (e) {
      // Socket closed
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    try {
      socket.send(JSON.stringify({ type: "exit", code: exitCode }));
      socket.close();
    } catch (e) {
      // Socket already closed
    }
  });

  socket.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());
      switch (msg.type) {
        case "input":
          ptyProcess.write(msg.data);
          break;
        case "resize":
          const cols = parseInt(msg.cols) || 80;
          const rows = parseInt(msg.rows) || 24;
          ptyProcess.resize(Math.max(1, cols), Math.max(1, rows));
          break;
        case "ping":
          socket.send(JSON.stringify({ type: "pong" }));
          break;
      }
    } catch (e) {
      console.error("Terminal message error:", e);
    }
  });

  socket.on("close", () => {
    ptyProcess.kill();
  });

  socket.on("error", (err) => {
    console.error("Terminal socket error:", err);
    ptyProcess.kill();
  });
});

// Terminal HTML page
app.get("/terminal", async (request, reply) => {
  const terminalHtml = path.join(__dirname, "terminal.html");
  return reply.type("text/html").send(fs.readFileSync(terminalHtml, "utf-8"));
});

// File Manager - served by React app (SPA fallback)
app.get("/manager", async (request, reply) => {
  const indexHtml = path.join(clientBuildPath, "index.html");
  if (fs.existsSync(indexHtml)) {
    return reply.type("text/html").send(fs.readFileSync(indexHtml, "utf-8"));
  }
  return reply.redirect("/");
});

// Start server
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
