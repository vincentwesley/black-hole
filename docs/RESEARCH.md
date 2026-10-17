# Research

Done 2026-10-17 at the start of the build. Links checked on that date.

## Physics sources (cited in the app's References section)
| Source | Used for |
|---|---|
| James, von Tunzelmann, Franklin, Thorne (2015), [arXiv:1502.03808](https://arxiv.org/abs/1502.03808), CQG 32 065001 | The "Interstellar look"; §4.2 confirms the film's disk had no frequency shifts, colour or brightness changes, so our **Film** look switches Doppler and gravitational shifts off. Camera-near-hole lensing discussion. |
| Luminet (1979), [A&A 75, 228](https://ui.adsabs.harvard.edu/abs/1979A%26A....75..228L) | Reference image of a Schwarzschild hole with a thin disk (primary + secondary images, brightness asymmetry). Used to sanity-check our frames. |
| Page & Thorne (1974), [ApJ 191, 499](https://ui.adsabs.harvard.edu/abs/1974ApJ...191..499P), eq. 15n; Novikov & Thorne (1973) | Disk flux F(r); T ∝ F^¼. Integrated numerically in `src/physics/disk.ts` (zero at ISCO, peak at 9.55 M = 4.77 r_s, unit-tested). |
| Chandrasekhar (1983), *Mathematical Theory of Black Holes*, ch. 3 | Binet form u'' + u = 3M u², b_crit = 3√3 M. |
| Antonelli, [Starless](https://rantonels.github.io/starless/) ([repo](https://github.com/rantonels/starless), GPL-3.0) | Cartesian form x'' = −(3/2) h² x / r⁵. Idea only, no code copied (GPL). |
| Bruneton (2020), [arXiv:2010.08735](https://arxiv.org/abs/2010.08735) ([repo](https://github.com/ebruneton/black_hole_shader), BSD-3) | Precomputed-table approach for constant-time lookups. Not used for the MVP (per-pixel integration was asked for), kept as the upgrade path for weak GPUs. |
| Rybicki & Lightman (1979) §1.4 | I_ν/ν³ invariance → a blackbody at T is seen as a blackbody at gT. |
| Wyman, Sloan, Shirley (2013), [JCGT 2(2)](https://jcgt.org/published/0002/02/01/) | Analytic CIE 1931 CMFs for Planck → sRGB. |
| Ballesteros (2012), [arXiv:1201.1809](https://arxiv.org/abs/1201.1809) | B−V → temperature for star colours. |
| Jimenez (2014), [CoD:AW post processing](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/) | 13-tap downsample / tent upsample bloom with firefly suppression. |
| van der Kruit (2024), [arXiv:2401.15518](https://arxiv.org/abs/2401.15518), Table 3 | Milky Way surface brightness (bright clouds ≈ 20.7–20.8 V mag/arcsec²; S10 = 27.78 V mag/arcsec²) → calibration of the NASA map against the BSC stars (`MILKY_WAY_SCALE`). |
| Snyder (1987), USGS Prof. Paper 1395 §22 | Gnomonic projection area scale 1/cos³c → cube texel solid angle (1 + u² + v²)^−3/2. |
| Narkowicz (2015), [ACES fit](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/) | Tone curve. |

## Existing projects
| Project | Licence | Notes |
|---|---|---|
| [rantonels/starless](https://github.com/rantonels/starless) | GPL-3.0 | CPU (numpy) ray tracer. Best explanation of the Cartesian trick. Avoid copying code. |
| [ebruneton/black_hole_shader](https://github.com/ebruneton/black_hole_shader) | BSD-3-Clause | WebGL2, precomputed tables, high quality. Closest prior art; reuse ideas if we ever add Kerr-free table mode. |
| [vlwkaos/threejs-blackhole](https://github.com/vlwkaos/threejs-blackhole) | GPL-3.0 (+ a CC BY-NC background image) | three.js + GLSL, Doppler/beaming. Avoid its NC image. |
| oseiskar/black-hole | not verified | Well-known WebGL demo (Binet integration in GLSL); repo URL did not resolve in this session, so not relied on. |
| [Gargantua R3F thread](https://discourse.threejs.org/t/gargantua-a-real-time-kerr-black-hole-ray-tracer-react-three-fiber/92834) | unchecked | Kerr, React Three Fiber. Shows the bar for "Interstellar look" in a browser. |

**What would make ours stand out:** physically consistent colour (Planck + CIE, Doppler via T → gT, Novikov–Thorne profile) instead of a hand-painted gradient; a real star catalogue in galactic coordinates; a one-click Film/Physical comparison; quality presets with an automatic governor so it runs on phones and in software-rendered headless browsers; citations in the UI.

**What to avoid:** GPL code, non-commercial textures, AI art, a 600 KB 3D engine for one full-screen quad, unbounded loops (TDR on weak GPUs), per-frame CPU work.

## Data
- **Yale Bright Star Catalogue, 5th rev.** (Hoffleit & Warren 1991): [CDS V/50](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50), file `catalog.gz` (also `http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz`). Distributed freely by NASA ADC/CDS for scientific use. 9,096 usable stars → 145 KB binary via `scripts/build-stars.mjs`.
- HYG database: CC BY-SA 4.0 (share-alike), more stars but larger; not needed.
- NASA SVS [Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851): Milky Way panoramas built from Gaia DR2 (credit NASA/Goddard Space Flight Center Scientific Visualization Studio; Gaia: ESA/Gaia/DPAC). **Used since M3:** `milkyway_2020_4k_gal.exr` (4096×2048, ZIP half-float, galactic, bright stars removed) → `public/data/milkyway.jpg` via `scripts/build-milkyway.py`. Orientation checked against the LMC (l 280.5°, b −32.9°) and SMC positions in the map. No licence text on the page beyond the credit line; NASA imagery is generally not copyrighted in the US, and the credit is given in-app, in `CREDITS.md` and `THIRD_PARTY_NOTICES.md`.

## Platform checks
- **WebGL2 in headless Chromium:** works through ANGLE + SwiftShader (Vulkan) in this container, including `EXT_color_buffer_float`; ~10–14 fps at 1280×720 on the Low/High presets. Good enough for e2e pixel checks.
- **GitHub Pages:** site ≤ 1 GB, soft 100 GB/month bandwidth, no custom HTTP headers → CSP goes in a `<meta http-equiv>` tag (cannot express `frame-ancestors`). [Limits doc](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- **Action versions** (resolved with `git ls-remote`, pinned by SHA): checkout v7.0.1 `3d3c42e5…`, setup-node v7.1.0 `949feb24…`, configure-pages v6.0.0 `45bfe019…`, upload-pages-artifact v5.0.0 `fc324d35…`, deploy-pages v5.0.1 `368f8252…`.

## Tooling
Used this session: Playwright (bundled `@playwright/test` driving `/opt/pw-browsers/chromium`), `@axe-core/playwright`, Vitest, the `scout` subagent for web research, repo skills `visual-check` / `design-review` / `ship-batch` recipes.

Worth installing later:
- **chrome-devtools MCP** for Lighthouse and GPU performance traces (frame timings per preset on real hardware).
- **Spector.js** (browser extension) to inspect the WebGL draw calls when tuning bloom.
- A Claude Code **GLSL lint** hook (`glslangValidator`) so shader compile errors surface before the browser.
