# RUN 4 — Locomotion quality

Stopping point. Foot IK is RUN 5 and is not started. Traffic vehicles are untouched, as agreed.
Nothing is pushed. 228/228 tests pass; typecheck clean.

Evidence: `evidence/run4-locomotion/{before,after}/`. Both sides are rendered by
`qa/gta-upgrade/locomotionbench.html`, which steps the real controller and the real figure at a
fixed 1/60 against flat ground and photographs chosen frames. The before sheets were captured
from a git worktree at the pre-RUN-4 commit through the same harness, so the two sides differ
only in the code under test.

---

## Changed files

| file | what |
| --- | --- |
| `src/player/locomotion.mjs` | **new** — the gait blend and the body-facing rule. No three, no renderer; testable as arithmetic. |
| `scripts/analyse-gait.mjs` | **new** — reads foot contacts off the bones and writes stride, cadence, duty and contact timing into the character report. |
| `src/player/figure.mjs` | locomotion is a blend the figure drives by hand; `characterAction` no longer picks a walk clip. |
| `src/player/controller.mjs` | bounded acceleration and braking, a separate `course`, a rate-limited body turn, turn drag. |
| `src/player/character-asset.mjs` | carries `gaitDetail` through to the blend. |
| `app/ShibuyaScene.tsx` | the player's contact shadow. |
| `public/data/character/citizen.json` | now carries `gaitDetail`. |
| `tests/locomotion.test.mjs` | **new** — 14 tests. |
| `tests/character-animation.test.mjs`, `tests/character-asset.test.mjs` | follow the new `characterAction` contract. |
| `qa/gta-upgrade/locomotionbench.html` | **new** — the frame-strip harness. |

## Clip gait data (STEP 1, measured, not reused)

`npm run analyse:gait`. Contacts are read off the `ball_l` / `ball_r` bones: a foot is planted
while it is near its own lowest point **and** moving backwards relative to the hips, because
height alone also matches a foot passing through the bottom of its swing.

| clip | upstream | duration | native m/s | stride | step | cadence | duty | airborne | left contact | L→R offset |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Walk | `Walk_Loop` | 1.333 s | 0.975 | 1.30 m | 0.65 m | 90 spm | 0.404 | 0.192 | 0.108 | **0.500** |
| Run | `Jog_Fwd_Loop` | 0.933 s | 5.357 | 5.00 m | 2.50 m | 129 spm | 0.329 | 0.342 | 0.008 | **0.500** |
| Sprint | `Sprint_Loop` | 0.667 s | 8.250 | 5.50 m | 2.75 m | 180 spm | 0.292 | 0.417 | 0.917 | **0.692** |

Two findings that changed the plan:

- **The Run clip strides 2.5 m per step.** A person running at 5.36 m/s takes roughly 1.5 m
  steps. This clip is a bound, and that is *why* slowing it down looks floaty — the stride is
  baked in and playback rate cannot shorten it.
- **Sprint's feet are not symmetric.** Its left and right contacts are 0.692 of a cycle apart
  rather than 0.5. Blending it against a symmetric clip by phase produces a limp. It is
  recorded in `gaitDetail` and reported here rather than averaged away.

Gameplay speeds, read from `src/player/controller.mjs`: `PLAYER.walk = 1.5`, `PLAYER.run = 4.2`.
**There is no separate sprint tier** — Shift is the 4.2 m/s run. The old `characterAction`
thresholds (2.1 / 3.7) therefore meant the Sprint clip was the steady state for running and the
Run clip was reachable only while accelerating through a 1.6 m/s window.

## What the before evidence shows

`before/transitions.png`, third row: `1.75s Walk 1.50 → 1.85s Run 2.64 → 1.95s Run 3.68 →
2.10s Sprint 4.10`. **Three clips inside 0.35 s**, and the Run clip on screen for 0.2 s.
Steady-state running is the Sprint clip at `4.2 / 8.25 = 0.51×` — a sprint in slow motion.

`before/turns-and-look.png`, fourth row: the body never moves while the camera swings 2.7
radians. A standing character was never told the view had turned.

## Locomotion state design

There is no state machine for walking any more. There are two things:

**The gait blend** owns the legs, always. It takes ground speed and returns a weight per clip
and a time per clip. It has no states and no transitions, so there is nothing to pop between.

**`characterAction`** owns everything else — Fall, Death, Enter, Exit, Hit, Guard, Startle,
Punch — and returns `null` when none of them applies. An action is layered *over* the legs
rather than replacing them, which is why a punch thrown while walking no longer stops the walk.

