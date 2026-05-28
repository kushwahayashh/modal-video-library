import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

const originalDataDir = process.env.DATA_DIR;
const originalAutoListen = process.env.NO_AUTO_LISTEN;

const dataDir = await mkdtemp(path.join(os.tmpdir(), "videolib-thumbnail-map-"));
process.env.DATA_DIR = dataDir;
process.env.NO_AUTO_LISTEN = "1";

const { app } = await import(`../src/index.js?test=${Date.now()}`);
await app.ready();

after(async () => {
  await app.close();
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;

  if (originalAutoListen === undefined) delete process.env.NO_AUTO_LISTEN;
  else process.env.NO_AUTO_LISTEN = originalAutoListen;

  await rm(dataDir, { recursive: true, force: true });
});

test("thumbnail map contract: read empty, write, and read persisted values", async () => {
  const initialRead = await app.inject({
    method: "GET",
    url: "/api/thumbnail-map",
  });

  assert.equal(initialRead.statusCode, 200);
  assert.deepEqual(initialRead.json(), {});

  const invalidWrite = await app.inject({
    method: "POST",
    url: "/api/thumbnail-map",
    payload: { videoId: "video-a" },
  });

  assert.equal(invalidWrite.statusCode, 400);
  assert.deepEqual(invalidWrite.json(), { error: "videoId and imageUrl required" });

  const firstWrite = await app.inject({
    method: "POST",
    url: "/api/thumbnail-map",
    payload: {
      videoId: "video-a",
      imageUrl: "/api/placeholder-images/alpha.jpeg",
    },
  });

  assert.equal(firstWrite.statusCode, 200);
  assert.deepEqual(firstWrite.json(), { success: true });

  const secondWrite = await app.inject({
    method: "POST",
    url: "/api/thumbnail-map",
    payload: {
      videoId: "video-b",
      imageUrl: "/api/placeholder-images/beta.jpeg",
    },
  });

  assert.equal(secondWrite.statusCode, 200);
  assert.deepEqual(secondWrite.json(), { success: true });

  const finalRead = await app.inject({
    method: "GET",
    url: "/api/thumbnail-map",
  });

  assert.equal(finalRead.statusCode, 200);
  assert.deepEqual(finalRead.json(), {
    "video-a": "/api/placeholder-images/alpha.jpeg",
    "video-b": "/api/placeholder-images/beta.jpeg",
  });

});
