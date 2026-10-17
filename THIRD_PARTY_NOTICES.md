# Third-party notices

## Data
- **Yale Bright Star Catalogue, 5th rev. ed.** (Hoffleit & Warren 1991, CDS catalogue V/50). Converted to `public/data/stars.bin` by `scripts/build-stars.mjs` (galactic longitude/latitude, V magnitude, B−V only).

## Fonts (`src/fonts/`)
SIL Open Font License 1.1, full text in `src/fonts/OFL.txt`: Space Grotesk, Inter, Silkscreen, JetBrains Mono.

## npm dependencies
Development dependencies only, pinned by `package-lock.json` (MIT, Apache-2.0, ISC, BSD; `@axe-core/playwright` is MPL-2.0): vite, typescript, vitest, eslint, typescript-eslint, @playwright/test, @axe-core/playwright, knip. Nothing from them is bundled into the site except Vite's small runtime helpers.

## Vendored Claude skills (`.claude/`)
Copied from `vincentwesley/vin-claude` (MIT) so cloud sessions can use them. Reference material under `.claude/skills/design-review/references/` and `.claude/skills/ship-batch/references/` keeps its upstream licence text next to it; repos and pinned SHAs are in `.claude/SOURCES.md`.
- `design-review/references/redesign-existing-projects`: Copyright (c) 2026 Leonxlnx, MIT (Leonxlnx/taste-skill).
- `design-review/references/ui-ux-pro-max`: Copyright (c) 2024 Next Level Builder, MIT (nextlevelbuilder/ui-ux-pro-max-skill).
- `design-review/references/web-design-guidelines`: Copyright (c) 2025 Vercel Labs, MIT (vercel-labs/web-interface-guidelines).
- `ship-batch/references/`: Copyright (c) 2025 Addy Osmani, MIT (addyosmani/agent-skills).

## Methods (no code copied)
The Cartesian geodesic form follows R. Antonelli's Starless notes (that code is GPL-3.0; none of it is used here). Bloom filters follow J. Jimenez (2014); tone curve follows K. Narkowicz (2015). Full list in `docs/RESEARCH.md`.
