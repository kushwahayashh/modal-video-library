# Refactor Guide

## Current Coupling Points
- `client/src/App.tsx` orchestrates data fetching, modal state, and action wiring; context menu, video card, player modal, and action modal have been extracted to `client/src/components/video-library/`.
- `server/src/` has been split into modules under `server/src/lib/`; main entrypoint is `server/src/index.js`.
- Duplicate utility UI exists for file manager:
  - React page (`client/src/FileManager.tsx`)
  - standalone HTML (`server/src/manager.html`)

## Safe Refactor Sequence
1. Extract backend service modules from `server/src/index.js` first.
2. Introduce frontend API client layer and typed request wrappers.
3. Split `App.tsx` into feature components and hooks.
4. Decide whether to keep or remove `server/src/manager.html`.
5. Add integration tests for critical routes before structural rewrites.

## Backend Extraction Targets
- Video scanning and metadata service.
- Sprite generation job service.
- File manager service.
- Terminal bridge service.
- Cloudflare URL state service.

## Frontend Extraction Targets
- `useVideos()` hook for list fetch + refresh.
- ~~`useSpriteProgress()` hook~~ — done (`client/src/hooks/useSpriteProgress.ts`).
- ~~`VideoPlayerModal` component~~ — done (`client/src/components/video-library/VideoPlayerModal.tsx`).
- ~~`VideoContextMenu` component~~ — done (`client/src/components/video-library/ContextMenu.tsx`).
- ~~`VideoActionsModal` component~~ — done (`client/src/components/video-library/VideoActionModal.tsx`).

## Contract Hardening
- Define shared API schemas for:
  - Video list item.
  - Video detail payload.
  - Sprite progress payload.
  - File manager item payload.
- Align backend and frontend with runtime validation where needed.

## Quality Improvements to Consider
- ~~Replace ad-hoc `alert` usage with a unified toast system~~ — done (`ToastProvider` + `ToastStack`).
- Add backend route tests for path safety and rename edge cases.
- Add e2e tests for sprite generation happy path and failure path.
