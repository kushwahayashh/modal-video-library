# Assets and Images

## `images/` Folder Purpose
- Serves static placeholder images via backend route `/api/placeholder-images`.
- Stores curated/renamed image assets and analysis markdown used by UI thumbnail picker.

## Current Curated Set
- `images/01_teal_eye_extreme_closeup.jpeg`
- `images/02_white_hair_center_portrait.jpeg`
- `images/03_violet_tone_soft_portrait.jpeg`
- `images/04_blue_eyes_black_hair_portrait.jpeg`
- `images/05_red_hair_freckled_closeup.jpeg`
- `images/ANALYSIS.md`

## Additional Placeholder Images
- Existing image files in `images/` are auto-discovered by extension:
  - `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`
- Frontend receives deterministic placeholder assignment using a hash of video ID.

## Public Frontend Assets
- `client/public/placeholder-1.jpeg`
- `client/public/placeholder-2.jpeg`
- `client/public/placeholder-3.jpeg`
- `client/public/favicon.svg`

These public assets are bundled by Vite and are separate from backend-served `/api/placeholder-images` files.
