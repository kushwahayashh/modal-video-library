import path from "path";
import { promises as fsp } from "fs";

export function createThumbMapStore(dataDir) {
  const mapPath = path.join(dataDir, "thumbnail-map.json");
  let opQueue = Promise.resolve();

  function queueOp(op) {
    const next = opQueue.then(op, op);
    opQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function writeThumbMapAtomic(map) {
    const dir = path.dirname(mapPath);
    const tempPath = path.join(
      dir,
      `.thumbnail-map.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
    );

    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(tempPath, JSON.stringify(map, null, 2), "utf-8");
    await fsp.rename(tempPath, mapPath);
  }

  async function readThumbMapRaw() {
    try {
      const raw = await fsp.readFile(mapPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch {
      return {};
    }
  }

  async function readThumbMap() {
    return queueOp(async () => readThumbMapRaw());
  }

  async function writeThumbMap(map) {
    await queueOp(async () => {
      await writeThumbMapAtomic(map);
    });
  }

  async function updateThumbMap(mutator) {
    return queueOp(async () => {
      const current = await readThumbMapRaw();
      const next = await mutator({ ...current });
      const normalized =
        next && typeof next === "object" && !Array.isArray(next) ? next : current;
      await writeThumbMapAtomic(normalized);
      return normalized;
    });
  }

  return { mapPath, readThumbMap, writeThumbMap, updateThumbMap };
}
