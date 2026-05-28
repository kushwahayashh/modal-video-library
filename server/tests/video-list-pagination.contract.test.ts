import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";

const originalDataDir = process.env.DATA_DIR;
const originalAutoListen = process.env.NO_AUTO_LISTEN;

const dataDir = await mkdtemp(path.join(os.tmpdir(), "videolib-video-pagination-contract-"));
process.env.DATA_DIR = dataDir;
process.env.NO_AUTO_LISTEN = "1";

const { app } = await import(`../src/index.js?test=${Date.now()}-video-pagination`);
await app.ready();

after(async () => {
  await app.close();
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;

  if (originalAutoListen === undefined) delete process.env.NO_AUTO_LISTEN;
  else process.env.NO_AUTO_LISTEN = originalAutoListen;

  await rm(dataDir, { recursive: true, force: true });
});

test("video list supports offset/limit pagination and text filtering", async () => {
  const videosDir = path.join(dataDir, "videos");
  await mkdir(videosDir, { recursive: true });

  const files = ["first.mp4", "second.mp4", "third.mp4"];
  for (const file of files) {
    await writeFile(path.join(videosDir, file), `bytes-${file}`);
  }
  await utimes(path.join(videosDir, "first.mp4"), new Date("2026-02-01T00:00:00.000Z"), new Date("2026-02-01T00:00:00.000Z"));
  await utimes(path.join(videosDir, "second.mp4"), new Date("2026-02-02T00:00:00.000Z"), new Date("2026-02-02T00:00:00.000Z"));
  await utimes(path.join(videosDir, "third.mp4"), new Date("2026-02-03T00:00:00.000Z"), new Date("2026-02-03T00:00:00.000Z"));

  const firstId = Buffer.from("first.mp4").toString("base64url");
  const secondId = Buffer.from("second.mp4").toString("base64url");
  const thirdId = Buffer.from("third.mp4").toString("base64url");

  const firstPageRes = await app.inject({
    method: "GET",
    url: "/api/videos?offset=0&limit=2",
  });
  assert.equal(firstPageRes.statusCode, 200);
  const firstPage = firstPageRes.json();
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.videos.length, 2);
  assert.equal(firstPage.videos[0].id, thirdId);
  assert.equal(firstPage.videos[1].id, secondId);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextOffset, 2);

  const secondPageRes = await app.inject({
    method: "GET",
    url: "/api/videos?offset=2&limit=2",
  });
  assert.equal(secondPageRes.statusCode, 200);
  const secondPage = secondPageRes.json();
  assert.equal(secondPage.total, 3);
  assert.equal(secondPage.videos.length, 1);
  assert.equal(secondPage.videos[0].id, firstId);
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextOffset, null);

  const filteredRes = await app.inject({
    method: "GET",
    url: "/api/videos?q=second&offset=0&limit=5",
  });
  assert.equal(filteredRes.statusCode, 200);
  const filtered = filteredRes.json();
  assert.equal(filtered.total, 1);
  assert.equal(filtered.videos.length, 1);
  assert.equal(filtered.videos[0].id, secondId);
});
