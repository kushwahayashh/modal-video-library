import path from "path";
import { promises as fsp } from "fs";

export async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isPathSafe(dataDir, targetPath) {
  const resolvedData = path.resolve(dataDir);
  const resolved = path.resolve(dataDir, targetPath);
  return resolved === resolvedData || resolved.startsWith(resolvedData + path.sep);
}

export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
