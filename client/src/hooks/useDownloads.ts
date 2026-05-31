import { useCallback, useEffect, useRef, useState } from "react";

export type DownloadStatus =
  | "starting"
  | "queued"
  | "downloading"
  | "merging"
  | "cancelling"
  | "done"
  | "error"
  | "cancelled";

export interface DownloadJob {
  id: string;
  url: string;
  tool: "ytdlp" | "aria2c";
  status: DownloadStatus;
  title: string;
  filename: string;
  percent: number;
  speed: string | null;
  eta: string | null;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  options?: Record<string, any>;
}

export interface LogEntry {
  ts: number;
  line: string;
}

const MAX_LOG_BUFFER = 800;

function getWsUrl(path: string) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export function useDownloads() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [logsById, setLogsById] = useState<Record<string, LogEntry[]>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const appendLog = useCallback((id: string, entry: LogEntry) => {
    setLogsById((prev) => {
      const existing = prev[id] || [];
      const next = existing.length >= MAX_LOG_BUFFER
        ? [...existing.slice(existing.length - MAX_LOG_BUFFER + 1), entry]
        : [...existing, entry];
      return { ...prev, [id]: next };
    });
  }, []);

  const replaceLogs = useCallback((id: string, entries: LogEntry[]) => {
    setLogsById((prev) => ({ ...prev, [id]: entries.slice(-MAX_LOG_BUFFER) }));
  }, []);

  const requestLogs = useCallback((id: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify({ type: "logs", id })); } catch { /* ignore */ }
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch("/api/downloads");
      if (!res.ok) return;
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch { /* ignore */ }
  }, []);

  const fetchLogs = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/downloads/${encodeURIComponent(id)}/logs`);
      if (!res.ok) return;
      const data = await res.json();
      replaceLogs(id, Array.isArray(data.logs) ? data.logs : []);
    } catch { /* ignore */ }
  }, [replaceLogs]);

  useEffect(() => {
    let active = true;

    void fetchSnapshot();

    const connect = () => {
      if (!active) return;
      const ws = new WebSocket(getWsUrl("/ws/downloads"));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "snapshot") {
            setJobs(msg.jobs as DownloadJob[]);
          } else if (msg.type === "job") {
            setJobs((prev) => {
              const idx = prev.findIndex((j) => j.id === msg.job.id);
              if (idx === -1) return [msg.job as DownloadJob, ...prev];
              const next = [...prev];
              next[idx] = msg.job as DownloadJob;
              return next;
            });
          } else if (msg.type === "removed") {
            setJobs((prev) => prev.filter((j) => j.id !== msg.id));
            setLogsById((prev) => {
              const { [msg.id]: _drop, ...rest } = prev;
              return rest;
            });
          } else if (msg.type === "log") {
            appendLog(msg.id, msg.entry as LogEntry);
          } else if (msg.type === "logs") {
            replaceLogs(msg.id, msg.logs as LogEntry[]);
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setConnected(false);
        if (!active) return;
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(connect, 1500);
      };

      ws.onerror = () => {
        try { ws.close(); } catch { /* ignore */ }
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) try { ws.close(); } catch { /* ignore */ }
    };
  }, [appendLog, fetchSnapshot, replaceLogs]);

  return { jobs, logsById, connected, requestLogs, fetchLogs };
}
