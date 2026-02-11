# Frontend Overview

## Stack
- React 18
- TypeScript
- React Router
- Vite
- Lucide React icons
- Plyr media player

## Entry and Routing
- Entry: `client/src/main.tsx`
- Routes:
  - `/` -> `App` (`client/src/App.tsx`)
  - `/manager` -> `FileManager` (`client/src/FileManager.tsx`)

## Source File Responsibilities
- `client/src/App.tsx`: video library page, player modal, context menu, actions.
- `client/src/FileManager.tsx`: filesystem browser and file operations.
- `client/src/utils.ts`: formatting helpers.
- `client/src/types.ts`: shared type definitions.
- `client/src/index.css`: design tokens and global styles.
- `client/src/App.css`: styles for video library page and overlays.
- `client/src/FileManager.css`: styles for React file manager page.

## Build and Dev
- Dev server: `bun run dev` (port 5173).
- Build output: `client/dist`.
- Proxy: Vite forwards `/api/*` requests to `http://localhost:3000`.

## Data Contracts with Backend
- `Video` interface mirrors `/api/videos` response shape.
- `FileItem` interface mirrors `/api/files` response shape.
- Thumbnail overrides are read from and written to `/api/thumbnail-map`.
