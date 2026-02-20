# File Catalog

This catalog maps the repository by responsibility and highlights actively important files.

For an exact current tracked file list, run: `git ls-files`.

## Root

- `.gitignore`
- `AGENTS.md`
- `README.md`
- `design.md`
- `main.py`
- `app.py`
- `redirect.html`
- `start-tunnel.sh`

## Frontend (`client/`)

### Config and build files

- `client/package.json`
- `client/package-lock.json`
- `client/index.html`
- `client/vite.config.js`
- `client/tsconfig.json`
- `client/tsconfig.node.json`
- `client/postcss.config.js`
- `client/tailwind.config.js`

### Public assets

- `client/public/favicon.svg`
- `client/public/placeholder-1.jpeg`
- `client/public/placeholder-2.jpeg`
- `client/public/placeholder-3.jpeg`

### App source

- `client/src/main.tsx`
- `client/src/App.tsx`
- `client/src/App.css`
- `client/src/index.css`
- `client/src/types.ts`
- `client/src/utils.ts`

### Components

- `client/src/components/ThumbnailPicker.tsx`
- `client/src/components/ToastProvider.tsx`
- `client/src/components/ToastStack.tsx`
- `client/src/components/ToastStack.css`
- `client/src/components/video-library/ContextMenu.tsx`
- `client/src/components/video-library/CustomVideoPlayer.tsx`
- `client/src/components/video-library/ProcessesModal.tsx`
- `client/src/components/video-library/VideoActionModal.tsx`
- `client/src/components/video-library/VideoCard.tsx`
- `client/src/components/video-library/VideoPlayerModal.tsx`
- `client/src/components/video-library/VirtualizedVideoGrid.tsx`
- `client/src/components/video-library/helpers.ts`
- `client/src/components/video-library/types.ts`

### Hooks

- `client/src/hooks/useContextMenuState.ts`
- `client/src/hooks/useDialogFocusTrap.ts`
- `client/src/hooks/useSpriteProgress.ts`
- `client/src/hooks/useVideoLibraryData.ts`
- `client/src/hooks/useVideoPlayer.ts`

## Backend (`server/`)

### Config

- `server/package.json`
- `server/package-lock.json`

### Server source

- `server/src/index.js`
- `server/src/terminal.html`
- `server/src/lib/files.js`
- `server/src/lib/http-range.js`
- `server/src/lib/sprite-generation.js`
- `server/src/lib/thumb-map.js`
- `server/src/lib/video-added-map.js`
- `server/src/lib/video-utils.js`

### Tests

- `server/tests/http-range.unit.test.js`
- `server/tests/thumb-map.store.unit.test.js`
- `server/tests/thumbnail-map.contract.test.js`
- `server/tests/video-added-map.store.unit.test.js`
- `server/tests/video-list-order.contract.test.js`
- `server/tests/video-list-pagination.contract.test.js`
- `server/tests/video-placeholder-stability.contract.test.js`
- `server/tests/video-rename-delete.contract.test.js`

## Documentation (`docs/`)

- `docs/README.md`
- `docs/architecture.md`
- `docs/runtime-and-operations.md`
- `docs/backend-overview.md`
- `docs/backend-api.md`
- `docs/backend-terminal-html.md`
- `docs/frontend-overview.md`
- `docs/frontend-video-library-page.md`
- `docs/frontend-styling-and-design-system.md`
- `docs/deployment-modal.md`
- `docs/assets-and-images.md`
- `docs/refactor-guide.md`
- `docs/file-catalog.md`

## Image Assets (`images/`)

The `images/` directory currently contains:

- `ANALYSIS.md`
- multiple anime portrait/close-up JPEG placeholders
- multiple landscape/background JPEG placeholders
- `redirect-background-art.jpg`

Use `git ls-files images` for the full up-to-date filename list.
