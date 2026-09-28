# RUN 5.5 — Animation asset quality pass: the Run slot

**Stopped at the `IF NO GOOD CLIP EXISTS` branch, as the brief directs.** No clip was replaced,
no clip was modified, and no external asset was introduced. What follows is the measurement
that establishes there is nothing to replace it *with* inside the current sources, and the
external candidates, reported for a decision.

Nothing is pushed. 235/235 tests pass; typecheck clean. RUN 6 is not started.

---

## STEP 0 — the two penetration numbers, reconciled

RUN 5 produced two figures for the same clip that read as contradictory:

> "the Run clip's sole passes **42.9 mm** through the road"
> "the Run clip's floor is **11.3 mm** below the plane the Idle clip stands on"

Both are correct and they are different measurements. Rather than explain that from memory, it
is now fixed by code: `node qa/gta-upgrade/penetration-definitions.mjs` measures all of them
side by side.

| row | what is measured | reference plane | value |
| --- | --- | --- | ---: |
| A | Run clip alone, native rate, deepest sample | the model origin | −19.0 mm |
| | Idle clip alone, same | the model origin | −7.6 mm |
| **B** | **Run clip alone, deepest sample** | **the Idle sole plane** | **−11.4 mm** |
| **C** | **Run in game at 4.20 m/s, real blend, deepest sample** | **the road surface** | **−42.9 mm** |
| D | Run in game, mean over each foot in its own stance window | the road surface | 59.8 mm |
| D′ | Run in game, mean over the lower sole only | the road surface | 58.5 mm |
| | Walk in game at 1.50 m/s, deepest sample | the road surface | −25.5 mm |
| | Walk in game, mean over each foot in its own window | the road surface | 11.4 mm |

The three axes they differ on:

- **Reference plane.** A is the model's own origin, and is *not* an error — the shoe mesh has
  thickness and the ball bone sits inside it, so a perfectly grounded clip still reads a few
  millimetres negative. Idle's −7.6 mm **is** that offset, which is exactly why B exists: B is
  A minus Idle's offset, and is a property of the clip alone.
- **Whether the game is involved.** B is the raw clip at its own rate with the root at the
  origin. C is the same clip placed by the controller, retimed to 4.2 m/s and mixed with Walk
  by the gait blend. The blend and the retiming are the 31 mm between them.
- **Maximum versus mean.** B and C are both single deepest samples. D and D′ are means, and
  over populations that have to be named — each foot in its own stance window, or the lower
  sole only. They differ from each other by about a millimetre, and from C by 17.

**One correction falls out of this.** The RUN 5 note quotes 49.0 mm for the running mean. That
figure comes from the photographic bench, which runs its scenario **from a standing start** and
samples all 133 frames, so a third of its population is the acceleration ramp — where the blend
still leans on Walk, which is well grounded. Measured at steady state instead, the mean is
**59.8 mm**, not 49.0. The steady state is the worse number and the more honest one, and it
supersedes the earlier figure rather than sitting alongside it.

## STEP 1–2 — the upstream inventory

Full tables: [`docs/ANIMATION-LOCOMOTION-AUDIT.md`](ANIMATION-LOCOMOTION-AUDIT.md), generated
by `node scripts/audit-locomotion.mjs`.

Two things about the method are worth stating, because both changed the numbers.

**Root motion is now read, not inferred.** The archive ships two builds — `UAL1_Standard.glb`
with root motion stripped, and `UAL1_Standard_RM.glb` with it baked in. RUN 4 only used the
stripped build, so it had to derive each clip's speed from how the feet moved. Reading the RM
build's actual pelvis translation gives:

| clip | RUN 4, inferred from feet | RUN 5.5, read from root motion |
| --- | ---: | ---: |
| `Walk_Loop` | 0.975 m/s, 1.30 m stride | **0.93 m/s, 1.24 m stride** |
| `Jog_Fwd_Loop` | 5.357 m/s, 5.00 m stride | **5.10 m/s, 4.76 m stride** |
| `Sprint_Loop` | 8.25 m/s, 5.50 m stride | **7.85 m/s, 5.23 m stride** |

RUN 4's estimates ran about 5 % high across the board. The conclusions it drew from them stand.

**Planted drift has to be measured on the RM build too.** Measured on the stripped build, a
correctly planted foot slides backwards by a whole step *by construction* — it reported 600 mm
of "drift" for a clean walk, which is the stride, not a defect. On the RM build the body
advances and a planted foot should stand still, so what is left is real slip: Walk 46 mm, Jog
65 mm, Sprint 18 mm.

### The candidate pool

