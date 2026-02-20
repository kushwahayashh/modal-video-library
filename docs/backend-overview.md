# Backend Overview

## Main Files

- Entrypoint: `server/src/index.js`
- Utilities/services:
  - `server/src/lib/files.js`
  - `server/src/lib/http-range.js`
  - `server/src/lib/sprite-generation.js`
  - `server/src/lib/thumb-map.js`
  - `server/src/lib/video-added-map.js`
  - `server/src/lib/video-utils.js`
- Standalone terminal page: `server/src/terminal.html`

## Boot Sequence

1. Create Fastify app (`maxParamLength: 500`), register CORS + WebSocket.
2. Attempt static serving of `client/dist` (non-fatal if absent).
3. Resolve runtime directories (`DATA_DIR`, `videos`, `sprites`, placeholders dir).
4. Register placeholder static serving at `/api/placeholder-images/`.
5. Initialize JSON map stores (`thumbnail-map.json`, `video-added-map.json`).
6. Initialize sprite service (`spriteJobs` map + generator).
7. Register HTTP and WS routes.
8. Start listener unless `NO_AUTO_LISTEN=1`.

## Runtime State

- `cloudflareUrl`: set through `POST /api/cf-url`.
- `lastActivityAt`: updated by request hook and terminal events.
- `terminalConnectionCount`: incremented/decremented by WS terminal lifecycle.
- `spriteJobs`: in-memory job state for sprite generation.

## Filesystem Persistence

- Thumbnail map store and video-added map store both:
  - serialize updates through an internal promise queue
  - write atomically via temporary file + rename
  - guard against malformed/non-object JSON

## Video List Pipeline (`GET /api/videos`)

- Recursively reads `VIDEOS_DIR`.
- Filters by known video extensions.
- Computes duration using `ffprobe` with LRU-like duration cache.
- Resolves stable `videoId` from relative path.
- Resolves `addedAt` from map or filesystem fallback.
- Resolves thumbnail from saved map or deterministic placeholder hash.
- Persists auto-assigned placeholders and `addedAt` map corrections.
- Supports `q`, `offset`, `limit` with bounded page size (`<=200`).

## Rename/Delete Side Effects

- Rename:
  - keeps extension and subfolder
  - sanitizes invalid filename characters
  - moves sprite folder to new ID
  - rewrites sprite VTT URLs to new ID
  - remaps both `thumbnail-map` and `video-added-map` keys
- Delete:
  - removes video file and sprite folder
  - removes map entries
  - drops active sprite job entry

## Streaming and Range Handling

- `/api/stream/:id` supports:
  - attachment mode (`?download=1`)
  - RFC-style byte range responses (`206`)
  - invalid range response (`416` + `Content-Range: bytes */<size>`)

## Terminal WebSocket

- Route: `GET /ws/terminal` (upgrade).
- Spawns shell using Bun terminal API (`TERM=xterm-256color`).
- Handles messages: `input`, `resize`, `ping`.
- Emits: `output`, `pong`, `exit`, `error`.
- CWD prefers `DATA_DIR` if present.

## Routing/Fallback Rules

- `/terminal` serves `server/src/terminal.html`.
- Unknown `/api/*` and `/ws/*` routes return JSON 404.
- Other unknown routes attempt to serve SPA `index.html` from `client/dist`.
