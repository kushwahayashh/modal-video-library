import path from "path";
import fs from "fs";
import { fromBase64Url } from "../lib/video-utils.js";
import { fileExists } from "../lib/files.js";

export function registerSpriteRoutes(app, deps) {
  const { VIDEOS_DIR, SPRITES_DIR, spriteJobs, runSpriteGeneration, isJobRunning } = deps;

  app.post("/api/videos/:id/sprites", async (request, reply) => {
    const { id } = request.params;
    const filename = fromBase64Url(id);
    const filePath = path.join(VIDEOS_DIR, filename);

    if (!(await fileExists(filePath))) {
      return reply.status(404).send({ error: "Video not found" });
    }

    if (isJobRunning(spriteJobs.get(id))) {
      return reply.status(409).send({ error: "Sprite generation already in progress" });
    }

    runSpriteGeneration(id, filename, filePath);
    return { success: true, message: "Sprite generation started" };
  });

  app.get("/api/sprites/progress", async () => {
    return { jobs: Array.from(spriteJobs.values(), (job) => ({ ...job })) };
  });

  app.get("/api/sprites/:id/image", async (request, reply) => {
    const { id } = request.params;
    const spritePath = path.join(SPRITES_DIR, id, "sprite.jpg");

    if (!(await fileExists(spritePath))) {
      return reply.status(404).send({ error: "Sprite not found" });
    }

    return reply.type("image/jpeg").send(fs.createReadStream(spritePath));
  });

  app.get("/api/sprites/:id/vtt", async (request, reply) => {
    const { id } = request.params;
    const vttPath = path.join(SPRITES_DIR, id, "sprite.vtt");

    if (!(await fileExists(vttPath))) {
      return reply.status(404).send({ error: "Sprite VTT not found" });
    }

    return reply.type("text/vtt").send(fs.createReadStream(vttPath));
  });

  app.get("/api/sprites/:id/status", async (request) => {
    const { id } = request.params;
    const spriteDir = path.join(SPRITES_DIR, id);
    const exists =
      (await fileExists(path.join(spriteDir, "sprite.jpg"))) &&
      (await fileExists(path.join(spriteDir, "sprite.vtt")));

    return { exists };
  });
}
