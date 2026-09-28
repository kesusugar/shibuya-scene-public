# Stage 6 — playable asset loading

Base: 52fb245. Branch: codex/prebaked-motion.

## Changes

- `app/ShibuyaScene.tsx` now imports the lightweight deferred vehicle facade.
  The existing baked six-model vehicle pack and renderer are a dynamic import.
  Observer mode, walking without an active vehicle, and scooters do not request it.
- `src/player/deferred-vehicle-visual.mjs` keeps the normal instanced traffic vehicle
  visible until its detailed replacement has loaded. Concurrent updates share one
  pending request; the newest state wins. Hide/dispose cannot resurrect a pending
  model. Failed requests leave fallback rendering intact and retry at most every 5 s.
- `scripts/bake-character.mjs` optimizes redundant keyframe samples offline with
  Three.js AnimationClip.optimize. Meshes, all 12 clips and their durations remain.
  This does not generate anything on startup.
- `npm run measure:playable` checks the production manifest's static dependency graph
  and reports artifact sizes and Node construction diagnostics. QA mode exposes
  `window.__SHIBUYA_QA__.playableLoading` with request count, status, load duration,
  construction duration and error. Load time includes download/module evaluation;
  construction includes first model creation, but not subsequent GPU upload.

## Measurements

Initial production scene chunk (shared framework/Three libraries excluded):

| Artifact | Before | After |
| --- | ---: | ---: |
| Scene JS raw | 2,887,409 B | 1,151,266 B |
| Scene JS gzip | 545,580 B | 393,398 B |
| Character module raw | 274,441 B | 228,151 B |
| Character module gzip | 34,812 B | 34,154 B |

The deferred vehicle chunk is 1,691,025 B raw / 150,244 B gzip. These bytes are
postponed, not eliminated. The initial scene chunk shrank about 60.1% raw / 27.9%
gzip. Measurements include the final QA instrumentation.
Node v24.19.0 character construction median over nine samples was 1.33 ms on this
container; this is not a browser/device performance claim or an end-to-end READY time.

## Review and validation

- Before/after animation interpolants: 56,964 sampled components, maximum difference 0.
- Focused animation, NPC pool and loading tests: 10 passed.
- Deferred loading tests cover idle mode, latest state, fallback ownership, disposal,
  hiding/reentry and rejected loads with bounded retry.
- Typecheck, production build and full current suite passed: 183 tests, zero failures.
- Manifest audit confirms vehicle module absent from the initial static import graph.
- New `docs/previews/playable-loading.png` visualizes measured artifact sizes; it is
  a diagnostic chart, not a gameplay screenshot. The art has not changed.

## Remaining acceptance

One planned stage remains: real-browser day/night appearance and target-device startup,
first-drive hitch and FPS checks. Stage 6's runtime implementation is complete; its
browser timing acceptance remains open and carries into that final stage. Offline
baking removes generation, not JSON evaluation, typed-array creation or GPU upload.
The character pack still loads with the scene. All six car types load at first demand;
per-type network splitting is not implemented. No new cloud services or paid capture.
