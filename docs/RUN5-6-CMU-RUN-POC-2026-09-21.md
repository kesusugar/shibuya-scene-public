# RUN 5.6 — CMU run retarget, proof of concept

**Verdict: the legs are a large, clear win. The arms are a clear regression. I am not
integrating it, and the retargeter existing is not a reason to use it.**

Nothing is pushed, `citizen.glb` is untouched, and no CMU data is committed to this repository.
235/235 tests pass; typecheck clean. RUN 6 is not started.

---

## Corrected reference maths

Carried over from the correction that preceded this run, because every number below depends on
it. **At a fixed speed, step length and cadence are the same fact**: `step = speed / (spm/60)`.
They are not two things a clip can get wrong independently — the current clip's 2.38 m at
106 spm multiplies back to 4.2 m/s, exactly the speed it was asked for.

People running at 4.2 m/s turn their legs over at roughly 160–170 spm, which fixes the step at
**1.48–1.58 m**. The earlier claim of "0.75–0.85 m at 160–170 spm" was withdrawn: those two
numbers describe 2.2 m/s, a walking step beside a running cadence.

## STEP 0 — licence and provenance

| | |
| --- | --- |
| Original dataset | CMU Graphics Lab Motion Capture Database, `mocap.cs.cmu.edu` |
| Conversion | Motionbuilder-friendly BVH conversion by Bruce Hahne (cgspeed), 2010 release v1.1 |
| Mirror used | `github.com/una-dinosauria/cmu-mocap` — the official hosts are unreachable from this environment, as in RUN 2 |
| Licence file | `READMEFIRST.txt`, 13,248 B, sha256 `8e6fe2e640b3728e…` — saved to `evidence/run5-6-cmu/CMU-READMEFIRST.txt` |
| Files taken | 17 BVH trials only, from the brief's shortlist. Not the 2,600-trial dataset. |

The licence text, read from the file rather than from a web page:

> CMU places **no restrictions** on the use of the original dataset, and I (Bruce) place no
> additional restrictions on the use of this particular BVH conversion.
>
> Use this data! This data is free for use in research and **commercial projects worldwide**.
> If you publish results obtained using this data, we would appreciate it if you would send the
> citation … and also would add this text to your acknowledgments section: "The data used in
> this project was obtained from mocap.cs.cmu.edu. The database was created with funding from
> NSF EIA-0196217."

**Redistribution: the document contains no restriction of any kind.** `grep` for
restrict/resell/redistribute/licence returns exactly the two lines above. The RUN 5.5 note
claimed CMU asks that the data not be resold even converted; **that was recalled rather than
sourced, and is withdrawn.** The project's own rule — do not redistribute raw data as a
third-party asset pack, pre-convert only what Shibuya needs — is stricter than the licence and
still governs. The acknowledgment would go in `docs/CHARACTER-ASSET-PROVENANCE.md` if this were
ever adopted.

## STEP 1–2 — a minimal BVH reader, and the shortlist

`scripts/cmu/bvh.mjs` reads hierarchy, rest offsets, frame time, root translation and joint
rotations, and does forward kinematics. Nothing else. Rotation order is composed explicitly
from the channel order rather than handed to a Euler helper, because a skeleton that is wrong
by an axis swap still animates — it just animates incorrectly. **No BVH parsing exists at
runtime**; this is `scripts/` only.

**The scale is derived, not asserted.** The conversion documents no unit. Rather than adopt the
often-quoted 0.056444 on faith, the scale is computed from the requirement that actually
matters for retargeting — the source skeleton must end up the same size as the target — giving
`target leg / source leg` ≈ **0.0533 m per unit** for subject 16. A standing-hip cross-check
lands at 0.92 m, which is what said the first attempt (inches, 0.0254) was wrong by half.

**Frame 0 is discarded.** `READMEFIRST.txt` states that every file has a T-pose added as its
first frame. That synthetic pose sits up to 40 mm below anything in the real capture, so taking
it as a foot's lowest point put the floor underground and made twelve of seventeen trials
report "no foot lands twice" while their gait was clean.

## STEP 6–7 — one extracted cycle per trial, same benchmark

