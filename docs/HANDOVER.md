# Handover

_Last updated: 2026-10-18. PRs #1–#3 merged; site live on GitHub Pages; repo public. UX pass (scroll no longer trapped) in a new PR._

## Done
- **M1 core renderer:** Schwarzschild geodesics per pixel (WebGL2), Novikov–Thorne disk with Doppler + gravitational shifts, Physical/Film looks, BSC5 star cubemap, bloom + ACES, orbit camera (mouse/touch/keys), quality presets + governor, settings persistence, PNG snapshot, no-WebGL2 still-frame fallback.
- **M2 ship:** Vitest physics/sky/settings tests, Playwright e2e (pixel read-back, toggles, keys, theme, fallback) + axe in dark and light at desktop and 375 px, README with screenshots, `CREDITS.md`, Pages deploy workflow, research/decision/plan docs.

- **M3a:** NASA SVS Milky Way glow (galactic centre lensed into an Einstein ring), Sky brightness slider + Milky Way toggle, cubemap solid-angle fix (stars no longer dim toward face corners), Deploy now also runs after automerge.

- **UX pass:** page scroll no longer trapped by the render (cooperative gestures), jump links to How it works / Sources / Credits, +/− zoom buttons, "More below" cue (DECISIONS #20).

- **UI pass 2:** grouped controls panel that fits without scrolling, view recentres on the hole beside the panel, bottom-sheet panel on phones, Full screen and Hide interface (DECISIONS #21).

- **Progressive accumulation (2026-11-18, DECISIONS #22):** with the camera still, jittered samples average into a float history; sky layer only while the disk animates, the whole image (then idle, no new frames) when time is frozen by reduced motion. Any change resets it instantly. Fallback without float targets: the old direct render. Tune the sample cap with `SAMPLE_CAP` in `src/render/accum.ts` (more = smoother, longer to settle); the view tolerance is `TOL` there. `window.__bh.samples()` reports the count.

- **Render audit fixes (2026-11-18, DECISIONS #23–#27, branch bh-render):** out-of-steps rays drawn dark (no wrong-coloured shadow rim); escape radius max(100, 2 r_cam); `tests/tiers.test.ts` checks the shipped tiers against a fine reference (all sub-pixel); Medium sky 1024²; 30 fps after 5 s idle; dither on the no-float path; educational overlay `renderer.setOverlay(bool)` (off by default, needs a UI checkbox).

## One-time steps for Vincent
All done (2026-10-17): repo made public, Pages source set to GitHub Actions, first deploy run. Live at https://vincentwesley.github.io/black-hole/.
Optional, sidebar only (no API access from sessions): repo description, website, topics and social preview image (`public/og.jpg`).

## Next (ranked, see PLAN.md M3)
1. Kerr (spinning) option per James et al. 2015.
2. Table-based fast path (Bruneton 2020) for low-end phones.
3. Free-flight camera with observer aberration.

## Known issues
- **TAA while cruising is not done** (DECISIONS #22 still holds: the history restarts every frame while the camera orbits). A sky-only reprojected TAA was prototyped and measured worse than none (the sky lookup is already mip-filtered over the pixel, so jitter only adds noise; the aliasing left is the disk, photon ring and shadow edge). Next attempt: jitter the ray, full-colour history, a separate resolve pass with YCoCg variance clipping, motion = the sky's screen Jacobian solve (exact for orbits) for sky pixels and 0 for disk/shadow (static geometry under an orbit).
- Faint concentric banding in the sky at Low quality (large steps end at different radii). Medium and up hide it; with reduced motion the jittered still image should soften it (not measured).
- Very bright stars sparkle slightly near the Einstein ring while orbiting (cubemap mip selection on strongly diverging rays); once the camera stops, accumulation settles them.
- The disk turbulence is artistic (DECISIONS #7); the brightness/colour profile is physical.
- Headless SwiftShader runs at ~10–14 fps, so e2e uses the Low preset; real GPUs should hold 60 fps on High (not measured on hardware in this session).

- Automerge → Deploy dispatch is untested until the next automerged PR: check the Actions tab shows a Deploy run right after the merge.

## How to resume
`npm ci --ignore-scripts`, then the checks in CLAUDE.md. Screenshots: see CLAUDE.md "Project rules".
