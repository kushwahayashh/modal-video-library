export function getStablePlaceholder(videoId: string, placeholders: string[]): string | null {
  if (placeholders.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < videoId.length; i += 1) {
    hash = (hash * 31 + videoId.charCodeAt(i)) >>> 0;
  }
  return placeholders[hash % placeholders.length] || null;
}

export async function saveThumbnailToServer(videoId: string, imageUrl: string) {
  const res = await fetch("/api/thumbnail-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, imageUrl }),
  });
  if (!res.ok) {
    let message = "Failed to save thumbnail";
    try {
      const body = await res.json();
      if (typeof body?.error === "string" && body.error.trim()) {
        message = body.error;
      }
    } catch {
      // Keep default message if parsing fails.
    }
    throw new Error(message);
  }
}
