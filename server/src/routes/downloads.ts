export function registerDownloadRoutes(app, deps) {
  const { downloadService, touchActivity } = deps;

  app.get("/api/downloads", async () => {
    return { jobs: downloadService.listJobs() };
  });

  app.get("/api/downloads/:id", async (request, reply) => {
    const job = downloadService.getJob(request.params.id);
    if (!job) return reply.status(404).send({ error: "Job not found" });
    return { job };
  });

  app.get("/api/downloads/:id/logs", async (request, reply) => {
    const job = downloadService.getJob(request.params.id);
    if (!job) return reply.status(404).send({ error: "Job not found" });
    return { logs: downloadService.getLogs(request.params.id) };
  });

  app.post("/api/downloads/info", async (request, reply) => {
    const body = (request.body as any) || {};
    const { url, tool, extraArgs } = body;
    if (!url || typeof url !== "string") {
      return reply.status(400).send({ error: "url required" });
    }
    const useTool = tool === "aria2c" ? "aria2c" : "ytdlp";
    touchActivity?.();
    try {
      if (useTool === "ytdlp") {
        const info = await downloadService.fetchYtdlpInfo(url, extraArgs);
        return { info };
      }
      const info = await downloadService.fetchAria2Info(url);
      return { info };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to fetch info" });
    }
  });

  app.post("/api/downloads", async (request, reply) => {
    const body = (request.body as any) || {};
    const { url, tool } = body;
    if (!url || typeof url !== "string") {
      return reply.status(400).send({ error: "url required" });
    }
    if (tool !== "ytdlp" && tool !== "aria2c") {
      return reply.status(400).send({ error: "tool must be 'ytdlp' or 'aria2c'" });
    }
    touchActivity?.();
    try {
      const job = await downloadService.startDownload({
        url,
        tool,
        outputTemplate: body.outputTemplate,
        format: body.format,
        filename: body.filename,
        concurrent: body.concurrent ? parseInt(body.concurrent, 10) : null,
        splits: body.splits ? parseInt(body.splits, 10) : null,
        extraArgs: body.extraArgs,
        subdir: body.subdir,
      });
      return { job };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to start download" });
    }
  });

  app.delete("/api/downloads/:id", async (request, reply) => {
    const { id } = request.params as any;
    const query = (request.query as any) || {};
    const force = query.force === "1" || query.force === "true";
    const job = downloadService.getJob(id);
    if (!job) return reply.status(404).send({ error: "Job not found" });

    if (job.status === "downloading" || job.status === "starting" || job.status === "merging") {
      downloadService.cancelDownload(id);
      if (force) downloadService.removeJob(id);
      return { success: true, cancelled: true };
    }
    downloadService.removeJob(id);
    return { success: true, removed: true };
  });

  app.post("/api/downloads/clear", async () => {
    const removed = downloadService.clearFinished();
    return { removed };
  });

  app.get("/ws/downloads", { websocket: true }, (socket) => {
    let alive = true;

    const send = (payload) => {
      if (!alive || socket.readyState !== 1) return;
      try { socket.send(JSON.stringify(payload)); } catch { /* ignore */ }
    };

    // Initial snapshot
    send({ type: "snapshot", jobs: downloadService.listJobs() });

    const unsubscribe = downloadService.subscribe((evt) => {
      send(evt);
    });

    socket.on("message", (raw) => {
      try {
        const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
        const msg = JSON.parse(text);
        if (msg.type === "logs" && typeof msg.id === "string") {
          send({ type: "logs", id: msg.id, logs: downloadService.getLogs(msg.id) });
        } else if (msg.type === "ping") {
          send({ type: "pong" });
        }
      } catch { /* ignore */ }
    });

    const cleanup = () => {
      if (!alive) return;
      alive = false;
      try { unsubscribe(); } catch { /* ignore */ }
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });
}
