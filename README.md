# LUNA Video Library

Self-hosted video library with a searchable UI, custom video player, and file manager — deployable locally or on [Modal](https://modal.com).

## Features

- **Video library** — recursive scan of `DATA_DIR/videos`, searchable with paginated results
- **Password gate** — signed session cookie protects all data, media, and terminal endpoints
- **Video streaming** — HTTP range support for seek-friendly playback
- **Custom video player** — keyboard shortcuts, playback speed control, edge fill toggle (`A`)
- **Seek-preview sprites** — auto-generated sprite sheets (`sprite.jpg` + `sprite.vtt`) for thumbnail scrubbing
- **Thumbnail management** — placeholder image upload/assignment, per-video thumbnail picker
- **Watch progress** — persists playback position, auto-clears at 95% completion
- **Downloads** — fetch media with yt-dlp or aria2c, with live progress and logs over WebSocket
- **File manager** — browse, create, rename, download, and delete files/folders on the server
- **In-browser terminal** — WebSocket shell with xterm.js (resizable, 256-color)
- **Auto-refresh** — library polls a version endpoint and reloads when files change on disk
- **SQLite storage** — all metadata (video index, thumbnails, watch progress) in a single `luna.db`
- **Idle auto-shutdown** — Modal container stops after 2 hours of inactivity

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Vanilla CSS, Varela Round, Tabler Icons |
| Backend | Bun, Fastify 5, Fastify WebSocket |
| Database | SQLite (WAL mode, via `bun:sqlite`) |
| Media | ffmpeg, ffprobe |
| Downloaders | yt-dlp, aria2c |
| Deployment | Modal (`app.py`), Cloudflare Tunnel |

## Project layout

```
.
├── app.py                              # Modal image build + run/launch lifecycle
├── server/
│   ├── src/
│   ├── src/
│   │   ├── index.ts                    # Fastify app, auth hook, placeholder/thumbnail/progress routes
│   │   ├── routes/
│   │   │   ├── videos.ts              # Video CRUD, search, rename, delete, streaming
│   │   │   ├── sprites.ts            # Sprite generation + serving
│   │   │   ├── files.ts              # File manager (list, mkdir, rename, delete, download, info)
│   │   │   ├── downloads.ts          # Download jobs + WebSocket progress stream
│   │   │   ├── auth.ts               # Login, logout, session check
│   │   │   └── terminal.ts           # WebSocket terminal (PTY shell)
│   │   └── lib/
│   │       ├── sqlite-store.ts        # SQLite schema, prepared statements, transactions
│   │       ├── video-utils.ts         # ffprobe/ffmpeg helpers, base64url encoding, path safety
│   │       ├── sprite-generation.ts   # Sprite sheet extraction + VTT generation
│   │       ├── download-service.ts    # yt-dlp/aria2c job lifecycle, log buffer, event emitter
│   │       ├── auth.ts               # Token signing/verification, cookie helpers
│   │       ├── http-range.ts          # HTTP Range header parsing
│   │       └── files.ts              # fileExists, formatBytes utilities
├── client/
│   ├── src/
│   │   ├── App.tsx                     # Main page — library + file manager views
│   │   ├── index.css                   # Design tokens (dark monochrome palette)
│   │   ├── components/
│   │   │   ├── video-library/         # VideoCard, VirtualizedVideoGrid, CustomVideoPlayer,
│   │   │   │                            ContextMenu, PlayerContextMenu, VideoActionModal,
│   │   │   │                            VideoPlayerModal, StreamModal, ThumbnailBrowserModal,
│   │   │   │                            ProcessesModal
│   │   │   ├── file-manager/          # FileManager (full CRUD file browser)
│   │   │   ├── downloads/            # DownloadsPage (job list, progress, logs)
│   │   │   ├── PasswordGate.tsx      # Login screen shown until authenticated
│   │   │   └── ui/                    # Button, Sonner (toast notifications)
│   │   ├── hooks/                      # useVideoLibraryData, useVideoPlayer, useVideoActions,
│   │   │                                useSpriteProgress, useContextMenuState, useActionModal,
│   │   │                                useDialogFocusTrap, useDownloads
│   │   └── lib/utils.ts
│   └── dist/                           # Production build output
└── images/                             # Default placeholder images
```

## Quick start

### Local development

```bash
# terminal 1 — backend
cd server && bun install && bun run start

# terminal 2 — frontend (proxies /api → localhost:3000)
cd client && bun install && bun run dev
```

Frontend dev server runs at `http://localhost:5173`.

### Deploy on Modal

```bash
modal run app.py
```

This builds the client, starts the backend, opens a Cloudflare tunnel, and prints the public URL. The container auto-stops after 2 hours of inactivity.

The `launch()` endpoint provides a web URL that auto-starts the container on first visit and redirects to the tunnel once ready.

## Data layout

Default `DATA_DIR` is `/data` (on Modal) or a local directory.

```
$DATA_DIR/
├── videos/             # Source videos (nested folders supported)
├── sprites/            # Generated sprite artifacts per video ID
│   └── <videoId>/
│       ├── sprite.jpg  # Tiled sprite sheet
│       └── sprite.vtt  # WebVTT timestamps → sprite regions
├── thumbnails/         # Uploaded placeholder/thumbnail images
└── luna.db             # SQLite database (videos, thumbnails, watch progress)
```

### SQLite schema (`luna.db`)

| Table | Purpose |
|-------|---------|
| `videos` | Video index — id, filename, title, size, duration, addedAt, lastSeenAt |
| `thumbnail_overrides` | Per-video thumbnail URL assignments |
| `watch_progress` | Playback position (currentTime, duration, updatedAt) |

## API reference

All endpoints under `/api/`, `/ws/`, and `/terminal` require a valid session cookie and
return `401` without one. The exceptions — reachable unauthenticated — are `/api/auth/*`,
`/api/health`, `/api/runtime/status`, `/api/cf-url`, and `/cf`. Static client assets are
served freely so the password gate can render.

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Log in (`{ password }`), sets session cookie |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/auth/check` | Whether the current cookie is valid |

### Videos

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/videos?q=&offset=&limit=` | List/search videos with pagination |
| `GET` | `/api/videos/:id` | Video details + metadata |
| `GET` | `/api/videos/version` | Library fingerprint — changes when files change on disk |
| `POST` | `/api/videos/:id/rename` | Rename video (`{ newName }`) |
| `DELETE` | `/api/videos/:id` | Delete video + sprites + metadata |
| `GET` | `/api/videos/:id/progress` | Get watch progress |
| `POST` | `/api/videos/:id/progress` | Save watch progress (`{ currentTime, duration }`) |
| `GET` | `/api/stream/:id` | Stream video (HTTP range) |
| `GET` | `/api/stream/:id?download=1` | Download video file |

### Sprites

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/videos/:id/sprites` | Start sprite generation |
| `GET` | `/api/sprites/progress` | All sprite job statuses |
| `GET` | `/api/sprites/:id/image` | Sprite sheet image |
| `GET` | `/api/sprites/:id/vtt` | Sprite VTT file |
| `GET` | `/api/sprites/:id/status` | Check if sprites exist |

### Thumbnails

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/placeholder-images` | List available placeholder images |
| `POST` | `/api/placeholder-images/upload` | Upload placeholder images (multipart) |
| `DELETE` | `/api/placeholder-images/:filename` | Delete a placeholder image |
| `GET` | `/api/thumbnail-map` | Get all thumbnail overrides |
| `POST` | `/api/thumbnail-map` | Set thumbnail (`{ videoId, imageUrl }`) |

### File manager

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/files?path=` | List directory contents |
| `POST` | `/api/files/mkdir` | Create folder (`{ path, name }`) |
| `POST` | `/api/files/rename` | Rename file/folder (`{ path, newName }`) |
| `DELETE` | `/api/files` | Delete file/folder (`{ path }`) |
| `GET` | `/api/files/download?path=` | Download a file |
| `GET` | `/api/files/info?path=` | File/folder properties |

### Downloads

Jobs run yt-dlp or aria2c into `DATA_DIR/videos` and are held in memory, so they do not
survive a restart. Each job keeps a rolling buffer of the last 800 log lines.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/downloads` | List all jobs |
| `GET` | `/api/downloads/:id` | Single job status |
| `GET` | `/api/downloads/:id/logs` | Buffered job logs |
| `POST` | `/api/downloads/info` | Probe a URL without downloading (`{ url, tool, extraArgs }`) |
| `POST` | `/api/downloads` | Start a job (`{ url, tool, format, filename, subdir, ... }`) |
| `DELETE` | `/api/downloads/:id` | Cancel an active job, or remove a finished one (`?force=1` to do both) |
| `POST` | `/api/downloads/clear` | Remove all finished jobs |
| `GET` | `/ws/downloads` | WebSocket — snapshot on connect, then live progress and log events |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/runtime/status` | Runtime status (idle time, terminal count, active jobs) |
| `GET` | `/api/watch-progress` | All watch progress entries |
| `GET` | `/api/cf-url` | Current Cloudflare tunnel URL |
| `POST` | `/api/cf-url` | Set tunnel URL (internal) |
| `GET` | `/ws/terminal` | WebSocket terminal |
| `GET` | `/terminal` | Terminal HTML page |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCESS_PASSWORD` | `modal` | Site password. Set this before exposing the app publicly |
| `AUTH_SECRET` | derived from password | Explicit signing secret for session tokens |
| `DATA_DIR` | `/data` | Root for videos, sprites, thumbnails, and `luna.db` |
| `PLACEHOLDERS_DIR` | `$DATA_DIR/thumbnails` | Placeholder image directory |
| `VIDEO_SCAN_CONCURRENCY` | `6` | Concurrent workers for video scanning (max 16) |
| `PORT` | `3000` | Backend listen port |
| `SHELL` | `/bin/bash` | Shell for WebSocket terminal |
| `NO_AUTO_LISTEN` | — | Set to `1` to import the app without calling `listen()` |

Server variables can also be set in `server/.env` — see `server/.env.example`.

## Testing

No test suite at present.
