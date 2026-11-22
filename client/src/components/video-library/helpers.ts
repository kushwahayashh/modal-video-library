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
