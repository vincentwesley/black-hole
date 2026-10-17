> Update at the end of any session that changed state. Keep it lean. Detail lives in `docs/HANDOVER.md`.

Continue work on **Black Hole (3D-18)** (repo `vincentwesley/black-hole`, deploys to GitHub Pages).

## Before anything
1. Read this file, `docs/HANDOVER.md`, then `docs/PLAN.md` / `docs/DECISIONS.md` as needed.
2. `npm ci --ignore-scripts` and run the checks below to confirm green.

## How to work here
- Branch `claude/...`, one PR per session; automerge squashes it when CI passes. Identity: `vincentwesley` noreply.
- Checks: `npm run typecheck && npm run lint && npm test && npm run build && PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e`
- Shader `scene.frag` mirrors `traceRay()` in `src/physics/schwarzschild.ts`; change both.

## Current state
- MVP merged (PR #1). M3a (Milky Way, sky fixes, deploy trigger) on `claude/sharp-cerf-1qllnk`. Pages needs the one-time Settings step in HANDOVER.md.

## Known gaps
1. See HANDOVER.md "Known issues" and "Next".
