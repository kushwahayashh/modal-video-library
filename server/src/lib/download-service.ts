import path from "path";
import { promises as fsp } from "fs";
import crypto from "crypto";

const MAX_LOG_LINES = 800;

export function createDownloadService({ videosDir }) {
  const jobs = new Map();
  const listeners = new Set<(evt: any) => void>();

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit(evt) {
    for (const fn of listeners) {
      try { fn(evt); } catch { /* ignore */ }
    }
  }

  function serializeJob(job) {
    return {
      id: job.id,
      url: job.url,
      tool: job.tool,
      status: job.status,
      title: job.title,
      filename: job.filename,
      percent: job.percent,
      speed: job.speed,
      eta: job.eta,
      downloadedBytes: job.downloadedBytes,
      totalBytes: job.totalBytes,
      error: job.error,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      exitCode: job.exitCode,
      options: job.options,
    };
  }

  function listJobs() {
    return Array.from(jobs.values()).map(serializeJob);
  }

  function getJob(id) {
    const job = jobs.get(id);
    return job ? serializeJob(job) : null;
  }

  function getLogs(id) {
    const job = jobs.get(id);
    return job ? [...job.logs] : [];
  }

  function pushLog(job, line) {
    if (!line) return;
    const entry = { ts: Date.now(), line };
    job.logs.push(entry);
    if (job.logs.length > MAX_LOG_LINES) {
      job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
    }
    emit({ type: "log", id: job.id, entry });
  }

  function updateJob(job, patch) {
    Object.assign(job, patch);
    emit({ type: "job", job: serializeJob(job) });
  }

  function parseYtdlpLine(job, line) {
    // Marker line we emit with --progress-template
    if (line.startsWith("DLPROGRESS:")) {
      const rest = line.slice("DLPROGRESS:".length);
      const [pct, speed, eta, dl, total, fname] = rest.split("|");
      const patch: any = {};
      const pctNum = parseFloat((pct || "").replace(/[^\d.]/g, ""));
      if (!Number.isNaN(pctNum)) patch.percent = pctNum;
      if (speed && speed !== "N/A") patch.speed = speed.trim();
      if (eta && eta !== "N/A") patch.eta = eta.trim();
      const dlNum = parseInt((dl || "").replace(/[^\d]/g, ""), 10);
      if (!Number.isNaN(dlNum)) patch.downloadedBytes = dlNum;
      const totalNum = parseInt((total || "").replace(/[^\d]/g, ""), 10);
      if (!Number.isNaN(totalNum)) patch.totalBytes = totalNum;
      if (fname && fname !== "NA") {
        const baseName = path.basename(fname);
        patch.filename = baseName;
        if (job.filename && job.filename !== baseName) {
          patch.title = baseName;
        } else if (!job.title) {
          patch.title = baseName;
        }
      }
      if (job.status === "starting" || job.status === "queued" || job.status === "merging") {
        patch.status = "downloading";
      }
      updateJob(job, patch);
      return;
    }
    // [download] Destination: <path>
    const dest = line.match(/^\[download\]\s+Destination:\s+(.+)$/);
    if (dest) {
      const fn = path.basename(dest[1].trim());
      const patch: any = { filename: fn };
      if (job.filename && job.filename !== fn) {
        patch.title = fn;
      } else if (!job.title) {
        patch.title = fn;
      }
      updateJob(job, patch);
      return;
    }
    // [Merger] Merging formats into "<path>"
    const merger = line.match(/\[Merger\]\s+Merging formats into\s+"(.+)"/);
    if (merger) {
      const fn = path.basename(merger[1].trim());
      updateJob(job, { filename: fn, title: fn, status: "merging" });
      return;
    }
    if (/^\[download\]\s+100%/.test(line)) {
      updateJob(job, { percent: 100 });
    }
  }

  function parseAria2Line(job, line) {
    // [#abcdef 1.2MiB/10.0MiB(12%) CN:8 DL:512KiB ETA:18s]
    const m = line.match(/\[#[^\s]+\s+([\d.]+\w+)\/([\d.]+\w+)\((\d+)%\).*?DL:([\d.]+\w+)(?:\s+ETA:(\w+))?/);
    if (m) {
      const patch: any = {
        percent: parseInt(m[3], 10),
        speed: `${m[4]}/s`,
        downloadedBytes: parseHumanSize(m[1]),
        totalBytes: parseHumanSize(m[2]),
      };
      if (m[5]) patch.eta = m[5];
      if (job.status === "starting" || job.status === "queued") patch.status = "downloading";
      updateJob(job, patch);
      return;
    }
    // Filename detection from aria2 status line
    const fn = line.match(/^\d+\|[^|]+\|[^|]+\|(.+)$/);
    if (fn) {
      const candidate = path.basename(fn[1].trim());
      if (candidate && !job.filename) {
        updateJob(job, { filename: candidate, title: job.title || candidate });
      }
    }
  }

  function parseHumanSize(s) {
    const m = s.match(/^([\d.]+)\s*(KiB|MiB|GiB|TiB|B)?$/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    const unit = (m[2] || "B").toLowerCase();
    const mul = unit === "tib" ? 1024 ** 4 : unit === "gib" ? 1024 ** 3 : unit === "mib" ? 1024 ** 2 : unit === "kib" ? 1024 : 1;
    return Math.round(v * mul);
  }

  function shellSplit(s) {
    if (!s) return [];
    // Very small splitter: respects double quotes only.
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (!inQ && /\s/.test(c)) {
        if (cur) { out.push(cur); cur = ""; }
        continue;
      }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  function buildYtdlpArgs({ url, outputTemplate, format, concurrent, extraArgs, subdir }) {
    const destDir = subdir
      ? path.join(videosDir, subdir.replace(/^\/+|\.+/g, "").replace(/\.\./g, ""))
      : videosDir;
    const args = [
      "--newline",
      "--no-colors",
      "--progress",
      "--progress-template",
      "DLPROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes,progress.total_bytes_estimate)s|%(info.filename)s",
      "-P", destDir,
      "-o", outputTemplate && outputTemplate.trim() ? outputTemplate.trim() : "%(title)s.%(ext)s",
    ];
    if (format && format.trim()) args.push("-f", format.trim());
    if (concurrent && concurrent > 1) args.push("-N", String(concurrent));
    const extra = shellSplit(extraArgs || "");
    const hasPlaylistArg = extra.some((arg) => arg === "--yes-playlist" || arg === "--no-playlist");
    if (!hasPlaylistArg) {
      args.push("--no-playlist");
    }
    args.push(...extra);
    args.push(url);
    return { args, destDir };
  }

  function buildAria2Args({ url, filename, concurrent, splits, extraArgs, subdir }) {
    const destDir = subdir
      ? path.join(videosDir, subdir.replace(/^\/+|\.+/g, "").replace(/\.\./g, ""))
      : videosDir;
    const args = [
      "--summary-interval=1",
      "--console-log-level=warn",
      "--show-console-readout=true",
      "--allow-overwrite=false",
      "--auto-file-renaming=true",
      "--continue=true",
      `--max-connection-per-server=${Math.max(1, Math.min(16, concurrent || 16))}`,
      `--split=${Math.max(1, Math.min(64, splits || 16))}`,
      "--min-split-size=1M",
      "--dir", destDir,
    ];
    if (filename && filename.trim()) args.push("--out", filename.trim());
    const extra = shellSplit(extraArgs || "");
    args.push(...extra);
    args.push(url);
    return { args, destDir };
  }

  async function startDownload(opts) {
    const { url, tool } = opts;
    if (!url || typeof url !== "string") throw new Error("url required");
    if (tool !== "ytdlp" && tool !== "aria2c") throw new Error("tool must be 'ytdlp' or 'aria2c'");

    const id = crypto.randomUUID();
    const job: any = {
      id,
      url,
      tool,
      status: "starting",
      title: "",
      filename: "",
      percent: 0,
      speed: null,
      eta: null,
      downloadedBytes: 0,
      totalBytes: 0,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
      exitCode: null,
      options: {
        outputTemplate: opts.outputTemplate || "",
        format: opts.format || "",
        filename: opts.filename || "",
        concurrent: opts.concurrent || null,
        splits: opts.splits || null,
        extraArgs: opts.extraArgs || "",
        subdir: opts.subdir || "",
      },
      logs: [] as any[],
      proc: null,
    };
    jobs.set(id, job);

    let bin, args, destDir;
    if (tool === "ytdlp") {
      const built = buildYtdlpArgs({
        url,
        outputTemplate: opts.outputTemplate,
        format: opts.format,
        concurrent: opts.concurrent,
        extraArgs: opts.extraArgs,
        subdir: opts.subdir,
      });
      bin = "yt-dlp";
      args = built.args;
      destDir = built.destDir;
    } else {
      const built = buildAria2Args({
        url,
        filename: opts.filename,
        concurrent: opts.concurrent,
        splits: opts.splits,
        extraArgs: opts.extraArgs,
        subdir: opts.subdir,
      });
      bin = "aria2c";
      args = built.args;
      destDir = built.destDir;
    }

    try {
      await fsp.mkdir(destDir, { recursive: true });
    } catch { /* ignore */ }

    pushLog(job, `$ ${bin} ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`);

    let proc;
    try {
      proc = Bun.spawn([bin, ...args], {
        cwd: destDir,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, PYTHONUNBUFFERED: "1", TERM: "dumb" },
      });
    } catch (err: any) {
      job.status = "error";
      job.error = `Failed to spawn ${bin}: ${err.message}`;
      job.finishedAt = Date.now();
      pushLog(job, job.error);
      emit({ type: "job", job: serializeJob(job) });
      return serializeJob(job);
    }

    job.proc = proc;
    updateJob(job, { status: "downloading" });

    const decoder = new TextDecoder();
    let stdoutBuf = "";
    let stderrBuf = "";

    const pumpStream = async (stream, isStderr) => {
      if (!stream) return;
      try {
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (isStderr) {
            stderrBuf += text;
            let idx;
            while ((idx = stderrBuf.search(/[\r\n]/)) >= 0) {
              const line = stderrBuf.slice(0, idx).replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
              stderrBuf = stderrBuf.slice(idx + 1);
              if (line.length) pushLog(job, line);
            }
          } else {
            stdoutBuf += text;
            let idx;
            while ((idx = stdoutBuf.search(/[\r\n]/)) >= 0) {
              const raw = stdoutBuf.slice(0, idx);
              stdoutBuf = stdoutBuf.slice(idx + 1);
              const line = raw.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
              if (!line.length) continue;
              if (tool === "ytdlp") parseYtdlpLine(job, line);
              else parseAria2Line(job, line);
              pushLog(job, line);
            }
          }
        }
      } catch { /* stream closed */ }
    };

    pumpStream(proc.stdout, false);
    pumpStream(proc.stderr, true);

    proc.exited.then((exitCode) => {
      if (stdoutBuf.length) { pushLog(job, stdoutBuf); stdoutBuf = ""; }
      if (stderrBuf.length) { pushLog(job, stderrBuf); stderrBuf = ""; }
      const wasCancelled = job.status === "cancelling";
      const finalStatus = wasCancelled ? "cancelled" : exitCode === 0 ? "done" : "error";
      const patch: any = {
        status: finalStatus,
        exitCode,
        finishedAt: Date.now(),
      };
      if (finalStatus === "done") patch.percent = 100;
      if (finalStatus === "error" && !job.error) patch.error = `Process exited with code ${exitCode}`;
      job.proc = null;
      updateJob(job, patch);
    });

    return serializeJob(job);
  }

  function cancelDownload(id) {
    const job = jobs.get(id);
    if (!job) return false;
    if (job.status !== "downloading" && job.status !== "starting" && job.status !== "merging") return false;
    if (job.proc) {
      job.status = "cancelling";
      pushLog(job, "[user] cancelling…");
      try { job.proc.kill("SIGTERM"); } catch { /* ignore */ }
      setTimeout(() => {
        if (job.proc) {
          try { job.proc.kill("SIGKILL"); } catch { /* ignore */ }
        }
      }, 3000);
    }
    return true;
  }

  function removeJob(id) {
    const job = jobs.get(id);
    if (!job) return false;
    if (job.status === "downloading" || job.status === "starting" || job.status === "merging" || job.status === "cancelling") {
      return false;
    }
    jobs.delete(id);
    emit({ type: "removed", id });
    return true;
  }

  function clearFinished() {
    const removed: string[] = [];
    for (const [id, job] of jobs) {
      if (job.status === "done" || job.status === "error" || job.status === "cancelled") {
        jobs.delete(id);
        removed.push(id);
      }
    }
    for (const id of removed) emit({ type: "removed", id });
    return removed.length;
  }

  async function fetchYtdlpInfo(url, extraArgs) {
    const extra = shellSplit(extraArgs || "");
    const proc = Bun.spawn(["yt-dlp", "-J", "--no-warnings", "--no-playlist", ...extra, url], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(stderr.trim() || `yt-dlp exited ${exitCode}`);
    }
    let parsed;
    try { parsed = JSON.parse(stdout); } catch (e: any) {
      throw new Error(`Failed to parse yt-dlp output: ${e.message}`);
    }
    return {
      tool: "ytdlp",
      url,
      title: parsed.title || null,
      uploader: parsed.uploader || parsed.channel || null,
      duration: parsed.duration || null,
      thumbnail: parsed.thumbnail || null,
      ext: parsed.ext || null,
      filesize: parsed.filesize || parsed.filesize_approx || null,
      width: parsed.width || null,
      height: parsed.height || null,
      formatNote: parsed.format_note || null,
      formatId: parsed.format_id || null,
      isPlaylist: Boolean(parsed.entries),
      entryCount: parsed.entries ? parsed.entries.length : null,
      formats: Array.isArray(parsed.formats)
        ? parsed.formats
            .filter((f) => f.vcodec !== "none" || f.acodec !== "none")
            .slice(-25)
            .map((f) => ({
              formatId: f.format_id,
              ext: f.ext,
              note: f.format_note || null,
              height: f.height || null,
              fps: f.fps || null,
              filesize: f.filesize || f.filesize_approx || null,
              vcodec: f.vcodec,
              acodec: f.acodec,
            }))
        : [],
    };
  }

  async function fetchAria2Info(url) {
    if (!/^https?:\/\//i.test(url)) {
      return { tool: "aria2c", url, title: null, filesize: null, contentType: null, suggestedFilename: null };
    }
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      const len = res.headers.get("content-length");
      const ctype = res.headers.get("content-type");
      const cd = res.headers.get("content-disposition") || "";
      let suggested: string | null = null;
      const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      if (m) suggested = decodeURIComponent(m[1]);
      if (!suggested) {
        try {
          const u = new URL(url);
          const last = u.pathname.split("/").filter(Boolean).pop();
          if (last) suggested = decodeURIComponent(last);
        } catch { /* ignore */ }
      }
      return {
        tool: "aria2c",
        url,
        title: suggested || null,
        suggestedFilename: suggested,
        filesize: len ? parseInt(len, 10) : null,
        contentType: ctype,
        ok: res.ok,
        status: res.status,
      };
    } catch (err: any) {
      throw new Error(`HEAD request failed: ${err.message}`);
    }
  }

  return {
    startDownload,
    cancelDownload,
    removeJob,
    clearFinished,
    listJobs,
    getJob,
    getLogs,
    subscribe,
    fetchYtdlpInfo,
    fetchAria2Info,
  };
}
