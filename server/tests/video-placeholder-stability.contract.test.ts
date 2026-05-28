import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

const originalDataDir = process.env.DATA_DIR;
const originalAutoListen = process.env.NO_AUTO_LISTEN;
const originalPlaceholdersDir = process.env.PLACEHOLDERS_DIR;

const dataDir = await mkdtemp(path.join(os.tmpdir(), "videolib-placeholder-stability-data-"));
const placeholdersDir = await mkdtemp(path.join(os.tmpdir(), "videolib-placeholder-stability-images-"));
process.env.DATA_DIR = dataDir;
process.env.NO_AUTO_LISTEN = "1";
process.env.PLACEHOLDERS_DIR = placeholdersDir;

const { app } = await import(`../src/index.js?test=${Date.now()}-placeholder-stability`);
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

function videosToThumbMap(videos) {
  return Object.fromEntries(videos.map((video) => [video.id, video.thumbnail]));
}

test("existing videos keep their assigned thumbnail when new placeholder images are added", async () => {
  const videosDir = path.join(dataDir, "videos");
  await mkdir(videosDir, { recursive: true });

  await writeFile(path.join(placeholdersDir, "alpha.jpg"), "alpha");
  await writeFile(path.join(placeholdersDir, "beta.jpg"), "beta");

  await writeFile(path.join(videosDir, "one.mp4"), "video-one");
  await writeFile(path.join(videosDir, "two.mp4"), "video-two");

  const oneId = toVideoId("one.mp4");
  const twoId = toVideoId("two.mp4");
  const threeId = toVideoId("three.mp4");

  const firstRes = await app.inject({ method: "GET", url: "/api/videos" });
  assert.equal(firstRes.statusCode, 200);
  const firstPayload = firstRes.json();
  const firstThumbById = videosToThumbMap(firstPayload.videos || []);
  assert.equal(typeof firstThumbById[oneId], "string");
  assert.equal(typeof firstThumbById[twoId], "string");

  await writeFile(path.join(placeholdersDir, "gamma.jpg"), "gamma");

  const secondRes = await app.inject({ method: "GET", url: "/api/videos" });
  assert.equal(secondRes.statusCode, 200);
  const secondPayload = secondRes.json();
  const secondThumbById = videosToThumbMap(secondPayload.videos || []);
  assert.equal(secondThumbById[oneId], firstThumbById[oneId]);
  assert.equal(secondThumbById[twoId], firstThumbById[twoId]);

  await writeFile(path.join(videosDir, "three.mp4"), "video-three");

  const thirdRes = await app.inject({ method: "GET", url: "/api/videos" });
  assert.equal(thirdRes.statusCode, 200);
  const thirdPayload = thirdRes.json();
  const thirdThumbById = videosToThumbMap(thirdPayload.videos || []);
  assert.equal(thirdThumbById[oneId], firstThumbById[oneId]);
  assert.equal(thirdThumbById[twoId], firstThumbById[twoId]);
  assert.equal(typeof thirdThumbById[threeId], "string");

  const thumbMapRes = await app.inject({ method: "GET", url: "/api/thumbnail-map" });
  assert.equal(thumbMapRes.statusCode, 200);
  const persistedThumbMap = thumbMapRes.json();
  assert.equal(persistedThumbMap[oneId], firstThumbById[oneId]);
  assert.equal(persistedThumbMap[twoId], firstThumbById[twoId]);
  assert.equal(persistedThumbMap[threeId], thirdThumbById[threeId]);
});
