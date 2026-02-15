# Video Library

A self-hosted video library app that runs locally or on Modal with a Cloudflare tunnel.

## Tech Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Bun + Fastify
- **Entry Point:** Python (for Modal compatibility)
- **Tools:** ffmpeg, yt-dlp, aria2c, mediainfo, gallery-dl, cloudflared

## Project Structure

```
├── main.py           # Local entry point
├── modal_app.py      # Modal entry point (image + cloudflare tunnel)
├── server/           # Bun + Fastify backend
│   ├── package.json
│   └── src/
│       ├── index.js
│       └── lib/      # Backend service modules
└── client/           # React + Vite frontend
    ├── package.json
    └── src/
        ├── App.tsx
        ├── types.ts
        ├── utils.ts
        ├── hooks/
        │   └── useSpriteProgress.ts
        └── components/
            ├── ThumbnailPicker.tsx
            ├── ToastProvider.tsx
            ├── ToastStack.tsx
            └── video-library/
                ├── ContextMenu.tsx
                ├── VideoCard.tsx
                ├── VideoPlayerModal.tsx
                ├── VideoActionModal.tsx
                ├── helpers.ts
                └── types.ts
```

## Running Locally

```bash
python main.py
# Visit http://localhost:3000
```

First run will install dependencies and build the client automatically.

## Running on Modal

```bash
modal run modal_app.py
```

This will:
1. Use pre-built image with all dependencies (fast!)
2. Build the React client
3. Start the Fastify server
4. Create a Cloudflare tunnel
5. Output a public URL (e.g., `https://xxx.trycloudflare.com`)

**Note:** The URL only works while the container is running. Each run generates a new URL.

### Cold Start Performance

- **First run:** Image builds with deps (~2-3 min, cached forever)
- **Subsequent runs:** ~5-7 seconds (build client + start server)

## Modal Volume

Videos and data are stored in a persistent Modal Volume (`video-library-data`):

```
/data
├── videos/       # Downloaded videos
├── thumbnails/   # Generated thumbnails
├── sprites/      # Sprite sheets + VTT files
└── db/           # SQLite database
```

## Development

For frontend hot-reload during development:

```bash
# Terminal 1: Start backend
cd server && bun install && bun run start

# Terminal 2: Start frontend dev server
cd client && bun install && bun run dev
# Visit http://localhost:5173
```

## Features

- [x] Video library browsing
- [x] Video streaming/playback (Plyr)
- [x] Search
- [x] Context menu (play, download, copy link, rename, delete, properties, thumbnails, sprites)
- [x] Sprite generation (preview thumbnails on seek bar)
  - Parallel ffmpeg frame extraction across CPU cores
  - Real-time progress tracking (persists across page refresh)
  - Plyr preview thumbnails via WebVTT
- [x] Processes modal for active background jobs (sprite extraction/tiling progress)
- [x] Toast notification system
- [x] Web terminal
- [ ] Video downloading (yt-dlp, aria2c)
- [x] Metadata extraction (video properties modal)
- [x] Thumbnail selection for library grid
- [ ] Tags and categories
