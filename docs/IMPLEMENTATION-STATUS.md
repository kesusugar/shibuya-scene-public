# Implementation status and handoff

Updated: 2026-09-18 (playable Shibuya refinement)

## Target

The target is a dense, recognizable Shibuya night scene with believable building proportions, differentiated glass and displays, saturated signage, readable road surfaces, continuous legal vehicle flow, active pedestrian areas, and stable interactive performance. User-supplied images are visual direction; they are not proof of current billboard inventory or measured geometry.

## Playable sandbox refinement (2026-09-18)

Implemented camera/input corrections, an articulated player and detailed controlled vehicle, nearby crowd response, bounded impact/damage effects, a compact minimap HUD, and a repeatable three-stop delivery. See [the focused handoff](PLAYER-EXPERIENCE-2026-09-18.md) for files, controls, validation and limitations. Typecheck and all 158 current tests pass. Live GPU rendering and fixed HIGH day/night visual acceptance remain pending because the available browser lacks WebGL2. No FPS or GTA-equivalent visual-quality claim is made.

The follow-up street-action loop adds local melee with NPC retaliation and death, theft of parked or signal-stopped traffic, visible eased entry/exit with an opening controlled-car door, and instanced crowd idle/combat gestures. It adds no external assets or per-citizen skeletons and preserves the existing pre-generated static model key. Live GPU acceptance remains pending.

## Seven-stage status

| Stage | Status | Exit work still required |
| --- | --- | --- |
| 1. Reference ledger | Started | Settle visual era, authoritative references, and permitted artwork set. |
| 2. QFRONT | In progress | Final day/night comparison, monitor readability, facade bleed check, production branding decision, frame-time acceptance. |
| 3. Principal advertisements | In progress | 21 of 30 reference slots placed and all 30 drawn; 9 await buildings that do not exist yet. Skyline hierarchy still open. |
| 4. Lighting and materials | Current | Improve shaped reflections, glass response, exposure balance, and fixed-camera visual acceptance. |
| 5. Stores and street fixtures | Started | Add convincing lower interiors, entrances, pavement furniture, and clearance validation. |
| 6. People and vehicles | Pending refinement | Increase variation and perceived continuity without signal-phase or performance regressions. |
| 7. Integrated QA and optimization | Pending | Capture paired fixed-camera evidence, eliminate shader/console errors, and establish stable FPS/draw-call budgets. |

Estimated visual progress toward the supplied target: 45–55%. This is a planning estimate, not an acceptance measurement.

## Recently completed

- QFRONT glass, shallow interiors, and central display were physically separated.
- Low-storey cafe and retail framing gained aligned physical geometry.
- Rooftop and facade sign density, sign emission, storefront spill, and road color breakup were expanded.
- Asphalt now has subtle relief and wetness-dependent roughness.
- A reserved GLSL identifier that made asphalt disappear was fixed; shader failures now raise a visible alert.
- Relevant lifecycle, material, storefront, road-shader, and type checks pass at the latest recorded implementation commit.
- The committed static model pack was stale against its own inputs, so every clean checkout
  silently rebuilt ground, station, signage, streetscape, traffic and crowd geometry at
  runtime on each HIGH load. The pack is rebaked and loads again; see the stage 0 note below.
- The reference advertisement inventory is placed on real facades and drawn on its own
  high-resolution sheet. See `docs/REFERENCE-ADS-2026-09-14.md`.

## Stage 0 findings (2026-09-14)

- `public/data/shibuya-static-models.json` stored key `5ab11510...` while its inputs hash to
  `a52355fa...`, and the mismatch predates the pack's own bake commit `78ca60e`. HIGH
  therefore logged `[Static models] runtime fallback Error: stale static models` on every
  clean checkout and paid full runtime generation. Rebaking fixed it.
- The mismatch was masked locally because `npm test` runs `prebuild`, which rebakes before
  the suite. Only `npm run test:ci` on a fresh clone exposed it, and
  `tests/launch-config.test.mjs` was failing on master for exactly this reason.
- Same-machine A/B under software rendering: with the pack, all 13 stages reported in 45.5 s;
  forcing runtime generation with `?prebuilt=0` had reached only stage 6 at 54 s. These are
  software-renderer figures and are diagnostic only, not performance acceptance.
- `tests/rendered-html.test.mjs` and `tests/ui-components.test.mjs` each fail one case on
  master in this environment, unrelated to scene work. Not yet diagnosed.
- `tests/s7-signage.test.mjs` has three cases failing on master. It is not in the
  `test:ci` lane, which is why the failures went unnoticed.

## Highest-priority next work

1. Finish stage 4 with narrower scene-derived-looking reflection shapes and balanced night exposure.
2. Continue stage 5 with lower-floor depth, entrances, illuminated station/utility boxes, curb furniture, and Center-gai pavement detail.
3. Refine stage 6 vehicle cadence, traffic phase visibility, crowd diversity, and Center-gai activity.
4. Run stage 7 at Scramble High, Scramble Street, QFRONT, Hachiko, 109, and Center-gai in both day and night.

## Known risks

