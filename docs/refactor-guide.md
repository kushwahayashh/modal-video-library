# Refactor Guide

## Current State Snapshot

- Backend logic is already split into focused modules under `server/src/lib/`.
- Frontend `App.tsx` is orchestration-heavy but major concerns are extracted into hooks/components.
- Contract/unit tests exist for key backend behavior (pagination, ordering, map stores, rename/delete side effects, range parsing).

## Coupling That Still Exists

- `App.tsx` still coordinates many flows (search, modals, action dispatch, toasts, sprite settlement).
- API calls are still made directly via `fetch` from components/hooks (no shared typed API client layer).
- Backend route handlers still contain substantial inline flow logic (especially `/api/videos` scan + merge behavior).

## Safe Refactor Sequence

1. Introduce a typed frontend API client (`client/src/api/*`) wrapping all request/response parsing.
2. Extract `App.tsx` action handlers into dedicated hooks:
   - `useVideoActions` (rename/delete/sprite/thumbnail)
   - `useModalState` (player/action/processes lifecycle)
3. Move backend video scanning and list assembly into dedicated service module from `index.js`.
4. Add schema validation on backend request bodies for mutation endpoints.
5. Expand tests around error cases and path safety constraints.

## Done vs Pending

Done:

- `useSpriteProgress`
- `useVideoLibraryData`
- `useContextMenuState`
- `useVideoPlayer`
- extracted modal/grid/player/context-menu components
- JSON map store isolation (`thumb-map`, `video-added-map`)

Pending:

- Shared runtime API schema definitions (frontend/backend)
- Frontend API client layer with centralized error extraction
- Additional backend test coverage for:
  - malformed request bodies across mutating routes
  - placeholder directory edge cases
  - sprite generation failure diagnostics

## Testing Priorities Before Large Refactors

- Keep `NO_AUTO_LISTEN=1` inject-style route tests for contracts.
- Preserve rename/delete side-effect tests whenever touching ID/path logic.
- Add focused tests before changing `/api/videos` scan/sort/pagination behavior.
