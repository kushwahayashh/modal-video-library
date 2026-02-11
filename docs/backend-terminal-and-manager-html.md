# Backend Standalone HTML Tools

## Purpose
The backend includes two standalone HTML pages under `server/src/`:
- `terminal.html`: live terminal client used by route `/terminal`.
- `manager.html`: static file-manager page that talks to file API routes.

The primary app UI is React-based. These pages are utility UIs and can be used independently.

## `terminal.html`

### Dependencies
- xterm.js from CDN.
- xterm addons: fit, web-links, webgl, canvas.

### UI Features
- Header with connection status.
- Clear button.
- Reconnect button that appears when disconnected.

### Runtime Behavior
- Connects to `/ws/terminal` using `ws://` or `wss://` based on page protocol.
- Sends periodic ping every 25 seconds.
- Supports resize sync with debounced fitting.
- Keeps terminal rendered via heartbeat when visible.
- Auto-reconnect with capped exponential backoff.
- Supports optional renderer selection via query param `?renderer=webgl`.

### Client Message Handling
- Writes raw output from server `output` events.
- Prints system lines for exit and connection loss.
- Sends keystrokes to server on every terminal input event.

## `manager.html`

### Purpose
- Legacy/non-React file manager page.
- Uses same backend file API as React manager.

### Behavior
- Loads file list via `/api/files`.
- Renders breadcrumb navigation.
- Supports folder navigation, rename, and delete.
- Supports right-click context menu actions.
- Uses modal overlays for rename/delete confirmation.

### API Calls
- `GET /api/files?path=...`
- `POST /api/files/rename`
- `DELETE /api/files/<encoded path>`

## Notes for Refactor
- `terminal.html` is actively linked by React app (`/terminal`).
- `manager.html` currently has no explicit backend route registration in `server/src/index.js` and appears to be a retained utility artifact.
- If removing `manager.html`, verify no external links or automation depend on it.
