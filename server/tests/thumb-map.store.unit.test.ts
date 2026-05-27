import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createJsonMapStore } from "../src/lib/json-map-store.js";

test("thumb-map store serializes concurrent updates", async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "thumb-map-store-"));
  try {
    const { update: updateThumbMap, read: readThumbMap } = createJsonMapStore(dataDir, "thumbnail-map.json");

    await Promise.all([
      updateThumbMap((map) => ({ ...map, a: "/img/a.jpg" })),
      updateThumbMap((map) => ({ ...map, b: "/img/b.jpg" })),
      updateThumbMap((map) => ({ ...map, c: "/img/c.jpg" })),
    ]);

    const map = await readThumbMap();
    assert.deepEqual(map, {
      a: "/img/a.jpg",
      b: "/img/b.jpg",
      c: "/img/c.jpg",
    });

    const persisted = JSON.parse(await readFile(path.join(dataDir, "thumbnail-map.json"), "utf-8"));
    assert.deepEqual(persisted, map);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
