# Backend Overview

## Files
- Server entrypoint: `server/src/index.js`
- Package metadata: `server/package.json`
- Standalone terminal UI: `server/src/terminal.html`
- Standalone manager UI: `server/src/manager.html`

## Boot Sequence (`server/src/index.js`)
1. Creates Fastify app with CORS and WebSocket plugins.
2. Attempts to serve built frontend from `client/dist`.
3. Initializes `DATA_DIR` subfolders if possible.
4. Exposes placeholder images from `images/` under `/api/placeholder-images/`.
5. Registers HTTP and WebSocket routes.
6. Starts listener on `0.0.0.0:${PORT}` where `PORT` defaults to `3000`.

## Startup/Testability Controls
- `NO_AUTO_LISTEN=1` prevents automatic `app.listen(...)` so route contracts can be tested via `app.inject`.
- `app` is exported from `server/src/index.js` for contract test usage.

## Core Helpers
- `toBase64Url()` and `fromBase64Url()`: map relative file paths to URL-safe IDs.
- `fileExists()`: async path existence check.
- `getVideoDuration()`: ffprobe duration extraction with path+mtime cache and bounded LRU-style eviction.
- `getVideoMetadata()`: ffprobe stream/format metadata extraction.
- `formatBytes()`, `formatBitrate()`, `formatChannels()`: backend formatting helpers.
- `isPathSafe()`: path traversal guard for file-manager operations.

## Sprite Pipeline
- Job state stored in `spriteJobs` map keyed by video ID.
- Steps:
  - Reset sprite directory.
  - Probe duration and compute extraction interval.
  - Split extraction into multiple ffmpeg workers based on CPU count.
  - Merge extracted segment frames into global sequence.
  - Tile frames into `sprite.jpg`.
  - Generate `sprite.vtt` with `xywh` coordinates.
- Job retention:
  - Job removed 10 seconds after completion/failure.

## File and Stream Handling
- Video list from `/data/videos` scanned recursively (including subfolders) and filtered by extension.
- Stream route supports:
  - Download mode with `Content-Disposition`.
  - HTTP byte-range partial content for playback.
- Video rename/delete routes also maintain sprite assets and thumbnail-map consistency.
- File manager allows recursive delete via `fsp.rm(..., { recursive: true })` on validated paths.

## Terminal WebSocket Backend
- Route: `/ws/terminal`.
- Spawns shell with Bun terminal API and `TERM=xterm-256color`.
- Handles messages:
  - `input`: writes to terminal stdin.
  - `resize`: updates pseudo-terminal dimensions.
  - `ping`: responds with `pong`.
- Emits messages:
  - `output`, `exit`, `error`.

## Static and Fallback Routing
- `/terminal` serves raw `server/src/terminal.html`.
- API and WS unknown routes return JSON 404.
- Other unknown routes fallback to SPA `index.html` if build exists.