- Current colored road spill is art-directed emission, not physically reflected scenery.
- Some real-brand signs are reconstructed approximations and their exact host placement is provisional.
- Performance readings collected during HMR or on different machines are not comparable acceptance data.
- Generated evidence contains machine-dependent timing fields and should be committed independently.
- A successful unit test does not compile every material variant on the GPU; browser QA remains mandatory.
- The 2026-09-15 historical audit also exposed unresolved long-run findings: reference choreography can report crosswalk-boundary contacts, and an older three-minute crowd/traffic audit did not observe the expected scramble traffic resume. Other failures were obsolete stage locks or stale constants. These long-run findings belong to stages 6–7 and are not claimed fixed by the current PR gate.

## Test lanes

- `npm run test:ci`: maintained current contracts used as the pull-request gate.
- `npm test`: portable production build followed by the current contracts.
- `npm run test:legacy`: expensive historical audit, including frozen stage locks and long simulations. Its failures must be classified, not blindly converted into current requirements or ignored.

## Handoff checklist

- Confirm branch and clean/understood working tree.
- Name the stage and camera affected.
- Keep geometry/material allocations bounded.
- Run targeted tests and typecheck; run full `npm test` for integration.
- Inspect HIGH day and night after HMR has settled.
- Record what was actually verified and what remains inferred.
- Update this file only when stage status or priority materially changes.

## Playable motion increment — 2026-09-19

Vehicle momentum, four-point suspension and speed-aware camera are integrated on
`codex/prebaked-motion`. Six controlled-car meshes now use indexed offline-generated
buffers; city prebuilt data is unchanged. See `docs/VEHICLE-MOTION-2026-09-19.md`.
Character rig replacement and predictive NPC response remain pending. Live WebGL visual
and startup/FPS acceptance remain unverified.

## Character motion foundation — 2026-09-19

Player now uses an original offline-baked skinned character (11 bones, six batches)
with ten animation clips. Runtime state selects and crossfades the clips; existing crowd
instancing is unchanged. See `docs/CHARACTER-MOTION-2026-09-19.md` for review images,
validation limitations and the five remaining planned stages. This is a stylized art
foundation, not acceptance of Cabsolutely-equivalent realism or real-device performance.

## Near-character pool — 2026-09-19

Stage 3 now reuses the offline player rig for a bounded nearby NPC pool: HIGH 32,
MEDIUM 12, LOW 4. Buffers/materials are shared; allocation is deferred to player mode
and staggered. Base instanced bodies are restored on exit. See
`docs/NEAR-CHARACTERS-2026-09-19.md` for costs, validation and four remaining stages.

## Predictive NPC reactions — 2026-09-19

Controlled-car warnings now predict turning/reversing contact and select checked escape
directions over existing crowd cells. Updates are bounded to 10 Hz / 64 candidates.
Startle/Guard clips are baked offline and shared; the character module remains about 35 KB
gzip. Crossing movement ownership is preserved. See `docs/PEDESTRIAN-THREATS-2026-09-19.md`
for behavior, scope, review results and three remaining planned stages.

## Vehicle contact foundation — 2026-09-19

Stage 5 replaces player collision full-stop with checked tangent sliding, small outward
separation and bounded impact yaw. Damage is based on normal speed loss with cooldown.
Offline assets are unchanged; no new startup generation. Traffic remains kinematic.
See `docs/VEHICLE-CONTACT-2026-09-19.md` for tests, new model-render image and limitations.
Two planned stages remain: loading/startup measurements and live visual/device tuning.
Actual WebGL day/night inspection remains outstanding.

## Playable loading — 2026-09-20

Stage 6 separates the baked controlled-car pack from the initial scene dependency graph.
The existing traffic model remains visible during deferred loading; cancellation and
failure paths preserve it. Offline character clips discard redundant keyframes without
sampled pose changes. Initial scene chunk is approximately 2.89 MB -> 1.15 MB raw,
546 KB -> 393 KB gzip (shared libraries excluded, car payload deferred rather than removed).
See `docs/PLAYABLE-LOADING-2026-09-20.md` and `npm run measure:playable`.
One planned stage remains: live day/night, target-device startup/first-drive/FPS acceptance.
Browser startup seconds and visual acceptance are still unverified.

## Stage 7 QA instrumentation and Claude handoff — 2026-09-20

QA capture now records bounded 120-frame pacing/CPU samples per view, times out stalled
render waits, and restores the current camera/solar phase. The local CDP runner has a
five-minute hard limit and writes startup/renderer/build/stage/loading/run diagnostics.
Chrome is absent here: real WebGL day/night, startup, first-drive and device FPS acceptance
remain OPEN. This is tooling completion, not stage 7 visual acceptance.
See `docs/CLAUDE-CODE-HANDOFF-2026-09-20.md` for all commits, transfer instructions,
validation commands, limitations and next implementation priorities.

## Player crowd contact — 2026-09-24

The player now collides with pedestrians (no physics engine; `src/player/crowd-contact.mjs`),
people give way to a walking player, 30% of bumps start a fight, both sides take 25 per blow from
100 HP (four blows), every punched person hits back, a traffic car does 25 instead of killing, and
the dashboard shows a health bar with a game-over dialog. Left and right on foot were mirrored and
are fixed. Checked in Chrome on the user's PC at HIGH by day; the contact bench is at or up to ~25%
over its target, and trappedSeconds in packed kerb crowds missed its target. Details, evidence and
limitations: `docs/GTA-FIDELITY-STATUS.md` §9l and `evidence/player-contact/`.
