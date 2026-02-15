# File Catalog

This catalog covers all tracked repository files (excluding generated folders like `node_modules` and `client/dist`).

## Root Files
- `.gitignore`: ignores dependencies/build artifacts and Python cache.
- `AGENTS.md`: local coding and design constraints for agent workflows.
- `README.md`: high-level project introduction and run instructions.
- `design.md`: prompt-like frontend design guidance text.
- `main.py`: local bootstrapper for dependency install/build/start.
- `modal_app.py`: Modal image definition and runtime entrypoint.
- `start-tunnel.sh`: local tunnel helper and backend URL registration script.

## Backend (`server/`)
- `server/package.json`: backend scripts and dependencies.
- `server/package-lock.json`: backend dependency lockfile.
- `server/src/index.js`: main Fastify server with API + WS routes.
- `server/src/terminal.html`: standalone terminal client for `/terminal`.
- `server/tests/thumbnail-map.contract.test.js`: contract tests for `GET/POST /api/thumbnail-map` using Fastify inject.
- `server/tests/video-rename-delete.contract.test.js`: contract tests for rename/delete side-effects on sprite and thumbnail metadata.

## Frontend Build and Config (`client/`)
- `client/package.json`: frontend scripts and dependencies.
- `client/package-lock.json`: frontend dependency lockfile.
- `client/index.html`: Vite HTML shell and root mount point.
- `client/vite.config.js`: Vite config and API proxy.
- `client/tsconfig.json`: TypeScript config for app source.
- `client/tsconfig.node.json`: TypeScript config for Vite config file context.
- `client/tailwind.config.js`: Tailwind config scaffold.
- `client/postcss.config.js`: PostCSS plugin config.

## Frontend Source (`client/src/`)
- `client/src/main.tsx`: React bootstrap and route registration.
- `client/src/App.tsx`: video library page logic.
- `client/src/App.css`: video library styling.
- `client/src/components/ThumbnailPicker.tsx`: thumbnail selection component with loading skeletons.
- `client/src/components/ToastProvider.tsx`: global toast context provider and hook.
- `client/src/components/ToastStack.tsx`: toast notification stack renderer.
- `client/src/components/ToastStack.css`: toast notification styling.
- `client/src/components/video-library/ContextMenu.tsx`: right-click context menu with viewport clamping.
- `client/src/components/video-library/VideoCard.tsx`: video card with lazy thumbnail loading via intersection observer.
- `client/src/components/video-library/VideoPlayerModal.tsx`: video player modal with Plyr integration.
- `client/src/components/video-library/VideoActionModal.tsx`: action modal for rename, delete, properties, and thumbnail selection.
- `client/src/components/video-library/helpers.ts`: stable placeholder selection and thumbnail save helper.
- `client/src/components/video-library/types.ts`: shared types for context menu state, action modal, and video properties.
- `client/src/hooks/useSpriteProgress.ts`: sprite progress polling hook.
- `client/src/index.css`: global tokens and reset styles.
- `client/src/types.ts`: shared TS interfaces.
- `client/src/utils.ts`: reusable formatting helpers.

## Frontend Public Assets (`client/public/`)
- `client/public/favicon.svg`: app favicon.
- `client/public/placeholder-1.jpeg`: static placeholder asset.
- `client/public/placeholder-2.jpeg`: static placeholder asset.
- `client/public/placeholder-3.jpeg`: static placeholder asset.

## Shared Image Assets (`images/`)
- `images/01_teal_eye_extreme_closeup.jpeg`: curated placeholder image.
- `images/02_white_hair_center_portrait.jpeg`: curated placeholder image.
- `images/03_violet_tone_soft_portrait.jpeg`: curated placeholder image.
- `images/04_blue_eyes_black_hair_portrait.jpeg`: curated placeholder image.
- `images/05_red_hair_freckled_closeup.jpeg`: curated placeholder image.
- `images/ANALYSIS.md`: analysis notes for curated images.
- `images/anime-girl-black-outfit.jpeg`: placeholder image asset.
- `images/anime-girl-blue-closeup.jpeg`: placeholder image asset.
- `images/anime-girl-freckled-closeup.jpeg`: placeholder image asset.
- `images/anime-girl-straw-hat.jpeg`: placeholder image asset.
- `images/anime-girl-teal-portrait.jpeg`: placeholder image asset.
- `images/anime-girl-violet-closeup.jpeg`: placeholder image asset.
- `images/anime-girl-yellow-coat-profile.jpeg`: placeholder image asset.
- `images/bench-lone-figure.jpeg`: placeholder image asset.
- `images/misty-harbor-castle.jpeg`: placeholder image asset.
- `images/snowfield-lone-figure.jpeg`: placeholder image asset.

## Documentation (`docs/`)
- `docs/README.md`: documentation index.
- `docs/architecture.md`: architecture and flow map.
- `docs/runtime-and-operations.md`: runbook and environment behavior.
- `docs/backend-overview.md`: backend internals overview.
- `docs/backend-api.md`: route and payload reference.
- `docs/backend-terminal-html.md`: standalone terminal HTML behavior.
- `docs/file-catalog.md`: complete repository file inventory.
- `docs/frontend-overview.md`: frontend architecture summary.
- `docs/frontend-video-library-page.md`: `App.tsx` detailed behavior.
- `docs/frontend-styling-and-design-system.md`: design token and CSS file guide.
- `docs/deployment-modal.md`: Modal deployment/runtime details.
- `docs/assets-and-images.md`: image asset behavior and inventory.
- `docs/refactor-guide.md`: practical refactor strategy and extraction plan.
