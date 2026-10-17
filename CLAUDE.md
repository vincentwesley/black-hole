# CLAUDE.md — Black Hole (3D-18)

Real-time Schwarzschild black hole in raw WebGL2: per-pixel geodesic ray tracing, photon ring, Novikov–Thorne disk with Doppler beaming, bloom. Deployed to GitHub Pages. Read `docs/HANDOVER.md` and `docs/next-session.md` first; architecture in `docs/PLAN.md`, reasons in `docs/DECISIONS.md`, sources in `docs/RESEARCH.md`.

## Project rules
- Checks that must stay green: `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e` (in this container prefix e2e with `PW_CHROMIUM=/opt/pw-browsers/chromium`).
- `src/render/shaders/scene.frag` mirrors `traceRay()` in `src/physics/schwarzschild.ts`. Change both together and keep the physics tests passing.
- Units: Schwarzschild radius r_s = 1 everywhere (M = 1/2). Disk plane is y = 0, rotation about +y.
- Physics must stay cited: any new formula gets a reference in the app's References list and `docs/RESEARCH.md`.
- Shipped data is real: stars come from BSC5 via `scripts/build-stars.mjs`. The disk turbulence is the one artistic element (see DECISIONS #7).
- GitHub Pages cannot set headers: the CSP lives in the `<meta http-equiv>` in `index.html`. No third-party hosts, no inline scripts.
- The render stays dark in both themes; the theme toggle only changes the page chrome.
- Screenshots: `npm run build && npx vite preview --port 4173` then `PW_CHROMIUM=/opt/pw-browsers/chromium node scripts/screenshots.mjs http://127.0.0.1:4173/ qa-output` (gitignored). `scripts/hero.mjs` regenerates `public/fallback.jpg`, `public/og.jpg` and `docs/img/*` (slow on SwiftShader: run in the background).


## Who
Vincent Wesley (GitHub: vincentwesley).

## How to work
- Orchestrate: split the work and run subagents in parallel (`scout` for search/reading, `builder` for implementation, both in `.claude/agents/`). Review their output yourself before calling anything done.
- Terse: report outcomes in a line or two. No reasoning, no option tours. Ask only when blocked.
- Invoke skills yourself: simplify + code-review after non-trivial changes, security-review before committing auth/secrets/network/CSP changes.
- Each batch: typecheck + lint + unit tests + build. Full e2e, axe, Lighthouse and screenshots (`ship-batch`, `visual-check`) only when I call a milestone.
- Only touch what I ask for. List other findings, don't act on them.
- Prefer free, licensed assets over from-scratch builds for complex visuals. Never AI-generated art, never stock figures.
- Titles only, no descriptive captions on personal content. Never replace PLACEHOLDER content with invented facts; flag it.
- Never blanket-revert (`git checkout --` / `reset --hard`) without checking for my uncommitted work.
- Keep `docs/next-session.md` (Before anything / How to work here / Current state / Known gaps) and `docs/HANDOVER.md`. Read them first, update them after each milestone, keep them lean.

## GitHub Actions minutes are limited
- Verify locally (typecheck, lint, unit tests, build) before pushing. Never use CI as your test runner.
- Don't push small things. Batch the work and push once per session or at a real milestone: one branch, one PR, not a push per fix or per docs edit.
- Don't push work in progress, don't re-run or watch CI, and don't add workflows or cron schedules unless I ask. The `automerge.yml` workflow already in the template is the only exception.
- If a docs-only commit must go out on its own, put `[skip ci]` in the message.

## Git
- Commits only as `vincentwesley <221810966+vincentwesley@users.noreply.github.com>`. Never a real email, never the retired Pincenw account.
- Work on a `claude/...` branch and open a PR. Repos stay private; never change visibility.

## House style (every UI)
- Dark by default, even with no JS and the OS set to light (bg `#11150e`, accent `#4fe0a0`). Mint light theme only via toggle (`data-theme="light"`). Secondary accents: peach `#e9a07f`, lavender `#a996e0`.
- Fonts, self-hosted (no runtime Google Fonts): Space Grotesk (headings), Inter (body), Silkscreen (pixel labels), JetBrains Mono (code/stats). Ship their `OFL.txt`.
- Glowing pixel-frame cards, square corners, offset-shadow buttons, firefly accents, springy motion, all respecting `prefers-reduced-motion`. Reuse `hs-` classes from `tokens.css`.
- Every UI ends with the starter's credits card; replace `{{PROJECT}}` with the project name.

## Stack
npm, Node 24 (`.nvmrc`), install with `npm ci --ignore-scripts`. Vitest, Playwright, @axe-core/playwright. GitHub Pages for this repo (strict CSP in a meta tag); Cloudflare Pages/Workers elsewhere. GitHub Actions CI. Free tiers only, no third-party runtime hosts.

## Done means
Typecheck, lint, unit and e2e pass; axe clean; works at 375px and desktop in dark and light; credits card present.

## Safety (every repo)
- MIT LICENSE `Copyright (c) 2026 Vincent Wesley`; `package.json` has license/author/repository; SECURITY.md present.
- No secrets, tokens or personal data in tracked files; `.env.example` has names only. Gitignore `.env*`, `.dev.vars`, `*.db`, `data/`, `test-results/`.
- No `preinstall`/`install`/`postinstall`/`prepare` scripts, no `curl | sh`. Actions pinned to commit SHAs with least-privilege `permissions:`, no `pull_request_target`.
- Credit third-party assets in `THIRD_PARTY_NOTICES.md`. Fan projects carry a non-affiliation disclaimer.
- README says "provided as is, no warranty" and lists the secrets and network calls the project needs.
