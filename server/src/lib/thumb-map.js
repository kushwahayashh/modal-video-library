import path from "path";
import { promises as fsp } from "fs";

export function createThumbMapStore(dataDir) {
  const mapPath = path.join(dataDir, "thumbnail-map.json");

  async function readThumbMap() {
    try {
      const raw = await fsp.readFile(mapPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function writeThumbMap(map) {
    await fsp.writeFile(mapPath, JSON.stringify(map));
  }

  return { mapPath, readThumbMap, writeThumbMap };
}
