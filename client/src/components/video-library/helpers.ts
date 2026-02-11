export function getStablePlaceholder(videoId: string, placeholders: string[]): string | null {
  if (placeholders.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < videoId.length; i += 1) {
    hash = (hash * 31 + videoId.charCodeAt(i)) >>> 0;
  }
  return placeholders[hash % placeholders.length] || null;
}

export function saveThumbnailToServer(videoId: string, imageUrl: string) {
  fetch("/api/thumbnail-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, imageUrl }),
  }).catch(() => {});
}
