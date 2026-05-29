# Running LUNA on Modal

This guide explains how LUNA is deployed and runs on [Modal](https://modal.com) — a serverless cloud platform that lets you run containers on-demand without managing infrastructure.

## How it works (high level)

```
You (local machine)
  │
  ├── `modal deploy app.py`  ──►  Modal Cloud
  │                               │
  │                               ├── Builds container image (cached)
  │                               ├── Mounts persistent volume at /data
  │                               ├── Builds client (Vite)
  │                               ├── Starts Fastify server
  │                               ├── Opens Cloudflare tunnel
  │                               └── Prints public URL
  │
  └── `launch()` endpoint  ──►  Auto-starts the container on first visit
                                 and redirects to the tunnel URL
```

There are two ways to start the app:

1. **`modal deploy app.py`** — deploys the app persistently, giving the `launch()` endpoint a stable URL
2. **`launch()` web endpoint** — visit the stable URL to auto-start the container via `run.spawn()` (fire-and-forget), then get redirected to the Cloudflare tunnel once ready

## Where videos are stored — Volumes

LUNA stores all its data on a **Modal Volume** — a persistent, distributed filesystem that survives container restarts.

```python
# app.py
volume = modal.Volume.from_name("video-library-data", create_if_missing=True)

@app.function(volumes={"/data": volume})
def run():
    # Everything under /data/ persists across runs
    ...
```

The volume is mounted at `/data` inside the container:

```
/data/
├── videos/         # Your video files (nested folders supported)
├── sprites/        # Generated seek-preview sprite sheets
├── thumbnails/     # Uploaded placeholder/thumbnail images
├── luna.db         # SQLite database (video index, thumbnails, watch progress)
└── .home/          # HOME directory (shell history, tool configs, etc.)
```

### Accessing volume data from CLI

You can browse, upload, and download files without starting the app:

```bash
# List all volumes
modal volume list

# Browse files in the volume
modal volume ls video-library-data
modal volume ls video-library-data /videos
modal volume ls video-library-data /videos/subfolder

# Upload videos to the volume
modal volume put video-library-data ./my-video.mp4 /videos/my-video.mp4
modal volume put video-library-data ./movie-folder/ /videos/movie-folder

# Download files from the volume
modal volume get video-library-data /videos/my-video.mp4 ./local-copy.mp4
modal volume get video-library-data /videos/ ./all-videos/

# Delete files from the volume
modal volume rm video-library-data /videos/unwanted-video.mp4
```

> **Tip:** This is the easiest way to bulk-upload videos. Upload them with `modal volume put`, then start the app — it will pick them up automatically on the next scan.

### Volume behavior

- Writes are automatically committed on container shutdown
- `volume.commit()` can be called to explicitly persist mid-run
- `volume.reload()` fetches changes made by other containers
- Multiple containers can read from the same volume concurrently

## Container image — what's installed

The Modal image is built in layers (each step is cached — only changed layers rebuild):

```python
image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg", "aria2", "curl", "imagemagick", ...)
    .run_commands(
        # Node.js 22, Bun, yt-dlp, cloudflared
    )
    .pip_install("gallery-dl", "ffmpeg-python", "Pillow", ...)
    # Package files first (dependency caching)
    .add_local_file("server/package.json", "/app/server/package.json")
    .run_commands("cd /app/server && bun install")
    # Source code last (changes don't bust dep cache)
    .add_local_dir("server/src", remote_path="/app/server/src")
    .add_local_dir("client/src", remote_path="/app/client/src")
)
```

**Installed tools available inside the container:**

| Tool | Purpose |
|------|---------|
| `ffmpeg` / `ffprobe` | Video processing, sprite generation, metadata |
| `yt-dlp` | Download videos from URLs |
| `aria2c` | Fast multi-connection downloads |
| `gallery-dl` | Batch media downloads |
| `imagemagick` | Image manipulation |
| `mediainfo` | Detailed media file info |
| `cloudflared` | Cloudflare tunnel for public URL |
| `bun` | JavaScript runtime (server) |
| `node` / `npm` | Node.js 22 |

## Shared state — `modal.Dict`

The `launch()` endpoint and `run()` function need to coordinate (is the app running? what's the tunnel URL?). They use a **Modal Dict** — a distributed key-value store:

```python
cf_url_store = modal.Dict.from_name("cf-url-store", create_if_missing=True)

# run() writes:
cf_url_store["url"] = "https://xxx.trycloudflare.com"
cf_url_store["status"] = "running"        # starting | running | stopped | failed
cf_url_store["heartbeat"] = time.time()   # proves the container is alive

# launch() reads:
state = {
    "url": cf_url_store.get("url"),
    "status": cf_url_store.get("status"),
    "heartbeat": cf_url_store.get("heartbeat"),
}
```

**Key behaviors:**
- Network latency ~tens of ms per operation
- Values are `cloudpickle`-serialized (any Python object)
- Entries expire after **7 days of inactivity**
- Max 100 MiB per entry

## Secrets

API keys are stored as Modal Secrets and injected as environment variables:

```python
@app.function(secrets=[modal.Secret.from_name("gemini-key")])
def run():
    key = os.environ["GEMINI_API_KEY"]  # Available as env var
```

**Managing secrets:**

```bash
# Create a secret
modal secret create gemini-key GEMINI_API_KEY=sk-...

# Or create via the Modal dashboard at https://modal.com/secrets
```

## Container lifecycle and timeouts

### Execution timeout

```python
@app.function(timeout=86400)  # 24 hours max runtime
def run():
    ...
```

The `run()` function has a 24-hour timeout — Modal will kill the container after that regardless of activity.

### Idle auto-shutdown (app-level)

LUNA implements its own idle detection on top of Modal's timeout:

```python
IDLE_TIMEOUT_SECONDS = 2 * 60 * 60  # 2 hours
```

Every 60 seconds, `run()` polls the server's `/api/runtime/status` endpoint checking:
- **Terminal connections** — are any WebSocket terminals open?
- **Active sprite jobs** — are sprites being generated?
- **Last activity timestamp** — when was the last API request?

If all are idle for 2 hours, the container shuts down gracefully.

### Heartbeat mechanism

The `run()` function writes `cf_url_store["heartbeat"] = time.time()` every second. The `launch()` endpoint uses this to determine if a container is actually alive (heartbeat must be < 15 seconds old).

### Launch lock

To prevent duplicate containers from spawning, `launch()` uses a lock mechanism:
- Sets `cf_url_store["launching"] = timestamp` before calling `run.spawn()`
- Lock TTL: 20 minutes (covers slow image builds)
- Grace period: 60 seconds (waits for heartbeat to appear)
- If the lock is stale and no heartbeat exists, it clears the lock and spawns fresh

## Common CLI commands

### Deploying the app

```bash
# Deploy persistently (stable launch URL, survives restarts)
modal deploy app.py

# One-off run for testing (blocks until container stops)
modal run app.py
```

### Debugging

```bash
# Open an interactive shell inside the container image
modal shell luna

# View logs of a running app
modal app logs <app-id>
modal app logs <app-id> -f    # follow (tail)

# List running apps
modal app list

# Stop a running app
modal app stop <app-id>
```

### Volume management

```bash
# Upload a batch of videos
modal volume put video-library-data ./movies/ /videos/movies

# Check what's stored
modal volume ls video-library-data /videos

# Download the SQLite database for local inspection
modal volume get video-library-data /luna.db ./luna-backup.db

# Clean up sprites to reclaim space
modal volume rm video-library-data /sprites
```

## Environment variables set by `app.py`

| Variable | Value | Purpose |
|----------|-------|---------|
| `HOME` | `/data/.home` | Persists shell history and tool configs across runs |
| `PI_OFFLINE` | `1` | Disables pi-coding-agent telemetry |

## Architecture notes

- **No direct ingress** — Modal functions don't expose ports directly. LUNA uses a Cloudflare quick tunnel (`cloudflared tunnel --url http://localhost:3000`) to make the Fastify server publicly accessible.
- **Client build happens at runtime** — the Vite build runs inside the container on every start (not during image build) so that source code changes take effect without rebuilding the image layer.
- **Image layering is optimized** — `package.json` files are added before source code, so `bun install` is cached and only re-runs when dependencies change.
- **`launch()` is a FastAPI endpoint** — decorated with `@modal.fastapi_endpoint()`, it gets a stable Modal-hosted URL. This is the "front door" that auto-starts the container and redirects to the tunnel.
- **`run()` is a regular function** — it runs as a long-lived container (up to 24h) managing the server, tunnel, and idle watchdog as subprocesses/threads.
