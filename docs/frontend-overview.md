# Frontend Overview

## Stack

- React 18 + TypeScript
- React Router (`/` route)
- Vite
- Lucide + Tabler icons

## Entry and Composition

- Entry: `client/src/main.tsx`
- Root tree:
  - `BrowserRouter`
  - `ToastProvider`
  - `Routes` -> `App`
  - `ToastStack`

## Main Page (`client/src/App.tsx`)

`App.tsx` orchestrates:

- search input + debounced query
- library data loading/pagination
- virtualized video grid rendering
- context menu actions
- player modal, action modal, and processes modal
- sprite job polling and completion notifications

## Key Hooks

- `useVideoLibraryData`:
  - loads `/api/videos` pages
  - handles `hasMore/loadingMore`
  - loads placeholders and thumbnail map
  - persists thumbnail overrides
- `useContextMenuState`:
  - context menu open/close/reopen timing and viewport-safe anchor positioning
- `useSpriteProgress`:
  - polls `/api/sprites/progress`
  - emits settled jobs (`done`/`error`) once per started job
- `useVideoPlayer`:
  - custom player state/actions
  - keyboard shortcuts
  - sprite VTT parsing and cue lookup
- `useDialogFocusTrap`:
  - focus trapping and focus restoration for modal dialogs

## Key Components

- `VirtualizedVideoGrid`: absolute-positioned virtualized list with overscan and scroll-driven paging
- `VideoCard`: lazy image loading + stable placeholder fallback
- `ContextMenu`: keyboard-accessible action menu with close/open animation
- `VideoPlayerModal`: modal container + sprite badge + custom player
- `CustomVideoPlayer`: full custom controls, scrubbing, volume/speed/fullscreen, sprite hover preview
- `VideoActionModal`: rename/delete/properties/thumbnail dialogs
- `ProcessesModal`: active sprite jobs list/progress
- `ThumbnailPicker`: image selection UI for thumbnail overrides
- `ToastProvider` + `ToastStack`: global notification system

## Data Contract Summary

`Video` item fields (from `/api/videos`):

- `id`, `title`, `filename`
- `size`, `sizeBytes`
- `createdAt`, `addedAt`
- `thumbnail`
- `duration`
- `hasSprites`

Properties modal extends this with `/api/videos/:id` metadata fields.

## Dev and Build

- Dev: `cd client && bun run dev` (`http://localhost:5173`)
- Build: `cd client && bun run build` -> `client/dist`
- API proxy: `/api` -> `http://localhost:3000` (configured in `client/vite.config.js`)
