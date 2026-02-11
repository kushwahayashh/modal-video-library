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
- Most interactions are transition-based, not transform-heavy animation.

## Note on Consistency
- `server/src/terminal.html` mirrors main token set closely.
- `server/src/manager.html` has its own embedded token set and uses Space Mono instead of Space Grotesk.
