export function getStablePlaceholder(stableKey: string, placeholders: string[]): string | null {
  if (placeholders.length === 0) return null;
  
  // Highest Random Weight (Rendezvous Hashing)
  // Ensures adding/removing a placeholder only affects a minimal number of videos
  // instead of scrambling the entire library.
  let bestPlaceholder = placeholders[0];
  let maxHash = -1;

  for (let i = 0; i < placeholders.length; i++) {
    const url = placeholders[i];
    // Use filename to make the hash resilient to mount path changes
    const filename = url.split("/").pop() || url;
    const str = stableKey + "|" + filename;
    
    let hash = 0;
    for (let j = 0; j < str.length; j++) {
      hash = (Math.imul(31, hash) + str.charCodeAt(j)) | 0;
    }
    // force unsigned 32-bit integer for comparison
    hash = hash >>> 0;
    
    if (hash > maxHash) {
      maxHash = hash;
      bestPlaceholder = url;
    }
  }
  
  return bestPlaceholder || null;
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
