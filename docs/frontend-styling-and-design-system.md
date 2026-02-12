# Frontend Styling and Design System

## Global Design Tokens (`client/src/index.css`)
- Core palette and semantics are defined via CSS variables:
  - Backgrounds: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-card`, `--bg-card-hover`
  - Text: `--text-primary`, `--text-secondary`, `--text-muted`
  - Border: `--border`
  - Accent and semantics: `--accent`, `--danger`, `--success`, `--warning`
  - Overlay and utility tokens: `--overlay-*`, `--danger-subtle`, `--shimmer-highlight`, `--shadow-*`
- Font family is Space Grotesk.
- Global scrollbar and selection styles are centralized here.

## Page-Level Style Files
- `client/src/App.css`
  - Navigation bar and search.
  - Video grid cards.
  - Context menu.
  - Video playback modal and Plyr thumbnail styles.
  - Action modals (rename/delete/properties/thumbnail picker).
  - Sprite progress toast.
  - Responsive breakpoints.
- `client/src/FileManager.css`
  - Header and breadcrumb toolbar.
  - File grid/list row layout.
  - Action buttons and modal styles.
  - Small-screen two-column fallback.

## Styling Constraints in Current Codebase
- Neutral/dark monochrome visual language.
- Border radii are mostly minimal (4px) with some 8px modal corners.
- Overlays use translucent dark backgrounds and selective backdrop blur.
- Video player modal uses CSS transitions for open/close.
- Action modals use CSS keyframe animations (`actionModalFadeIn`/`actionModalFadeOut`, `slideUp`/`slideDown`) with `onAnimationEnd` for cleanup.
- Context menu uses `contextMenuFadeIn` animation on mount.

## Note on Consistency
- `server/src/terminal.html` mirrors main token set closely.
- `server/src/manager.html` has its own embedded token set and uses Space Mono instead of Space Grotesk.

## Toast Notifications
- Toast styles are in `client/src/components/ToastStack.css`.
- Supports `error`, `success`, and `status` (with progress bar) variants.
