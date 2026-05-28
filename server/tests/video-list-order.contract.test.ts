import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";

const originalDataDir = process.env.DATA_DIR;
const originalAutoListen = process.env.NO_AUTO_LISTEN;

const dataDir = await mkdtemp(path.join(os.tmpdir(), "videolib-video-order-contract-"));
process.env.DATA_DIR = dataDir;
process.env.NO_AUTO_LISTEN = "1";

const { app } = await import(`../src/index.js?test=${Date.now()}-video-order`);
await app.ready();

after(async () => {
  await app.close();
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;

  if (originalAutoListen === undefined) delete process.env.NO_AUTO_LISTEN;
  else process.env.NO_AUTO_LISTEN = originalAutoListen;

  await rm(dataDir, { recursive: true, force: true });
});

test("video list is ordered by addedAt descending", async () => {
  const videosDir = path.join(dataDir, "videos");
  await mkdir(videosDir, { recursive: true });

  const oldFilename = "old.mp4";
  const newFilename = "new.mp4";
  const oldId = Buffer.from(oldFilename).toString("base64url");
  const newId = Buffer.from(newFilename).toString("base64url");

  const oldPath = path.join(videosDir, oldFilename);
  const newPath = path.join(videosDir, newFilename);
  await writeFile(oldPath, "video-bytes-old");
  await writeFile(newPath, "video-bytes-new");
  await utimes(oldPath, new Date("2026-02-01T10:00:00.000Z"), new Date("2026-02-01T10:00:00.000Z"));
  await utimes(newPath, new Date("2026-02-02T10:00:00.000Z"), new Date("2026-02-02T10:00:00.000Z"));

  const listRes = await app.inject({
    method: "GET",
    url: "/api/videos",
  });

  assert.equal(listRes.statusCode, 200);
  const payload = listRes.json();
  assert.equal(Array.isArray(payload.videos), true);
  assert.equal(payload.videos.length, 2);
  assert.equal(payload.videos[0].id, newId);
  assert.equal(payload.videos[1].id, oldId);
});