## Blend strategy (STEP 2 / STEP 3)

One line does the work:

```
period = blended stride / ground speed
```

The clips are placed on a ladder by native speed; the two rungs bracketing the current speed are
mixed by `w = (v − a.speed) / (b.speed − a.speed)`; the blended stride is `lerp(a.stride,
b.stride, w)`; and the cycle is given exactly as long as that stride needs at the current speed.
**Where that holds, the planted foot is stationary relative to the ground** — playback rate is
not a free parameter, it is determined by how far the animation moves the body per cycle.

The period is clamped to 0.72–1.16 s. Outside that band the feet slide, but a clip played at 0.5×
reads as wrong whatever the feet are doing, so the sliding is the cheaper error and it is
bounded.

Phase (STEP 3) is one number shared by every clip. Each clip is placed at
`((phase + its own left-foot contact) mod 1) × its duration`, so Walk at 0.108 and Run at 0.008
are held together at the footfall rather than at time zero. `reset()` is never called on a
locomotion action.

Measured across the range:

| speed | period | cadence | weights | clip rates |
| ---: | ---: | ---: | --- | --- |
| 0.60 | 1.16 | 103 | Idle 0.41, Walk 0.59 | Walk 1.15× |
| 1.50 | 1.16 | 103 | Walk 0.88, Run 0.12 | Walk 1.15×, Run 0.80× |
| 3.00 | 1.00 | 120 | Walk 0.54, Run 0.46 | Walk 1.33×, Run 0.93× |
| 4.20 | 0.96 | 125 | Walk 0.26, Run 0.74 | Walk 1.39×, Run 0.97× |
| 8.25 | 0.72 | 167 | Sprint 1.00 | Sprint 0.93× |

**Nothing plays below 0.80× or above 1.39× anywhere in the gameplay range.** Against 0.51×
before.

## Sprint policy (STEP 8)

**Option A/B: Run carries the top speed; the Sprint clip stays shipped and out of range.**

Not by preference — by arithmetic. At 4.2 m/s the blend is Walk 0.26 / Run 0.74 at a 0.96 s
period. Sprint does not enter until about 5.4 m/s, which gameplay never reaches. Playing Sprint
at 0.51× to make 4.2 m/s was never a run at half speed; it was an 8 m/s stride at a stroll's
cadence.

The other options, and why not:

- **C, motion warping the Sprint clip** would have to shorten a 2.75 m step to about 1.35 m.
  That is not warping, it is re-authoring, and it is what Foot IK in RUN 5 is for.
- **D, raising the gameplay sprint speed** was rejected: gameplay speed should not move for
  animation's convenience. It is worth noting separately that there is no sprint *tier* at all
  — Shift is the run — so if one is ever added, the ladder already reaches Sprint with no new
  plumbing, and the 0.692 contact offset above is what to fix first.

## Acceleration values (STEP 5)

| | before | after |
| --- | --- | --- |
| accelerating | `speed += (target − speed) · min(1, dt·10)` | `PLAYER.accelerate = 7.5 m/s²` |
| braking | same expression, `dt·12` | `PLAYER.brake = 11 m/s²` |
| turn cost | none | `PLAYER.turnDrag = 0.55`, scaled by how far the body has to swing |

An exponential reaches 1.5 m/s in about a tenth of a second from standing, which the feet cannot
keep up with. A rate limit gives 0.2 s to walking pace and 0.56 s to running pace, and the stop
from 4.2 m/s takes 0.38 s. Response is not noticeably worse: the body starts turning on the same
frame as the input.

`after/transitions.png`, first row: `0.55s Idle 0.00 → 0.65s Idle 0.38 → 0.75s Walk 1.12 →
0.85s Walk 1.50`, and the 0.65 s frame is legs-together at the top of a cycle, because a journey
now starts at phase 0.88 rather than wherever the cycle was left.

## Turn behaviour (STEP 6)

A rate limit, not a spring. A spring covers most of a half-turn in three frames and then crawls,
which is the instant snap this was meant to remove.

- moving: 7.0 rad/s, so a 180° reversal takes about 0.45 s;
- standing: the body ignores the camera until it has swung 0.95 rad, then turns at 3.6 rad/s
  until within 0.04 rad. The gap is what stops it twitching at every mouse movement;
- the body leans into a turn, scaled by turn rate and by speed, capped at 0.17 rad;
- turning costs speed, so a reversal does not happen at full pace.

