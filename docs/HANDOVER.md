# Handover

_Last updated: 2026-10-17, end of milestone 2. Branch `claude/sharp-cerf-1qllnk`, PR open; automerge squashes it into `main` once CI passes, which triggers Deploy._

## Done
- **M1 core renderer:** Schwarzschild geodesics per pixel (WebGL2), Novikov–Thorne disk with Doppler + gravitational shifts, Physical/Film looks, BSC5 star cubemap, bloom + ACES, orbit camera (mouse/touch/keys), quality presets + governor, settings persistence, PNG snapshot, no-WebGL2 still-frame fallback.
- **M2 ship:** Vitest physics/sky/settings tests, Playwright e2e (pixel read-back, toggles, keys, theme, fallback) + axe in dark and light at desktop and 375 px, README with screenshots, `CREDITS.md`, Pages deploy workflow, research/decision/plan docs.

## One-time steps for Vincent
1. **Turn on GitHub Pages:** repo Settings → Pages → Build and deployment → Source: **GitHub Actions**. The `Deploy` workflow then publishes on each push to `main` (it ran once the PR merged; re-run it from the Actions tab if Pages was enabled afterwards). Site: https://vincentwesley.github.io/black-hole/
2. Private repo + Pages needs a paid plan (GitHub Pro/Team). If the repo stays private on a free plan, Pages will refuse to deploy; making it public is your call (house rule says repos stay private, so I did not change visibility).

## Next (ranked, see PLAN.md M3)
1. Milky Way glow from NASA SVS Deep Star Maps (EXR → compressed 2k texture).
2. Temporal accumulation when the camera is still (crisper photon ring and stars).
3. Kerr (spinning) option per James et al. 2015.
4. Table-based fast path (Bruneton 2020) for low-end phones.
5. Free-flight camera with observer aberration.

## Known issues
- Faint concentric banding in the sky at Low quality (large steps end at different radii). Medium and up hide it.
- Very bright stars sparkle slightly near the Einstein ring while orbiting (cubemap mip selection on strongly diverging rays).
- The disk turbulence is artistic (DECISIONS #7); the brightness/colour profile is physical.
- Headless SwiftShader runs at ~10–14 fps, so e2e uses the Low preset; real GPUs should hold 60 fps on High (not measured on hardware in this session).

## How to resume
`npm ci --ignore-scripts`, then the checks in CLAUDE.md. Screenshots: see CLAUDE.md "Project rules".
