import path from "path";
import { promises as fsp } from "fs";

export function createJsonMapStore(dataDir, filename) {
  const mapPath = path.join(dataDir, filename);
  const baseName = path.basename(filename, ".json");
  let opQueue = Promise.resolve();

  function queueOp(op) {
    const next = opQueue.then(op, op);
    opQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function writeAtomic(map) {
    const dir = path.dirname(mapPath);
    const tempPath = path.join(
      dir,
      `.${baseName}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
    );
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(tempPath, JSON.stringify(map, null, 2), "utf-8");
    await fsp.rename(tempPath, mapPath);
  }

  async function readRaw() {
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

  async function read() {
    return queueOp(async () => readRaw());
  }

  async function update(mutator) {
    return queueOp(async () => {
      const current = await readRaw();
      const next = await mutator({ ...current });
      const normalized =
        next && typeof next === "object" && !Array.isArray(next) ? next : current;
      await writeAtomic(normalized);
      return normalized;
    });
  }

  return { mapPath, read, update };
}