`after/turns-and-look.png`: the 90° row dips to 1.15 m/s and recovers; the 180° row dips further,
to 0.92 m/s, and takes longer to recover — a bigger turn costs more, which is the point. The
"look while standing" row holds still for four frames and then pivots.

There are **no turn-in-place clips** in the library — the 43 upstream clips contain no
`TurnLeft` / `TurnRight`, and no `StartWalk` / `StopWalk` either. This is rotation and blending
only, and the report says so rather than implying authored transitions.

## Strafe and diagonal (STEP 7)

Three headings, kept apart: `heading` is the camera, `course` is where the input asks the body to
go, `bodyHeading` is where the body has turned to. Travel follows `bodyHeading`, not `course`, so
the character goes where it is pointing instead of sliding sideways while it turns. Measured in
the real scene on a diagonal run: `course −1.89`, `body −1.89` — exactly aligned.

## Contact shadow (STEP 9)

`createContactShadows` from `src/life/shadows.mjs`, one instance, one draw call. No new system.
The crowd's own shadow pass skips the controlled slot (`src/life/render.mjs:100`,
`if (!p.active || p.controlled) continue`), which is why the player was the one person in the
city standing on nothing.

Evidence: `after/contact-shadow.png`.

## Animation payload impact

**Zero.** No clip was added, removed or re-exported; `citizen.glb` is byte-identical.
`citizen.json` grew by the `gaitDetail` block — 1.4 KB, in a file already fetched.

## CPU impact

Measured, 2,000,000 iterations: **275 ns per character per frame** for the blend and the body
facing together. At 33 characters and 60 Hz that is 0.54 ms per second of wall clock — about
0.05% of one core. No new skeletons, no new mixers, no new pool, no IK.

The blend replaces a crossfade per transition, so the mixer does slightly *less* work in the
steady state than it did: two weighted actions instead of one action plus an in-flight fade.

## Acceptance

| | | evidence |
| --- | --- | --- |
| 1 | Idle→Walk does not pop | `after/transitions.png` row 1; the first step starts at phase 0.88 |
| 2 | Walk→Run does not skip leg phase | one shared phase; `tests/locomotion.test.mjs` asserts a speed change advances the phase by one frame rather than resetting |
| 3 | Run→Stop does not slide visibly | row 5; 0.38 s of braking rather than an exponential |
| 4 | 90° turn is natural | `after/turns-and-look.png` row 1 |
| 5 | 180° turn does not snap | row 2; a test asserts 0.35–0.7 s |
| 6 | Run/Sprint is not slow motion | no clip below 0.80×, asserted by test |
| 7 | root and feet do not diverge | period = stride / speed; a test asserts the implied foot speed is within 2% of ground speed at four speeds |
| 8 | player contact shadow exists | `after/contact-shadow.png` |
| 9 | zero console errors | in-scene run: 0 across city build, player mode, walk, diagonal run, punch, vehicle entry |
| 10 | combat and vehicle entry intact | same run: `attackTime 0.42` after a punch, `sedan` entered; 228/228 tests |

## Known limitations

1. **Below about 1 m/s the feet slide.** The period clamps at 1.16 s while the blend cannot
   produce a stride shorter than the Walk clip's 1.3 m, so at 0.95 m/s the feet travel about 18%
   faster than the body. The Idle blend covers most of it. A slow-walk clip would fix it
   properly; `Walk_Formal_Loop` is in the upstream library and was not shipped.
2. **The stride is long at speed.** At 4.2 m/s the character covers 4.0 m per cycle at 125 spm.
   That is a bounding run rather than a sprint, and it is the Run clip's authored stride, not the
   blend's choice. It is correct in the sense that the feet do not slide, and wrong in the sense
   that a person that size would take shorter, faster steps.
3. **No authored start, stop or turn-in-place.** Every transition is blending and damping.
4. **Sprint's asymmetric contacts are unfixed**, and would show as a limp if a sprint tier were
   added and the blend crossed 5.4 m/s.
5. **Backwards input turns the body around** rather than walking backwards; there is no
   backpedal clip.
6. **The upper body does not lead the turn.** The whole root rotates together. Spine-level
   counter-rotation needs an additive layer, which is not in this RUN.
7. **Foot IK is not here** — RUN 5. Everything above is about when a foot *should* be down;
   nothing yet puts it on an uneven surface.

**Not judgeable here, 実機確認待ち:** whether the transitions read as smooth in motion rather
than frame by frame, whether 7.0 rad/s feels responsive on a real input device, and whether the
camera and body settle together at speed.
