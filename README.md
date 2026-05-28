# LUNA Video Library

Self-hosted video library with a searchable UI, custom video player, and file manager — deployable locally or on [Modal](https://modal.com).

## Features

- **Video library** — recursive scan of `DATA_DIR/videos`, searchable with paginated results
- **Video streaming** — HTTP range support for seek-friendly playback
- **Custom video player** — keyboard shortcuts, playback speed control, edge fill toggle (`A`)
- **Seek-preview sprites** — auto-generated sprite sheets (`sprite.jpg` + `sprite.vtt`) for thumbnail scrubbing
- **Thumbnail management** — placeholder image upload/assignment, per-video thumbnail picker
- **Watch progress** — persists playback position, auto-clears at 95% completion
- **File manager** — browse, create, rename, download, and delete files/folders on the server
- **In-browser terminal** — WebSocket shell with xterm.js (resizable, 256-color)
- **SQLite storage** — all metadata (video index, thumbnails, watch progress) in a single `luna.db`
- **Idle auto-shutdown** — Modal container stops after 2 hours of inactivity

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Vanilla CSS, Space Grotesk, Tabler Icons |
| Backend | Bun, Fastify 5, Fastify WebSocket |
| Database | SQLite (WAL mode, via `bun:sqlite`) |
| Media | ffmpeg, ffprobe |
| Deployment | Modal (`app.py`), Cloudflare Tunnel |

## Project layout

```
.
├── app.py                              # Modal image build + run/launch lifecycle
├── server/
│   ├── src/
│   │   ├── index.ts                    # Fastify app, hooks, placeholder/thumbnail/progress routes
│   │   ├── routes/
│   │   │   ├── videos.ts              # Video CRUD, search, rename, delete, streaming
│   │   │   ├── sprites.ts            # Sprite generation + serving
│   │   │   ├── files.ts              # File manager (list, mkdir, rename, delete, download, info)
│   │   │   └── terminal.ts           # WebSocket terminal (PTY shell)
│   │   └── lib/
│   │       ├── sqlite-store.ts        # SQLite schema, prepared statements, transactions
│   │       ├── video-utils.ts         # ffprobe/ffmpeg helpers, base64url encoding, path safety
│   │       ├── sprite-generation.ts   # Sprite sheet extraction + VTT generation
│   │       ├── http-range.ts          # HTTP Range header parsing
│   │       └── files.ts              # fileExists, formatBytes utilities
│   └── tests/                          # Contract + unit tests (7 files, 12 tests)
├── client/
│   ├── src/
│   │   ├── App.tsx                     # Main page — library + file manager views
│   │   ├── index.css                   # Design tokens (dark monochrome palette)
│   │   ├── components/
│   │   │   ├── video-library/         # VideoCard, VirtualizedVideoGrid, CustomVideoPlayer,
│   │   │   │                            ContextMenu, VideoActionModal, VideoPlayerModal,
│   │   │   │                            ThumbnailBrowserModal, ProcessesModal
│   │   │   ├── file-manager/          # FileManager (full CRUD file browser)
│   │   │   └── ui/                    # Button, Sonner (toast notifications)
│   │   ├── hooks/                      # useVideoLibraryData, useVideoPlayer, useVideoActions,
│   │   │                                useSpriteProgress, useContextMenuState, useActionModal,
│   │   │                                useDialogFocusTrap
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

### Videos

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/videos?q=&offset=&limit=` | List/search videos with pagination |
| `GET` | `/api/videos/:id` | Video details + metadata |
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
| `DATA_DIR` | `/data` | Root for videos, sprites, thumbnails, and `luna.db` |
| `PLACEHOLDERS_DIR` | `$DATA_DIR/thumbnails` | Placeholder image directory |
| `VIDEO_SCAN_CONCURRENCY` | `6` | Concurrent workers for video scanning (max 16) |
| `PORT` | `3000` | Backend listen port |
| `SHELL` | `/bin/bash` | Shell for WebSocket terminal |
| `NO_AUTO_LISTEN` | — | Set to `1` to skip `listen()` (for tests) |

## Testing

```bash
cd server && bun run test
```

Runs 12 tests across 7 files — contract tests against the Fastify app and unit tests for HTTP range parsing.
