import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createJsonMapStore } from "../src/lib/json-map-store.js";

test("video-added-map store serializes concurrent updates", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "video-added-map-store-"));
  try {
    const { update: updateVideoAddedMap, read: readVideoAddedMap } = createJsonMapStore(dataDir, "video-added-map.json");

    await Promise.all([
      updateVideoAddedMap((map) => ({ ...map, a: "2026-02-01T10:00:00.000Z" })),
      updateVideoAddedMap((map) => ({ ...map, b: "2026-02-02T10:00:00.000Z" })),
      updateVideoAddedMap((map) => ({ ...map, c: "2026-02-03T10:00:00.000Z" })),
    ]);

    const map = await readVideoAddedMap();
    assert.deepEqual(map, {
      a: "2026-02-01T10:00:00.000Z",
      b: "2026-02-02T10:00:00.000Z",
      c: "2026-02-03T10:00:00.000Z",
    });

    const persisted = JSON.parse(await readFile(path.join(dataDir, "video-added-map.json"), "utf-8"));
    assert.deepEqual(persisted, map);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
