import path from "path";
import { promises as fsp } from "fs";
import { fileURLToPath } from "url";
import { fileExists, formatBytes } from "../lib/files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function safePath(base, relativePath) {
  const cleaned = (relativePath || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== ".." && seg !== ".")
    .join("/");
  const resolved = path.resolve(base, cleaned);
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

function relativeDisplay(base, fullPath) {
  const rel = path.relative(base, fullPath);
  return rel ? "/" + rel.split(path.sep).join("/") : "/";
}

export function registerFileRoutes(app, { DATA_DIR }) {
  const ROOT = DATA_DIR;

  // List directory contents
  app.get("/api/files", async (request, reply) => {
    const queryPath = (request.query?.path || "/").replace(/^\/+/, "");
    const dirPath = queryPath ? safePath(ROOT, queryPath) : ROOT;
    if (!dirPath) return reply.status(400).send({ error: "Invalid path" });

    if (!(await fileExists(dirPath))) {
      return reply.status(404).send({ error: "Directory not found" });
    }

    let stat;
    try {
      stat = await fsp.stat(dirPath);
    } catch {
      return reply.status(404).send({ error: "Path not found" });
    }

    if (!stat.isDirectory()) {
      return reply.status(400).send({ error: "Path is not a directory" });
    }

    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      // Skip hidden files
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dirPath, entry.name);
      let entryStat;
      try {
        entryStat = await fsp.stat(fullPath);
      } catch {
        continue;
      }

      const isDir = entry.isDirectory();
      items.push({
        name: entry.name,
        path: relativeDisplay(ROOT, fullPath),
        isDirectory: isDir,
        size: isDir ? null : entryStat.size,
        sizeFormatted: isDir ? "—" : formatBytes(entryStat.size),
        modifiedAt: entryStat.mtime.toISOString(),
      });
    }

    // Sort: folders first, then alphabetical
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    const currentPath = relativeDisplay(ROOT, dirPath);
    const parentPath =
      currentPath === "/"
        ? null
        : relativeDisplay(ROOT, path.dirname(dirPath));

    return {
      path: currentPath,
      parentPath,
      items,
    };
  });

  // Create folder
  app.post("/api/files/mkdir", async (request, reply) => {
    const { path: dirPath, name } = request.body || {};

    if (!name || typeof name !== "string") {
      return reply.status(400).send({ error: "Folder name is required" });
    }

    const sanitized = name.replace(/[<>:"/\\|?*]/g, "").trim();
    if (!sanitized) {
      return reply.status(400).send({ error: "Invalid folder name" });
    }

    const basePath = (dirPath || "/").replace(/^\/+/, "");
    const parentDir = basePath ? safePath(ROOT, basePath) : ROOT;
    if (!parentDir) return reply.status(400).send({ error: "Invalid path" });

    const newDir = path.join(parentDir, sanitized);
    if (!newDir.startsWith(ROOT)) {
      return reply.status(400).send({ error: "Invalid path" });
    }

    if (await fileExists(newDir)) {
      return reply.status(409).send({ error: "A folder with that name already exists" });
    }

    try {
      await fsp.mkdir(newDir, { recursive: true });
      return { success: true, path: relativeDisplay(ROOT, newDir) };
    } catch (e) {
      console.error("Error creating folder:", e);
      return reply.status(500).send({ error: "Failed to create folder" });
    }
  });

  // Rename file or folder
  app.post("/api/files/rename", async (request, reply) => {
    const { path: itemPath, newName } = request.body || {};

    if (!itemPath || typeof itemPath !== "string") {
      return reply.status(400).send({ error: "Path is required" });
    }
    if (!newName || typeof newName !== "string") {
      return reply.status(400).send({ error: "New name is required" });
    }

    const sanitized = newName.replace(/[<>:"/\\|?*]/g, "").trim();
    if (!sanitized) {
      return reply.status(400).send({ error: "Invalid name" });
    }

    const cleanPath = itemPath.replace(/^\/+/, "");
    const oldFullPath = cleanPath ? safePath(ROOT, cleanPath) : null;
    if (!oldFullPath) return reply.status(400).send({ error: "Invalid path" });

    if (!(await fileExists(oldFullPath))) {
      return reply.status(404).send({ error: "File or folder not found" });
    }

    const parentDir = path.dirname(oldFullPath);
    const newFullPath = path.join(parentDir, sanitized);

    if (!newFullPath.startsWith(ROOT)) {
      return reply.status(400).send({ error: "Invalid name" });
    }

    if (newFullPath !== oldFullPath && (await fileExists(newFullPath))) {
      return reply.status(409).send({ error: "An item with that name already exists" });
    }

    try {
      await fsp.rename(oldFullPath, newFullPath);
      return {
        success: true,
        path: relativeDisplay(ROOT, newFullPath),
        name: sanitized,
      };
    } catch (e) {
      console.error("Error renaming:", e);
      return reply.status(500).send({ error: "Failed to rename" });
    }
  });

  // Delete file or folder
  app.delete("/api/files", async (request, reply) => {
    const { path: itemPath } = request.body || {};

    if (!itemPath || typeof itemPath !== "string") {
      return reply.status(400).send({ error: "Path is required" });
    }

    const cleanPath = itemPath.replace(/^\/+/, "");
    const fullPath = cleanPath ? safePath(ROOT, cleanPath) : null;

    // Prevent deleting root
    if (!fullPath || fullPath === ROOT) {
      return reply.status(400).send({ error: "Cannot delete root directory" });
    }

    if (!(await fileExists(fullPath))) {
      return reply.status(404).send({ error: "File or folder not found" });
    }

    try {
      const stat = await fsp.stat(fullPath);
      if (stat.isDirectory()) {
        await fsp.rm(fullPath, { recursive: true, force: true });
      } else {
        await fsp.unlink(fullPath);
      }
      return { success: true };
    } catch (e) {
      console.error("Error deleting:", e);
      return reply.status(500).send({ error: "Failed to delete" });
    }
  });

  // Download a file
  app.get("/api/files/download", async (request, reply) => {
    const queryPath = (request.query?.path || "").replace(/^\/+/, "");
    if (!queryPath) return reply.status(400).send({ error: "Path is required" });

    const fullPath = safePath(ROOT, queryPath);
    if (!fullPath) return reply.status(400).send({ error: "Invalid path" });

    if (!(await fileExists(fullPath))) {
      return reply.status(404).send({ error: "File not found" });
    }

    let stat;
    try {
      stat = await fsp.stat(fullPath);
    } catch {
      return reply.status(404).send({ error: "File not found" });
    }

    if (stat.isDirectory()) {
      return reply.status(400).send({ error: "Cannot download a directory" });
    }

    const fileName = path.basename(fullPath);
    const stream = (await import("fs")).createReadStream(fullPath);
    return reply
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .header("Content-Length", stat.size)
      .type("application/octet-stream")
      .send(stream);
  });

  // Get file/folder info
  app.get("/api/files/info", async (request, reply) => {
    const queryPath = (request.query?.path || "").replace(/^\/+/, "");
    if (!queryPath) return reply.status(400).send({ error: "Path is required" });

    const fullPath = safePath(ROOT, queryPath);
    if (!fullPath) return reply.status(400).send({ error: "Invalid path" });

    if (!(await fileExists(fullPath))) {
      return reply.status(404).send({ error: "File not found" });
    }

    let stat;
    try {
      stat = await fsp.stat(fullPath);
    } catch {
      return reply.status(404).send({ error: "File not found" });
    }

    const isDir = stat.isDirectory();
    const ext = isDir ? "" : path.extname(fullPath).toLowerCase();

    const info = {
      name: path.basename(fullPath),
      path: relativeDisplay(ROOT, fullPath),
      isDirectory: isDir,
      size: isDir ? null : stat.size,
      sizeFormatted: isDir ? "—" : formatBytes(stat.size),
      extension: ext || "—",
      createdAt: stat.birthtime.toISOString(),
      modifiedAt: stat.mtime.toISOString(),
    };

    if (isDir) {
      try {
        const entries = await fsp.readdir(fullPath);
        info.itemCount = entries.filter((e) => !e.startsWith(".")).length;
      } catch {
        info.itemCount = 0;
      }
    }

    return info;
  });

  // /files is handled by the React SPA
}
