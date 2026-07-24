export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)) + " " + sizes[i];
}

export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Build a stream URL for a library video. When a share token is supplied the URL
 * works for anyone without the site password; otherwise it relies on the
 * logged-in session cookie (fine for in-app playback/downloads).
 */
export function buildStreamUrl(
  videoId: string,
  opts: { shareToken?: string; download?: boolean; absolute?: boolean } = {}
): string {
  const params = new URLSearchParams();
  if (opts.download) params.set("download", "1");
  if (opts.shareToken) params.set("token", opts.shareToken);
  const query = params.toString();
  const path = `/api/stream/${videoId}${query ? `?${query}` : ""}`;
  return opts.absolute ? `${window.location.origin}${path}` : path;
}
