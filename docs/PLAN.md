# Plan

## Architecture
```
index.html            full-screen <canvas> stage + HUD + controls, then How it works / References / Keys, credits card
src/main.ts           wiring: theme, settings form, input (pointer, pinch, wheel, keys), frame loop, governor, snapshot, test hook
src/camera.ts         damped orbit camera (radius 2.2–60 r_s)
src/settings.ts       settings, Physical/Film looks, sanitised localStorage
src/physics/          schwarzschild.ts (geodesics, camera rays, redshift), disk.ts (Novikov–Thorne), color.ts (Planck/CIE)
src/sky/stars.ts      BSC5 → galactic → world → float cubemap faces
src/render/           renderer.ts (WebGL2 passes), quality.ts (presets, governor), shaders/*.vert|frag
scripts/              build-stars.mjs (catalogue → public/data/stars.bin), build-milkyway.py (NASA EXR → public/data/milkyway.jpg), screenshots.mjs, hero.mjs
tests/ (Vitest)       physics, stars, settings/quality/camera
e2e/ (Playwright)     render sanity via pixel read-back, toggles, keys, theme, no-WebGL fallback, axe
```
Render pipeline per frame: scene.frag (geodesics + disk + sky) → RGBA16F → bloom chain (5–7 mips) → composite (bloom mix, exposure, ACES, sRGB, dither).

## MVP scope
- Schwarzschild lensing per pixel, photon ring, primary + secondary disk images, shadow.
- Thin Novikov–Thorne disk with Doppler beaming and gravitational redshift (toggleable), Film look.
- Real star background (BSC5).
- Orbit/zoom by mouse, touch, keyboard; cruise mode; quality presets + governor.
- Bloom, tone mapping, PNG snapshot.
- Docs, citations in-app, README with screenshots, GitHub Pages deploy.

## Milestones
1. **M1 Core renderer** — physics modules + tests, shaders, renderer, page, controls. ✅
2. **M2 Ship** — e2e + axe, hero/fallback frames, Pages workflow, README, handover. ✅ (see HANDOVER.md)
3. **M3 Polish (next)** — ideas ranked:
   1. ✅ Milky Way glow from NASA SVS Deep Star Maps behind the BSC stars (DECISIONS #16).
   2. Temporal accumulation / jittered supersampling when the camera is still (crisper photon ring at no steady-state cost).
   3. Kerr (spinning) hole option following James et al. 2015 (needs the Carter-constant equations; much heavier).
   4. Table-based fast path (Bruneton 2020) for the Low preset on phones.
   5. Free-flight camera (not just orbit) with relativistic aberration for a moving observer.
