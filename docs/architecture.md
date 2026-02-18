# Architecture

## High-Level Components
- Frontend web app: `client/` (React + Vite + TypeScript).
- Backend API server: `server/src/index.js` (Bun + Fastify + WebSocket).
- Local launcher: `main.py`.
- Modal launcher and image definition: `app.py`.
- Static image assets: `images/`.

## Runtime Topology
- Browser talks to backend via:
  - HTTP for metadata, streaming, sprites, and placeholder images.
  - WebSocket for interactive terminal I/O.
- Backend serves built frontend (`client/dist`) when present.
- Backend reads/writes media data under `DATA_DIR` (default `/data`).
- Modal run mounts persistent volume at `/data`.

## Data Directories
- `/data/videos`: source video files.
- `/data/thumbnails`: reserved for thumbnail assets.
- `/data/sprites`: generated sprite sheets and VTT files.
- `/data/db`: reserved for DB files.
- `/data/thumbnail-map.json`: frontend-selected thumbnail overrides.

## Identifier and Path Strategy
- Video IDs are base64url-encoded relative paths (e.g., `subfolder/video.mp4` for nested files).
- Sprite output paths are keyed by video ID.

## Core Flows

### Video Library Load
1. Frontend fetches `/api/videos`.
2. Backend recursively scans `/data/videos` (including subfolders), computes size, created time, duration, sprite availability.
3. Frontend renders cards and fetches placeholder + thumbnail map.

### Playback
1. User opens modal in UI.
2. Player loads `/api/stream/:id`.
3. Backend serves ranged streaming with MIME detection.
4. If sprites exist, Plyr loads `/api/sprites/:id/vtt` and image references.

### Sprite Generation
1. Frontend calls `POST /api/videos/:id/sprites`.
2. Backend launches async ffmpeg pipeline with progress tracked in-memory map.
3. Frontend polls `/api/sprites/progress` each second.
4. Backend publishes `sprite.jpg` and `sprite.vtt` under `/data/sprites/:id/`.

### Terminal
1. Browser opens `/terminal` and connects to `/ws/terminal`.
2. Backend spawns shell (`$SHELL` or `/bin/bash`) using Bun pseudo-terminal support.
3. Input/output frames are exchanged as JSON messages.

### Modal Cloud URL Registration
1. `app.py` starts cloudflared tunnel process.
2. Extracted `*.trycloudflare.com` URL is stored in Modal Dict.
3. URL is posted to backend via `POST /api/cf-url` for app-level awareness.

## Architectural Characteristics
- Single-process backend with async route handlers.
- No DB currently used for metadata; filesystem is source of truth.
- Thumbnail override map is persisted as JSON file.
- Sprite jobs are ephemeral and in-memory; progress disappears after process restart.