Cycles are cut between two successive contacts **of the same foot**, from the middle of the
trial, and the discontinuity across the cut is measured rather than crossfaded away. Which foot
is chosen varies per trial: these captures are 1.1–1.6 s and a given foot may land only once.

| trial | speed | step | cadence | step/ref | L→R | drift | seam | seamY |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **16_45** | 3.79 | 1.34 m | 169 | **0.97** | 0.51 | 20 mm | **90 mm** | 17 mm |
| **16_46** | 3.91 | 1.30 m | 180 | 0.92 | 0.49 | 18 mm | 73 mm | 25 mm |
| 16_36 | 2.53 | 0.99 m | 153 | 1.08 | 0.53 | 15 mm | **40 mm** | 6 mm |
| 02_03 | 2.55 | 1.01 m | 152 | 1.09 | 0.51 | 24 mm | 60 mm | 21 mm |
| 35_20 | 3.10 | 1.01 m | 185 | 0.89 | 0.42 | 16 mm | 265 mm | 42 mm |
| 35_17/18/19/22/24 | 2.9–3.2 | 0.77–0.92 | 212–222 | 0.74–0.78 | 0.29–0.34 | 9–25 mm | 516–670 mm | 14–25 mm |

**The cleanest loops are not the best candidates.** 16_36 and 02_03 have the lowest seams by
far — but they run at 2.5 m/s with a 1.0 m step, and RUN 4 drives a clip at
`period = stride / speed`, so at 4.2 m/s they would demand **250 spm**. They are worse than the
incumbent. Loop quality and speed suitability point in opposite directions here.

| driven at 4.2 m/s | step | cadence | step/ref | distance from reference |
| --- | ---: | ---: | ---: | ---: |
| current `Jog_Fwd_Loop` | 2.38 m | 106 | 1.56 | **0.56** |
| **CMU 16_45** | 1.34 m | 188 | 0.88 | **0.12** |
| CMU 16_46 | 1.30 m | 193 | 0.85 | 0.15 |
| CMU 16_36 | 0.99 m | 255 | 0.65 | 0.35 |

## STEP 3–5 — the retarget

`scripts/cmu/retarget.mjs`, offline, emitting quaternion tracks as JSON. 22 bones mapped; **no
fingers**, as instructed. Three things in it are worth stating because each was got wrong first:

- **Rotations are not copied; rest-relative deltas are.** `delta = src_world · src_rest⁻¹`, then
  `target_world = delta · target_rest`.
- **The source rest pose is frame 0, the added T-pose** — not the zero-rotation hierarchy.
  READMEFIRST says the T-pose exists precisely to make retargeting work. Using the
  zero-rotation pose instead produced knees and elbows that measured fine and feet that were
  systematically wrong.
- **The pelvis height track is written in the pelvis's parent frame, not into `.y`.** This
  skeleton is Z-up in bone space; RUN 5 hit this in the foot-IK pelvis drop and this exporter
  hit it again.
- **The clip is grounded once, at bake time**, by the constant that puts its lowest sole of the
  cycle on the floor (−13 mm for 16_45, −66 mm for 16_46). A constant offset applied offline
  cannot hide a clip whose feet are wrong *relative to each other*, because every frame moves
  together. That is the distinction RUN 5's boundary turns on and it is deliberately kept sharp.

### STEP 4 — joint validation

`scripts/cmu/validate.mjs`, checking the four failures the brief names:

| | 16_45 | 16_46 | 16_36 |
| --- | ---: | ---: | ---: |
| knee minimum bend | 74° / 67° | 77° / 67° | 83° / 82° |
| **knee inversions** | **0** | **0** | **0** |
| elbow minimum bend | 43° / 39° | 41° / 40° | 58° / 50° |
| planted foot yaw | 14° | 19° | 28° |
| pelvis roll | 7° | 6° | 5° |
| NaN | none | none | none |

The foot-yaw check took four wrong framings before it was right, and the sequence is worth
recording because every version *looked* reasonable: measuring against an assumed −z forward
(this rig's forward is +z); against the world rest direction (180° for a character running
opposite its bind facing — correct behaviour, flagged as failure); over the whole cycle
(160–180° mid-swing, because a running shin folds back and the toe genuinely aims behind the
runner). Only the fourth — **planted feet only, in the pelvis's frame** — measures the thing
the name refers to. Printing the poses frame by frame settled in one pass what three rounds of
reasoning had not.

