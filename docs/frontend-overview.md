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
- `client/src/App.tsx`: video library page orchestration, modal routing, and action wiring.
- `client/src/FileManager.tsx`: filesystem browser and file operations.
- `client/src/components/ThumbnailPicker.tsx`: thumbnail selection grid with skeleton loading and image-level load state.
- `client/src/components/ToastProvider.tsx`: global toast context and `useToast` hook.
- `client/src/components/ToastStack.tsx`: toast notification stack renderer with status/error/success variants.
- `client/src/components/ToastStack.css`: toast notification styling.
- `client/src/components/video-library/ContextMenu.tsx`: right-click context menu with viewport clamping and keyboard/scroll close.
- `client/src/components/video-library/VideoCard.tsx`: video card with lazy thumbnail loading via intersection observer.
- `client/src/components/video-library/VideoPlayerModal.tsx`: video player modal overlay with Plyr integration.
- `client/src/components/video-library/VideoActionModal.tsx`: action modal for rename, delete, properties, and thumbnail operations with fade-out animation.
- `client/src/components/video-library/helpers.ts`: stable placeholder hash and thumbnail save helper.
- `client/src/components/video-library/types.ts`: shared types for context menu, action modal, and video properties.
- `client/src/hooks/useSpriteProgress.ts`: sprite progress polling hook with job-settled callback.
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
