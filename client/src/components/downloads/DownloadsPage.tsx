import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  IconDownload,
  IconInfoCircle,
  IconLoader,
  IconPlayerStopFilled,
  IconSettings,
  IconAlertTriangle,
} from "@tabler/icons-react";
import "./DownloadsPage.css";
import { useDownloads, type DownloadJob, type DownloadStatus } from "../../hooks/useDownloads";

type Tool = "ytdlp" | "aria2c";

interface InfoResultYtdlp {
  tool: "ytdlp";
  title: string | null;
  duration: number | null;
  ext: string | null;
  filesize: number | null;
  isPlaylist: boolean;
  entryCount: number | null;
  formats: Array<{
    formatId: string;
    ext: string;
    note: string | null;
    height: number | null;
    fps: number | null;
    filesize: number | null;
    vcodec: string;
    acodec: string;
  }>;
}

interface InfoResultAria2 {
  tool: "aria2c";
  title: string | null;
  suggestedFilename: string | null;
  filesize: number | null;
  contentType: string | null;
}

type InfoResult = InfoResultYtdlp | InfoResultAria2;

function formatBytes(bytes: number | null | undefined) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

function formatDuration(sec: number | null | undefined) {
  if (!sec && sec !== 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function statusLabel(status: DownloadStatus) {
  switch (status) {
    case "starting": return "Starting";
    case "queued": return "Queued";
    case "downloading": return "Downloading";
    case "merging": return "Merging";
    case "cancelling": return "Cancelling";
    case "done": return "Done";
    case "error": return "Error";
    case "cancelled": return "Cancelled";
    default: return status;
  }
}

function statusClass(status: DownloadStatus) {
  if (status === "done") return "dl-status-done";
  if (status === "error") return "dl-status-error";
  if (status === "cancelled") return "dl-status-cancelled";
  if (status === "downloading" || status === "merging" || status === "starting") return "dl-status-active";
  return "dl-status-idle";
}

export default function DownloadsPage({ onBack }: { onBack?: () => void } = {}) {
  const [url, setUrl] = useState("");
  const [tool, setTool] = useState<Tool>("ytdlp");
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Common
  const [extraArgs, setExtraArgs] = useState("");
  // yt-dlp
  const [format, setFormat] = useState("");
  const [outputTemplate, setOutputTemplate] = useState("");
  const [ytConcurrent, setYtConcurrent] = useState<number>(4);
  // aria2c
  const [aFilename, setAFilename] = useState("");
  const [aConn, setAConn] = useState<number>(16);
  const [aSplits, setASplits] = useState<number>(16);

  const [info, setInfo] = useState<InfoResult | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [starting, setStarting] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const { jobs, logsById, requestLogs, fetchLogs, connected } = useDownloads();
  const logScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const requestedLogIdsRef = useRef<Set<string>>(new Set());

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  }, [jobs]);

  const visibleLogId = selectedLogId;

  useEffect(() => {
    if (!visibleLogId) return;
    if (logsById[visibleLogId] && logsById[visibleLogId].length > 0) return;
    if (requestedLogIdsRef.current.has(visibleLogId)) return;

    requestedLogIdsRef.current.add(visibleLogId);
    if (connected) requestLogs(visibleLogId);
    void fetchLogs(visibleLogId);
  }, [visibleLogId, connected, logsById, requestLogs, fetchLogs]);

  const visibleLogs = (visibleLogId && logsById[visibleLogId]) || [];

  useEffect(() => {
    if (!autoScrollRef.current) return;
    const el = logScrollRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [visibleLogs.length, visibleLogId]);

  const onLogScroll = () => {
    const el = logScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    autoScrollRef.current = distanceFromBottom < 32;
  };

  useEffect(() => {
    if (!url.trim()) return;
    const u = url.trim();
    if (/^magnet:/i.test(u) || /\.torrent($|\?)/i.test(u)) {
      setTool("aria2c");
    } else if (/\.(mp4|mkv|webm|mov|avi|flv|wmv|m4v|ts|mp3|m4a|opus|aac|flac|wav|pdf|zip|rar|7z|tar|gz|iso|img|bin|exe|dmg)(\?|$)/i.test(u)) {
      if (tool === "ytdlp") setTool("aria2c");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const fetchInfo = async () => {
    if (!url.trim()) { toast.error("Enter a URL first"); return; }
    setInfoLoading(true);
    setInfoError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/downloads/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), tool, extraArgs: tool === "ytdlp" ? extraArgs : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      setInfo(data.info as InfoResult);
      // If aria2c info returns a suggested filename and user hasn't typed one, fill it.
      if (data.info?.tool === "aria2c" && data.info.suggestedFilename && !aFilename) {
        setAFilename(data.info.suggestedFilename);
      }
    } catch (err: any) {
      setInfoError(err.message || "Failed to fetch info");
    } finally {
      setInfoLoading(false);
    }
  };

  const startDownload = async () => {
    if (!url.trim()) { toast.error("Enter a URL first"); return; }
    setStarting(true);
    try {
      const body: any = {
        url: url.trim(),
        tool,
        extraArgs: extraArgs.trim() || undefined,
      };
      if (tool === "ytdlp") {
        if (format.trim()) body.format = format.trim();
        if (outputTemplate.trim()) body.outputTemplate = outputTemplate.trim();
        if (ytConcurrent && ytConcurrent > 1) body.concurrent = ytConcurrent;
      } else {
        if (aFilename.trim()) body.filename = aFilename.trim();
        if (aConn) body.concurrent = aConn;
        if (aSplits) body.splits = aSplits;
      }
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      toast.success("Download started");
      setSelectedLogId(null);
      autoScrollRef.current = true;
    } catch (err: any) {
      toast.error(err.message || "Failed to start download");
    } finally {
      setStarting(false);
    }
  };

  const cancelJob = async (id: string) => {
    try {
      const res = await fetch(`/api/downloads/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel");
    }
  };

  const removeJob = async (id: string) => {
    try {
      const res = await fetch(`/api/downloads/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      if (selectedLogId === id) setSelectedLogId(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to remove");
    }
  };

  const renderInfoCard = () => {
    if (infoLoading) {
      return (
        <div className="dl-info-card dl-info-loading">
          <IconLoader className="dl-spin" size={16} /> <span>Fetching info…</span>
        </div>
      );
    }
    if (infoError) {
      return (
        <div className="dl-info-card dl-info-error">
          <IconAlertTriangle size={16} />
          <span>{infoError}</span>
        </div>
      );
    }
    if (!info) return null;

    if (info.tool === "ytdlp") {
      return (
        <div className="dl-info-card">
          <div className="dl-info-body">
            <div className="dl-info-title">{info.title || "(untitled)"}</div>
            <div className="dl-info-meta">
              {info.filesize != null && <span>{formatBytes(info.filesize)}</span>}
              {info.duration != null && <span>{formatDuration(info.duration)}</span>}
              {info.ext && <span>.{info.ext}</span>}
              {info.isPlaylist && info.entryCount != null && <span>Playlist · {info.entryCount} items</span>}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="dl-info-card">
        <div className="dl-info-body">
          <div className="dl-info-title">{info.suggestedFilename || info.title || "(remote file)"}</div>
          <div className="dl-info-meta">
            {info.filesize != null && <span>{formatBytes(info.filesize)}</span>}
            {info.contentType && <span>{info.contentType}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderJob = (job: DownloadJob) => {
    const isActive = job.status === "downloading" || job.status === "merging" || job.status === "starting";
    const isSelected = job.id === visibleLogId;
    const pct = Math.max(0, Math.min(100, Math.round(job.percent || 0)));
    return (
      <div
        key={job.id}
        className={`dl-job${isSelected ? " dl-job-selected" : ""}`}
        onClick={() => {
          setSelectedLogId(isSelected ? null : job.id);
        }}
      >
        <div className="dl-job-head">
          <div className="dl-job-title-wrap">
            <div className="dl-job-title" title={job.title || job.filename || job.url}>
              {job.title || job.filename || job.url}
            </div>
          </div>
          <div className="dl-job-actions">
            {isActive ? (
              <IconPlayerStopFilled
                size={18}
                className="dl-stop-icon"
                title="Cancel"
                onClick={(e) => { e.stopPropagation(); cancelJob(job.id); }}
              />
            ) : (
              <button
                type="button"
                className="dl-text-btn dl-danger-text-btn"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); removeJob(job.id); }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <div className="dl-progress-track">
          <div
            className={`dl-progress-bar${job.status === "error" ? " dl-progress-error" : ""}${job.status === "done" ? " dl-progress-done" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="dl-job-meta">
          <span className="dl-tool-tag">{job.tool === "ytdlp" ? "yt-dlp" : "aria2c"}</span>
          <span className="dl-meta-sep">·</span>
          <span className={`dl-job-status ${statusClass(job.status)}`}>{statusLabel(job.status)}</span>
          <span className="dl-meta-sep">·</span>
          <span className="dl-meta-pct">{pct}%</span>
          <span className="dl-meta-sep">·</span>
          <span>{formatBytes(job.downloadedBytes)} / {formatBytes(job.totalBytes)}</span>
          {job.speed && <><span className="dl-meta-sep">·</span><span>{job.speed}</span></>}
          {job.eta && <><span className="dl-meta-sep">·</span><span>ETA {job.eta}</span></>}
          {job.error && <><span className="dl-meta-sep">·</span><span className="dl-job-error" title={job.error}>{job.error}</span></>}
        </div>
        {isSelected && (
          <div
            ref={logScrollRef}
            className="dl-job-logs"
            onClick={(e) => e.stopPropagation()}
            onScroll={onLogScroll}
          >
            {visibleLogs.length === 0 ? (
              <div className="dl-job-logs-empty">
                Waiting for output…
              </div>
            ) : (
              visibleLogs.map((entry, i) => (
                <div key={i} className="dl-log-line">{entry.line}</div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dl-page">
      <nav className="nav">
        <div className="container nav-content">
          <a className="nav-logo" href="/cf">
            VIDEO<span>LIB</span> DOWNLOADS
          </a>
          <div className="nav-right">
            <a
              href="/"
              className="nav-btn nav-btn-terminal"
              onClick={(e) => {
                if (onBack && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  e.preventDefault();
                  onBack();
                }
              }}
            >
              Video Library
            </a>
            <a href="/files" target="_blank" rel="noopener noreferrer" className="nav-btn nav-btn-terminal">
              Files
            </a>
            <a href="/terminal" target="_blank" rel="noopener noreferrer" className="nav-btn nav-btn-terminal">
              Terminal
            </a>
          </div>
        </div>
      </nav>

      <div className="dl-container">
        {/* URL + tool */}
        <div className="dl-card">
          <div className="dl-row dl-row-url">
            <input
              type="text"
              className="dl-input dl-input-url"
              placeholder="Paste a URL (video page, direct file, magnet, .torrent)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !infoLoading) void fetchInfo(); }}
              spellCheck={false}
            />
            <div className="dl-select-wrapper">
              <select
                className="dl-select"
                value={tool}
                onChange={(e) => setTool(e.target.value as Tool)}
                aria-label="Downloader"
              >
                <option value="ytdlp">yt-dlp</option>
                <option value="aria2c">aria2c</option>
              </select>
              <div className="dl-select-arrow" aria-hidden="true">
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          {renderInfoCard()}

          <div className="dl-row dl-row-actions">
            <button
              type="button"
              className="dl-secondary-btn"
              onClick={fetchInfo}
              disabled={infoLoading || !url.trim()}
            >
              {infoLoading ? <IconLoader size={14} className="dl-spin" /> : <IconInfoCircle size={14} />}
              Get info
            </button>
            <button
              type="button"
              className="dl-secondary-btn"
              onClick={() => setOptionsOpen((v) => !v)}
              aria-expanded={optionsOpen}
            >
              <IconSettings size={14} />
              {optionsOpen ? "Hide options" : "Options"}
            </button>

            {info && info.tool === "ytdlp" && info.formats.length > 0 && (
              <div className="dl-select-wrapper">
                <select
                  className="dl-select dl-select-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  aria-label="Format Selector"
                >
                  <option value="">auto (best format)</option>
                  {info.formats.map((f) => (
                    <option key={f.formatId} value={f.formatId}>
                      {f.formatId} · {f.ext}
                      {f.height ? ` · ${f.height}p` : ""}
                      {f.fps ? ` · ${f.fps}fps` : ""}
                      {f.note ? ` · ${f.note}` : ""}
                      {f.filesize ? ` · ${formatBytes(f.filesize)}` : ""}
                    </option>
                  ))}
                </select>
                <div className="dl-select-arrow" aria-hidden="true">
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            )}

            <div className="dl-row-spacer" />
            <button
              type="button"
              className="dl-primary-btn"
              onClick={startDownload}
              disabled={starting || !url.trim()}
            >
              {starting ? <IconLoader size={14} className="dl-spin" /> : <IconDownload size={14} />}
              Download
            </button>
          </div>

          {optionsOpen && (
            <div className="dl-options">
              <div className="dl-options-grid">
                {tool === "ytdlp" ? (
                  <>
                    <div className="dl-field">
                      <label className="dl-field-label">Output template</label>
                      <input
                        type="text"
                        className="dl-input"
                        placeholder="%(title)s.%(ext)s"
                        value={outputTemplate}
                        onChange={(e) => setOutputTemplate(e.target.value)}
                      />
                    </div>
                    <div className="dl-field">
                      <label className="dl-field-label">Format selector (-f)</label>
                      <input
                        type="text"
                        className="dl-input"
                        placeholder="bv*+ba/b  (or pick from Get info)"
                        value={format}
                        onChange={(e) => setFormat(e.target.value)}
                      />
                    </div>
                    <div className="dl-field">
                      <label className="dl-field-label">Concurrent fragments (-N)</label>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        className="dl-input"
                        value={ytConcurrent}
                        onChange={(e) => setYtConcurrent(parseInt(e.target.value, 10) || 1)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dl-field">
                      <label className="dl-field-label">Output filename</label>
                      <input
                        type="text"
                        className="dl-input"
                        placeholder="(optional)"
                        value={aFilename}
                        onChange={(e) => setAFilename(e.target.value)}
                      />
                    </div>
                    <div className="dl-field">
                      <label className="dl-field-label">Connections per server (-x)</label>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        className="dl-input"
                        value={aConn}
                        onChange={(e) => setAConn(parseInt(e.target.value, 10) || 1)}
                      />
                    </div>
                    <div className="dl-field">
                      <label className="dl-field-label">Splits (-s)</label>
                      <input
                        type="number"
                        min={1}
                        max={64}
                        className="dl-input"
                        value={aSplits}
                        onChange={(e) => setASplits(parseInt(e.target.value, 10) || 1)}
                      />
                    </div>
                  </>
                )}

                <div className="dl-field dl-field-full">
                  <label className="dl-field-label">
                    Extra arguments ({tool === "ytdlp" ? "yt-dlp" : "aria2c"})
                  </label>
                  <input
                    type="text"
                    className="dl-input"
                    placeholder={tool === "ytdlp"
                      ? `--write-subs --sub-langs en --embed-thumbnail`
                      : `--header "Referer: https://example.com" --check-certificate=false`}
                    value={extraArgs}
                    onChange={(e) => setExtraArgs(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Jobs list */}
        <div className="dl-section">
          <div className="dl-section-head">
            <h2 className="dl-section-title">Jobs</h2>
            <span className="dl-section-count">{sortedJobs.length}</span>
          </div>
          {sortedJobs.length === 0 ? (
            <div className="dl-empty">No downloads yet</div>
          ) : (
            <div className="dl-jobs-list">
              {sortedJobs.map(renderJob)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
