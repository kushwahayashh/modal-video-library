# Runtime and Operations

## Required Tooling
- Bun runtime for backend and frontend dependency management.
- Python 3 for local launcher.
- ffmpeg and ffprobe for durations and sprite generation.
- cloudflared for public tunnel flow.

## Commands
- Local all-in-one start: `python main.py`
- Frontend dev server: `cd client && bun run dev`
- Backend server: `cd server && bun run start`
- Frontend build: `cd client && bun run build`
- Modal run: `modal run modal_app.py`

## Local Run Behavior (`main.py`)
- Checks and installs `server/node_modules` if missing.
- Checks and installs `client/node_modules` if missing.
- Builds frontend if `client/dist` is missing.
- Starts backend on `http://localhost:3000`.

## Backend Runtime Variables
- `DATA_DIR`: root data folder for videos, sprites, thumbnails, and map file.
- `SHELL`: terminal shell binary for `/ws/terminal`.

## Modal Runtime Notes
- Persistent volume: `video-library-data` mounted to `/data`.
- Runtime `HOME` is set to `/data/.home`.
- Container process starts tunnel, builds client, then starts backend.

## Tunnel Utility Script
- `start-tunnel.sh [modal-url]` starts cloudflared against a target URL.
- Extracts a public `trycloudflare.com` URL from cloudflared logs.
- Registers URL back to app through `POST /api/cf-url`.

## Operational Caveats
- Sprite progress is in-memory and not persisted.
- Duration cache invalidates by file `mtime` and path.
- If `client/dist` is absent, backend static serving for SPA is skipped.
- Local environment without `/data` may limit media features unless `DATA_DIR` is set.
