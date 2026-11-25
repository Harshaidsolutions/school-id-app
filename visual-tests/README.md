# Visual testing — all four surfaces, offline

Isolated workspace. Its deps live here only; nothing here is installed into the
apps or shipped to EC2, so it can never break a build the way a stray devDep did.

Pixel baselines are generated ONCE on a real machine (`npm run update`),
reviewed by eye, and committed. After that, any pixel drift fails the run.

## 1 & 2 — admin-web + ID-card generator (React / Electron)  → Playwright, fully offline
Same React code renders in both, so one tool covers both.

    cd admin-web && npm run build          # produce dist/ (offline)
    cd ../desktop-generator && npm run build:renderer
    cd ../visual-tests && npm install && npx playwright install chromium

    npm run update            # first time: write baselines, then eyeball them
    npm run test:web          # admin-web: login + modal states (webServer serves dist)
    npm run test:generator    # Electron: 5s splash window + main window + a rendered card

Playwright's `_electron.launch` drives the real desktop app with no browser and
no network — ideal for the generator. For logged-in admin-web states (the
notification bulk-delete modal that broke), seed a local backend and sign in in
a `beforeEach`; the skipped test in web.spec.ts is the template.

## 3 & 4 — teacher-app + admin-mobile (React Native / Expo)
Three tiers, cheapest first:

- **Structural snapshots — offline, no device (already set up via jest-expo).**
  `react-test-renderer` serializes the component tree to JSON; unintended UI
  changes fail. Run `npm test` in each app. See tests/component/*.snap.
- **Real pixels without an emulator — Expo web.** `npx expo export -p web`
  builds a web bundle; point visual-tests/playwright at it and screenshot.
  RN-web ≈ native (not identical) but catches large layout regressions on your Mac.
- **True native pixels — needs a local Android emulator** (Maestro or Detox).
  This is the only way to verify the actual on-device render; it's offline once
  the emulator image is downloaded, but it does need the emulator running.

## What each tier can and cannot catch
- Playwright pixel diff: real CSS stacking / z-index / layout — i.e. exactly the
  "modal behind the page" and "screen not in form" class of bug. ✔
- jest snapshots: structure/props drift, not pixels. ✔ cheap, ✘ not visual truth.
- None of these replaces a once-through manual pass after a deploy — unit/snapshot
  tests pass against code, not against what actually shipped to the browser/EC2.
