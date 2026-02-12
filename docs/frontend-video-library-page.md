# Frontend Video Library Page (`client/src/App.tsx`)

## Main Responsibilities
- Fetch and render library grid.
- Open video player modal with Plyr.
- Show per-item context menu actions.
- Handle rename/delete/properties/thumbnail actions via modal dialogs.
- Trigger sprite generation and display in-progress toast.

## Internal Components
- `ContextMenu`: right-click action menu with viewport clamping and outside-click close behavior.
- `VideoCard`: lazy thumbnail loading with intersection observer and stable placeholder fallback.
- `ThumbnailPicker`: extracted thumbnail chooser used by the thumbnail action modal, including skeleton states and per-image fade-in.

## Local State Summary
- Data and loading: `videos`, `loading`.
- Playback: `selectedVideo`, `modalVisible`, `videoRef`, `playerRef`.
- Search: `search`.
- Context menu: `contextMenu`.
- Action modals: `actionModal`, `actionModalClosing`, `actionVideo`, `renameValue`, `actionLoading`.
- Properties: `videoProps`.
- Sprite status: `activeSpriteJobs` (via `useSpriteProgress` hook).
- Thumbnail sources: `placeholderImages`, `thumbnailOverrides`, `placeholdersLoading`.

## Data Fetching
- On mount:
  - Fetch `/api/placeholder-images`.
  - Fetch `/api/thumbnail-map`.
- Video list refresh via `fetchVideos()` calling `/api/videos`.
- Properties modal fetches `/api/videos/:id` lazily.

## User Actions
- `Play`: open modal, initialize Plyr instance.
- `Download`: open `/api/stream/:id?download=1`.
- `Copy Link`: copy direct stream URL.
- `Rename`: `POST /api/videos/:id/rename`.
- `Delete`: `DELETE /api/videos/:id`.
- `Generate Sprites`: `POST /api/videos/:id/sprites`.
- `Change Thumbnail`: save selection to `/api/thumbnail-map`.

## Sprite Integration
- Uses `useSpriteProgress` hook to poll `/api/sprites/progress` every second.
- Displays extraction/tiling status for all active jobs (not just one).
- Refreshes video list after each job settlement.
- On playback, enables Plyr preview thumbnails if `hasSprites` is true.

## Thumbnail Picker Behavior
- Thumbnail action modal renders `ThumbnailPicker` with three states:
  - Global loading skeleton tiles while placeholder list is loading.
  - Empty state when no placeholder images are available.
  - Interactive image grid with per-image skeleton until each image load completes.
- Selected thumbnail is persisted through `POST /api/thumbnail-map`.

## User Feedback
- Replaces blocking `alert` calls with in-app toast notifications.
- Uses success toasts for copy-link and sprite start/complete events.
- Uses error toasts for failed operations.

## Player Lifecycle
- Plyr is created once when modal opens and ref exists.
- Thumbnail track element is appended when sprite metadata exists.
- ESC key closes action modals first, then video player modal.
- Player destroyed on close transition completion (race-safe via `closeTimerRef`).

## Modal Animations
- Action modals use CSS animation-based fade-in/fade-out with `onAnimationEnd` for cleanup (no timers).
- Video player modal uses CSS transition-based open/close with race-safe timer cleanup via `closeTimerRef`.
- Search shows a "no results" empty state when filtering produces zero matches.

## Error Handling
- Uses fallback empty states on fetch failures.
- Uses toast notifications for operation failures (rename/delete/sprite).
- Defensive catch blocks avoid app crashes on background polling errors.
