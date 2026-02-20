# Backend Standalone Terminal HTML

## Purpose

`server/src/terminal.html` is a standalone utility terminal page served by `GET /terminal`.

This is separate from the React SPA but linked from the app navbar.

## UI + Libraries

- Uses `xterm.js` from CDN plus addons:
  - fit
  - web-links
  - webgl
  - canvas
- Header controls:
  - Clear button
  - Reconnect button (shown when disconnected)
  - Connection status badge
- Fonts: Space Grotesk (UI) and Space Mono (terminal)

## Connection Behavior

- Connects to `/ws/terminal` with `ws://` or `wss://` based on page protocol.
- Sends keepalive `ping` every 25s.
- Syncs terminal dimensions using fit addon with debounced resize.
- Auto-reconnects with capped backoff.
- Handles server `output`, `pong`, `exit`, and `error` message types.

## Rendering Notes

- Applies theme from local CSS variables.
- Supports query-param renderer preference (for example `?renderer=webgl`).
- Keeps a fallback renderer path if WebGL is unavailable.

## Why it matters

- Provides direct operational shell access when frontend app is running.
- Serves as a lightweight debug surface independent of SPA build state.
