# Video Library

A self-hosted video library app that runs locally, on Modal, or in GitHub Codespaces.

## Tech Stack

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Fastify + SQLite
- **Entry Point:** Python (for Modal compatibility)
- **Tools:** ffmpeg, yt-dlp, aria2c, mediainfo, gallery-dl, cloudflared

## Project Structure

```
├── main.py           # Local entry point
├── modal_app.py      # Modal entry point (image + cloudflare tunnel)
├── image.py          # Modal image definition (standalone)
├── server/           # Node.js backend (Fastify)
│   ├── package.json
│   └── src/
│       └── index.js
└── client/           # React frontend (Vite + Tailwind)
    ├── package.json
    └── src/
        ├── App.jsx
        └── main.jsx
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
4. Create a cloudflare tunnel
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
└── db/           # SQLite database
```

## Development

For frontend hot-reload during development:

```bash
# Terminal 1: Start backend
cd server && npm install && npm run start

# Terminal 2: Start frontend dev server
cd client && npm install && npm run dev
# Visit http://localhost:5173
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Python Entry (main.py / modal_app.py)          │
│  - Local: runs npm start                        │
│  - Modal: builds client + cloudflare tunnel     │
└─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  Node.js Backend (Fastify)                      │
│  - REST API for video operations                │
│  - Serves React build in production             │
│  - Tools: ffmpeg, yt-dlp, aria2c                │
└─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│  React Frontend                                 │
│  - Video library UI                             │
│  - Tailwind CSS styling                         │
└─────────────────────────────────────────────────┘
```

## Features (Planned)

- [ ] Video downloading (yt-dlp, aria2c)
- [ ] Video library browsing
- [ ] Metadata extraction
- [ ] Thumbnail generation
- [ ] Video streaming/playback
- [ ] Search and filtering
- [ ] Tags and categories
