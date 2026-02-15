# Backend Standalone Terminal HTML

## Purpose
The backend includes a standalone HTML page under `server/src/`:
- `terminal.html`: live terminal client used by route `/terminal`.

The primary app UI is React-based. This page is a utility UI.

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

## Notes for Refactor
- `terminal.html` is actively linked by React app (`/terminal`).
