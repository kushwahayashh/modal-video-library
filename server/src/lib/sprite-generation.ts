import os from "os";
import path from "path";
import { promises as fsp } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

export function createSpriteService({ spritesDir, fileExists }) {
  const spriteJobs = new Map();

  async function runSpriteGeneration(id, filename, filePath) {
    const ext = path.extname(filename);
    const title = path.basename(filename, ext);
    const abortController = new AbortController();
    const job = { videoId: id, title, status: "extracting", current: 0, total: 0, error: null, abortController };
    spriteJobs.set(id, job);
    const startTime = Date.now();

    console.log(`  sprites: "${title}" — extracting frames...`);

    let progressInterval = null;

    try {
      const spriteDir = path.join(spritesDir, id);
      const tempDir = path.join(spriteDir, "temp");

      if (await fileExists(spriteDir)) {
        await fsp.rm(spriteDir, { recursive: true });
      }

      await fsp.mkdir(tempDir, { recursive: true });

      const { stdout: durationOut } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ]);

      const durationSecs = parseFloat(durationOut.trim());
      if (isNaN(durationSecs)) {
        job.status = "error";
        job.error = "Could not determine video duration";
        return;
      }

      const interval = durationSecs < 60 ? 1 : durationSecs < 600 ? 2 : durationSecs < 3600 ? 5 : 10;
      job.total = Math.ceil(durationSecs / interval);

      const workerCount = Math.min(Math.max(Math.floor(os.cpus().length / 2), 2), 8);
      const segmentDuration = durationSecs / workerCount;

      const segments = [];
      for (let w = 0; w < workerCount; w++) {
        const segStart = w * segmentDuration;
        const segEnd = Math.min((w + 1) * segmentDuration, durationSecs);
        if (Math.ceil(segEnd / interval) - 1 < Math.floor(segStart / interval)) continue;
        const segDir = path.join(tempDir, `seg_${w}`);
        segments.push({ segStart, segEnd, segDir });
      }

      await Promise.all(segments.map((segment) => fsp.mkdir(segment.segDir, { recursive: true })));

      const workerTasks = segments.map((segment) =>
        execFileAsync("ffmpeg", [
          "-ss", String(segment.segStart),
          "-i", filePath,
          "-t", String(segment.segEnd - segment.segStart),
          "-vf", `fps=1/${interval},scale=480:270`,
          "-q:v", "2",
          path.join(segment.segDir, "frame_%04d.jpg"),
        ], { signal: abortController.signal })
      );

      progressInterval = setInterval(async () => {
        if (!spriteJobs.has(id)) {
          clearInterval(progressInterval);
          abortController.abort();
          return;
        }
        try {
          let count = 0;
          for (const segment of segments) {
            try {
              const files = await fsp.readdir(segment.segDir);
              count += files.filter((file) => file.endsWith(".jpg")).length;
            } catch {}
          }
          job.current = count;
        } catch {}
      }, 500);

      await Promise.all(workerTasks);

      clearInterval(progressInterval);
      progressInterval = null;

      let globalIndex = 1;
      for (const segment of segments) {
        const segmentFrames = (await fsp.readdir(segment.segDir))
          .filter((file) => file.endsWith(".jpg"))
          .sort();
        for (const frame of segmentFrames) {
          const dest = path.join(tempDir, `frame_${String(globalIndex).padStart(4, "0")}.jpg`);
          await fsp.rename(path.join(segment.segDir, frame), dest);
          globalIndex++;
        }
        await fsp.rm(segment.segDir, { recursive: true });
      }

      const frames = (await fsp.readdir(tempDir)).filter((file) => file.startsWith("frame_") && file.endsWith(".jpg"));
      const frameCount = frames.length;
      job.current = frameCount;
      job.total = frameCount;

      if (frameCount === 0) {
        await fsp.rm(spriteDir, { recursive: true });
        job.status = "error";
        job.error = "No frames extracted";
        return;
      }

      job.status = "tiling";
      console.log(`  sprites: "${title}" — ${frameCount} frames, tiling...`);

      const cols = 10;
      const rows = Math.ceil(frameCount / cols);

      if (!spriteJobs.has(id)) throw new Error("Job cancelled");

      await execFileAsync("ffmpeg", [
        "-i", path.join(tempDir, "frame_%04d.jpg"),
        "-filter_complex", `tile=${cols}x${rows}:padding=0`,
        "-q:v", "2",
        path.join(spriteDir, "sprite.jpg"),
      ], { signal: abortController.signal });

      let vtt = "WEBVTT\n\n";
      for (let i = 1; i <= frameCount; i++) {
        const startTime = (i - 1) * interval;
        if (startTime >= durationSecs) break;
        const endTime = Math.min(i * interval, durationSecs);
        const x = ((i - 1) % cols) * 480;
        const y = Math.floor((i - 1) / cols) * 270;

        vtt += `${i}\n`;
        vtt += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
        vtt += `/api/sprites/${id}/image#xywh=${x},${y},480,270\n\n`;
      }

      await fsp.writeFile(path.join(spriteDir, "sprite.vtt"), vtt);
      await fsp.rm(tempDir, { recursive: true });

      job.status = "done";
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  sprites: "${title}" — done in ${elapsed}s`);
    } catch (e) {
      console.error(`  sprites: "${title}" — failed: ${e.message}`);
      if (e?.stderr) {
        console.error(`  sprites: "${title}" — stderr:\n${e.stderr.toString()}`);
      }
      if (e?.stdout) {
        console.error(`  sprites: "${title}" — stdout:\n${e.stdout.toString()}`);
      }
      job.status = "error";
      job.error = e.name === "AbortError" ? "Job cancelled" : "Failed to generate sprites";
      if (e.name === "AbortError") {
         try { await fsp.rm(path.join(spritesDir, id), { recursive: true, force: true }); } catch {}
      }
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      if (job.status !== "error" || job.error !== "Job cancelled") {
        setTimeout(() => spriteJobs.delete(id), 10000);
      }
    }
  }

  function cancelJob(id) {
    const job = spriteJobs.get(id);
    if (job && job.abortController) {
      job.abortController.abort();
    }
    spriteJobs.delete(id);
  }

  function isJobRunning(job) {
    return !!job && (job.status === "extracting" || job.status === "tiling");
  }

  return { spriteJobs, runSpriteGeneration, isJobRunning, cancelJob };
}
