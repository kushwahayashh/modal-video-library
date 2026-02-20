# Architecture

## High-Level Components

- Frontend SPA: `client/` (React + Vite + TypeScript)
- Backend API + WS: `server/src/index.js` (Bun + Fastify)
- Local launcher: `main.py`
- Modal launcher/runtime control: `app.py`
- Placeholder assets: `images/`

## Runtime Topology

- Browser <-> backend over HTTP for library, streaming, sprites, and metadata writes.
- Browser <-> backend over WebSocket for terminal I/O (`/ws/terminal`).
- Backend serves `client/dist` when available and falls back to SPA `index.html` for non-API routes.
- Backend reads/writes under `DATA_DIR` (default `/data`).

## Persistent Data Model

`DATA_DIR` contains:

- `videos/`: source media (subdirectories supported)
- `sprites/<videoId>/`: generated `sprite.jpg` and `sprite.vtt`
- `thumbnail-map.json`: selected thumbnail URL by `videoId`
- `video-added-map.json`: stable `addedAt` timestamp by `videoId`

Video IDs are base64url-encoded relative file paths (for example: `sub/clip.mp4`).

## Request and Processing Flows

### Library Load + Infinite Scroll

1. Frontend loads placeholders + thumbnail overrides.
2. Frontend requests `GET /api/videos?offset=<n>&limit=<m>&q=<optional>`.
3. Backend recursively scans `videos/`, computes metadata, applies stable placeholders, and sorts by `addedAt` descending.
4. Frontend appends pages and renders a virtualized grid.

### Thumbnail Assignment

1. Backend auto-assigns deterministic placeholders when no override exists.
2. Auto-assigned values are persisted to `thumbnail-map.json`.
3. User-selected thumbnail updates are written through `POST /api/thumbnail-map`.

### Playback

1. User opens modal player.
2. Player streams `/api/stream/:id` with range requests.
3. If sprites exist, player loads `/api/sprites/:id/vtt` and `/api/sprites/:id/image` for timeline preview.

### Sprite Generation

1. Frontend triggers `POST /api/videos/:id/sprites`.
2. Backend creates an in-memory job, extracts frames with parallel ffmpeg workers, builds tiled sprite + VTT.
3. Frontend polls `/api/sprites/progress` and updates process UI.
4. Jobs are removed shortly after completion/failure (ephemeral runtime state).

### Modal Launch + Tunnel

1. `app.py` run lifecycle starts Cloudflare tunnel and backend.
2. Tunnel URL is stored in Modal Dict and posted to backend `POST /api/cf-url`.
3. FastAPI launch endpoint (`launch`) returns a redirect page that polls until tunnel is ready.
4. Idle watchdog stops runtime when no terminal sessions, no active sprite jobs, and no user activity for 2 hours.

## Architecture Characteristics

- Filesystem is source of truth for video library state.
- JSON map stores are atomically written and serialized through queued operations.
- API server is single-process with async handlers.
- Sprite progress and terminal session count are process-local runtime state.
