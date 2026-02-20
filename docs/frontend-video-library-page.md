# Frontend Video Library Page (`client/src/App.tsx`)

## Responsibilities

- Display searchable video library.
- Open custom video player modal for playback.
- Show contextual actions (download, copy link, rename, delete, properties, sprites, thumbnail).
- Track active sprite generation jobs.
- Handle empty/error/loading states and user feedback via toasts.

## Core State Groups

- Playback: `selectedVideo`, `modalVisible`
- Search: `search`, `debouncedSearch`
- Action dialogs: `actionModal`, `actionModalClosing`, `actionVideo`, `renameValue`, `videoProps`, `actionLoading`
- Processes dialog: `processesModalOpen`
- Data layer (from `useVideoLibraryData`):
  - `videos`, `loading`, `loadingMore`, `hasMore`, `videosError`
  - `placeholderImages`, `placeholdersLoading`
  - `thumbnailOverrides`

## Data and Refresh Flow

1. `useVideoLibraryData` loads placeholder images + thumbnail map on mount.
2. `fetchVideosPage(true)` loads first page with optional debounced `q` search.
3. `VirtualizedVideoGrid` requests more pages as viewport nears content bottom.
4. Failures are shown as either:
   - full-page error (if no data loaded)
   - non-blocking retry banner (if old data exists)

## Search Behavior

- Input changes are debounced (~180ms).
- Search query is trimmed and sent as `q` to `/api/videos`.
- Empty results with active query show a dedicated “No results” state.

## Context Menu Actions

- `play`: opens player modal
- `download`: opens `/api/stream/:id?download=1`
- `copy-link`: copies direct stream URL to clipboard
- `rename`: opens rename dialog, posts `/api/videos/:id/rename`
- `info`: opens properties dialog, loads `/api/videos/:id`
- `sprites`: posts `/api/videos/:id/sprites`
- `thumbnail`: opens thumbnail picker, posts `/api/thumbnail-map`
- `delete`: sends `DELETE /api/videos/:id`

## Sprite Job UX

- `useSpriteProgress` polls `/api/sprites/progress` every second.
- Navbar shows `Processes` button with active job count when running jobs exist.
- `ProcessesModal` displays per-job status and extraction progress.
- On settled jobs:
  - `done`: success toast + mark `hasSprites: true`
  - `error`: error toast

## Player Modal and Preloading

- Opening modal sets selected video, then toggles visible state for transition.
- If selected video already has sprites, app prefetches VTT and sprite image.
- Closing modal is transition-safe via `closeTimerRef` cleanup.
- ESC handling priority:
  1. close processes modal
  2. close action modal
  3. close player modal

## Accessibility and Interaction

- Modals use focus trap hook (`useDialogFocusTrap`).
- Global scroll is locked while any modal is open.
- Context menu supports keyboard navigation and focus management.

## User Feedback Model

- Non-blocking toasts replace alert-driven UX.
- Success toasts: rename, delete, copy link, sprite start/completion, thumbnail update.
- Error toasts: API failures and sprite failures.
