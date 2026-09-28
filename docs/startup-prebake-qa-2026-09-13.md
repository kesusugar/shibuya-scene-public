# Static pre-generation and local Chrome QA — 2026-09-13

## Implementation

- Pre-generate ground, generic buildings, station and station detail models for all three tiers using the existing generators. Restore the ground height query on load.
- Fingerprint generator inputs and dependencies. Missing or stale packs fall back to live generation; `prebuilt=0` explicitly selects that baseline.
- Reuse generated models and yield during pedestrian network construction without changing graph results.
- Include the pending four-period solar transitions, ground backing/paving improvements and QA readiness correction in this change set.
- Fix application-wide TypeScript errors, including Cloudflare environment declarations. Exclude the local actions-runner checkout from application type checking.

The generated JSON is 4,942,598 bytes. Input key: `470381a3e6b81c7b768e1b9a9b5b9237520220fb43de9ce8182c429c154958fa`.

## Real Windows Chrome measurements

Same revised application, HIGH, night, scramble camera, local Vite server; pre-generated models enabled versus disabled:

| Metric | Disabled | Enabled | Reduction |
| --- | ---: | ---: | ---: |
| Scene build complete | 111.273 s | 95.381 s | 14.3% |
| Interactive ready | 111.344 s | 95.935 s | 13.8% |
| First scene frame | 13.787 s | 3.698 s | 73.2% |

These are single sequential development-server runs, not repeated controlled benchmark medians. Other local work and runtime variability can affect the measurements. They isolate the pre-generation switch, not the cumulative effect of all historical changes.

Remaining enabled-run stage costs include signage 13.543 s, streetscape 37.955 s, traffic 15.564 s and crowd 22.458 s. Startup optimization is not exhausted.

## Consecutive capture verification

The existing Generate QA Pack action completed twice consecutively in real Windows Chrome, with no GPU/WebGL disabling options applied. Both packs contain metrics.json and seven nonblank PNGs. All fourteen images were opened and visually inspected.

Local output directories (ignored by Git):

- `qa/2026-09-13-static-startup/run-1/shibuya-qa-pack/`
- `qa/2026-09-13-static-startup/run-2/shibuya-qa-pack/`

Each contains `overview-day.png`, `overview-night.png`, `scramble-street-day.png`, `scramble-street-night.png`, `qfront-night.png`, `scramble-high-day.png`, `scramble-high-night.png`, and `metrics.json`.

Downloaded archive timestamps were 13:00:44 and 13:01:55 JST. Exact capture durations were not instrumented; the timestamp interval is not a capture-duration measurement.

Run 1 metrics: framebuffer 2256x1167, DPR 1.5, 3,615,377 triangles, 318 draw calls, 1,978 pedestrians, 62 moving and 12 parked vehicles. Static layouts remain consistent across runs; simulation movement naturally changes pixels. Daytime remains pale and curbside crowds still look band-like. This verification does not claim reference-level visual parity.

## Checks and reproduction

- `npm run typecheck`: passed.
- `node scripts/bake-static-models.mjs --check`: passed.
- `node --test tests/static-models.test.mjs tests/network-startup.test.mjs tests/startup-timing.test.mjs tests/qa-capture.test.mjs tests/solar.test.mjs`: 13 passed.
- Ground and solar checks also passed earlier in this change set.
- Production build via `node node_modules/vinext/dist/cli.js build`: passed. `npm run build` reached the existing Bash wrapper but this environment denied WSL execution; the build itself was verified through Node directly. Existing CSS import-order and large-chunk warnings remain.
- Full repository test suite is not claimed passing: an existing S14 source-string assertion still targets the old app/page.tsx implementation.

Regenerate with `npm run bake:static` (also runs before the existing build command). Open `http://127.0.0.1:5173/?qa=1&tier=high&time=night&camera=scramble&startupTiming=1`; add `&prebuilt=0` for the baseline. Wait for Scene Build Complete and use the existing Generate QA Pack action.

No GitHub push was performed for this change set.
