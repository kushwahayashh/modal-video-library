# Instructions

## Design Language

All UI changes must follow the app's existing design language:

- **Dark monochrome palette** — use CSS variables from `client/src/index.css`, never hardcoded colors
  - Backgrounds: `--bg-primary` (#0a0a0a), `--bg-secondary` (#111), `--bg-tertiary` (#1a1a1a), `--bg-card` (#161616)
  - Text: `--text-primary` (#fff), `--text-secondary` (#a8a8a8), `--text-muted` (#707070)
  - Borders: `--border` (#222)
  - Accent: `--accent` (#fff) — white, not colored
  - Semantic: `--danger`, `--success`, `--warning` only for their intended purposes
- **No colored accents for informational UI** — badges, labels, and indicators use the neutral palette (text-secondary, bg-tertiary, border)
- **Font**: Space Grotesk
- **Border radius**: minimal (4px), no pill/rounded shapes unless it's a specific control
- **Subtle, flat aesthetic** — no shadows, no gradients, no glow effects
- **Backdrop blur** on overlays/nav only

## Commands

- **Dev frontend**: `cd client && bun run dev`
- **Dev backend**: `cd server && bun run start`
- **Build client**: `cd client && bun run build`
- **Run locally**: `python main.py`
- **Run on Modal**: `modal run app.py`
