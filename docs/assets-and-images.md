# Assets and Images

## Purpose of `images/`

- Primary source for backend-served placeholder images.
- Files are exposed at `/api/placeholder-images/<filename>`.
- Includes `ANALYSIS.md` notes and artwork used by runtime redirect UI.

## Discovery Rules

Backend auto-discovers placeholder files from `PLACEHOLDERS_DIR` using extensions:

- `.jpg`
- `.jpeg`
- `.png`
- `.webp`
- `.gif`

List endpoint: `GET /api/placeholder-images`.

## Thumbnail Assignment Model

- For videos without explicit override, backend assigns deterministic placeholder by hashing video ID.
- Auto-assigned placeholders are persisted in `thumbnail-map.json`.
- User changes via UI override this value and are also stored in `thumbnail-map.json`.

## Current Repository Image Set

Tracked `images/` files include:

- anime portrait/close-up variants (for example: `anime-eye-teal-extreme-closeup.jpeg`, `anime-girl-violet-tone-soft-closeup.jpeg`, `anime-girl-red-hair-freckled-closeup.jpeg`)
- landscape/background variants (for example: `misty-harbor-castle-landscape.jpeg`, `snowfield-lone-figure-landscape.jpeg`)
- redirect background: `redirect-background-art.jpg`
- analysis notes: `ANALYSIS.md`

Use `git ls-files images` to view the exact current set.

## Frontend Public Assets

`client/public/` includes static Vite assets separate from backend placeholder discovery:

- `favicon.svg`
- `placeholder-1.jpeg`
- `placeholder-2.jpeg`
- `placeholder-3.jpeg`
