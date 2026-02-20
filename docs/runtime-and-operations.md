# Runtime and Operations

## Required Tooling

- Bun (server runtime and JS package management)
- Python 3 (launcher scripts)
- ffmpeg + ffprobe (duration, metadata, sprite generation)
- cloudflared (public tunnel path)

## Common Commands

- Local all-in-one: `python main.py`
- Backend only: `cd server && bun run start`
- Backend watch: `cd server && bun run dev`
- Frontend dev: `cd client && bun run dev`
- Frontend build: `cd client && bun run build`
- Backend tests: `cd server && bun run test`
- Modal run: `modal run app.py`

## Local Launcher Behavior (`main.py`)

- Installs `server/node_modules` if missing.
- Installs `client/node_modules` if missing.
- Builds client if `client/dist` does not exist.
- Starts backend on `http://localhost:3000`.

## Backend Runtime Variables

- `DATA_DIR` (default `/data`)
- `PLACEHOLDERS_DIR` (default `<repo>/images`)
- `VIDEO_SCAN_CONCURRENCY` (default `6`, min `1`, max `16`)
- `SHELL` (terminal shell binary for `/ws/terminal`)
- `PORT` (default `3000`)
- `NO_AUTO_LISTEN=1` (for tests using `app.inject`)

## Modal Runtime Notes (`app.py`)

- Modal volume `video-library-data` mounted at `/data`.
- Runtime `HOME` set to `/data/.home`.
- `run()` lifecycle:
  - starts Cloudflare tunnel
  - builds client
  - starts backend
  - posts tunnel URL to backend
  - monitors activity and auto-stops on idle timeout (2 hours)
- Runtime state stored in Modal Dict `cf-url-store` (`url`, `status`, `heartbeat`, `launching`).

## Health and Runtime Status

- `GET /api/health` reports server status + current Cloudflare URL.
- `GET /api/runtime/status` reports:
  - `lastActivityAt`
  - `terminalConnectionCount`
  - `activeSpriteJobs`

This status endpoint is used by the Modal idle watchdog.

## Tunnel Helper Script

`start-tunnel.sh [target-url]`

- Starts `cloudflared tunnel --url <target>`.
- Parses first `trycloudflare.com` URL from logs.
- Registers it through `POST <target>/api/cf-url`.

## Operational Caveats

- Sprite job progress is in-memory only.
- If `client/dist` is missing, backend serves API only (no SPA fallback page).
- Frontend dev proxy forwards `/api` but not `/ws`; terminal route is typically tested against backend origin.
