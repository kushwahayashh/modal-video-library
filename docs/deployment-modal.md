# Deployment on Modal (`app.py`)

## Modal Objects

- App name: `luna`
- Volume: `video-library-data` mounted at `/data`
- Dict: `cf-url-store` for runtime URL/status/heartbeat state

## Image Build Definition

Base image: `modal.Image.debian_slim()`

Installs:

- APT: `ffmpeg`, `aria2`, `curl`, `unzip`, `mediainfo`, `imagemagick`, `libmagic1`, `wget`
- Node.js 22 + global CLIs: `@openai/codex`, `@qwen-code/qwen-code`
- Bun (`bun`, `bunx` symlinked into `/usr/local/bin`)
- `yt-dlp`
- `cloudflared`
- Python packages: `gallery-dl`, `ffmpeg-python`, `python-magic`, `Pillow`, `mutagen`, `fastapi[standard]`

Build caching strategy:

1. Copy package manifests/config first.
2. Run `bun install` for server and client.
3. Copy source code and static assets afterward.

## `run()` Runtime Lifecycle

1. Reset runtime state in `cf-url-store` (`status=starting`, heartbeat).
2. Ensure `/data` directories exist.
3. Start Cloudflare tunnel subprocess and capture first `trycloudflare.com` URL.
4. Build client (`bun run build`) in parallel thread.
5. Start backend (`bun run start`) once build succeeds.
6. Wait for backend health (`/api/health`).
7. Post tunnel URL to backend (`POST /api/cf-url`).
8. Keep heartbeat updated while processes are alive.
9. Idle watchdog polls `/api/runtime/status` and stops app after 2h idle.
10. On exit, terminate child processes and clear URL/heartbeat state.

## Launch Endpoint (`@modal.fastapi_endpoint`)

Function: `launch(fmt: str = "")`

- Returns redirect HTML immediately for browser clients.
- HTML polls `?fmt=json` until app reaches running state and tunnel URL is ready.
- Returns `202` JSON during startup.
- Handles stale launch locks and failed prior runs.
- Spawns `run` only when no active run heartbeat is detected.

## Local Entrypoint

`@app.local_entrypoint` -> `main()` calls `run.remote()`.

Command:

```bash
modal run app.py
```

## Failure Modes

- Client build failure aborts startup.
- Backend health timeout marks runtime as failed.
- Tunnel URL capture may fail if cloudflared output format changes.
- Temporary status probe failures during idle checks are tolerated (loop continues).
