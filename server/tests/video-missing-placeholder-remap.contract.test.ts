import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

const originalDataDir = process.env.DATA_DIR;
const originalAutoListen = process.env.NO_AUTO_LISTEN;
const originalPlaceholdersDir = process.env.PLACEHOLDERS_DIR;

const dataDir = await mkdtemp(path.join(os.tmpdir(), "videolib-missing-placeholder-data-"));
const placeholdersDir = await mkdtemp(path.join(os.tmpdir(), "videolib-missing-placeholder-images-"));
process.env.DATA_DIR = dataDir;
process.env.NO_AUTO_LISTEN = "1";
process.env.PLACEHOLDERS_DIR = placeholdersDir;

const { app } = await import(`../src/index.js?test=${Date.now()}-missing-placeholder-remap`);
await app.ready();

after(async () => {
  await app.close();
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;

  if (originalAutoListen === undefined) delete process.env.NO_AUTO_LISTEN;
  else process.env.NO_AUTO_LISTEN = originalAutoListen;

  if (originalPlaceholdersDir === undefined) delete process.env.PLACEHOLDERS_DIR;
  else process.env.PLACEHOLDERS_DIR = originalPlaceholdersDir;

  await rm(dataDir, { recursive: true, force: true });
  await rm(placeholdersDir, { recursive: true, force: true });
});

function toVideoId(filename) {
  return Buffer.from(filename).toString("base64url");
}

test("videos endpoint repairs stale placeholder mapping when image file no longer exists", async () => {
  const videosDir = path.join(dataDir, "videos");
  await mkdir(videosDir, { recursive: true });

  await writeFile(path.join(placeholdersDir, "live-a.jpg"), "a");
  await writeFile(path.join(placeholdersDir, "live-b.jpg"), "b");

  const filename = "stale.mp4";
  const videoId = toVideoId(filename);
  const staleThumbnail = "/api/placeholder-images/missing.jpg";

  await writeFile(path.join(videosDir, filename), "video-bytes");
  await writeFile(
    path.join(dataDir, "thumbnail-map.json"),
    JSON.stringify({ [videoId]: staleThumbnail })
  );

  const placeholdersRes = await app.inject({
    method: "GET",
    url: "/api/placeholder-images",
  });
  assert.equal(placeholdersRes.statusCode, 200);
  const placeholderPayload = placeholdersRes.json();
  const availableImages = new Set(placeholderPayload.images || []);
  assert.equal(availableImages.size > 0, true);
  assert.equal(availableImages.has(staleThumbnail), false);

  const videosRes = await app.inject({ method: "GET", url: "/api/videos" });
  assert.equal(videosRes.statusCode, 200);
  const videosPayload = videosRes.json();
  const video = (videosPayload.videos || []).find((item) => item.id === videoId);

  assert.ok(video, "expected video to be present in /api/videos response");
  assert.equal(video.thumbnail === staleThumbnail, false);
  assert.equal(availableImages.has(video.thumbnail), true);

  const persistedThumbMap = JSON.parse(
    await readFile(path.join(dataDir, "thumbnail-map.json"), "utf-8")
  );
  assert.equal(persistedThumbMap[videoId], video.thumbnail);
});
