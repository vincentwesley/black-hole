# Handover

_Last updated: 2026-10-18. PRs #1–#3 merged; site live on GitHub Pages; repo public. UX pass (scroll no longer trapped) in a new PR._

## Done
- **M1 core renderer:** Schwarzschild geodesics per pixel (WebGL2), Novikov–Thorne disk with Doppler + gravitational shifts, Physical/Film looks, BSC5 star cubemap, bloom + ACES, orbit camera (mouse/touch/keys), quality presets + governor, settings persistence, PNG snapshot, no-WebGL2 still-frame fallback.
- **M2 ship:** Vitest physics/sky/settings tests, Playwright e2e (pixel read-back, toggles, keys, theme, fallback) + axe in dark and light at desktop and 375 px, README with screenshots, `CREDITS.md`, Pages deploy workflow, research/decision/plan docs.

- **M3a:** NASA SVS Milky Way glow (galactic centre lensed into an Einstein ring), Sky brightness slider + Milky Way toggle, cubemap solid-angle fix (stars no longer dim toward face corners), Deploy now also runs after automerge.

- **UX pass:** page scroll no longer trapped by the render (cooperative gestures), jump links to How it works / Sources / Credits, +/− zoom buttons, "More below" cue (DECISIONS #20).

## One-time steps for Vincent
All done (2026-10-17): repo made public, Pages source set to GitHub Actions, first deploy run. Live at https://vincentwesley.github.io/black-hole/.
Optional, sidebar only (no API access from sessions): repo description, website, topics and social preview image (`public/og.jpg`).

## Next (ranked, see PLAN.md M3)
1. Temporal accumulation when the camera is still (crisper photon ring and stars).
2. Kerr (spinning) option per James et al. 2015.
3. Table-based fast path (Bruneton 2020) for low-end phones.
4. Free-flight camera with observer aberration.

## Known issues
- Faint concentric banding in the sky at Low quality (large steps end at different radii). Medium and up hide it.
- Very bright stars sparkle slightly near the Einstein ring while orbiting (cubemap mip selection on strongly diverging rays).
- The disk turbulence is artistic (DECISIONS #7); the brightness/colour profile is physical.
- Headless SwiftShader runs at ~10–14 fps, so e2e uses the Low preset; real GPUs should hold 60 fps on High (not measured on hardware in this session).

- Automerge → Deploy dispatch is untested until the next automerged PR: check the Actions tab shows a Deploy run right after the merge.

## How to resume
`npm ci --ignore-scripts`, then the checks in CLAUDE.md. Screenshots: see CLAUDE.md "Project rules".
