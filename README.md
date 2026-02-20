# LUNA Video Library

Self-hosted video library for local or Modal runtime.

## What the app does

- Scans videos recursively from `DATA_DIR/videos` and serves a searchable library UI.
- Streams videos with HTTP range support (`/api/stream/:id`).
- Generates and serves seek-preview sprites (`sprite.jpg` + `sprite.vtt`).
- Persists deterministic thumbnail selections (`thumbnail-map.json`).
- Tracks stable library ordering with `addedAt` metadata (`video-added-map.json`).
- Includes a browser terminal connected to a backend shell over WebSocket.

## Stack

- Frontend: React 18 + TypeScript + Vite
- Backend: Bun + Fastify + Fastify WebSocket
- Runtime launcher: Python (`main.py`) and Modal (`app.py`)
- Media tooling: `ffmpeg`, `ffprobe`

## Project layout

```text
.
├── main.py                     # Local launcher (install/build/start)
├── app.py                      # Modal image + launch/run lifecycle
├── server/
│   ├── src/index.js            # Fastify routes + WebSocket terminal
│   ├── src/lib/                # Sprite, file, metadata, map helpers
│   └── tests/                  # Contract + unit tests
├── client/
│   ├── src/App.tsx             # Video library page orchestration
│   ├── src/components/         # Modals, cards, context menu, player
│   └── src/hooks/              # Data/polling/player/state hooks
├── images/                     # Placeholder images served by backend
└── docs/                       # Architecture/API/runtime documentation
```

## Quick start

### Run locally

```bash
python main.py
```

Opens backend at `http://localhost:3000` (and serves built frontend from `client/dist`).

### Run frontend/backend separately (dev)

```bash
# terminal 1
cd server && bun install && bun run start

# terminal 2
cd client && bun install && bun run dev
```

Frontend dev server: `http://localhost:5173` (proxying `/api` to backend).

### Run on Modal

```bash
modal run app.py
```

`app.py` builds the client, starts backend + Cloudflare tunnel, and auto-stops after prolonged inactivity.

## Data layout

Default `DATA_DIR` is `/data`.

```text
/data
├── videos/                 # Source videos (nested folders supported)
├── sprites/                # Generated sprite artifacts per video ID
├── thumbnail-map.json      # videoId -> thumbnail URL
└── video-added-map.json    # videoId -> stable addedAt timestamp
```

## Key routes

- `GET /api/videos` with `q`, `offset`, `limit` pagination/search
- `GET /api/videos/:id` video properties + metadata
- `POST /api/videos/:id/rename`
- `DELETE /api/videos/:id`
- `POST /api/videos/:id/sprites`
- `GET /api/sprites/progress`
- `GET /api/stream/:id` (or `?download=1`)
- `GET /ws/terminal` (WebSocket)

Full reference: `docs/backend-api.md`.

## Environment variables

- `DATA_DIR`: media + metadata root (default `/data`)
- `PLACEHOLDERS_DIR`: placeholder image folder (default `images/`)
- `VIDEO_SCAN_CONCURRENCY`: concurrent stat/metadata workers for `/api/videos` (default `6`, max `16`)
- `PORT`: backend port (default `3000`)
- `SHELL`: shell used by `/ws/terminal`
- `NO_AUTO_LISTEN=1`: disables `listen()` for tests

## Testing

```bash
cd server && bun run test
```

## Documentation

- `docs/README.md` documentation index
- `docs/runtime-and-operations.md` runbooks and operational behavior
- `docs/architecture.md` system architecture and request flows
- `docs/frontend-overview.md` and `docs/backend-overview.md` implementation maps