| clip | native | step | cadence | penetration vs idle floor | rate needed @4.2 m/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| `Walk_Loop` | 0.93 m/s | 0.62 m | 90 spm | −0.2 mm | 4.526× |
| `Walk_Formal_Loop` | 0.93 m/s | 0.62 m | 90 spm | −0.2 mm | 4.526× |
| `Jog_Fwd_Loop` | 5.10 m/s | 2.38 m | 129 spm | 11.4 mm | **0.824×** |
| `Sprint_Loop` | 7.85 m/s | 2.62 m | 180 spm | 34.7 mm | 0.535× |
| `Crouch_Fwd_Loop` | 0.71 m/s | 0.71 m | 60 spm | 0.2 mm | 5.884× |
| `Push_Loop` | 0.29 m/s | 0.38 m | 45 spm | 2.5 mm | 14.710× |
| `Swim_Fwd_Loop` | 2.07 m/s | 1.38 m | 90 spm | 256.9 mm | 2.028× |

`Walk_Formal_Loop` was the one genuinely new name in the pool, and it is **the same walk**:
identical root motion, identical stride, identical contact phases and duty. It differs only
above the waist — 77 mm of arm swing against 347 mm, and about 2° less lean. A walk with its
hands kept still, not a faster one.

Crouch, push and swim were measured rather than dismissed by name, as instructed. They are
crouched, pushing and swimming, at 46°–88° of lean.

**There is nothing between 0.93 m/s and 5.10 m/s.**

## STEP 3–4 — the baseline, and why it looks wrong

Gameplay speed is unchanged and was never a candidate for change: `PLAYER.walk` 1.5,
`PLAYER.run` 4.2.

`evidence/run5-5-animation/before/run-4.2ms-four-views.png` — side, rear ¾, front ¾ and a feet
close-up of the current run at 4.2 m/s, through `qa/gta-upgrade/runbench.html`:

| | current |
| --- | ---: |
| blended stride | **4.02 m** |
| step | **2.01 m** |
| cycle | 0.958 s |
| cadence | **125 spm** |
| duty | 0.349 |
| sole below the road, worst across one stride | 39 mm |

### The reference, computed rather than recalled

**At a fixed speed, step length and cadence are the same fact.** `step = speed / (spm/60)`,
so a clip driven at 4.2 m/s cannot get them wrong independently — the measured 2.01 m at
125 spm multiplies back to 4.19 m/s, which is the speed it was asked for. The one free
variable is cadence.

People running at 4.2 m/s turn their legs over at roughly **160–170 spm**, which fixes the
step at:

| cadence | step at 4.2 m/s |
| ---: | ---: |
| 125 spm *(current clip)* | **2.02 m** |
| 160 spm | 1.58 m |
| 165 spm | 1.53 m |
| 170 spm | 1.48 m |
| 180 spm | 1.40 m |

So the current run is **1.32× the reference step**, equivalently **0.76× the reference
cadence** — one defect stated two ways, not two defects.

**An earlier draft of this note claimed “0.75–0.85 m steps at 160–170 spm” and called the
current clip 2.4× too long. That is withdrawn:** 0.8 m at 165 spm is 2.2 m/s, a walking step
length placed next to a running cadence. The two figures never described the same runner.
The reference range above is computed from the speed, and the bench now prints it beside
whatever it measures so the comparison cannot drift again.

The problem is real and unchanged in kind — the side view shows the legs splitting into a
bound and hanging there, and **retiming cannot shorten a stride baked into the keyframes** —
but it is a 30% overshoot, not a 140% one, and the decision gate for a replacement should be
set against the smaller number.

## STEP 5 — there is no candidate

Both Quaternius libraries are now enumerated and measured.

**UAL1** — the four upright forward loops are in the table above. Nothing serves 4.2 m/s.

**UAL2** — found during this run, and checked properly because it looked promising:

- **Licence CC0-1.0**, read from the archive's own bundled `License.txt`, not from a web page.
- **Bytes verified**: `UAL2_Standard.glb`, 8,091,444 B, sha256 `8cee20ab1bc55130…`, corroborated
  by four unrelated repositories, one of which recorded the hash in a Git-LFS pointer
  independently of the two that committed the bytes.
- **Skeleton identical** — the same 65-bone UE naming. A drop-in with no retargeting at all.
- **And it contains no run and no jog.** All 43 clips measured for root-motion speed: the
  fastest upright forward motions are `Slide_Start` 4.65 m/s and `Slide_Loop` 4.28 m/s, and
  those are *slides* — the character is not on its feet. It is a themed action pack (sword,
  shield, farming, zombie, ninja).

There is no UAL3.

## STEP 6 — the Walk / Jog / Run policy question is moot

