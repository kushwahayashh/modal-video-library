# Refactor Guide

## Current Coupling Points
- `client/src/App.tsx` mixes data fetching, modal orchestration, sprite polling, player lifecycle, and context-menu logic.
- `server/src/index.js` contains all route registration and all service logic in one file.
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
- `useSpriteProgress()` hook for polling lifecycle.
- `VideoPlayerModal` component.
- `VideoContextMenu` component.
- `VideoActionsModal` component.

## Contract Hardening
- Define shared API schemas for:
  - Video list item.
  - Video detail payload.
  - Sprite progress payload.
  - File manager item payload.
- Align backend and frontend with runtime validation where needed.

## Quality Improvements to Consider
- Replace ad-hoc `alert` usage with a unified toast system.
- Add backend route tests for path safety and rename edge cases.
- Add e2e tests for sprite generation happy path and failure path.
