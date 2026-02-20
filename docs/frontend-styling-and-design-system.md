# Frontend Styling and Design System

## Global Tokens (`client/src/index.css`)

Core variables live in `:root` and should be reused across UI:

- Backgrounds: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-card`, `--bg-card-hover`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`
- Borders/accent: `--border`, `--accent`
- Semantics: `--danger`, `--danger-hover`, `--success`, `--warning`
- Overlay/utility: `--overlay-*`, `--danger-subtle`, `--shimmer-highlight`

Global typography uses Space Grotesk.

## Styling File Responsibilities

- `client/src/index.css`
  - CSS variables and reset/base rules
  - global font, selection, scrollbar styles
- `client/src/App.css`
  - navigation, cards, context menu, modals, custom player, processes modal, responsive rules
- `client/src/components/ToastStack.css`
  - toast container/card enter-exit transitions

## Visual Language in Current App

- Dark neutral palette built from root variables.
- Flat styling with minimal radius (primarily `4px`).
- No box-shadow emphasis in main app surfaces (`--shadow-*` set to `none`).
- Backdrop blur used on nav and modal overlays.
- Motion is mostly short opacity/transform transitions.

## Component-Specific Notes

- Custom player (`.vp-*` classes) intentionally uses:
  - black media stage
  - gradient controls backdrop
  - hover/scrub sprite preview states
- Context menu and action modal rely on lightweight enter/exit animations.
- Processes and status banners remain neutral (no colored informational accents).

## Terminal UI Parity

`server/src/terminal.html` mirrors the same token naming and typography approach, while remaining standalone.
