# Backend API Reference

## Base URL
- Local: `http://localhost:3000`
- Dev frontend proxy: Vite forwards `/api/*` to backend.

## Health and Cloudflare

### `GET /api/health`
- Response: `{ status, timestamp, cloudflareUrl }`

### `POST /api/cf-url`
- Body: `{ url }`
- Validation: URL must contain `trycloudflare.com`.
- Response: `{ success, url }`

### `GET /api/cf-url`
- Query: `redirect=true` optionally redirects to URL.
- Response: `{ url }` or 404 if unset.

### `GET /cf`
- Redirect helper to configured Cloudflare URL.

## Placeholder and Thumbnail Map

### `GET /api/placeholder-images`
- Returns `images` array of URL paths under `/api/placeholder-images/<filename>`.

### `GET /api/thumbnail-map`
- Returns JSON map: `{ [videoId]: imageUrl }`.

### `POST /api/thumbnail-map`
- Body: `{ videoId, imageUrl }`
- Upserts thumbnail map entry.

## Video Library

### `GET /api/videos`
- Returns `{ videos, total }`.
- Each video item includes:
  - `id`, `title`, `filename`
  - `size`, `sizeBytes`, `createdAt`
  - `thumbnail` (currently always null from backend)
  - `duration`
  - `hasSprites`

### `GET /api/videos/:id`
- Returns enriched metadata:
  - basic video fields
  - `modifiedAt`
  - video stream fields: `resolution`, `videoCodec`, `videoBitrate`, `framerate`, `pixelFormat`
  - audio stream fields: `audioCodec`, `audioBitrate`, `audioChannels`, `sampleRate`
  - format fields: `container`, `totalBitrate`

### `POST /api/videos/:id/rename`
- Body: `{ newName }`.
- Preserves original extension.
- Sanitizes invalid filename characters.
- Renames sprite folder from old ID to new ID and rewrites VTT sprite URL references.

### `DELETE /api/videos/:id`
- Deletes video file.

## Sprite Endpoints

### `POST /api/videos/:id/sprites`
- Starts async sprite generation.
- Returns immediately.

### `GET /api/sprites/progress`
- Returns `{ jobs: [...] }` with current extraction/tiling status.

### `GET /api/sprites/:id/image`
- Returns generated sprite sheet as `image/jpeg`.

### `GET /api/sprites/:id/vtt`
- Returns WebVTT metadata for sprite previews.

### `GET /api/sprites/:id/status`
- Returns `{ exists: boolean }`.

## Streaming

### `GET /api/stream/:id`
- Query: `download=1` enables attachment download.
- Supports `Range` requests for progressive playback.
- MIME inferred from file extension.

## File Manager

### `GET /api/files?path=<relativePath>`
- Lists files in resolved `DATA_DIR/path`.
- Returns array of `{ name, path, size, isFolder, modified }`.

### `POST /api/files/rename`
- Body: `{ oldPath, newPath }`.
- Path safety checked for both paths.

### `DELETE /api/files/*`
- Deletes file/folder recursively from validated path.

## WebSocket Terminal

### `GET /ws/terminal` (WebSocket upgrade)
- Client -> server messages:
  - `{ type: "input", data: string }`
  - `{ type: "resize", cols, rows }`
  - `{ type: "ping" }`
- Server -> client messages:
  - `{ type: "output", data }`
  - `{ type: "exit", code }`
  - `{ type: "error", message }`
  - `{ type: "pong" }`
