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

## Local State Summary
- Data and loading: `videos`, `loading`.
- Playback: `selectedVideo`, `modalVisible`, `videoRef`, `playerRef`.
- Search: `search`.
- Context menu: `contextMenu`.
- Action modals: `actionModal`, `actionVideo`, `renameValue`, `actionLoading`.
- Properties: `videoProps`.
- Sprite status: `spriteProgress`.
- Thumbnail sources: `placeholderImages`, `thumbnailOverrides`.

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
- Polls `/api/sprites/progress` every second.
- Displays active extraction/tiling status.
- Refreshes video list after completion.
- On playback, enables Plyr preview thumbnails if `hasSprites` is true.

## Player Lifecycle
- Plyr is created once when modal opens and ref exists.
- Thumbnail track element is appended when sprite metadata exists.
- ESC key closes modal.
- Player destroyed on close transition completion.

## Error Handling
- Uses fallback empty states on fetch failures.
- Uses alert for operation failures (rename/delete/sprite).
- Defensive catch blocks avoid app crashes on background polling errors.
