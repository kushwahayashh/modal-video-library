import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

const originalDataDir = process.env.DATA_DIR;
const originalAutoListen = process.env.NO_AUTO_LISTEN;

const dataDir = await mkdtemp(path.join(os.tmpdir(), "videolib-video-contract-"));
process.env.DATA_DIR = dataDir;
process.env.NO_AUTO_LISTEN = "1";

const { app } = await import(`../src/index.js?test=${Date.now()}-rename-delete`);
await app.ready();

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

after(async () => {
  await app.close();
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;

  if (originalAutoListen === undefined) delete process.env.NO_AUTO_LISTEN;
  else process.env.NO_AUTO_LISTEN = originalAutoListen;

  await rm(dataDir, { recursive: true, force: true });
});

test("video rename moves thumbnail-map key and sprite metadata", async () => {
  const videosDir = path.join(dataDir, "videos");
  const spritesDir = path.join(dataDir, "sprites");
  await mkdir(videosDir, { recursive: true });
  await mkdir(spritesDir, { recursive: true });

  const oldFilename = "alpha.mp4";
  const newFilename = "beta.mp4";
  const oldId = Buffer.from(oldFilename).toString("base64url");
  const newId = Buffer.from(newFilename).toString("base64url");

  const oldVideoPath = path.join(videosDir, oldFilename);
  const newVideoPath = path.join(videosDir, newFilename);
  await writeFile(oldVideoPath, "video-bytes");

  const oldSpriteDir = path.join(spritesDir, oldId);
  await mkdir(oldSpriteDir, { recursive: true });
  await writeFile(path.join(oldSpriteDir, "sprite.jpg"), "jpeg-bytes");
  await writeFile(
    path.join(oldSpriteDir, "sprite.vtt"),
    `WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\n/api/sprites/${oldId}/image#xywh=0,0,480,270\n`
  );

  const scanRes = await app.inject({ method: "GET", url: "/api/videos" });
  assert.equal(scanRes.statusCode, 200);
  const initialVideo = (scanRes.json().videos || []).find((video) => video.id === oldId);
  assert.ok(initialVideo, "expected old video to be indexed before rename");

  const thumbWriteRes = await app.inject({
    method: "POST",
    url: "/api/thumbnail-map",
    payload: { videoId: oldId, imageUrl: "/api/placeholder-images/alpha.jpeg" },
  });
  assert.equal(thumbWriteRes.statusCode, 200);

  const renameRes = await app.inject({
    method: "POST",
    url: `/api/videos/${oldId}/rename`,
    payload: { newName: "beta" },
  });

  assert.equal(renameRes.statusCode, 200);
  assert.deepEqual(renameRes.json(), { success: true, id: newId, filename: newFilename });

  assert.equal(await exists(oldVideoPath), false);
  assert.equal(await exists(newVideoPath), true);

  const newSpriteDir = path.join(spritesDir, newId);
  assert.equal(await exists(oldSpriteDir), false);
  assert.equal(await exists(newSpriteDir), true);

  const rewrittenVtt = await readFile(path.join(newSpriteDir, "sprite.vtt"), "utf-8");
  assert.equal(rewrittenVtt.includes(`/api/sprites/${newId}/image`), true);
  assert.equal(rewrittenVtt.includes(`/api/sprites/${oldId}/image`), false);

  const thumbMapRes = await app.inject({ method: "GET", url: "/api/thumbnail-map" });
  assert.equal(thumbMapRes.statusCode, 200);
  const thumbMap = thumbMapRes.json();
  assert.equal(thumbMap[oldId], undefined);
  assert.equal(thumbMap[newId], "/api/placeholder-images/alpha.jpeg");

  const listRes = await app.inject({ method: "GET", url: "/api/videos" });
  assert.equal(listRes.statusCode, 200);
  const renamedVideo = (listRes.json().videos || []).find((video) => video.id === newId);
  assert.equal(renamedVideo?.addedAt, initialVideo.addedAt);
});

test("video delete removes thumbnail-map entry and sprite directory", async () => {
  const videosDir = path.join(dataDir, "videos");
  const spritesDir = path.join(dataDir, "sprites");
  await mkdir(videosDir, { recursive: true });
  await mkdir(spritesDir, { recursive: true });

  const filename = "gamma.mp4";
  const id = Buffer.from(filename).toString("base64url");
  const videoPath = path.join(videosDir, filename);
  const spriteDir = path.join(spritesDir, id);

  await writeFile(videoPath, "video-bytes");
  await mkdir(spriteDir, { recursive: true });
  await writeFile(path.join(spriteDir, "sprite.jpg"), "jpeg-bytes");
  await writeFile(path.join(spriteDir, "sprite.vtt"), "WEBVTT");

  const scanRes = await app.inject({ method: "GET", url: "/api/videos" });
  assert.equal(scanRes.statusCode, 200);
  const thumbWriteRes = await app.inject({
    method: "POST",
    url: "/api/thumbnail-map",
    payload: { videoId: id, imageUrl: "/api/placeholder-images/gamma.jpeg" },
  });
  assert.equal(thumbWriteRes.statusCode, 200);

  const deleteRes = await app.inject({
    method: "DELETE",
    url: `/api/videos/${id}`,
  });

  assert.equal(deleteRes.statusCode, 200);
  assert.deepEqual(deleteRes.json(), { success: true });
  assert.equal(await exists(videoPath), false);
  assert.equal(await exists(spriteDir), false);

  const thumbMapAfterDeleteRes = await app.inject({ method: "GET", url: "/api/thumbnail-map" });
  assert.equal(thumbMapAfterDeleteRes.statusCode, 200);
  const thumbMapAfterDelete = thumbMapAfterDeleteRes.json();
  assert.equal(thumbMapAfterDelete[id], undefined);

  const listRes = await app.inject({ method: "GET", url: "/api/videos" });
  assert.equal(listRes.statusCode, 200);
  assert.equal((listRes.json().videos || []).some((video) => video.id === id), false);
});