The brief asks whether a Jog tier between Walk and Run would be more natural, and instructs
that the minimum configuration wins. **The question cannot be answered yet, because there is no
jog clip to put in the tier.** The gap in the pool is 0.93 → 5.10 m/s; a Jog tier needs
something around 2.5–3.5 m/s and nothing exists there. Left open rather than answered.

## This is the `IF NO GOOD CLIP EXISTS` branch — candidates, for a decision

Per the brief: the existing clip is not to be modified to fit, and nothing is introduced before
reporting. Two external options, with what is known about each.

### Candidate 1 — CMU Graphics Lab Motion Capture Database (cgspeed BVH conversion)

| | |
| --- | --- |
| Licence | Permissive. The bundled `READMEFIRST.txt` states: *"Use this data! This data is free for use in research and commercial projects worldwide."* An acknowledgment of `mocap.cs.cmu.edu` and NSF EIA-0196217 is requested, not required. |
| Commercial use | Explicitly allowed |
| Redistribution | The bundled document contains **no restriction of any kind** — verified by reading it, see RUN 5.6. An earlier draft of this row claimed CMU asks that the data not be resold even converted; that was recalled rather than sourced and is withdrawn. The project's own rule against redistributing raw data as a third-party asset pack still applies and is stricter than the licence. |
| Reachable | Yes — mirrored on GitHub (`una-dinosauria/cmu-mocap`), which is the only host this environment can reach |
| Content | Very large; multiple subjects walking, jogging and running at a range of real speeds. This is the only source found that would actually solve the problem. |
| Cost | **Substantial.** BVH, with MotionBuilder joint naming, not the UE 65-bone naming. Needs a retargeting pipeline: bone mapping, rest-pose alignment, scale normalisation, and a conversion step in `scripts/`. This is new code of a kind RUN 5.5 has so far avoided entirely. |

### Candidate 2 — accept the current Run and spend the effort elsewhere

Not a cop-out; it has a real argument. The **C** list from RUN 5 also contains `hit`, `enter`
and `exit`, and **UAL2 answers at least `hit` outright** — `Hit_Knockback` carries 2.93 m of
travel against a current `Hit` that barely moves, it is CC0, it is verified, and it is a
drop-in needing no retargeting. Three of the four **C** items may be addressable with zero new
pipeline, while the fourth needs a whole retargeter.

### What I would recommend

**Report first, and I am not choosing between these unilaterally** — the brief says to stop
here, and the decision has a real cost either way.

If the Run is to be fixed properly, Candidate 1 is the only route found and the retargeter is
unavoidable. If the aim is the most visible improvement per unit of risk, the UAL2 drop-ins
come first and the Run stays as it is for now — with the important caveat that **running is how
the player spends most of their time**, so leaving it is leaving the most-seen defect in place.

What is *not* acceptable, and is stated here so it does not creep in later: closing the 59.8 mm
with a stronger foot-IK term. RUN 5 drew that line and this run has not crossed it.

## What was changed

| file | what |
| --- | --- |
| `scripts/audit-locomotion.mjs` | **new** — the whole candidate pool on one benchmark, root motion read from the RM build. Writes `docs/ANIMATION-LOCOMOTION-AUDIT.md`. |
| `qa/gta-upgrade/penetration-definitions.mjs` | **new** — the four definitions of "sole penetration", measured rather than remembered. |
| `qa/gta-upgrade/runbench.html` | **new** — the run from four angles at a chosen speed, with stride, cadence and sole error on the frame. Built to photograph a candidate through the same harness as the incumbent. |
| `src/player/locomotion.mjs` | a read-only `stride` getter on the gait blend, so the benches can report what the blend is driving the period from. No behaviour change. |
| `docs/ANIMATION-LOCOMOTION-AUDIT.md` | **new**, generated |
| `.gitignore` | keeps the three new benches, like the ones before them |

**No clip was changed. No asset was added. `citizen.glb` is untouched**, so payload, initial
scene cost, draw calls and AnimationMixer actions are all unchanged by construction — there is
nothing to measure because nothing that affects them was altered.

## Remaining animation issues — recommended order, not implemented

1. **`hit`** — UAL2's `Hit_Knockback`, CC0, verified, drop-in, no retargeting. Highest value
   per unit of risk of anything on this list.
2. **`run`** — needs Candidate 1 and a retargeter, or it stays.
3. **`enter` / `exit`** — still `Sitting_Enter` / `Sitting_Exit`, chair clips doing a car's job.
   Neither library has a vehicle entry.
4. **`turn` / `start` / `stop`** — absent from both libraries. These are **D**: new animation,
   not a replacement.
