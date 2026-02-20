# Backend API Reference

Base URL (local): `http://localhost:3000`

In Vite dev, frontend requests to `/api/*` are proxied to backend.

## Health, Runtime, and Tunnel

### `GET /api/health`

Returns:

```json
{ "status": "ok", "timestamp": "...", "cloudflareUrl": null }
```

### `GET /api/runtime/status`

Returns activity info used by Modal idle watchdog:

```json
{
  "lastActivityAt": 1739999999999,
  "terminalConnectionCount": 0,
  "activeSpriteJobs": 0
}
```

### `POST /api/cf-url`

Body:

```json
{ "url": "https://xxxx.trycloudflare.com" }
```

- Validates that URL contains `trycloudflare.com`.
- Response: `{ success: true, url }`.

### `GET /api/cf-url`

- If unset: `404 { error: "Cloudflare URL not set" }`
- If set: `{ url }`
- Query `?redirect=true` returns HTTP redirect.

### `GET /cf`

Redirects to currently registered Cloudflare URL (or 404 if unset).

## Placeholder and Thumbnail Map

### `GET /api/placeholder-images`

Returns discovered placeholder image URLs:

```json
{ "images": ["/api/placeholder-images/file.jpg"] }
```

### `GET /api/thumbnail-map`

Returns persisted thumbnail override map:

```json
{ "<videoId>": "/api/placeholder-images/file.jpg" }
```

### `POST /api/thumbnail-map`

Body:

```json
{ "videoId": "...", "imageUrl": "/api/placeholder-images/file.jpg" }
```

- 400 on missing/blank/non-string values.
- Success response: `{ "success": true }`.

## Video Library

### `GET /api/videos`

Query parameters:

- `q`: optional case-insensitive search against `title` and `filename`
- `limit`: optional positive integer (pagination mode, max `200`)
- `offset`: optional integer >= 0 (used only when `limit` is valid)

Without valid `limit`, returns full filtered list:

```json
{ "videos": [...], "total": 42 }
```

With pagination:

```json
{
  "videos": [...],
  "total": 42,
  "offset": 0,
  "limit": 60,
  "hasMore": true,
  "nextOffset": 60
}
```

Each video item includes:

- `id`, `title`, `filename`
- `size`, `sizeBytes`
- `createdAt`, `addedAt`
- `thumbnail` (override or stable placeholder)
- `duration`
- `hasSprites`

### `GET /api/videos/:id`

Returns detailed metadata for one video:

- base fields (`id`, `title`, `filename`, `size`, `createdAt`, `modifiedAt`, `duration`)
- video stream fields (`resolution`, `videoCodec`, `videoBitrate`, `framerate`, `pixelFormat`)
- audio stream fields (`audioCodec`, `audioBitrate`, `audioChannels`, `sampleRate`)
- container fields (`container`, `totalBitrate`)

404 when video does not exist.

### `POST /api/videos/:id/rename`

Body:

```json
{ "newName": "new title without extension" }
```

Behavior:

- Keeps original extension and parent directory.
- Sanitizes invalid filename characters.
- Moves sprite directory and rewrites VTT sprite URL references.
- Migrates thumbnail and `addedAt` map keys to new video ID.

Responses:

- 200 `{ success: true, id, filename }`
- 400 invalid name/body
- 404 video missing
- 409 target filename exists

### `DELETE /api/videos/:id`

Deletes video and related metadata.

Response: `{ success: true }`.

## Sprite Endpoints

### `POST /api/videos/:id/sprites`

Starts asynchronous sprite generation.

- 404 when video missing.
- 409 when a sprite job for that video is already running.

Success response:

```json
{ "success": true, "message": "Sprite generation started" }
```

### `GET /api/sprites/progress`

Returns current in-memory jobs:

```json
{ "jobs": [{ "videoId": "...", "title": "...", "status": "extracting|tiling|done|error", "current": 12, "total": 40, "error": null }] }
```

### `GET /api/sprites/:id/image`

Returns sprite sheet (`image/jpeg`) or 404.

### `GET /api/sprites/:id/vtt`

Returns WebVTT (`text/vtt`) or 404.

### `GET /api/sprites/:id/status`

Returns:

```json
{ "exists": true }
```

## Streaming

### `GET /api/stream/:id`

- Streams media with content type inferred from extension.
- Supports HTTP `Range` requests.
- `?download=1` forces attachment download.
- Invalid range returns 416.

## Terminal WebSocket

### `GET /ws/terminal` (WebSocket)

Client -> server messages:

```json
{ "type": "input", "data": "ls\n" }
{ "type": "resize", "cols": 120, "rows": 40 }
{ "type": "ping" }
```

Server -> client messages:

```json
{ "type": "output", "data": "..." }
{ "type": "pong" }
{ "type": "exit", "code": 0 }
{ "type": "error", "message": "..." }
```