## STEP 8–9 — the comparison, and the decision

`evidence/run5-6-cmu/cmp-{side,rear,front,feet}.png`. Every clip driven identically by RUN 4's
rule at 4.2 m/s, no foot IK, same camera, same ground, same character. The incumbent's stride
is taken from the root-motion build (4.76 m) rather than `gaitDetail`'s foot-inferred 5.00 m,
so the comparison does not hand it a 5 % penalty it has not earned.

**What the sheets show.**

*Legs — CMU wins, decisively.* The current row splits into a bound and hangs there; the CMU
rows have a compact stride with real knee drive, and the feet come down and roll heel to toe.
Step/ref goes 1.56 → 0.88, which is **4.6× closer to the reference**. Planted drift 65 mm →
20 mm. Penetration 7 mm → 0.

*Arms — CMU loses, visibly.* Both candidates hold the hands high and tight across the chest
with the elbows folded to ~40°, where a running arm sits nearer 90°. It reads as someone
running while carrying something. The current Quaternius clip's arm swing is plainly better.
Whether that is the subjects' own style or an artifact of the zero-length CMU clavicle
retargeting onto a real one, I have not established — and I am not going to guess in a report.

### Against the STEP 9 gate

| criterion | result |
| --- | --- |
| clearly more natural than the 2.38 m step | **yes** — 1.34 m, 4.6× closer to reference |
| cadence improved | **yes** — 106 → 188 spm, against a 160–170 reference |
| penetration improved | **yes** — 7 mm → 0 |
| planted drift not worse | **yes** — 65 mm → 20 mm |
| no loop seam problem | **partly** — 90 mm on 16_45, the best of the pool, but not nothing |
| upper body natural | **no** — a visible regression |
| integrates with the RUN 4 blend | yes, via stride metadata; no controller change needed |
| RUN 5 IK not strengthened | yes — untouched |

Three of the three required metrics improve, and one qualitative criterion fails.

**So: not integrated.** The brief is explicit that a numeric win is not sufficient and that
having built a retargeter is not a reason to use it. Shipping a run whose legs are right and
whose arms are wrong trades one visible defect for another, and the arms are in frame whenever
the legs are.

## Recommendation

**16_45 is the right clip if the arms can be fixed, and the arm question is worth one short
run.** The leg result is not marginal — it is the largest single improvement available to the
character — and the whole offline path now exists and is validated. Three options, in the order
I would try them:

1. **Retarget the legs and spine from CMU, keep the arms from Quaternius.** The bone map is
   already per-bone; excluding the shoulder chain is a one-line change. Whether two sources
   blend acceptably at the spine is the thing to find out.
2. **Establish whether the arm pose is the subject or the clavicle retarget**, by checking the
   source's own elbow angle against the retargeted one. If the source runs with 90° elbows and
   the output has 40°, it is a fixable bug in the shoulder correction rather than a property of
   the capture.
3. **Look at other CMU subjects.** Only 17 of ~2,600 trials were touched, all from the brief's
   shortlist, and only three of those produced a clean cycle at a useful speed. Subjects 9, 127
   and 141 also contain running.

If none of that works, the current clip stays. It is a 1.56 step ratio, not a 2.4 one.

## What was added

| file | what |
| --- | --- |
| `scripts/cmu/bvh.mjs` | minimal BVH reader + forward kinematics + derived scale |
| `scripts/cmu/shortlist.mjs` | what the fetched trials contain |
| `scripts/cmu/measure.mjs` | cycle extraction and the STEP 7 metrics |
| `scripts/cmu/retarget.mjs` | the retarget, rest correction, in-place bake, grounding |
| `scripts/cmu/validate.mjs` | the four joint checks |
| `qa/gta-upgrade/runcompare.html` | the comparison sheet |
| `evidence/run5-6-cmu/` | four comparison sheets + the CMU licence file |

**No BVH and no retargeted clip is committed.** The JSON clips live in a gitignored
`qa/gta-upgrade/cmu-clips/` for the bench only. `citizen.glb`, the payload and the runtime are
untouched.
