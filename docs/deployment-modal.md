# Deployment on Modal (`modal_app.py`)

## Modal Objects
- App name: `video-library`.
- Volume: `video-library-data` mounted at `/data`.
- Dict: `cf-url-store` storing active tunnel URL.

## Container Image Definition
- Base: `modal.Image.debian_slim()`.
- APT installs:
  - ffmpeg, aria2, curl, unzip, mediainfo, imagemagick, libmagic1, wget
- Tool installs via commands:
  - Node.js 22
  - global CLIs: `@openai/codex`, `@qwen-code/qwen-code`
  - Bun and symlinks (`bun`, `bunx`)
  - `yt-dlp`
  - `cloudflared`
- Pip installs:
  - gallery-dl, ffmpeg-python, python-magic, Pillow, mutagen, fastapi[standard]

## Layering and Build Caching
- Package files copied first for dependency cache stability.
- `bun install` runs in image build for both `server` and `client`.
- Source directories copied after dependency layers.

## `run()` Function Lifecycle
1. Ensure `/data` runtime directories exist.
2. Start cloudflared tunnel subprocess and parse trycloudflare URL.
3. Build React client in parallel thread.
4. Start backend server after build success.
5. Wait for `/api/health` readiness.
6. Post tunnel URL to backend `/api/cf-url`.
7. Keep process alive while tunnel and server stay alive.
8. Terminate child processes on exit.

## Exposed FastAPI Endpoints
- `get_cf_url()`:
  - Redirects to current tunnel URL if available.
- `cf_url_json()`:
  - Returns `{ url }` JSON if set.

## Local Entrypoint
- `main()` calls `run.remote()`.

## Failure Modes to Watch
- Client build failures abort startup.
- Health check timeout aborts startup.
- Tunnel URL may be unset if cloudflared logs never include expected pattern.
