# GTA Fidelity Master Plan — status and handoff

The one document to read when resuming this work with no conversation history. Read
`AGENTS.md` and `CLAUDE.md` first for the repository rules, then this.

**Latest section: §9i (crowd realism, branch `claude/crowd-realism`).** Earlier header text: **Updated at the close of RUN 7C.** RUNs 0–6, 6.8, 7A, 7B and 7C are complete. RUN 7 proper —
the NPC behaviour work — is still only an unverified WIP commit; see §10.

## 1. Goal

Turn the Shibuya scramble scene into something that reads like a GTA-style street: a player
you can walk, run, fight and drive with, in a crowd that reacts, at a fidelity that holds up
when the camera is two metres from a person's face. Fourteen RUNs, sequential, each closed
with tests, in-browser verification, numbers, and a commit before the next begins.

Not a goal: a physics rewrite, an engine swap, or a photoreal character. The Superhero body
in use now is a placeholder for the pipeline, not the final visual asset.

## 2. Branch and HEAD

- Current work lands on `master` through PRs: #19 (RUN 10–11), #20 (crowd realism, §9i) and
  #21 (RUN 12, the final RUN, §9j, branch `claude/happy-tesla-dkn52d`). The punch fix found on
  real hardware after that (§9k) is on the same branch, restarted from `master` `c1b89c6`. Player crowd contact,
  four-blow fights and the left/right fix (§9l) are on `claude/player-crowd-contact`, from `master` `3e15698`. The historical working
  branch **`claude/gta-fidelity-upgrade`** is merged and no longer where work happens.
- RUN 10.1 handoff HEAD: **`76dc411`**. RUN 10.2–10.5 follow it on this branch; RUN 11 starts
  from `b037bc8` (§9h). Use `git log -1` for the current HEAD. Older HEAD lines and the old
  roadmap lower in this document are historical snapshots and are superseded by §9g.
- RUN 8 and RUN 9 are complete. The old RUN 7 WIP at `f6aa8e8` was found active in production
  and replaced by the single HQ authority in RUN 10.1.
- `master` is untouched by this work and must stay that way. It moved ahead independently
  (PRs #17 and #18 from `codex/prebaked-motion`); the local `master` here is `c538aa2`, a
  clean ancestor of the remote `39175bd`. Nothing has been merged into or pushed from it.

Checkpoint history, newest first:

```
cd5c1bb  RUN 8.4: let a punch reach the crowd it is standing in
986429c  RUN 8.3: pin crossing-safe combat and the death loop against the real controller
04ca156  RUN 8.2: stop the vehicle shadow shader redeclaring what three.js injects
01f57d1  RUN 8.1: melee lands when the fist arrives, not when the button is pressed
9a2e62a  RUN 7C complete: document the colour space fix and the knockdown chain
03fcd5b  RUN 6.8: Break near-humanoid clone appearance
3e9213b  Prepare ChatGPT Work handoff
f6aa8e8  RUN 7 WIP: NPC awareness state machine - NOT verified, NOT complete
b32e5a7  RUN 6 complete: handoff status document
cdb6271  RUN 6.7: near-pool budgets on every tier
09f8841  RUN 6.2: hold the near-humanoid budget at its limit under a real crowd
93085fb  RUN 6.1: stop the shader warm-up polling materials that are already gone
6b1f967  RUN 6: give the nearest citizens the player's body
```

## 3. RUN summary

| RUN | Subject | State |
| --- | --- | --- |
| 0 | Baseline capture | complete |
| 1 | OSS mapping | complete |
| 2 | Humanoid pipeline (Quaternius, CC0) | complete |
| 3 | Vehicle visual fidelity | complete |
| 4 | Locomotion (gait ladder, blends) | complete |
| 5 | Foot IK (player only) | complete |
| 5.5 | Animation audit — the whole candidate pool | complete |
| 5.6 | CMU run retarget POC | complete, not integrated as-is |
| 5.7 | Hybrid run (CMU lower + Quaternius upper) | complete, **adopted** |
| 6 | Near-NPC visual upgrade | **COMPLETE** |
| 6.8 | Near-humanoid clone break | **COMPLETE** |
| 7A | Massive HQ reactive crowd POC | **COMPLETE (POC)** |
| 7B | HQ crowd integrated into Shibuya | **COMPLETE** |
| 7C | HQ crowd colour / lighting integration | **COMPLETE** |
| 7 | Historical NPC awareness WIP | superseded in RUN 10.1; never a second production authority |
| 8 | Melee combat phases + mass crowd reaction | **COMPLETE** |
| 9 | Vehicle occupancy / enter-exit / carjacking | **COMPLETE** |
| 10 | NPC life / awareness consolidation | complete: browser acceptance closed 2026-09-23 (§9g) |
| 11 | Visual / audio / GTA feel polish | **COMPLETE** 2026-09-23 (§9h) |
| 12 | **Final**: performance guard, recorded audio, wet-road reflection, PBR ground, motion, robustness, final QA | **COMPLETE** 2026-09-24 (§9j) |
| 13 | Performance / stability | folded into RUN 12 |
| 14 | Final QA and handoff | folded into RUN 12 |

**Current authority:** `src/life/hq-awareness.mjs` (RUN 10.1 onward). The old
`src/life/awareness.mjs` is deprecated historical code with no production import. The RUN 7
notes below describe the old state at that time, not a second running system.

Each RUN has its own note under `docs/` (`RUN2-…`, `RUN3-…`, `RUN4-…`, `RUN5-…`,
`RUN5-5-…`, `RUN5-6-…`, `RUN5-7-…`). They carry the measurements; this file carries the state.

## 4. Architecture, in one screen

`app/ShibuyaScene.tsx` orchestrates a **module system**: each stage (`ground`, `buildings`,
`heroes`, `station`, `signs`, `streetscape`, `traffic`, `life`, `trains`, `construction`,
`nightglow`) is built asynchronously through a build queue and reports into a startup trace.

Two rules the rest of the code depends on:

- **Physics is the source of truth; visuals follow named anchors.** A `CharacterAsset` or
  `VehicleAsset` exposes anchors, and the figure code positions meshes to them. Keep this
  abstraction — it is what lets a baked figure and a 65-bone humanoid be interchangeable.
- **Prebaking is not optional.** Startup time is a hard constraint. Derived data is baked
  offline (`npm run bake:static`) and loaded, never regenerated at startup.

## 5. Character system

Upstream: **Quaternius Universal Base Characters + Universal Animation Library \[Standard\]**,
CC0-1.0, verified from the bundled `License.txt` and by SHA-256 against independent mirrors
(the official hosts are egress-blocked here; only `github.com` and `raw.githubusercontent.com`
are reachable). Provenance is recorded in `docs/CHARACTER-ASSET-PROVENANCE.md`. Upstream
archives are never committed — `/assets/character/upstream/` is gitignored.

Skeleton: 65 bones, UE naming (`root, pelvis, spine_01..03, neck_01, Head, clavicle/upperarm/
lowerarm/hand_l|r`, fingers, `thigh/calf/foot/ball_l|r`).

**Two facts about this rig that have caused bugs three times each. Read them before touching
bone space:**

- **The skeleton is Z-up in bone space.** `pelvis` rest position is `(0.005, 0.086, 0.877)` —
  the height is the `0.877` on **Z**. Writing a world-space Y into `pelvis.position.y`
  displaces the character *backwards*, and the stats will happily report the displacement you
  asked for. Convert world-down into the parent frame and divide by parent scale.
- **The rig's forward is +Z.** The controller advances by `(sin h, cos h)`.

Variation is a **uniform write, not a second asset**: the garment mask carries skin, top,
bottom, hair and shoes in vertex-colour channels, so recolouring costs no recompile and no
per-body material. Thirty-two unique assets is explicitly not the approach.

## 6. Locomotion

`src/player/locomotion.mjs`. Gameplay speeds are fixed (`PLAYER.walk` 1.5 m/s, `PLAYER.run`
4.2 m/s) and are never moved to suit an animation. A clip is driven at
`period = blended stride / ground speed`.

Constants that encode decisions: `LOCOMOTION.gameplayTop` 4.2, `LOCOMOTION.maxAsymmetry` 0.08
(keeps `Sprint_Loop`, whose contacts are 0.538 not 0.500, out of the gameplay blend),
`LOCOMOTION.minPeriod` 0.62 (0.72 made the feet imply 3.73 m/s at a 4.2 m/s ground speed,
which is foot sliding).

**At a fixed speed, step length and cadence are the same fact** — `step = speed / (spm/60)`.
They are not two things a clip can independently get wrong. At 4.2 m/s, 160–170 spm fixes the
step at 1.48–1.58 m.

## 7. Foot IK

`src/player/foot-ik.mjs`. **Player only.** 13 µs/frame, allocation-free, ~3.9 ground queries
a frame.

Its role is bounded and the boundary is deliberate, stated in the file header and repeated
here because it is the thing most likely to be eroded: **foot IK adapts a correct animation to
the terrain. It does not correct the animation.** If you are adding an absolute-height term to
close a contact number, you are crossing that line. A bad clip pose is an asset problem.

## 8. Hybrid run

`assets/character/hybrid-run.json` (17.8 KiB) — the only CMU-derived artefact in the repo,
carrying provenance for both halves. `scripts/convert-character.mjs` folds it into the `Run`
clip at conversion time, so the runtime sees an ordinary clip: **no second mixer, no second
skeleton, no second SkinnedMesh.**

CMU Graphics Lab Motion Capture Database via the cgspeed BVH conversion: *"CMU places no
restrictions… free for use in research and commercial projects worldwide."* Acknowledgment
requested (mocap.cs.cmu.edu, NSF EIA-0196217), not required.

Lower body is CMU 16_45, within 0.022° of the source across 9 bones × 24 phases (asserted by
`tests/hybrid-clip.test.mjs`); upper body is Quaternius; the hips→spine boundary is corrected.
Gait: stride 2.687 m, speed 3.793 m/s.

**Closed.** Do not reopen run-candidate search, CMU subject search, arm retarget or gait
研究 — RUN 5.7 settled it.

## 9. Near NPCs (RUN 6)

`src/life/near-characters.mjs`. The pool beside the player is **two pools**: the nearest few
wear the same 65-bone humanoid the player wears, the rest keep the offline-baked figure.

```
NEAR_LIMITS     high 32   medium 12   low 4     (total slots)
HUMANOID_LIMITS high  8   medium  4   low 0     (of those, humanoid)
NEAR_IK_LIMITS  high  8   medium  4   low 0     (of those, foot IK)
```

Measured (`qa/gta-upgrade/tierprobe.mjs`, 300 people, 600 frames of churn):

| tier | slots | humanoid | baked | triangles | draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| HIGH | 32 | 8 | 24 | 215k | 168 |
| MEDIUM | 12 | 4 | 8 | 93k | 60 |
| LOW | 4 | 0 | 4 | 15k | 24 |

Per rig, a humanoid is **4.1× the triangles of a baked figure and half the draw calls** —
three meshes against six. What scales here is skinning and bone matrices, not batches.

Three design points that are load-bearing:

1. **A slot's kind comes from the pool's quota, never from a candidate's per-frame rank.**
   Rank churns; keying kind to it makes the pool build a new humanoid every time a holder
   drifts down the list. That shipped once and reached 28 humanoids against a budget of 8.
   Filling the quota first makes the bound structural.
2. **Budget alone is not the goal.** Eight humanoids on the eight furthest people satisfies
   every bound and misses the point. One swap per frame between the furthest-fallen humanoid
   holder and the highest-ranked citizen on a baked figure, with a four-rank hysteresis band,
   moves the aim from 18–35% to 84–85% of the nearest eight.
3. **The humanoid arrives late, exactly as the player's does.** A session that never finishes
   loading it runs on baked figures throughout and nothing waits.

Priority order is unchanged from before RUN 6: combat target, then reacting pedestrian, then
nearest. Body quality follows rank; it does not set it.

### RUN 6.1 — the `isReady` error, root-caused

`TypeError: Cannot read properties of undefined (reading 'isReady')` at city build. It was
**not** caused by RUN 6 (it reproduces with those changes stashed) and it is not three.js
misbehaving.

`WebGLRenderer.compileAsync` polls materials every 10 ms until they report ready, and the poll
has no stop. Each tick reads `properties.get(material).currentProgram`, and `WebGLProperties.
get` returns a fresh empty object for a material it no longer holds — which is what
`deallocateMaterial` leaves behind. Disposing a material mid-wait therefore throws, from
inside a `setTimeout`, where neither the `try/catch` around the call nor the promise's
`.catch` can see it. Every build stage warms up the subtree it just added, and any teardown
disposes those materials.

Reproduced deterministically: tear the page down 4 s into the build and it throws; at 6 s and
8 s, with compilation finished, it does not.

Fixed by owning the warm-up — `src/quality/warmup.mjs`. It drops a material when that material
dispatches its own `dispose` event, treats a vanished property record the same way, cancels
every poll when the owner is disposed, and gives up at a deadline. **Nothing is caught and
nothing is silenced.** `tests/shader-warmup.test.mjs` reproduces the original TypeError
against the unfixed module.

## 9a. RUN 6.8 — near-humanoid clone break

RUN 6 met every criterion it set: humanoid budget held at 8, far crowd 1,978, console errors
0, foot IK bounded, all three tiers within budget. **The visual result was still wrong.**
Eight people who differ only in colour read as one person recoloured eight times, and no
amount of extra palette entries fixes that, because the thing the eye reads is *shape*.

RUN 6.8 gives them different shapes. Evidence, from the same camera:
`node qa/gta-upgrade/lineup.html` — **before: 1 silhouette across eight citizens. After: 4.**
`?before=1` reproduces the RUN 6 appearance model exactly, so the comparison is a comparison.

### Four archetypes, from assets already verified

| archetype | rig | hairstyle | height × | build × |
| --- | --- | --- | ---: | ---: |
| casual | Superhero_Male | `Hair_SimpleParted` | 1.000 | 1.00 |
| long hair | Superhero_Female | `Hair_Long` | 0.955 | 0.95 |
| cropped | Superhero_Male | `Hair_Buzzed` | 1.035 | 1.05 |
| short bob | Superhero_Female | `Hair_SimpleParted` | 0.975 | 0.97 |

Both bodies and all three hairstyles come from the Quaternius pack downloaded and licence-
checked for RUN 2. **No new asset, no new rig, no retargeting.**

### The two rigs do not share a rest pose — this is the load-bearing fact

Bone *names* match, which is all the old single-hairstyle merge ever checked. The rest poses
do not: **64 of 65 bones differ, the upperarms by 7.1 cm and the clavicles by 4.6 cm.**
Binding the female mesh to the male skeleton would have flattened her shoulders by that much.
`qa/gta-upgrade/bindcheck.mjs` prints it.

So each body keeps its own armature, and what is shared is the thing that actually costs:
**one set of AnimationClips**. Clip tracks address bones by name, so one clip array drives
either rig and a mixer binds it to whichever root its instance has. Four archetypes cost four
bodies' worth of geometry and **one** animation library.

### Two things glTF does that will break this if undone

1. **It strips punctuation from node names and suffixes duplicates.** `rig:m` came back as
   `rigm`, and the second rig's hair as `hairHair_Long_1`. Matching is therefore done on
   `userData`, which survives as glTF `extras`.
2. **It renames the second armature's bones** — `pelvis_1`, `thigh_l_1`, … Since a mixer
   resolves tracks by name and foot IK looks its joint chain up by name, the female rig would
   have silently animated nothing. The names are restored **by index** at load (bone order is
   identical and checked at bake time; a pattern would be guesswork, as `spine_01` and
   `index_01_l` already end in digits). Safe because a name only has to be unique within the
   tree it is resolved against, and an instance clones exactly one rig.

Hair is a separate mesh now rather than merged into the body: merging stores a whole body per
hairstyle, separate meshes let the exporter keep each body once and each hairstyle once.

### Appearance is a pure function of the pedestrian id

`src/life/appearance.mjs`. Archetype, skin, hair colour, top, bottom, shoes, height and build
all come from one well-mixed hash read at disjoint bit ranges, so the choices do not
correlate — reading several with `id % n` gives visible repeating runs down a pavement.

**Nothing comes from the pool, the frame, the tier, or the neighbours.** The pool recycles
slots constantly and reorders every frame; anything reading from it would make people change
clothes as the camera moves, which is worse than the clone problem. Walk away from someone
and walk back and they are the same person.

The one exception is `deduplicate`, and it is bounded: among the handful on screen it may move
a **shirt colour** and nothing else, walking them in ascending id so the same set of people
always gives the same answer whatever order the pool holds them in. Silhouette is never
negotiated at runtime.

### Slot allocation — a fixed spread, not demand chasing

Humanoid slots hold a round-robin spread: two of each archetype at HIGH, one at MEDIUM. Every
archetype is therefore on screen whenever the slots are full.

The first version chased demand — rebuild whichever spare slot the crowd currently wanted. At
300 people the near radius churns faster than that can settle: it converged on **two**
archetypes visible out of four, after fifty rebuilds. The fixed spread needs none.

A citizen takes a humanoid of their **own** archetype or a baked figure, never someone else's
silhouette. That costs aim — the RUN 6 swap that pulled good bodies toward the camera had to
become a swap *between people of the same archetype*, and nearest-eight coverage settles at
**71–74%** against RUN 6's 84–85%. A baked figure at four metres is a smaller lie than the
same face on a different body.

### Skeletons per body: 3 → 1

`SkeletonUtils.clone` gives every SkinnedMesh its own `Skeleton`, each owning a bone matrix
texture, although they share one set of bones. A citizen was paying for three and would have
paid for four once hair was split out. They are collapsed onto one.

### Measured

| | RUN 6 | RUN 6.8 |
| --- | ---: | ---: |
| archetypes on screen | 1 | **4** |
| humanoid budget (HIGH / MED / LOW) | 8 / 4 / 0 | 8 / 4 / 0 |
| near baked (HIGH) | 24 | 24 |
| far crowd | 1,978 | 1,978 |
| skeletons per humanoid | 3 | **1** |
| mixers per humanoid | 1 | 1 |
| meshes per humanoid | 3 | 4 |
| pool draw calls (HIGH) | 168 | 176 |
| pool triangles (HIGH) | 215k | 215k |
| slot rebuilds over 900 frames | — | 0 |
| foot IK | 8 | 8 |
| console errors | 0 | **0** |

Feet, with no IK, against a flat floor — the pre-existing Run float is neither introduced nor
worsened:

| clip | RUN 6 | RUN 6.8 (same body) | RUN 6.8 (all four archetypes) |
| --- | ---: | ---: | ---: |
| Idle | −8.3 mm | −8.2 mm | −8.6 … −4.7 mm |
| Walk | −7.5 mm | −7.4 mm | −7.8 … −2.3 mm |
| Run | 61.3 mm | 60.3 mm | 58.3 … 71.2 mm |

Payload:

```
RUN 6    citizen.glb  1,414,612 B   1 body,  1 hairstyle, 15 clips
RUN 6.8  citizen.glb  2,260,380 B   2 bodies, 3 hairstyles, 15 clips SHARED   (1.60x)
naive 4 separate character files   ~5,658,448 B                               (2.50x)
saved by sharing the clip library  ~3,398,068 B
```

### What RUN 6.8 deliberately did not do

No clothing geometry — no skirts, jackets, hoodies or bags. The garment mask paints clothes
onto the body; a skirt is a mesh, and meshes are new assets. No accessories, no faces beyond
the two the base bodies have, no clothing physics. The reference image this run was measured
against shows all of those; they are a future asset question, not a distribution one.

## 9b. RUN 7A — massive high-fidelity reactive crowd (POC)

The question RUN 7A had to answer: can a scramble crossing hold ~2,000 people who all look
like RUN 6.8 citizens **and** can all react to a car, without a skeleton each?

**Yes.** 1,978 of them, in a browser, cost **4 draw calls, 0 skeletons, 0 mixers and 0.3 ms
of CPU per frame.**

### Architecture: a shared GPU bone animation atlas

Chosen by measuring the alternatives, not by preference:

| candidate | payload | verdict |
| --- | --- | --- |
| Vertex animation texture | 5.5 MiB per archetype (22 MiB for four) | rejected — 60× the size |
| **Bone matrix atlas** | **618 KiB total, shared by every archetype** | **chosen** |
| Baked vertex frames | same order as VAT | rejected |
| Extend the old primitive crowd | cheap, but the bodies stay capsules | rejected |

A VAT stores every vertex at every frame. A bone atlas stores every *bone* at every frame —
65 bones × 203 rows × a 4×3 matrix — and works precisely because RUN 6.8 already gave every
archetype **one shared clip set**; they differ only in which vertices hang off those bones.

What that buys:

- **No `Skeleton` and no `AnimationMixer` per citizen, at any population.** A test asserts it.
- Clip and phase live in instanced attributes; the vertex shader turns them into an atlas row
  and skins from it. **Time advances on the GPU**, so a walking crowd costs the CPU nothing
  between state changes.
- **Draw calls follow the archetype count, not the population** — four meshes, two thousand
  people.
- State is typed arrays. A citizen is an index, not an object graph.

### The ladder (STEP 7 / 20)

CPU per frame, Node, `qa/gta-upgrade/hq-ladder.mjs`:

| citizens | update ms | µs/citizen | draws | tris (L1) | tris (L2) | heap |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 32 | 0.077 | 2.41 | 4 | 176k | 73k | 0.5 MB |
| 128 | 0.056 | 0.44 | 4 | 701k | 290k | 0.6 MB |
| 256 | 0.081 | 0.32 | 4 | 1.39M | 574k | 2.0 MB |
| 512 | 0.134 | 0.27 | 4 | 2.73M | 1.13M | 1.9 MB |
| 1024 | 0.298 | 0.29 | 4 | 5.51M | 2.27M | 1.8 MB |
| **1978** | **0.519** | **0.26** | **4** | 10.7M | **4.41M** | 1.8 MB |

Per-citizen cost is **flat in the population** (0.26–0.44 µs), which is the property that
matters: nothing here is O(N²) or allocating per person.

**PLATINUM and the ~1978 target are both reached** on the CPU side. The remaining limit is
GPU vertex throughput, not this code — which is why the LODs exist (L2 is 14% of L0's
triangles). SwiftShader frame rates are recorded in the bench and are explicitly **not** used
as acceptance, per the project rule.

### Mass reaction (STEP 9–13)

A car at 14 m/s through 1,978 in a dense block, **simultaneously**:

```
200 looking   286 fleeing   37 down        <- at the same instant, not cumulative
172 knocked down in ONE frame, in 0.45 ms
```

The requirement was twenty. In the browser, 1,200 with a car running through them holds 188
looking and 104 fleeing at 6 draw calls and 0.3 ms.

The spatial grid is why that is affordable, and the claim is checked: the same population
queried at four densities gives 1369 → 625 → 289 → 121 candidates. **Cost follows the radius
and the density, never the population.**

Knockdown is an impulse, a drag and a ground clamp — no rigid body, no ragdoll. Which side of
the car's centreline a body is caught on decides where it goes, so a row of people is not a
row of dominoes, and a test pins that.

**Identity survives everything.** Appearance, archetype, phase and height are the same
function of the pedestrian id used by RUN 6.8, so being hit by a car cannot change who
someone is — asserted directly.

### Three things found by looking rather than reasoning

- **The first bake gave everyone claws.** Forty of the sixty-five bones are finger joints;
  their vertices are dense and adjacent, and vertex clustering merged them into one
  representative carrying a single finger's weights. Finger weights are now folded into the
  hand before decimating.
- **The crowd looked bare-legged.** The garment mask was correct; the palette was not. Beige
  trousers read as skin when a hem is four vertices wide at LOD2. Every trouser colour is now
  darker than every skin tone, pinned by a luminance test.
- **three's `SimplifyModifier` is unusable here** — it keeps position, normal and uv and
  discards exactly the skin indices and garment mask this crowd is built on. Hence the
  attribute-preserving clustering decimator in the baker.

### Payload and startup

```
public/data/crowd/hq-crowd.bin   2,761 KiB
  bone atlas                       618 KiB   shared by all four archetypes
  geometry, 4 archetypes x 3 LODs  2,143 KiB
build 1,978 citizens at runtime        ~9 ms
```

Everything is baked offline by **`npm run bake:crowd-hq`**. Nothing is generated at startup,
which is the constraint the old crowd's fast start depends on.

### What RUN 7A is not

A POC. It is **not wired into the live Shibuya scene** — it runs in `qa/gta-upgrade/
hqcrowd.html` against its own crowd. Integration with the real pedestrian simulation, the
crossing queues and the signal groups is RUN 7 proper. The RUN 7 awareness WIP was not
touched.

## 9c. RUN 7B — the HQ crowd in the real Shibuya scene

RUN 7A proved the architecture in its own bench. RUN 7B connects it to the game, and **all
1,978 pedestrians in the crossing now carry a high-fidelity body.**

### The rule the integration is built on

**The simulation is the source of truth.** `src/life/hq-layer.mjs` READS `sim.pool`. Position,
heading, speed, route, crossing membership, queue membership and signal group all stay in
`src/life/simulation.mjs`. The layer changes what a pedestrian *looks like* and nothing else —
a test asserts that a sync pass leaves `crossing`, `queueKey`, `edge`, `route`, `x` and `z`
untouched.

One bounded exception: a body thrown by a car is moved by the reaction system for the length
of its knockdown, because it is not walking anywhere. `onDisown` / `onReclaim` hand that
authority over and back, and the scene uses the simulation's own `leave()` so a crossing is
**released**, never abandoned.

`?hq=` switches the renderer (`hq=1` tier default, `hq=512` a budget, absent for legacy), so
the legacy instanced bodies remain a one-parameter rollback. Both renderers share one mask:
the ids the HQ layer draws are unioned with the near-character pool's and skipped in the
legacy meshes, so nobody is drawn twice.

### The integration ladder, measured in the scene

HIGH / day / scramble, each rung a separate build:

| budget | drawn / held | dup | crowd draws | scene draws | HQ tris | skel / mix | sync | errors |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 128 | 128 / 128 | OK | 4 | 367 | 492k | 0 / 0 | 0.9 ms | 0 |
| 256 | 256 / 256 | OK | 4 | 367 | 566k | 0 / 0 | 1.1 ms | 0 |
| 512 | 512 / 512 | OK | 4 | 365 | 1.14M | 0 / 0 | 2.4 ms | 0 |
| 1024 | 1024 / 1024 | OK | 4 | 367 | 2.28M | 0 / 0 | 1.9 ms | 0 |
| **1978** | **1978 / 1978** | **OK** | **4** | **341** | **4.41M** | **0 / 0** | **2.3 ms** | **0** |

**The scene's draw call count goes DOWN** — 341 against legacy's 367 — because four instanced
lanes replace thirteen legacy instanced meshes. There is still no `Skeleton` and no
`AnimationMixer` at any rung.

`sync` is the layer's own cost: it ranks all ~1,978 pedestrians by distance to spend the
budget nearest the camera. That ranking, not the drawing, is where its 2.3 ms goes, and it is
the clearest remaining CPU target.

In player mode at full budget: 1,975 drawn, 23 at L0 and 1,952 at L2, 8 draw calls (four
archetypes across the two levels in use).

### LOD, and not popping

Three bands with hysteresis — L0 ≤14 m (released at 17), L1 ≤38 m (released at 44), L2 beyond
— reviewed four times a second, at most 24 moves a frame.

A camera swept across every band for 400 frames (`qa/gta-upgrade/lodpop.mjs`) produced
**8,611 level-of-detail changes** with all three levels in use and **zero** changes to body,
hairstyle, height, build, walk phase or archetype. A lane change carries the citizen's
palette, phase and clip with them, so detail is the only thing distance can alter. A test
pins it.

### The real vehicle, in the real crossing

The player's own car — the same one that already calls `alertPedestrians` — hands its state to
the layer, which runs RUN 7A's bounded query over the pedestrians it is drawing.

```
peak        265 reacting + 49 down SIMULTANEOUSLY
sustained   218 reacting + 95 down
query       413 candidates of 1,945 (21%), 0.4 ms
disowned    25 bodies under the reaction system at once
```

The requirement was twenty.

### Crossings and signals survive it

Thirty seconds of simulation after driving through the crowd — the check that matters more
than the spectacle:

```
crossings completed   29 -> 40      queue size    0
abandoned crossings    0            stuck         0
population         1,977 (steady)   console errors 0
```

The signals keep running and nothing locks. **Not claimed:** a full signal cycle was not
observed. The cycle is 108 s with a 20 s pedestrian phase, and the sim clock runs about 0.75×
wall under SwiftShader, so a 30 s sample covers roughly 22 s of simulation and sat inside one
pedestrian window.

### Two defects found by looking, not by measuring

- **The crowd held 224 citizens while drawing 128.** A citizen that fell out of the budget was
  never released: still rendered, no longer positioned — a frozen body standing beside the
  legacy pedestrian it was meant to replace, which is exactly the duplicate-crowd failure this
  integration must not have. It only appears when the nearest set keeps changing, which a
  static bench never does. `release()` now swap-removes from both the lane and the state
  arrays, and a test drives a moving camera over 900 people asserting population never exceeds
  what is drawn.
- **The HQ bodies read washed out in the scene, and this is NOT fixed.** The crowd material
  did have one flat roughness where RUN 6.8 gives each garment its own, so skin, cotton,
  denim, hair and a shoe were all the same plastic; that is corrected and is an improvement on
  its own. **It did not fix the wash-out.** The cause is now isolated rather than guessed: the
  identical palette and shader render correctly in `qa/gta-upgrade/hqcrowd.html` — dark
  trousers, distinct tops, varied skin — and only go pale in the scene, so it is the scene's
  environment, tone mapping, exposure or fog acting on the crowd material, not the crowd
  material itself. Carried into RUN 7C. See the limitations in §18.

### Quality tiers

`HQ_TIER_BUDGET` is HIGH 1978, MEDIUM 512, LOW 0. LOW keeps the legacy crowd entirely, which
is why the legacy renderer is worth keeping beyond this run.

## 9d. RUN 7C — the HQ crowd's colour space

RUN 7B put 1,978 high-fidelity bodies in the crossing and they looked washed out. RUN 7C is
why, and the answer is one line of shader.

### Root cause

`ColorManagement` is enabled, so the renderer's working space is **linear**. The RUN 6.8 near
characters pass their palette through `new THREE.Color(hex)`, which applies sRGB → linear for
them — which is exactly why they were correct in the scene all along. The HQ crowd packs its
palette as an 8-bit sRGB hex and divided it by 255, handing **sRGB values straight to
`diffuseColor` in a linear pipeline**.

The error is not uniform, and that is the entire symptom:

| colour | correct (linear) | HQ used | error |
| --- | ---: | ---: | ---: |
| `#1c2028` dark navy trousers | 0.0116 | 0.1098 | **9.5×** |
| `#2a2f38` | 0.0232 | 0.1647 | 7.1× |
| `#3a414c` | 0.0423 | 0.2275 | 5.4× |
| `#6b7280` mid grey | 0.1470 | 0.4196 | 2.9× |
| `#e7e3da` cream top | 0.7991 | 0.9059 | 1.1× |

Dark clothing was up to **9.5× too bright** while light clothing was nearly right. Dark
trousers stopped reading as dark, every tone trended pale, and the crowd lost its separation.

**Why the bench looked correct.** With dim lighting, no tone mapping and no environment, an
over-bright albedo still lands low enough in the final image to read as clothing. Under the
scene's exposure and environment it saturates toward white. The bench was not disproving the
bug; it was hiding it.

### The fix

three's own `SRGBToLinear` applied inside `unpackRGB`, verified to deviate from `THREE.Color`
by **0.000e+0 across the entire colour cube**.

Done in the shader rather than at pack time on purpose: a linear value for a dark colour is
about 0.012, and eight bits of that is three levels, which would band. Eight bits of sRGB
expanded in the shader is what an sRGB texture does, and it puts the precision where the eye
needs it.

**Cost: none.** No extra draw call, no extra uniform, no extra texture — a few ALU operations
in a shader that was already running.

### Hypotheses tested and rejected

- **Scene exposure / global tone mapping.** Rejected on principle before testing: the Shibuya
  environment already works, and darkening the whole scene to hide a crowd bug would damage
  buildings, signage and vehicles to fix pedestrians.
- **Per-garment roughness.** A real mismatch — the crowd had one flat roughness where RUN 6.8
  gives each garment its own — and worth correcting on its own, but it demonstrably did not
  fix the wash-out. I said in a commit that it had; that was wrong and was withdrawn.
- **Fog, environment intensity, bloom.** Never reached: the numeric comparison against
  `THREE.Color` identified the cause outright.

### Also found here: the knockdown chain never closed

The full-signal-cycle harness (`qa/gta-upgrade/signalcycle.mjs`, 240 simulated seconds at
30 Hz, covering all four phases of the 108-second cycle) found what a 30-second scene test
could not: **132 bodies permanently DOWNED and permanently disowned from their own routes.**
`DOWNED` was excluded from the state fall-through on the theory that it "waits to be
recovered", and nothing recovered it.

The chain now closes: **HIT → KNOCKDOWN → DOWNED → RECOVER → NORMAL.** Ownership is reconciled
from `sync` as well as from `vehicle`, because a body stands up on its own timer and the
player may have parked by then.

Telling a steady state from a leak requires removing the cause, so the harness drives for half
the run and parks for the rest. A car that never stops *should* hold a steady population on
the ground; that is not a leak. With the car parked:

```
132 disowned -> 0 in 2.9 s      crowd returns to 1,978 NORMAL
population steady at 1,978      non-finite values 0
signal phases covered           NS, ALL, EW, PEDESTRIAN (full 108 s cycle)
peak reacting 459               peak down 132
```

And a metric that lied: `inspect()` recomputed its reacting and down counts only inside
`vehicle`, so the moment the player parked it kept returning the figures from the last
drive-by. My own new test believed it and reported 67 citizens on the ground when none were.
The counts are now recomputed on every sync.

### Day and night

| | HQ drawn | byLod | crowd draws | scene draws | skel / mix | sync | errors |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| day | 1,974 | L0 23 / L2 1,951 | 8 | 359 | 0 / 0 | 1.5 ms | 0 |
| night | 1,974 | L0 23 / L2 1,951 | 8 | 367 | 0 / 0 | 2.7 ms | 0 |

**Day:** hair reads black, tops separate (white, navy, teal, red, cream), skin separates from
clothing, archetypes are readable, and the RUN 6.8 near characters now blend in instead of
being the only coloured bodies in frame.

**Night:** the crowd is not white, dark clothing reads dark without crushing, skin stays warm
rather than grey, and the bodies sit naturally in the billboard lighting. Day was not altered
to achieve it — the fix is in the crowd's own shader, and nothing scene-wide was touched.

**LOD colour consistency:** L0→L1 differs by a mean of 7.1/255 over the whole frame and L1→L2
by 12.1/255, and those deltas are dominated by silhouette edges moving under decimation rather
than tone. Structurally the colour cannot shift with detail: every lane shares one shader, and
`moveLane` copies the per-instance palette across.

### Scale preserved

1,974–1,978 HQ pedestrians, 0 skeletons, 0 mixers, 4 crowd lanes (8 draw calls with two LODs
in use), offline prebake unchanged, 295/295 tests, typecheck and build clean.

## 9e. RUN 8 — melee with a hit window

The old melee applied damage in the same tick as the input: `request()` set a flag, the next
update chose a target and subtracted health, and `attackTime` was only a countdown for the
renderer. A punch could land before the arm moved, and **could not miss** — anyone in range at
the press was hit.

### Attack state machine

`IDLE → WINDUP → ACTIVE → RECOVERY → IDLE`. A swing is an object with a clock; the hit test
runs inside the clip's own active window, at most once per swing. A press during recovery is
dropped rather than queued — there is no input buffering, so you cannot punch faster than the
arm moves.

### The timings are measured, not chosen

`qa/gta-upgrade/punch-timing.mjs` samples each clip at 120 steps, finds which hand travels
furthest from the pelvis, and reads the window where that hand is within 12% of full
extension — the part of the swing where a fist would be touching someone.

| clip | duration | hand | wind-up | **ACTIVE** | recovery | peak |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `Punch` | 0.867 s | LEFT | 0–0.188 | **0.188–0.368** | 0.368–0.867 | 0.202 |
| `PunchCross` | 1.000 s | RIGHT | 0–0.233 | **0.233–0.508** | 0.508–1.000 | 0.400 |

They turn out to be a natural one-two — a left jab and a right cross — so alternating them
reads as combination punching rather than the same arm twice. That is a property of the clips,
found by measuring. `PunchCross` was baked and unused until this run.

### Crossing the window, not landing in it

The hit test asks whether the **step crossed** the active window, not whether it landed inside
it. A frame long enough to step over a 180 ms window would otherwise skip the punch entirely.
At 60 Hz that never happens, but a stall, a background tab, or a test on coarse steps all
produce it — and a punch that silently does nothing when the frame rate dips is worse than one
that lands a frame late. **The NPC swing uses the same rule**; having one and not the other
meant a long frame quietly disarmed the crowd while the player kept punching.

### Combat on a crossing, without breaking the crossing

Pedestrians mid-crossing used to be excluded from targeting entirely, which made the middle of
a scramble crossing — most of this map — a place where combat silently did nothing.

They are now valid targets. What protects the signals is not refusing to hit them; it is
refusing to take them off their route for anything short of going down:

- a **survivable** hit damages and alarms them, and they keep crossing. `crossing`, `queueKey`
  and their signal group are untouched, and they are never stopped to fight.
- a **fatal** hit goes through `crowd.strike()`, which calls `leave()` first — so the group is
  **released**, never abandoned.

Both halves are pinned by tests, because a pedestrian stopped mid-crossing holds their signal
group, and the controller stops the clock for the whole map while any group is held.

### One authority

The **simulation** decides who was hit, how much health they lost, and whether they go down.
The HQ crowd renderer only shows it — it reads `struck` and `combatDead` off the pedestrian,
exactly as it already does for a car. Nothing in `combat.mjs` reaches into the HQ crowd.

### The crowd sees it

A punch raises a **witness event** — where it happened, how bad, and how far that carries —
which `src/life/hq-layer.mjs` turns into reactions. `combat.mjs` never scans the crowd itself;
it hands the event to whoever is listening and the listener owns the bounding.

| | value |
| --- | --- |
| radius | 11 m |
| severity, connecting punch | 0.72 |
| severity, punch that misses | 0.40 (0.72 × 0.55) |
| bands | `felt ≥ 0.52` FLEE · `≥ 0.30` AVOID · `≥ 0.12` LOOK |

`felt = severity × (1 − d/radius) / nerve`, and **nerve is per-citizen**, hashed from the same
id their appearance comes from, spread over 0.55–1.45. So one punch produces a spread of
responses rather than a chorus, and the same person is reliably the nervous one. The rule is
borrowed from `src/life/awareness.mjs`; the storage deliberately is not, because two thousand
JS state objects is the thing this architecture exists to avoid.

A punch that misses still raises an event at reduced severity. Bystanders reacting to a swing
that connected with nobody is the correct behaviour — they saw someone throw a punch.

Someone already fleeing, or already off their feet, is **not made to react again**. The second
punch in a fight therefore moves far fewer people than the first, and that is not the crowd
ignoring it.

### NPC retaliation

A struck pedestrian becomes hostile for 14 s, closes to `range × 0.72`, and swings on the same
phase model the player does: a wind-up, then damage when the arm is out. A player who has to
respect a hit window while the crowd lands instantly is not fighting, they are being audited.

| | player | NPC |
| --- | ---: | ---: |
| damage | 34 | 14 (+0–4 by id) |
| reach | 1.75 m | 1.75 m |
| arc | ±1.05 rad | — |
| cooldown | clip recovery | 1.05 s (+0–0.36 by id) |

Three punches kill a pedestrian; eight kill the player. The arc matters: a punch is not a
radius, and someone directly behind you cannot be hit.

### Player death and restart

`hurt()` takes health, holds a 0.34 s hurt lock so one frame of overlap cannot delete the
player, and at zero sets `alive=false` with `hitBy='fight'`. The scene shows
**「喧嘩で倒れました」** and a **「やり直す」** button, which calls `revive()` → `place()`:
health 100, alive, timers cleared, back at the start point. A dead player cannot swing and
cannot take further damage.

### Cost

`qa/gta-upgrade/combat-cost.mjs`, 600 frames at 1/60 s with 12 hostiles already engaged.
CPU only — no frame rate is claimed from this hardware.

| people | melee µs/frame | witness ms/punch | reacted (first punch) | seen |
| ---: | ---: | ---: | ---: | ---: |
| 64 | 14.5 | 0.074 | 60 | 60 |
| 256 | 14.0 | 0.098 | 93 | 163 |
| 1024 | 17.1 | 0.330 | 93 | 206 |
| 1978 | 11.5 | 0.558 | 93 | 206 |

**`melee.update` is flat in population** — 1,978 people cost no more than 64, because the fight
only ever walks the grid cells inside `notice` (4.5 m). At ~15 µs it is under 0.1% of a 16.7 ms
frame.

**`witness` is not flat**, and the reason is `grid.rebuild`, which is O(population) per call.
0.56 ms at full crowd, against roughly two punches a second, is ~1.1 ms/s — acceptable, and
recorded here because it is the term that would matter if punches ever became rapid.

The people reacting saturates at 93 of 206 seen, which is the bounding working: density inside
11 m stops growing once the disc is full, so a bigger city does not make a bigger reaction.

### Tests

`tests/combat.test.mjs` is new — the PRE-RUN 8 audit found **zero** combat tests. 22 cases.
Two of them contradict each other on purpose, so neither can pass vacuously:

- *DAMAGE DOES NOT HAPPEN ON THE INPUT TICK* — the bug this run exists for.
- *damage lands inside the active window* — and it does happen, later.

The rest pin the things that were previously unpinned: a punch at nobody misses; someone out
of range, or behind, misses; a target who walks away during the wind-up is missed and one who
walks **in** is hit; one swing damages at most once; a press during recovery does not start a
second swing; the two clips alternate; a fatal hit goes through `crowd.strike`, not around it;
a pedestrian on a crossing **can** be hit; a light hit does **not** take them off the crossing
and a fatal one **does** use the formal `leave` path; a witness event fires once per swing and
a miss fires a weaker one; the NPC swings on the same model the player does; a dead player
cannot swing; and nothing produces a NaN or a stuck phase.

`tests/hq-layer.test.mjs` gained three: a punch is seen by the people near it **and only by
them**; witnesses do not all react the same way and they recover; a punch in a dense crowd is
seen by a useful number of people.

The death loop (case 22) runs against the **real controller**, not the stub the rest of the
file uses — testing a copy of `hurt` would have proved nothing about the game. Both of its
guards were mutation-checked: removing `state.alive` from the swing start, and clamping health
to 1 instead of 0, each fail it.

### A bug RUN 8's QA found, which was not RUN 8's

The browser QA raised the scene's shader-error banner —
「描画シェーダーのコンパイルに失敗しました」— and the first read of it was wrong: the
browser had been open for over an hour, so a stale WebGL context looked like the obvious
answer. It was not. A **fresh** browser raised the same banner, at a reproducible moment: about
35 seconds into player mode, never in observer mode.

The captured log says exactly what happened:

```
ERROR: 0:76: 'instanceColor' : redefinition
```

`src/traffic/vehicle-shadow.mjs` declared `attribute vec3 instanceColor` inside its own vertex
shader. A `ShaderMaterial` — unlike a `RawShaderMaterial` — is given three.js's vertex prefix,
and that prefix already declares `instanceColor` under the very same `#ifdef`
(`WebGLProgram.js`). The second declaration is a redefinition, so:

- the program never compiled,
- the renderer logged `useProgram: program not valid` on every frame,
- **every vehicle in the scene lost its contact shadow**, and
- the scene told the user that roads and buildings might be missing, which was not the problem.

Why it only appeared in player mode: `USE_INSTANCING_COLOR` is defined only once an
`instanceColor` buffer exists, and that buffer is created by the first `setColorAt`. Until a
vehicle shadow is given its falloff exponent, the define is absent, the redundant declaration
is compiled out, and the shader is fine. Nothing to do with combat.

Fixed by deleting the declaration and keeping the guard. `tests/vehicle-shape.test.mjs` now
pins it: no custom shader may declare an attribute the renderer already injects. The test was
checked against the unfixed file and fails there.

**The lesson for the next RUN.** No unit test could have caught this — it needs a real GL
context, a real compile, and a coloured instance. The banner had been on screen in earlier
QA screenshots and was read as scenery. A red banner is a blocker whatever RUN raised it.

### Browser QA, in the real scene

`?qa=1&tier=high&time=day&camera=scramble&hq=1`, headless Chromium on SwiftShader. **No frame
rate is reported** — this hardware cannot produce performance evidence, only counts, CPU
timings, errors, and whether a thing renders at all.

| scenario | result | evidence |
| --- | --- | --- |
| player mode enters | **WORKS** | alive, health 100 |
| witnesses react to a punch | **WORKS** | peak **251** people reacted, `witnessMs` 2.1 |
| witnesses recover | **WORKS** | `reacting` 88, `down` 0, `disowned` 0 |
| **crossings keep running during combat** | **WORKS** | **22 completed, 0 abandoned, 0 stuck, 0 queued** |
| HQ scale preserved | **WORKS** | 1,945 HQ bodies, **0 skeletons, 0 mixers**, 12 draw calls |
| first air punch | inconclusive | sampled before the HQ crowd had spawned: `candidates=0` |
| player takes damage from the crowd | **NOT OBSERVED** | health stayed 100 — see below |

The line that matters most is the crossing one. Combat now happens in the middle of a scramble
crossing, and across the run the signals kept cycling with **nothing abandoned and nothing
stuck** — which is the failure mode this design was shaped around.

`witnessMs` in the live scene is **2.1 ms**, against 0.56 ms in the offline bench at the same
population. The bench does not carry the scene's grid occupancy; the live figure is the one to
believe, and it is the number to watch if punching ever becomes rapid.

### The bug that mattered: combat could not touch the crowd

RUN 8's first browser QA reported witnesses reacting in the hundreds and **not one knockdown**.
Six punches at a pedestrian **8 cm away**, standing still, `waiting`, not crossing — nothing.
`melee.snapshot()` was not exposed to QA at the time, so the run could see the crowd *react*
to a punch but could not tell a hit from a miss. That metric was added
(`__SHIBUYA_QA__.metrics.melee`) and the answer arrived immediately:

```
punch 5  melee={"swings":2,"hits":0,"misses":1,...}
```

Two swings, **zero hits**. Reproducing `eligible`'s clauses against the live simulation named
the failing one straight away — every pedestrian within reach carried `choreographed: true`:

| id | distance | in range | in arc | choreographed |
| --- | ---: | --- | --- | --- |
| 1115 | 0.06 m | yes | no | **yes** |
| 88 | 0.08 m | yes | no | **yes** |
| 669 | 0.24 m | yes | **yes** | **yes** |
| 149 | 0.40 m | yes | no | **yes** |
| 59 | 0.43 m | yes | no | **yes** |

`eligible` excluded `p.choreographed`. The choreographed Scramble cast is **74–85% of the
population** (`ScrambleChoreography.refill`: `target = total × 0.74…0.85`) — it *is* the crowd
in the crossing. Combat was therefore switched off exactly where the game happens, and the
one pedestrian in arc was cast like all the others.

**Why the exclusion was wrong.** `simulation.step` tests `struck` **before** it hands a
choreographed pedestrian to `choreography.move`:

```js
if(p.struck!==undefined){p.struck+=dt;p.speed=0;this.fly(p,dt); ... continue;}
...
if(p.choreographed)return this.choreography.move(p,dt);
```

A falling body is carried by the knock-down path, not by its track. **A car has always been
able to knock the cast down through `strike`.** Only a fist could not.

**The fix** is the crossing rule, generalised. `onRails(p) = p.crossing || p.choreographed`:

- they **can** be hit, damaged, alarmed and killed;
- they are **never** stopped to fight, because `choreography.move` would put them back on the
  track the next tick and the two would write over each other every frame — and because
  stopping one mid-crossing holds their signal group;
- the hostility window still opens, so a cast member who is punched and later leaves the cast
  turns and fights.

**Verified in the live scene, end to end**, over two runs at different viewport sizes:

| | before the fix | after (480×320) | after (900×620) |
| --- | ---: | ---: | ---: |
| swings | 2 | 3 | 5 |
| hits | **0** | **3** | **5** |
| misses | 1 | 0 | 0 |
| NPC deaths | 0 | **1** | **1** |
| `sim.struck` | 0 | **1** | **1** |
| GPU crowd `down` | 0 | **1** | **1** |
| GPU crowd state reached | — | `KNOCKDOWN` | `KNOCKDOWN` → **`DOWNED`** |

Five swings, five hits, no misses. The longer run also watched the body move through the
knockdown chain — `KNOCKDOWN` and then `DOWNED` — which is **RUN 7C's chain being driven by a
punch for the first time**; until now only a car had ever put a body on the ground.

**Why no unit test caught it.** Every NPC in `tests/combat.test.mjs` was built with
`choreographed` falsy — the helper never set it, so 23 passing cases all tested the 15–26% of
the population combat already worked on. Four cases now build a cast member explicitly, and
each fails against the old `eligible`.

**A frame-rate artefact, not a bug.** Sixteen key presses produced three swings. `FrameGate`
clamps `dt` to 0.1 s, so on a renderer reporting 0.2 FPS a 0.867 s clip needs nine frames and
takes about six real seconds; a press during that recovery is dropped by design. At 60 Hz the
clamp never engages. This is measurement noise from SwiftShader, and it is the reason the kill
needed a small viewport to reach in reasonable time.

### Not verified live

- **A visual frame of a body on the ground.** The knockdown is proven by numbers above
  (`KNOCKDOWN` → `DOWNED`, `down=1`, `sim.struck=1`, `npcDeaths=1`) and was captured at
  900×620 with the scene healthy — but the body is not identifiable in it. To reach a kill the
  player has to stand inside the crowd, and from there the camera looks at a wall of standing
  people that hides anyone lying at their feet. The same position hides the player's own arm,
  so the impact frames do not read as a punch either. **What is missing is a camera angle, not
  a behaviour.** A free or raised camera, or a kill at the edge of the crowd, would settle it.
- **NPC retaliation damaging the player.** Health stayed at 100 throughout. At 0.2 FPS an NPC
  needs its own wind-up plus a 1.05 s cooldown per swing, and the player was never held still
  long enough near a non-cast pedestrian. Pinned by unit tests, not observed in the browser.
- **A full 108-second signal cycle under combat load** — as before RUN 8.


## 9f. RUN 9 — vehicle occupancy, staged entry, and a real carjack

The PRE-RUN 8 audit found that driving worked, entry existed as one smoothstep, exit existed
behind a safe-doorstep rule, doors animated, and the anchors were already authored. What was
missing was underneath all of it: **traffic vehicles had no driver entity at all**. Nothing in
the project could say who was in a car, so "carjacking" was `takeOver(slot)` at the moment the
button went down — there was nobody to take it from.

### Occupancy is one authority

`src/traffic/occupancy.mjs`. Occupancy is never inferred from a mesh, from `controlled`, or
from whether a driver happens to be drawn.

```
OCCUPANT   NONE | TRAFFIC_DRIVER | PLAYER
DRIVER     SEATED -> ALERT -> BEING_EXTRACTED -> EXTRACTED
```

Data-oriented: the traffic pool is a fixed 146 slots, so occupancy is parallel typed arrays
indexed by slot id. No object per car, no allocation per spawn, **a driver costs 13 bytes
rather than a skeleton**. A driver is an *identity* — `driverId` and an appearance seed — not
an actor.

The model enforces its own invariants rather than trusting call sites:

| invariant | how it is guaranteed |
| --- | --- |
| one seat, one occupant | `seat` and `takeSeat` refuse a seat that is not `NONE` |
| the player is in at most one car | the seat they are in is a **single value**, so a second cannot exist |
| a driver cannot vanish from the seat | `advance` moves one state at a time; `extract` refuses unless `BEING_EXTRACTED` |

That last one is the instant takeover this RUN exists to remove, expressed as a state machine.

**Seats are reconciled, not assigned.** A vehicle becomes active in three places — `spawn`,
the central streams, and the rotary service — and seating at each means the next one added
forgets. `reconcileOccupancy` walks the pool once per frame instead, so no activation path can
be missed. The same reasoning produced `reconcileOwnership` in the HQ crowd layer.

Three cars stay empty on purpose: **parked** cars (an empty parked car *is* the normal-entry
case), the car the player is **controlling**, and a car whose driver has just been **dragged
out** — without that last marker a fresh driver appears in the seat while the player is still
walking round the bonnet.

### The driver you can see

`src/traffic/drivers.mjs` is deliberately the cheapest thing that stops a car reading as empty.
**No skeleton, no AnimationMixer, no clip, no per-frame AI.** Head, shoulders and a hint of
arms is the whole silhouette a cabin shows through glass.

| | |
| --- | ---: |
| draw calls, any traffic count | **3** |
| skeletons / mixers | **0 / 0** |
| CPU | ~0.1 ms/frame |
| budget | nearest 48 occupied cars within 46 m |

Bounded by **distance, not population**, so a city full of traffic costs what a street does.
Identity comes from `src/life/appearance.mjs`, the same recipe the crowd uses.

Two things had to be fixed before any of it was visible:

- the layer ranked cars by distance **from the camera body**, and the scramble preset sits
  sixty metres back and above the crossing, so every cabin fell outside the radius and it drew
  nobody. It now focuses on what is being *looked at*.
- **the cabin was a solid dark box.** `glass` had no transparency at all, so the seated driver
  was being drawn correctly and hidden completely, and no car in the scene could ever show that
  someone was in it. Now tinted (opacity .62) rather than clear.

### Anchors, finally used

`driverSeat`, `driverDoor`, `driverEntry`, `driverExit` have existed since the vehicle assets
were built and **nothing used them** — enter and exit invented their own offsets, so the
authoritative numbers and the numbers actually used were two different things.
`src/traffic/vehicle-anchors.mjs` is the one place that turns them into world poses, memoised
per body. Measured, for a sedan: seat `[-0.418, 0.591, 0.989]`, entry `[-1.630, 0, 0.897]`,
exit `[-1.690, 0, 0.598]`.

The side mirrors, because the player may approach from whichever side is clear. **The seat does
not** — walking round the far side of a car does not move the steering wheel to meet you.
`doorPose` still chooses the side, because it also tests the ground for solids.

### Entry and exit are sequences now

```
enter    ALIGN -> DOOR_OPEN -> ENTRY -> SEAT -> DOOR_CLOSE            1.62 s
exit     DOOR_OPEN -> EXIT -> STAND -> DOOR_CLOSE                     1.24 s
carjack  ALIGN -> DOOR_OPEN -> GRAB -> PULL -> THROW ->
         ENTRY -> SEAT -> DOOR_CLOSE                                  2.72 s
```

Each stage carries its own duration, waypoints and door state. That buys three things the old
`Math.sin(phase * PI)` could not express:

- the door **opens before** the body moves through it and **shuts after** it has cleared. The
  old shape opened the panel as the player set off walking and had it shut again as they sat.
- **the seat is a real destination.** Entry used to end at the *door*; sitting down was the
  renderer hiding the player while the car started drawing them.
- there is a defined moment when **control transfers**, and it is the end.

### Ownership is split in two

`takeOver` became `reserve` + `commit`.

`reserve` does what the animation needs: the car is frozen so traffic cannot pull away
mid-sequence, permits are released so a held signal group does not stall the map while the
player walks round the bonnet, and the slot becomes the one the player's renderer draws so its
door can swing. It deliberately does **not** set `active` — every driving path is gated on
that, so a reserved car sits there, input does nothing, `step` returns immediately, and nothing
is struck by it.

`commit` takes the wheel, and it **asks the occupancy model** whether the seat is free rather
than assuming. A car whose driver is still in it cannot be driven away. An entry that cannot
commit unreserves rather than stranding.

`vacateSeat` ends occupancy without giving up the car — the player still owns it and is still
offered it back as `own`, but a car nobody is sitting in must not report an occupant.

### The carjack

The carjack list is the entry list with three stages spliced in, so getting into a stolen car
is the same animation as getting into an empty one **with a fight in the middle**.

| stage | what happens |
| --- | --- |
| `GRAB` | the driver notices → `ALERT` |
| `PULL` | hauled across the sill → `BEING_EXTRACTED` |
| `THROW` | the body lands on the road, the seat is free |

Consequences hang off stage *changes* and replay any stage a long frame crossed, so none is
skipped — the same rule RUN 8's hit window needed.

Splitting it this way is what makes the seat **empty for a beat** before the player is in it.
Between `THROW` and `SEAT` the car has no occupant at all, which is the honest description of
a carjacking in progress and is what stops the player driving off with the driver still there.

**The person thrown out is the person who was sitting in it.** `appearanceId` carries the
driver's seed onto the pedestrian and the crowd renderers prefer it over the pool id.
Arriving on the pavement as somebody else would undo the whole reason a driver has an identity.

They are handed to `crowd.strike` — the simulation's own knock-down, the same path a car uses.
That buys the existing `HIT → KNOCKDOWN → DOWNED → RECOVER` chain, the blood and the scream,
rather than a second knockdown architecture to keep in step with the first.

A car doing more than **0.35 m/s refuses**: the same threshold `nearestEntry` already uses.
Pulling someone out of a car doing thirty is a different feature, and RUN 9 is not it.

Aborts are handled rather than hoped about. Leaving player mode mid-carjack settles the driver
back into the seat, shuts the door and hands the frozen slot back to traffic. `abort` is legal
only before the throw — once there is a person on the road, putting them back in the car is not
an abort, it is a resurrection.

### Browser QA, in the real scene

`?qa=1&tier=medium&time=day&camera=scramble`, headless Chromium on SwiftShader. Counts, states
and errors only — **no frame rate is reported**, and the small viewport is not cosmetic:
`FrameGate` clamps `dt` to 0.1 s, so on a renderer at 0.2 FPS a 1.62 s entry takes eighty
seconds of wall clock.

| scenario | result | evidence |
| --- | --- | --- |
| A enter an empty parked car | **WORKS** | door 0 → 1.00 → 0, seat becomes `PLAYER` at the end |
| B drive | **WORKS** | 3.7 m, 17 km/h |
| C exit | **WORKS** | `playerVehicle` → −1 |
| D safe-doorstep rule | intact | a spot existed, so the refusal path was not exercised |
| E occupied car, driver visible | **WORKS** | 14 drawn of 88 seated; HUD offers 「奪う・F」 |
| F no instant takeOver | **WORKS** | one frame after the press: `stage=ALIGN`, `playerVehicle=-1`, `active=false` |
| stages observed | **WORKS** | `ALIGN → DOOR_OPEN → GRAB → PULL → THROW → ENTRY → SEAT → DOOR_CLOSE` |
| G driver leaves the seat | **WORKS** | `driverId 6` out of vehicle 5 |
| H driver becomes a world body | **WORKS** | pedestrian 1527, thrown, same appearance seed |
| I player takes the seat | **WORKS** | `playerVehicle=5`, door shut |
| J drive the stolen car | **WORKS** | 3.9 m |
| K exit the stolen car | **WORKS** | `playerVehicle` → −1, first car left `NONE` |
| L a second carjack, another car | **WORKS** | driver 8 out of the sedan as pedestrian 1528, `playerVehicle=7`, first car still `NONE` |
| console errors | **0** | |

**Two of the three failures this QA reported were the QA's own fault**, and both were worth the
time it took to prove it rather than assume it. With each corrected, L passes:

- a second carjack "failed" because after getting out the player stands 1.4 m from the car they
  just left, and `nearestEntry` quite correctly offers the **nearer** car — their own.
- it failed again because the script stops the victim by writing `speed = 0` for one frame and
  then waited three seconds, during which the traffic simulation drove it away. A stopped car
  is only jackable *while* it is stopped.

The third was real, and is the reason G and H are green above. See below.

### Two bugs the suite could not see

**The driver vanished.** At HIGH the crowd pool is saturated — nearly two thousand people, all
active — so `crowd.spawn` fails, and the driver left the seat with no body arriving. Extracted
from the occupancy model, never delivered to the world. Every unit test passed because a test
pool always has a free slot. One distant pedestrian is now retired to make room, through
`despawn`, which calls `leave` first and releases any signal group they were holding.

**A scream took the frame down with it.** `say(kind, id, x, z, listener, urgency)` was called
as `say(pedestrian, 'scream', 1)`, so `listener` was undefined and `listener.x` threw — inside
the frame loop, at the `THROW` stage, every time a driver was pulled out. The sequence stopped
dead at `THROW`, the door stayed open at 1, and the player never reached the seat; three
"failures" after it were all this one exception. The call is deleted rather than corrected,
because `crowd.strike` already says the scream. `voices.say` now keeps the contract its own
comment makes — *"Never throws: a browser that refuses audio must not stop the game"* — which
it did not.

### Regression, at HIGH with the HQ crowd up

Everything RUN 7 and RUN 8 established, re-checked with occupancy, drivers and the carjack in
the scene. `?qa=1&tier=high&time=day&camera=scramble&hq=1`.

| gate | result | evidence |
| --- | --- | --- |
| HQ crowd alive | **WORKS** | 1,971 bodies, 12 draw calls |
| **no skeletons or mixers added** | **WORKS** | crowd 0/0, drivers 0/0 |
| seated drivers alongside the HQ crowd | **WORKS** | 5 drawn of 88 seated |
| RUN 8 melee still lands | **WORKS** | 2 swings, 1 hit, 0 misses |
| witness reaction still fires | **WORKS** | 277 people reacted |
| crossings still complete | **WORKS** | 0 → 7 |
| nothing abandoned or stuck | **WORKS** | abandoned 0, stuck 0 |
| no shader banner | **WORKS** | none |
| console errors | **0** | |

RUN 7's architecture is intact: **RUN 9 added no skeleton and no AnimationMixer anywhere**, and
the seated drivers coexist with 1,971 GPU crowd bodies for three extra draw calls.

### Not verified live

- **A frame of the driver lying in the road.** The extraction is proven by state
  (`thrown: true`, pedestrian 1527, the same appearance seed, in the knockdown chain) and the
  screenshot is of a healthy scene, but the camera sits at the driver's door during the
  sequence, and a body at the player's feet is below frame. Same shape of limitation as RUN 8's
  knockdown: a camera angle, not a behaviour.
- **Enter and exit at every body type.** Checked on a sedan, a taxi and a kei; the anchors are
  measured for all seven, but bus and scooter entry has not been watched.
- **A full 108-second signal cycle with a carjack in it** — as before.


## 9g. RUN 10 — NPC life / awareness consolidation

**RUN 10.1 (`76dc411`):** audit found that the old RUN 7 `awareness.mjs` really was
imported by `render.mjs` and scanned every ~1,978-person simulation pool on every frame.
It is now marked DEPRECATED / NOT PRODUCTION. The production import count is zero;
`hq-awareness.mjs` is the single rule authority. Its HQ states and three additional clocks
(`noticed`, `ready`, `attention`) are typed arrays. The near-character pool calls the same
`playerThreat` function for its at most eight excluded bodies; there is no second rule system.
The old module's stable ID-based nerve, 60–400 ms delay, thresholds, downward hysteresis and
cooldown were ported. Per-person JS AI, full-population perception, cell-to-cell panic, and a
second spatial alarm grid were rejected. The baked Startle clip needed no asset or mixer.

**RUN 10.2:** player perception evaluates only cells within 13 m and now rebuilds the HQ
spatial grid only on the 12 Hz perception tick rather than on every render frame. Distance,
player pace, closing time-to-contact and orientation drive LOOK → STARTLE → AVOID; the close
range bypasses FOV. The pass reports candidate count, accepted changes, query CPU and update
CPU separately, and the HQ layer reports grid-rebuild CPU. A 60-frame test bounds rebuilds
at 8–15 per second. A standing player is not a permanent attention magnet.

**RUN 10.3 / 10.4:** RUN 8 witnesses enter through `hq-layer.witness()` into the same
personality/priority rules. A fresh strong melee event interrupts RECOVER; a weak glance
does not. A vehicle still uses the existing urgent `applyVehicleThreat` path: proximity
contact forces HIT/KNOCKDOWN immediately, and a fast approach can override RECOVER. A new
simulation strike also interrupts HQ recovery and requests movement handoff through the
scene's formal `sim.leave()` callback. LOOK cannot interrupt physical states.

**State priority:** the numeric enum orders NORMAL, LOOK, STARTLE, AVOID, FLEE, HIT,
KNOCKDOWN and DOWNED. RECOVER is index 8 for its existing atlas lookup, but an explicit
`priority()` ranks it below a new AVOID/FLEE or physical threat. Physical hits take precedence
over visual attention. Each LOOK/STARTLE/AVOID drains to NORMAL; FLEE drains through RECOVER
to NORMAL. The cooldown starts at the actual timer transition. `byState` has nine entries,
including RECOVER, so QA cannot silently omit recovery.

**RUN 10.5:** visual awareness never writes crossing, queue, route or signal ownership.
Knockdowns call the scene's existing `onDisown → sim.leave()` path. Choreographed pedestrians
can show LOOK and STARTLE while retaining their crossing membership. A driver extracted in
RUN 9 retains `appearanceId` and `cameFromVehicle`; when their fall ends, they remain an
ordinary pedestrian, get a nearby unoccupied walkable node and route, and can again be noticed
or flee. The ejection landing point can be in a traffic lane, so the driver is placed at the
nearest safe node at the end of their fall; this curb transition needs visual QA. Recycling
the pedestrian slot clears both driver-only fields. The carjack/occupancy state machine is
unchanged. There are no per-citizen mass Skeletons or AnimationMixers.

**Headless HIGH QA:** `qa/gta-upgrade/awareness-cycle.mjs` runs the real traffic signals,
choreography, pedestrian simulation and 1,978-budget HQ layer for 120 simulated seconds at
30 Hz. Initial run: peak/end population 1,978; 12 HQ draws; 0 mass Skeletons and Mixers;
maximum 233 local candidates, 113 accepted changes, 189 simultaneous active reactions;
peak grid build 0.637 ms, candidate query 0.115 ms, awareness evaluation 0.891 ms on this
host. Melee reactions spread across LOOK/STARTLE/AVOID/FLEE; urgent vehicle contact threw
18 bodies. At the end FLEE/STARTLE/AVOID, physical ownership and disowned count returned to
zero. Four signal phases appeared; 904 crossings completed, 0 abandoned and 0 signal
violations, with 5 recorded stuck recoveries. These are diagnostic timings, not FPS or
portable budgets. The mass HQ sync still ranks the crowd every frame for rendering; that
existing O(N) render ranking is distinct from the local awareness query.

**Local browser acceptance — partial, NOT COMPLETE (2026-09-23):** Chrome loaded the real
HIGH/day scene. Local screenshots are under `qa/gta-upgrade/run10-browser/` (ignored local
evidence, not included in Git). Idle and normal walking showed no obvious circular gap;
direct running showed local STARTLE/AVOID, punches produced mixed local reactions, and
LOOK/STARTLE/AVOID/FLEE subsequently drained to zero. Punch and PunchCross landed. A real
carjack transferred occupancy to PLAYER for vehicle 0 and extracted driver 1 as pedestrian
1527 with appearance seed 506952114; the stolen taxi was driven. These observations do not
close all A–L scenarios.

One live walking snapshot reported total population 1,978, HQ population 1,945 (near bodies
are excluded), 12 HQ draws, 771 scene draws, zero mass Skeletons/Mixers and 0.3 ms grid
rebuild CPU. Counts and timings are snapshots, not maxima or portable performance results.
Console error checks returned zero; final fresh-page console/shader acceptance remains open.
Do not substitute the headless candidate/query/update measurements above for browser data.

**Provisional visual fix:** the working-tree change in `src/player/vehicle.mjs` increases
static-solid body padding from 0.05 m to 0.55 m. The same taxi route stopped visibly clear
of the station platform afterward (`vehicle-wall-before.png`, `vehicle-wall-after.png`).
This changes clearance around all static solids, so tight-clearance driving still needs
acceptance before this fix is finalized. Post-change `npm test` completed with 383 pass,
5 existing skips and zero failures, including its successful build; typecheck also passed.

**Still required:** close-pass judgement; frontal versus parallel/rear visual comparison;
individual flicker and state readability; combat/vehicle knockdown visual confirmation;
complete crossing/queue/signal measurements; extracted-driver curb transition judgement;
and a final browser console/shader audit. A prior trace measured a 1.83 m driver relocation
at fall completion, but its visual acceptability is unresolved. Browser automation later
stopped on URL verification; the latest resume exposes no browser-control tool. Keep RUN 10
pending until these checks can actually run. The reported mix of legacy/new character
models remains a later-plan item; no character replacement or RUN 11 work was started.

**Final gates:** `npm test`: 388 total, 383 pass, 5 existing skips, 0 fail;
`npm run typecheck`: clean; `npm run build`: successful. The RUN 8 combat/crossing and RUN 9
occupancy/carjack suites are included. The headless signal cycle is integration evidence, not
a screenshot or live console audit. **RUN 10 remains pending visual acceptance** until these
scenarios and console errors are checked in a real browser. RUN 11 was not started.

### RUN 10 — browser acceptance closed (Claude, 2026-09-23)

This follows Codex's partial QA above and does not replace it. Codex's patch `f6fe7bb` is
preserved as `6fee7d2` (identical content, different committer). All of it ran in the real
HIGH/day scene with `?qa=1&hq=1`, driven over the DevTools protocol in headless Chromium on
SwiftShader. At that frame rate the scene runs at about 0.2–1.5 fps and `FrameGate` clamps each
frame to 0.1 s, so every check waits on *simulated* progress, not wall time. No FPS here is a
performance result. Screenshots and traces are local QA evidence and are not committed.

**Legacy / old-style characters (`b87ca60`).** Measured per pedestrian from the renderer's own
ownership split (a new QA `ownership()`): the procedural legacy renderer drew **0** people. Every
old-looking body was a *baked* near-pool slot, the eleven-bone offline figure, in the ring
around the player where the HQ crowd would have drawn the same person better. While the HQ crowd
covers the scene, the near pool now keeps only its humanoid slots (`setHQCovered`). Live: 8
humanoids, 0 baked, 0 drawn twice. Without HQ, the baked fallback is unchanged.

**Player vehicle transparency (`1ee9e3f`).** Not a material problem. `loft()` in
`src/traffic/vehicle-shape.mjs` wound its side quads and caps inside-out, so every lofted body
had negative signed volume. With back-face culling the far inner walls were drawn and the car
read as hollow. The winding is fixed at the generator and the pack rebaked; all seven bodies now
have positive paint and glass volume, which two tests pin. Checked in the browser, day and night.
Traffic cars use a different builder and were never affected.

**Collision clearance (`f767029`).** Codex's .55 m on every side was measured against every
sedan lane pose on the map (`qa/gta-upgrade/clearance-cost.mjs`). It made **35 of 2,467**
undrivable, a narrow street near (−200, 55) that the AI's own sedans use. All of the cost was
lateral. The margin is now .55 m at the ends and .25 m at the sides, which loses **0** lane poses.
Browser: that street drives through at 35 km/h. Head-on into a station-area pillar the car stops
with its nose **0.61 m** clear and the bonnet visibly outside the structure. The car-to-car pad
is unchanged. `tests/vehicle-clearance.test.mjs` drives the real player vehicle onto every lane
pose; with the uniform .55 restored it fails on exactly the 35.

**E — parallel versus direct (4 people, after the cooldown fix below).** The player runs at
4.2 m/s from 12.5 m: straight at them, or past them 2.5 m to the side.

| person | direct: first / max | parallel: first / max |
| --- | --- | --- |
| 1913 | LOOK @ 9.05 m / AVOID | LOOK @ 9.09 m / STARTLE |
| 1890 | LOOK @ 7.27 m / AVOID | LOOK @ 7.30 m / STARTLE |
| 1516 | LOOK @ 8.37 m / AVOID | LOOK @ 8.75 m / STARTLE |
| 1637 | LOOK @ 9.17 m / FLEE | LOOK @ 11.02 m (near-held) / STARTLE |

Parallel is weaker every time. First notice is at about the same distance, as it should be: the
collision term only applies inside the 1.25 s time-to-contact, and the difference shows up
there. Per awareness pass there were 7–22 candidates and 3–17 evaluated inside 13 m.

**F — rear versus frontal.** Rear first notice / max: 1913 LOOK @ 6.63 m / LOOK; 1516 LOOK @
4.73 m / LOOK; 1637 LOOK @ 6.58 m / LOOK; and before the fix, 1654 LOOK @ 7.49 m / AVOID against
8.11 m / FLEE frontal. So rear is later and weaker in 4 of 5. The exception is **1890**: LOOK @
8.51 m, max AVOID, while held by the near pool. By the rule itself (`playerThreat`,
behindScale .35, nerve .73), a rear approach at 8.5 m scores 0.03, far below LOOK, and cannot
reach LOOK beyond about 4 m. So this person was almost certainly facing the player, having
turned on their route. That was not instrumented in that trial.

**A bug E found (`7fc1d69`).** Direct approach, before: NORMAL → LOOK → **NORMAL** → FLEE at
2.3 m. The LOOK hold (0.5 s) drained, the drain started the 1.15 s `REACTION_COOLDOWN`, and
`settle()` refused everything above NORMAL. The person strolled on while the runner closed about
six metres. The crowd now records the level the cooldown is for (`calmed`), and awareness blocks
only re-entry at or below it; a stronger reaction gets through. The threshold-wobble flicker
test is unchanged and passes. A LOOK → NORMAL blip of one reaction delay (60–400 ms) remains
before an escalation. It is invisible, because on the HQ crowd LOOK plays the same `Walk` clip
as NORMAL and `attention` is not rendered (see known limitations).

**I — real vehicle contact (2 runs, player's own car).** At 10.3 and 9.5 m/s: target
KNOCKDOWN + disowned + `reactionOwned` → DOWNED + disowned. 64 and 15 bystanders went
AVOID/FLEE from the car. Across 912 recorded transitions (every person within 14 m of the path,
each frame, with the hold timer), awareness downgraded a vehicle or damage state **0** times.
Closing layer snapshot: population 1,970, 12 HQ draws, 0 Skeletons, 0 Mixers, 0 console
errors. Screenshots show the thrown bodies with the blood decal in front of the car.

**A bug I found (`a6eb2c0`).** The eight near humanoids picked
`lifeReaction(p) ?? trafficReaction`, so player awareness always won. While driving, awareness
sees the rider in the car as a standing player, and people a few metres from the bonnet sat at
LOOK. Live: in **8 of 32** frames where the car's own warning asked for guard/startle, the body
showed a head turn instead, for example with a car 2.8 m away at 5.8 m/s. `nearReaction()` now
puts a live guard/startle/escape first and keeps the old order otherwise. The same
deterministic run afterwards has the same 8 input conflicts and **0** wrong reactions, read from
the body (`reactionOf`).

**L — extracted driver (`a7eb2c0`).** Carjack of taxi 5; the driver is pedestrian 1527 (seed
894229037), the same as Codex's run. Before: KNOCKDOWN → DOWNED → RECOVER → **KNOCKDOWN** → DOWNED.
The sim holds a thrown body for `struck` 4.9 s, but the HQ chain reached RECOVER at 3.9 s, was
handed back, and was knocked down again because `struck` was still set. Then the sim stood the
driver at the nearest safe node, **4.41 m** away this run, and walked them off at 1.91 m/s,
while the HQ body lay disowned at the old spot. On hand-back it jumped 2.2–6.57 m in one frame.
Fixed in the render layer only (sim, occupancy, carjack, identity and destination untouched).
While `struck` is set the layer holds DOWNED. From hand-back, a gap above 0.5 m closes at a
bounded rate, finishing within 1.2 s (`HQ_RISE`). Keying it on RECOVER was not enough: the parked
player car replaced RECOVER with AVOID on the next frame. After: KNOCKDOWN → DOWNED (until the sim
lets go) → RECOVER → AVOID → NORMAL → walking, one knockdown, largest move 0.55 m per clamped
0.1 s frame (the bounded 5.5 m/s glide, about 9 cm a frame at 60 fps), arriving at the safe node.
A side effect worth knowing: any body the sim holds down (car and punch victims, 14 s) now lies
for that long instead of standing up at 3.9 s and falling again.

**K — signal phases, live (`cd4ba03`).** SwiftShader renders this scene at 0.2–0.3 fps, so one
108 s signal cycle took about 90 minutes of wall time. K therefore ran in the live page with
the page's own traffic and pedestrian simulations stepped from inside the page, at their own
1/30 s fixed step, while the renderer kept drawing on its own frames. `hq=128` kept the HQ layer
live at a smaller draw budget; the simulated crowd is the full 1,978.

The first two attempts found the real problem. **In player mode the signals froze.** Entering
player mode parks the player's car beside the player, and from the start (12, 24) the first
legal road pose was *on* the scramble, at (9.2, 25.1). The scramble cast stops for any vehicle
on its track, so 24 of them stood on the crossing for good. The controller holds its cycle
until a crossing clears, so every signal on the map stayed at the end of the first pedestrian
phase for 850 simulated seconds. Moving the car off the crossing parked it in the lane the
central stream leaves by, and an 8-car platoon (ids 83–90) stopped behind it inside the scramble
holding the crossing's locks: signals cycled, but nobody was ever given WALK. The parking search
now skips crossings and the plaza, and prefers a pose whose whole body is at least 1.9 m from
every lane and junction centreline, falling back to the old rule only when there is none within
40 m. From the start the car now parks at (−13.5, 49.5).

After the fix, two complete live pedestrian phases (deltas from phase start to end; each end
includes the controller's hold while the crossing clears, 37.1 s at most):

| phase (signal time) | entries | completed | abandoned | violations | stuck recoveries (cumulative Δ) | currently stuck: all / on a crossing (start → peak → end) | on crossing (peak → end) | queues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 196 | 1,301 | 1,455 | 0 | 0 | 14 | 60 → 65 → 26 / 0 | 1,463 → 0 | 0 |
| 304 | 1,301 | 1,450 | 0 | 0 | 13 | 37 → 67 → 33 / 0 | 1,463 → 0 | 0 |

"Stuck recoveries" is the cumulative count of ambient walkers despawned after being blocked for
35 s. "Currently stuck" is the live number with `stuck > 1 s` at that moment: ambient walkers
held up by others, and never anyone on a crossing. The queue map was empty throughout: the
waiting crowd at the scramble is the choreographed cast, which waits at its kerb rather than in
a crossing queue. 0 console errors.

**Not fixed, recorded:** the *third* live phase (signal time 412) admitted nobody. A route-2
central-stream taxi (id 80) stood inside the scramble area holding its lock. Route 2's 18-car
ring was jammed: its 6 downstream cars waited at the path end, because recycling to the start
needs the start clear and the route's own upstream tail occupied it, and that upstream queue was
stopped mid-route. The same scene headless (traffic + choreography + pedestrian simulation, HIGH,
hero start), with or without the player car parked at the same pose, runs five consecutive
healthy phases (1,301 entries each). So this is a browser-only central-stream spillback that was
not isolated here. It is traffic-stream behaviour outside RUN 10's scope, left for a later plan
rather than widened into this RUN.

**Console.** Fresh pages, HIGH, `hq=1`, day then night, on the RUN 10 code. Day covered walking, running,
a punch and a boarding request; night covered load and idle. Result: **0 errors, 0 uncaught
exceptions, 0 shader-compile messages, no `[role="alert"]` banner** at any checkpoint.
0 Skeletons, 0 Mixers, 1,969–1,971 HQ. The only warnings were 3 per page of Chrome's "AudioContext
was not allowed to start" (autoplay policy without a user gesture), which is not an app error.
No X4122 appears (that is a Windows D3D warning; SwiftShader does not produce it). At 0.1 fps
the boarding sequence may not have finished inside that script's wait, but driving ran in the
I, near-reaction and L sessions, all with 0 console errors.

**Known limitations found here, not fixed (no RUN 11 work):**
- On the HQ crowd LOOK is invisible: it plays `Walk` like NORMAL, and `attention` is not
  rendered.
- The near pool applies the threat rule with no reaction delay or hysteresis ("no clocks"), so
  its eight bodies notice earlier than the mass crowd and can cross thresholds faster.
- A stationary player car still makes people within 8 m ahead AVOID (`THREAT.avoid` ignores
  speed).
- The HQ body falls where it is hit; the simulation carries its own pedestrian through the
  throw. The gap is now closed smoothly on hand-back but the throw itself is not drawn on the HQ
  body.
- Without `hq=1` the scene draws the legacy crowd by design (the RUN 7B rollback).
- A player can still park the car across a crossing themselves, and the signal hold then waits
  for them. Only the automatic parking was fixed.
- Third-cycle central-stream spillback in the browser (see K above).

**RUN 10 is COMPLETE.** RUN 11 was not started.

**After RUN 10 — signal-waiting Idle (`0d8c0d3`).** This is the one item authorised after the
RUN closed. On the HQ crowd, NORMAL played `Walk`, so everyone at a kerb walked on the spot.
`clipFor(behaviour, waiting)` in `hq-crowd.mjs` plays the pack's existing `Idle` clip instead,
only for NORMAL and only while the simulation says `p.state === 'waiting'` (a crossing queue, or
the scramble cast at its kerb). It never keys on speed. Priority is physical > awareness >
waiting/locomotion. This is a visual mapping only: no movement, queue or signal state is
touched. Browser, in a vehicle-green phase: 1,455/1,455 waiting HQ citizens Idle, 0 others Idle,
and the 142–155 stopped-but-not-waiting citizens keep `Walk`. The near humanoids already choose
Idle through their speed-driven locomotion blend and are unchanged.

**Final gates for this handoff (HEAD after `0d8c0d3`):** `npm run typecheck` clean; `npm test`
403 total, **398 pass, 5 existing skips, 0 fail** (up from 383/5/0: 15 new tests, no
regression); `npm run build` successful, and its static re-bake left the tree unchanged. Final
fresh-page console gate on this code, day and night: 0 errors, 0 uncaught exceptions, 0 shader
messages, no banner.


## 9h. RUN 11 — Visual / audio / GTA feel polish

Started from `b037bc8` (RUN 10 complete). Work was done on a local worktree branch and
fast-forwarded onto `claude/gta-fidelity-upgrade`; `master` was not touched. Browser QA ran in
the real HIGH/day scene with `?qa=1&hq=1`, driven over the DevTools protocol in headless
Chromium on SwiftShader at 0.1–1.5 fps. With `FrameGate` clamping dt to 0.1 s, every live check
waits on simulated progress, and no frame rate here is a performance result.

### 11.0 Regression cleanup (`401334e`)

**Old-looking bodies.** Re-diagnosed live rather than trusting RUN 10's count. For every
pedestrian within 20 m of the player the QA pass recorded owner, near body type, HQ lane LOD and
state:
- all were HQ (L0) or near humanoids;
- the legacy renderer drew **no bodies**;
- it DID still draw **971 props** on those same citizens: 657 phones, 174 bags, 63 canes,
  63 suitcases and 14 cone umbrellas.

The prop parts were never masked with the body. HQ and near citizens therefore wore the legacy
capsule's box phone, bag and suitcase and a floating cone umbrella, sized for a capsule, and
after a hit these tumbled on the legacy arc. That is what read as blocky old bodies around the
player, on crossings, in dense crowds and after contact. Props are now drawn only with a legacy
body. Live afterwards: 0 legacy props, 0 legacy bodies, 0 drawn twice, 1,969–1,970 HQ plus 7–8
near humanoids and 0 baked. `tests/crowd-legacy-props.test.mjs` builds the real crowd renderer
with the HQ pack and pins this.

**Walking on the spot at red lights.** RUN 10's Idle keyed on `p.state === 'waiting'` alone.
Measured at a red phase, the defect was a waiting citizen who glanced at the player: they went
to LOOK, and LOOK borrows the Walk clip. LOOK now keeps the stance underneath; STARTLE, AVOID,
FLEE and every physical state still win.
`src/life/stance.mjs` also counts as waiting:
- the scramble cast standing at the kerb between crossings (`exiting`/`recycle`);
- the queue behind the front row, through a `kerbQueue` flag the simulation sets when a blocked
  walker is within 8 m of a closed crossing.
Speed alone never decides. Live at a red phase: **1,455/1,455** waiting HQ citizens and
**8/8** near humanoids Idle. The 120 other stopped walkers were ordinary congestion across the
city (87 of them for under 2 s), none at the scramble, and keep Walk.

### 11.1 Vehicle impact realism (`db1d180`)

**Why hits read wrong.** Two unrelated models ran on one contact:
- *Simulation:* it threw every body along the car's course, whatever part of the car struck
  it, and put 57% of the horizontal speed upwards. A 20 m/s hit flew about 36 m.
- *HQ body:* it ran its own second impulse and usually dropped almost where it stood, so the
  body the player saw did not follow the simulation.
- *Car:* its speed bled off at a flat rate per frame of contact, which double-counted a crowd
  and ignored mass.

**One contact model** (`src/player/vehicle-impact.mjs`, pure):
- *Inputs:* the car's velocity vector, which face hit (front, side or rear), where on that
  face, the closing speed along the contact normal, and the victim's own motion.
- *Output:* an impulse, a lift, a state and the speed the car loses.
- *Kinds:* push (closing < 2.2 m/s: a light HIT that stumbles and stays standing), knock,
  heavy (≥ 7) and launch (≥ 14). The throw is 0.8 × closing, capped at 14 m/s, with a low lift
  (≤ 3.2 m/s), so a body is thrown rather than launched into the air.
- *Direction:* a corner deflects the body off that corner, weighted by how far off-centre the
  contact is. A side swipe throws sideways.

**Following the throw.** Both the simulation's throw (`strike` now takes the impulse) and the HQ
contact use the model. A disowned HQ body now follows the simulation's flight, arc included,
through `crowd.follow`, instead of its own. Thrown bodies get 3.5 m/s² of sliding friction on
the ground, so they come to rest definitively.

**Weight and crowd resistance.** Each contact costs the car speed by momentum exchange: 75 kg
against the vehicle's own mass, 20% restitution, plus a little contact drag. The flat bleed is
gone. A body already lying in the road is shoved forward at most three times (every 0.35 s),
keeps its sideways motion and is never carried along.

**Numbers** (`tests/vehicle-impact-live.test.mjs`, real player vehicle, real flight):

| Case | Result |
| --- | --- |
| Travel after the hit at 4 / 10 / 18 m/s | 1.37 / 5.73 / 10.86 m |
| 10 m/s sedan, one contact | 9.20 m/s |
| … then over that body lying in the road | 8.49 m/s |
| … ten people in a line | 1.95 m/s |
| … a dense block of 30 | 0.95 m/s |

### 11.2 Melee feel (`efb6fbf`, `6162a32`)

**Why a punch looked like a touch.** `controller.startAttack` ignored the attack's name and
length, so the figure always played `Punch` (never the cross), squeezed into the last 0.42 s
of a 0.87–1.0 s swing. That is double speed, and it came 0.2–0.35 s AFTER the measured hit
window had already run the damage. The swing now carries its name and duration, and the clip
plays at its own speed, so the frame the fist is out is the frame the hit test runs.

On top of the clip, an additive envelope (`punchEmphasis`):
- winds the torso up away from the punching side;
- drives spine_02/03 through with the shoulder, leans in and steps the body 11 cm forward;
- peaks exactly at the measured fist-out time and settles to zero.

`tests/melee-feel.test.mjs` pins the peak to the measured `peak` and inside the hit window.
`Hit_Knockback` (UAL2) was not integrated: the repository's character sources are fetched
through `assets/character/upstream.lock.json` with hashes of the official archive, and UAL2 has
no such pinned provenance here. See limitations.

**Victims** (`src/life/temperament.mjs`):
- *How a blow lands:* `blowOn()` gives each blow a strength (jab = light flinch, 0.34 s,
  0.9 m/s push; cross = strong stagger, 0.55 s, 1.7 m/s) and a direction away from the fist,
  classified by the victim's own quarter (front, back, left, right).
- *Movement:* the simulation owns a short stagger, counted down by the frame and never applied
  to anyone on a crossing or the cast.
- *HQ bodies:* a light HIT that stays owned by the simulation (no disown), then gives way to
  the chosen answer through a new `then` state.
- *Near bodies:* they play `Hit` for the blow's hold. Before, the victim was handed
  `combatAction = 1` and played its own Punch.

**Retaliate / flee / back off.** Everyone punched used to turn and fight for 14 s. The answer is
now a deterministic temperament on the same nerve awareness uses:
- fight (nerve > .68) engages as before;
- flee (< .42) runs through the simulation's scatter and HQ FLEE;
- back off (in between) takes a short scatter and AVOID.

Kids and the elderly never fight. Over the 1,978 ids each answer covers more than 15%, and fewer
than half fight. The crossing/cast rule is unchanged: they take the blow and are not stopped.

### 11.3 / 11.4 Witnesses, feedback, audio, camera (`082f702`, `4225ab8`)

**Witnesses** (`hq-awareness.witness`, `WITNESS`):
- *Close:* inside 5 m the whole reaction is immediate.
- *Middle distance:* the witness LOOKs first. The rest arrives after their own reaction delay
  (×1.6), plus 0.035 s per metre and 0.3 s if they were facing away.
- *Far edge:* the outer 20% of the radius only looks.
- *Queue:* escalations wait in a bounded queue (256) that the layer flushes every frame. A
  knocked-down witness is never lifted by one.
- *Vehicle accidents:* a car hit raises an accident witness event (severity 0.55 + closing/15,
  16 m radius), at most one pass per 0.25 s because a pass rebuilds the grid. Three or more
  reacting produce a `crowd_gasp`.

**Event hooks** (`src/app/feedback-bus.mjs`): `vehicle_impact`, `vehicle_runover`,
`pedestrian_scream`, `punch_swing`, `punch_hit`, `pain_voice`, `crowd_gasp`, `panic_voice`.
Each kind has a cooldown, coincident events of one kind merge into one (the loudest), and a frame
delivers at most 6.

**Audio.** Still entirely synthesised: no samples are shipped and there are no new assets or
licences.
- *New sounds:* a swing (a band of noise sweeping up), a punch hit (a body thump plus a short
  slap), a vehicle–person impact (heavier and lower), and a run-over thump.
- *Pooling and caps:* noise buffers are generated once per length and shared (it was a fresh
  random buffer per hit). At most 6 one-shots ring at once, and nothing starts on a suspended
  context, which never releases a source and would have pinned the cap.
- *Voices:* pain (うっ／いたっ／ぐっ) and gasp (えっ) go through the simulation's own voice queue,
  so its per-person cooldown and the 4-voice cap apply.

**Camera and visual.** Person hits added shake multiplied by the number hit in the frame, so a
crowd pinned the camera at full throw (0.42 m). There is now one bounded knock per frame of
contact (max 0.45) and a small punch knock (max 0.25). A contact raises a low road-dust puff from
the existing 72-particle effects pool, adding no draw call. The existing blood marks were not
increased.

### 11.5 Browser acceptance

Real HIGH/day scene, `?qa=1&hq=1`, headless Chromium on SwiftShader. Every scenario opened a
fresh page, and each checkpoint took the same census: population, owners, legacy props and
bodies, Skeleton and AnimationMixer counts, draw calls, non-finite transforms, behaviour
histogram, disowned and struck bodies, and feedback bus statistics.

**A. Old-looking bodies.** Checked at start, middle and end of every scenario below:
- 0 legacy props and 0 legacy bodies on HQ or near citizens;
- 0 citizens drawn twice and 0 baked;
- HQ 1,968–1,970 plus 7–8 near humanoids, population 1,976–1,978 (the gap is victims
  recycling).

**B. Signal waiting** (two full red → green cycles, simulations pumped to each phase and then
40 s of real frames to apply the clips):

| Cycle | Red: HQ waiting Idle | Red: near Idle | Green: HQ crossing Walk | Green: near Walk |
| --- | --- | --- | --- | --- |
| 1 (signal 140 s / 200 s) | 1,455 / 1,455 | 8 / 8 | 1,455 / 1,455 | 8 / 8 |
| 2 (signal 248 s / 308 s) | 1,456 / 1,456 | 7 / 7 | 1,455 / 1,455 | 8 / 8 |

No waiting citizen was on Walk and no crossing citizen on Idle.

**C. Vehicle impacts** (player car aimed at a single pedestrian, then at the densest 4 m cell):

| Case | Kind | Face | Closing | Travel | Direction vs expected |
| --- | --- | --- | --- | --- | --- |
| Low, 4 m/s | knock | front | 6.51 m/s* | 1.15 m | 6.6° |
| Mid, 9 m/s | knock | front | 5.62 m/s | 1.47 m | −2.3° |
| High, 15 m/s | heavy | front | 9.69 m/s | 3.88 m | 0° |
| Diagonal, 9 m/s, 0.8 off-centre | heavy | front | 8.77 m/s | 2.97 m | −12.3° (deflected off the corner) |

\* The low-speed pedestrian was walking into the car, which adds to the closing speed.

- *Every victim:* HQ went DOWNED on `Fall`, with the HQ body 0 m from the simulation's and a
  flight arc of at most 0.28 m.
- *Dense cell of 88 at 10 m/s:* 5.1 m/s after 7 hits, 0.68 after 18, then stopped. The car
  was not carried through.
- *After the hits:* 17 DOWNED and disowned, 56 AVOID, 83 LOOK (witness tiers). Eighteen
  seconds later there were 0 disowned and 0 struck, and the victims had recycled.
- *Feedback:* 70 events emitted, 23 merged, 6 throttled, 41 delivered, at most 3 in one frame.
- *Smoke (§F):* a dense cell of 122 took 7 hits and stopped the car.

**D. Melee** (12 swings next to walking pedestrians, 10 hits):
- *Clips:* both `Punch` and `PunchCross` played. The hit landed at clip progress 0.115 / 0.20,
  inside the measured window (one frame of ordering offset).
- *Victims:* every near-body victim played `Hit` for the blow's hold.
- *Answers:* back off 5, fight 4, flee 1.
- *Afterwards:* all NORMAL again after 16 s, and no hostile left.
- *Feedback:* 32 events, at most 2 in a frame.

**E. Witnesses.** Tiers were seen live in C (AVOID close, LOOK further out). Escalation from LOOK
to AVOID/FLEE is pinned by `tests/awareness.test.mjs`, including the 256-entry bound.

**F. Long mixed smoke** (one page, in order): walk → run → wait at red at the scramble kerb →
cross on the green → three punches on one pedestrian → carjack → drive → hit → dense crowd →
get out → walk → 20 s settle.
- *Punches:* three hits, light/back, strong/left, then light/left and fatal. The victim, a
  fleer, went DOWNED on `Fall` under HQ ownership.
- *Carjack:* succeeded, and the thrown driver was later milling with `cameFromVehicle` set.
- *Hit:* the single-pedestrian hit in this run found no clear line (a building stood between
  car and target) and was skipped. C covers it.
- *Dense crowd:* 7 hits, car stopped.
- *Settled:* population 1,978 (HQ 1,969, near 8), every HQ citizen NORMAL, 0 reacting, 0 down,
  0 disowned, 0 struck. 62 drivers seated, 0 legacy props or bodies, 0 non-finite.
- *Feedback:* 19 emitted, 5 merged, 1 throttled, 13 delivered, at most 3 in a frame.
- *Harness notes:* the harness stepped the player onto the road after getting out, and a
  passing kei car ran the player over. That is existing behaviour (the `轢かれました` retry
  banner). The run hit its 90-minute wall-clock limit before the last two steps; they were
  finished on the same open page.
- *Errors:* all 50 page log entries of the run were replayed on re-attach: 0 errors,
  0 exceptions, 0 shader failures. The only warnings were Chrome's headless AudioContext
  autoplay notices.

**G. Structure.**
- 0 `Skeleton` and 0 `AnimationMixer` on crowd citizens in every census.
- HQ draws stayed at 12; total draw calls 442–461 (RUN 10: 444–458).
- No per-pedestrian physics bodies.
- Audio: 0 one-shots ringing in any census (the headless context stays suspended). The pool
  cap and the suspended guard are pinned in `tests/player-audio.test.mjs`.
- No new startup work: the noise buffers are built lazily, once per length.

**Console gate.** Fresh pages, HIGH, `hq=1`, day then night, on the RUN 11 code. Day covered
walking, running, a punch, boarding, driving and getting out; night covered load and idle.
- **0 errors, 0 uncaught exceptions, 0 shader-compile messages, no `[role="alert"]` banner.**
- 0 Skeletons and 0 Mixers. HQ 1,969 (day) and 1,972 (night); draw calls 473 / 477.
- The only warnings were 3 per page of Chrome's AudioContext autoplay notice, as in RUN 10.

**Final gates** (HEAD `6162a32`, before this document):
- `npm run typecheck`: clean.
- `npm test`: 439 total, **434 pass, 5 existing skips, 0 fail**. That is 36 new tests over
  RUN 10's 403/398/5/0, with no regression.
- `npm run build` (run by `npm test`): successful, and the static re-bake left the tree
  unchanged.

**RUN 10 limitations closed by this RUN:**
- LOOK no longer walks a waiting citizen on the spot.
- The throw is now drawn on the HQ body (`crowd.follow`).
- A light push no longer knocks anyone down.
- The NPC hit reaction is directional in movement: the push goes away from the fist and is
  classified by quarter. It still uses the same `Hit` clip, so it is not directional in
  animation.

**Remaining known limitations:**
- **`Hit_Knockback` is not integrated.** UAL2 is CC0 by its authors' statement, but this
  repository fetches character sources only through `assets/character/upstream.lock.json`, with
  the official archive's hash, and UAL2 has no pinned lock here. Adding it is an asset-pipeline
  change, not a RUN 11 polish item. The victim's `Hit` still barely moves, and a front blow and
  a back blow play the same clip; the stagger and push carry the direction.
- **HQ and near citizens carry no props.** Masking the legacy props removed the capsule-sized
  box phones and cone umbrellas. The HQ pack has no prop meshes, so no citizen near the player
  shows a phone, bag or umbrella now. That needs new assets.
- **Crossing and cast victims are not stopped.** A victim on a crossing or in the scramble cast
  takes the blow (HQ HIT and near `Hit`) but is not staggered by the simulation, for the reason
  in §18.
- **The kerb queue flag rarely fires in practice.** The cast's own `exiting`/`recycle` states
  cover most of the scramble. It exists for non-cast queues behind a closed crossing.
- **A stationary player car still makes people within 8 m ahead AVOID** (RUN 10, unchanged).
- **The near pool has no reaction clocks** (RUN 10, unchanged). Its eight bodies react on the
  frame.
- **Audio could not be heard in this environment.** The headless AudioContext never leaves
  `suspended`. Scheduling, pooling, caps and the suspended guard are unit-tested against a fake
  context, but loudness and mix balance need a listening pass in a real browser.
- **Third-cycle central-stream spillback in the browser** (RUN 10 K) stays a known limitation.
  RUN 11 does not touch traffic or signals, and the two signal cycles above ran without it.
- The player can be run over by traffic after getting out in a road. This is existing
  gameplay and is unchanged.

**Performance observations** (structural only; SwiftShader frame rates are not a result):
- Nothing new per frame is O(population). The feedback bus is O(events), with a 6-event cap.
- The witness escalation queue is bounded at 256 and flushed in O(pending).
- A vehicle contact costs a grid lookup of the car's cells, as before.
- The accident witness pass reuses `witness`, at most 4 times a second.
- No new draw calls: dust uses the existing particle pool, and props were removed.
- Noise buffers are built lazily, once per length.

**Carried to RUN 12:**
- The HQ layer ranks all ~1,978 citizens every frame (~2.3 ms).
- `witness` rebuilds the grid on every call (0.56 ms at 1,978). The accident pass makes this
  more frequent in dense crashes, capped at 4 per second.
- The QA-only `ownership()` census is O(population); it is QA-gated.
- LOW/MEDIUM prebake coverage.

**New assets and licences:** none. Every RUN 11 sound is synthesised at runtime. No samples, no
models, no textures and no new dependencies.

**Commits** (on `claude/gta-fidelity-upgrade`, on top of `b037bc8`):

```
401334e  RUN 11.0: fix crowd render and signal-idle regressions
db1d180  RUN 11.1: directional vehicle impact, weight, and crowd resistance
efb6fbf  RUN 11.2: a punch that reads as a punch, and victims who answer it
082f702  RUN 11.3/11.4: witness panic, feedback events, audio, camera, dust
4225ab8  RUN 11.4: never start a one-shot on a suspended AudioContext; QA hooks for feedback and audio
6162a32  RUN 11.5: report the last landed blow (victim, answer, strength) in the melee snapshot for QA
```

This document is committed on top of `6162a32`; `git log -1` is the final HEAD.

**RUN 11 COMPLETE.** RUN 12 was not started.

## 9i. Crowd realism (branch `claude/crowd-realism`, from `master` `a940ce4`)

Real Chrome on Windows (not SwiftShader), HIGH, `?qa=1`, scene frame rate about **6–7 fps**
on this machine (`__SHIBUYA_QA__.metrics.fps`), so every live check here ran at a real frame
rate, not a clamped headless one. A second dev server was started from this checkout on
**port 5175**; the user's own server on 5174 was left running (see Bug 1).

### Bug 1 — old-model bodies around the player, even with `hq=1`

**Measured cause 1: the 5174 server was not serving this code.** The dev server on
`127.0.0.1:5174` (PID 30036, started 2026-09-22) is rooted at a different checkout,
`Documents/shibuya-run10-play`, and served code older than RUN 10's fixes: its page had no
`ownership()`, no `setHQCovered`, and `/src/life/stance.mjs` returned 404. On that page, in player
mode at the scramble: near pool **24 baked** (the eleven-bone offline figure with the big eared
head and the white back plate) + 8 humanoids, and **971 legacy props** (657 phones, 174 bags,
63 canes, 63 suitcases, 14 cone umbrellas) on HQ/near citizens — exactly what `b87ca60` and
`401334e` fixed. The same probe on this code (5175): within 25 m, 676 HQ + 8 near, 0 legacy,
0 baked, 0 props. That is why the cloud QA never saw it.

**Measured cause 2 (a real bug in current code): the HQ crowd was requested once per page.**
`hqRequested` in `app/ShibuyaScene.tsx` was set on the first request. Toggling traffic rebuilds
the life module; the new crowd came up with no HQ layer, forever, and the humanoid asset was not
handed to its new near pool either. Live after one traffic toggle: `hq:false`, **442 legacy +
21 baked within 25 m**, 1,978 legacy bodies, 972 props.

**Fix:** `src/app/hq-request.mjs` keys the request on the crowd instance: the pack is fetched
once and shared, each rebuilt crowd gets its own layer, a crowd replaced while the pack is in
flight is never enabled, and a tier change re-applies the budget (LOW turns it off, HIGH back
on). A rebuilt crowd is handed the loaded humanoid. `hq-layer.dispose()` hands disowned bodies
back. `?hq=` absent now means the tier default (`hqBudget` → −1); `?hq=0` / `?hq=false` remain
the legacy rollback. Live after the same toggle: HQ back, 455 HQ + 8 humanoids, 0 legacy /
0 baked / 0 props, with no `hq` in the URL.

### Bug 2 — stepping on the spot when stopped

Idle came only from the simulation's waiting flags and Walk played at a fixed cadence
(`writeClip` claimed to scale by speed but did not). **Fix:** `src/life/pace.mjs`, one rule for
the HQ crowd and the eight near humanoids: pace is the smoothed velocity **vector** of the drawn
position (not `p.speed`, which is intent), with hysteresis (start 0.30, stop 0.12 m/s). The
vector matters: jammed ambient walkers sidestep left/right on alternate ticks (0.4 m/s of path,
0.05 m/s of progress); a scalar read that as walking. Walk/Run cadence = stride / measured speed
(Walk 1.30 m, Run 2.687 m per cycle from `citizen.json`), bounded 0.5–1.75×, and a rate change
shifts the phase so the pose never jumps. Stopped NORMAL/LOOK → Idle; stopped AVOID/FLEE →
Guard (never running on the spot); Run above 2.2 m/s for reactions, 3.2 m/s for strollers
(far-LOD walkers move in 0.2 s bursts that read ~3 m/s).

Live, two full signal cycles (~7 fps):

| cycle | red: kerb Idle | green: crossing Walk | near stepping |
| --- | --- | --- | --- |
| 1 | 1,455 / 1,455 | 1,455–1,456 / same | 0 |
| 2 | 1,455 / 1,455 | 1,457 / 1,457 | 0 |

Residual "Walk while net displacement < 0.1 m over 1.5 s": 2–9 of 1,969, mostly far-LOD patrol
walkers 60–200 m away, plus walkers reversing on a patrol route (real movement the metric
cannot tell from dither).

### Bug 3 — running on the spot after a car hit

The HQ body went AVOID/FLEE and played Run, but nothing moved the pedestrian: the choreographed
cast (74–85% of the crowd) never ran `move()`, so `scatter` could not reach it. **Fix, in the
simulation (the source of truth):** `sim.flee` — away from the threat with a deterministic
per-person spread (±0.62 rad; ±0.22 for a dodge), 3–5 m/s, 1–1.8 s or 2.4–5.5 m, accel 10 /
decel 7 m/s², walkable ground or the person's own crossing only, steering round solids and cars,
and a step may not add overlap inside 0.44 m. Flights run first each tick, furthest from the
danger first, so a packed kerb unpacks from its far edge. `sim.vehicleThreat`: in the path with
< 1.5 s to contact → sideways dodge; close → away, but not ahead of the car; below 2 m/s anyone
inside the car's footprint steps out at 1.5 m/s. `sim.panic`: accident witnesses scatter.
Cast members carry their displacement as an offset and walk it back with checked steps (never
into a car). No crossing or queue is released; `isWaiting` is false while fleeing/returning.

Live, same cell (−26, 14), same signal moment, car at 9 m/s:

| | before | after (kerb) | after (on the crossing) |
| --- | --- | --- | --- |
| reacted | 361 | 363 | 371 |
| median moved in 2 s | **0 m** | **2.54 m** | **3.50 m** |
| moved < 30 cm | 323 / 347 | 22 / 353 | 0 / 353 |
| moved > 1 m | 17 | 297 | 353 |
| left / right of the car | 6 / 18 | 163 / 168 | 210 / 161 |
| peak flee speed | — | 4.97 m/s | 4.96 m/s |

Crossing run, direction at each person's farthest point: sideways 197, away 135, toward 39;
compass peaks E 154 / W 121 against a northbound car — the crowd parts to both sides. Bodies
inside the car at the end: 0. Headless on the real network (`tests/crowd-flee.test.mjs`): 347
fled, median 2.22 m, 26 under 30 cm; dodges go across the path; everyone stops, the cast is back
on its track within 12 s, signals keep cycling, 0 signal violations.

### The previous implementer's twelve "might look wrong" items

| # | item | live result | action |
| --- | --- | --- | --- |
| 1 | running on the spot after a hit | wrong (median 0 m) | fixed (Bug 3) |
| 2 | stagger counted in frames | it was already seconds, but the start-of-frame speed made a cross carry ~45% further at 7 fps than at 60 | fixed: exact integral, `push·hold/2` at any fps |
| 3 | sliding: punch push, ground friction, runover | stagger 0.15–0.47 m over its hold under `Hit`/`Startle` reads as a stumble; a lying body sliding is correct | friction retuned (item 9); push kept |
| 4 | bodies inside the car | wrong: a car below 2 m/s left people in its panels | fixed: step-out rule; 0 inside at the end of both live runs |
| 5 | punch emphasis slides the feet | wrong: the root moved 11 cm with both feet planted | fixed: spine lean 0.2 rad instead, no root translation |
| 6 | victim's `Hit` too weak | wrong (baked `Hit` barely moves) | improved: additive spine/head recoil away from the blow, jab 0.2 / cross 0.38 rad; live: a cross from the right played `Hit` for its 0.55 s hold with the direction handed over |
| 7 | pose jumps on HIT→FLEE, Idle↔Walk, KNOCKDOWN→RECOVER | wrong: every clip change popped; one-shots started at a random frame; DOWNED froze mid-fall; getting up snapped | fixed: GPU crossfade (0.25 s, 0.1 s into a hit, 0.6 s getting up), one-shots from frame 0 timed to their state, DOWNED holds the last frame. Live: 813 / 813 clip changes in 4 s blended |
| 8 | Idle bodies sliding | ~4% of Idle bodies drift 0.15–0.3 m/s (jam creep) | band narrowed to 0.30 / 0.12 m/s; residual listed below |
| 9 | throw too flat / short; clip vs direction | wrong: gravity was 16 m/s², slide mostly viscous; the baked Fall goes over backwards whatever the flight | fixed: g 9.81, Coulomb-dominant slide, cap 16 / lift 4 m/s → 1.3 / 8.0 / 17.8 m at 4 / 10 / 18 m/s (was 1.4 / 5.7 / 10.9; reconstruction bands ~6.5–8.5 and 17–25 m); a thrown body turns to face against its flight (live 1.79 → 0 rad) |
| 10 | car stopping in a dense crowd | natural: now most of the crowd dodges, so fewer are hit (7–17 per run instead of every body in front); through a parted crossing the car kept 10.4 m/s | unchanged |
| 11 | LOOK looks like nothing | wrong on standing citizens | fixed: a standing LOOK/STARTLE/RECOVER turns up to 0.9 rad towards what was noticed; walkers don't crab |
| 12 | audio, shake, dust, fighters | fighters **32.7%** (flee 31.6%, back off 35.7%), not ~40%. Shake 0.45 / 0.25 caps unchanged. **Audio not verified:** synthetic clicks are not user gestures, so the page never created its AudioContext, and this session cannot listen | recorded; see next steps |

### Structure and gates

Population 1,978; HQ 1,969 + 8 near humanoids; 0 legacy bodies, 0 baked, 0 props; 12 HQ draws
(8 at night in one census); total draw calls 471–481 (RUN 11: 473–477); 0 Skeleton, 0
AnimationMixer; no new per-pedestrian objects, physics bodies or R3F. Fresh pages day and
night: **0 console errors, 0 exceptions, no error banner.** The only warning is the Windows D3D
`X4122` precision note, logged before the HQ crowd is enabled, so not from its shader.

**Final gates** (HEAD `e2956e3`, before this document): `npm run typecheck` clean; `npm test`
(build included) **467 total, 462 pass, 5 existing skips, 0 fail** — 28 new tests over RUN
11's 439/434/5/0, no regression; the build's static re-bake left the tree unchanged.

### Remaining issues

- **Jam creep in Idle.** Ambient walkers the simulation holds in a jam creep continuously at
  0.15–0.3 m/s and keep Idle below the 0.30 m/s start threshold (a few percent of Idle bodies).
  Real people step-and-stop; the fix is in the walker model (stop-and-go), not the renderer.
- **Far-LOD dither.** 2–9 walkers 60–200 m away still read as Walk with near-zero net progress
  (0.2 s throttled ticks are slower than the pace smoothing).
- **Flee is local.** People flee on ground they can see (walkable or their crossing), never
  across a road, and a packed kerb against a wall has nowhere to go; they press, then walk back.
- **The HQ LOOK turn is the whole body** (standing only). There is still no head turn on the
  mass crowd; that needs an additive bone in the atlas shader.
- **Crossfades are matrix lerps**, not quaternion blends; fine over 0.1–0.6 s at crowd distance,
  and getting up is a 0.6 s blend from lying to Guard, not a get-up clip (the pack has none).
- **Audio is unheard**, and the fighter ratio (32.7%) is a design choice left as is — for a
  Shibuya setting fewer people squaring up may read truer.
- The user's dev server on 5174 still serves the old checkout until it is restarted from this
  repository.

### Next

1. Restart the 5174 dev server from this checkout (`npm run dev:local`) and re-check by eye.
2. Stop-and-go creep for jammed walkers in `simulation.move` (removes the Idle creep).
3. An additive head-look bone in the crowd shader for LOOK while walking.
4. Pin `Hit_Knockback` / a get-up clip (UAL2) through `upstream.lock.json`.
5. A listening pass on the synthesized audio with a real gesture; decide the fighter share.

## 9j. RUN 12 — the final RUN: performance guard, recorded audio, wet-road reflection, PBR ground, motion, robustness, final QA

**Scope and working method.**
- **Base:** started from `master` `6c779cb` (PR #20 merged) on branch `claude/happy-tesla-dkn52d`, PR #21. RUNs 13 and 14 of the old roadmap are folded in here.
- **Choosing what to do:** TIDELIGHT (a small WebGL scene, studied from outside) was used as a checklist of methods, never as a source of code or assets. Taken from it: recorded CC0 sound, a planar reflection, CC0 PBR surfaces, one shared definition for CPU and GPU, and graded quality and robustness. Left out: sun shafts (little use at night) and the no-bundler layout.
- **Verification:** everything was checked in headless Chromium on SwiftShader (0.1–1.5 fps) and by the test suite. **Nothing here has been listened to or watched at a real frame rate.** Those are the user's real-device checks listed at the end of this section.

### 12.0 Performance guard (`ae7e546`, `86110e3`)
- **Ranking:** the HQ layer sorted every pedestrian by distance every frame, allocating a record for each, only to take the nearest `budget`. It now keeps pooled records, orders nothing when everyone fits (HIGH), and runs an in-place O(n) nearest-k selection (`selectNearest`) otherwise.
- **Grid:** the crowd grid (O(population)) is built at most once per synced frame and shared by the vehicle threat, every witness event and the perception tick (`ensureGrid`). It used to be rebuilt up to three times a frame.
- **Cost:** `qa/gta-upgrade/sync-cost.mjs` measures 1,978 walkers over 600 frames, CPU only.

  | Budget | Mean before → after | p95 before → after |
  | --- | --- | --- |
  | 1,978 | 1.355 → 0.975 ms | 1.821 → 1.455 ms |
  | 512 | 0.876 → 0.321 ms | 1.329 → 0.449 ms |

**Quality tiers, as they stand** (collected from the modules that own them):

| | HIGH | MEDIUM | LOW |
| --- | --- | --- | --- |
| Pixel ratio × render scale | ≤1.5 × 1 | ≤1.25 × .6 | 1 × .3 |
| Frame cap | 60 | 30 | 24 |
| Shadows / GTAO / SMAA / bloom | 4096 / on / on / on | off | off |
| Night point lights / spots | 6 / on | 2 / off | 0 / off |
| Environment map | on | on | off |
| HQ crowd budget | 1,978 | 512 | 0 (legacy) |
| Near humanoids / near slots | 8 / 32 | 4 / 12 | 0 / 4 |
| Moving / parked cars | 62 / 12 | 30 / 7 | 14 / 3 |
| Road mirror (12.2) | on at night, 1/2 res, every 2nd frame (4th below 25 fps) | off | off |
| PBR ground (12.3) | on | on | off |
| Recorded audio (12.1) | on | on | on |

### 12.1 Recorded CC0 audio (`0064309`, `deb6415`, `51cd72f`)
- **Sources and pipeline:**
  - `assets/audio/upstream.lock.json` pins 33 CC0-1.0 sources: 32 Freesound sounds, each licence read from the sound's own page, plus Kenney's Impact Sounds.
  - `npm run fetch:audio` verifies every file by SHA-256.
  - `npm run convert:audio` does the rest in a local Chrome:
    - cuts each clip to its window and trims the silence;
    - normalises one-shots to −12 dBFS on their loudest 50 ms, beds to −20 dBFS and the chirp to −16 dBFS, with peaks ≤ −1 dBFS;
    - crossfades loop tails into their heads;
    - encodes to MP3 (lamejs, dev only);
    - records the encoder's 25 ms lead-in.
  - Output: 40 clips, 1.73 MB, in `public/audio/`. Credits are in `docs/AUDIO-ASSETS.md`.
  - Commit `0064309` carries both the pipeline and its runtime. A broken command chain merged two intended commits; it was pushed and not rewritten.
- **Playback** (`src/audio/bank.mjs`, `src/audio/soundscape.mjs`):
  - Clips load after the entering-player gesture and are never awaited; every sound keeps its synthesised fallback until they decode.
  - Variants rotate and detune ±3%.
  - Placed sounds are HRTF panners with the listener on the camera.
  - Caps: 4 voices per kind and 18 in total; a safety compressor guards the output.
  - Two beds scale with the people and moving cars near the ears: Heigh-hoo's real `cross_road_shibuya` and `ginza_ambience` recordings.
  - A Japanese "cuckoo" crossing chirp sits at the scramble during the pedestrian green.
  - Footsteps play per stride actually covered, and tyres squeal on a real slide or a hard stop. Crashes duck the beds, and **H** sounds the horn.
  - Crowd screams, gasps and low grunts use recordings through the voices' own cap, gaps and scream priority. The words stay synthesised.
- **Live** (headless with autoplay allowed):
  - 40 clips decoded, 0 errors, 0 fallbacks once loaded;
  - 3 loops playing and 10 steps over a 5 s walk;
  - punches played as recordings;
  - 0 voices left ringing.

### 12.2 Wet-road reflection (`a5d8bc6`, `06541c9`)
- **Method:** the asphalt's night patch now samples a real mirror (`src/nightglow/road-reflection.mjs`).
  - The mirror camera sits below the road with an oblique near plane.
  - It is sampled along a ripple-perturbed reflected ray and blurred more along the view, the way wet asphalt streaks light.
  - It is weighted by Fresnel and the existing wet mask, and faded at the texture edges.
- **Budget:**
  - HIGH at night only, half resolution capped at 960 px, every 2nd frame (every 4th below 25 fps).
  - Ground, crowd and wet decals are hidden from the mirror.
  - The texture is unbound while it is drawn into, so it can never form a feedback loop.
  - The painted streaks and patches step back (×0.45, ×0.4) instead of doubling.
- **Headless HIGH night:** at CAM-03 and CAM-08 the lit frontage, signs and street lamps now appear in the crossing. 0 errors, 0 shader messages. `__SHIBUYA_MIRROR__.enabled` gives an A/B.
- **Found this way:** the GLSL snippet lacked a trailing newline, so the three.js shader it was prepended to began `}#define STANDARD` and the asphalt failed to compile. A test now checks every preprocessor line.

### 12.3 PBR ground (`612dc5e`, `fd976a0`, `2dbe71f`, `692c110`, `d0512cd`)
- **Sets:** two Poly Haven CC0 sets. `asphalt_track` is 2 m, dark and crack-free, so no repeating cracks. `concrete_pavement` is 1.8 m grey rectangular pavers.
- **Pipeline:** pinned by hash and re-encoded in Chrome's canvas at 1024 px, 4.7 → 1.33 MB.
- **Runtime** (`src/ground/pbr.mjs`):
  - The maps are swapped onto the same materials once the city stands (idle callback), so draw calls are unchanged and the night patches carry over.
  - They tile at real scale.
  - Each material is tinted per channel, in linear light, so the photograph averages exactly what the procedural texture did. The lighting was calibrated against that average.
  - LOW and `?pbr=0` keep the procedural ground.
- **Headless:** applied to both sets day and night, draw calls unchanged (341 / 349), 0 errors. The difference is detail in close-up, not grade.

### 12.4 Motion (`eedfc73`, `63c03dd`, `429ef3a`, `51a4a8d`)
- **Returning cast stay on the pavement.** The walk-back after fleeing a car used a single fallback: once held up for a second, any non-solid step. It is now tiered: after 1 s, walkable ground with a thin 5 cm margin or their own crossing; only after 3 s, any clear step. In one crowd arrangement 7 of 347 fleers had ended off walkable ground; now 0.
- **The head.**
  - A walker who notices something turns the head (≤0.75 rad), and a standing one's head takes whatever the body turn left over.
  - Only bind-pose vertices above the neck turn, faded over 3.5% of the height and pivoting on the neck carried by its own skin matrix.
  - The yaw shares the shoe attribute's slot (`aShoe` is now `vec2`). The crowd shader already uses the 16 vertex attributes WebGL guarantees, and a separate `aHead` failed to link ("Too many attributes"). A test pins it.
- **Wind in the street trees.**
  - The shared leaf material sways in the vertex shader in two unequal gusts per 11 s cycle.
  - The front travels at 3.2 m/s across the street, and the sway is weighted by height so planters barely move.
  - The shadow depth material carries the same patch.
- **Tried and reverted: stop-and-go for jammed walkers.** Measured on the real network over 60 s:
  - the renderer-visible creep (smoothed pace 0.12–0.3 m/s) fell only from 7.6% to 5.9%;
  - stopped walkers went from 12% to 30%, and stuck recycles from 5 to 19.

  The creep is almost all far-LOD walkers 60–200 m out, updated every 0.2 s. Near the player it is ≈0.3% of samples and the renderer's start threshold hides it.
- **Not done, by decision:**
  - Velocity-matched (Hermite) pose transfer: PR #20's crossfades already remove the pops, and the GPU atlas keeps no per-bone state to match.
  - `Hit_Knockback`: its provenance still cannot be pinned.

### 12.5 Robustness (`85ba0f0`, `d6f2c1e`)
- **Hidden tab:** the AudioContext is suspended if it was running, and resumed on return. Live: running → suspended → running.
- **Lost WebGL context:** the sound stops with the picture.
- **Reduced motion:** `prefers-reduced-motion` quarters camera knocks, and `?shake=0` removes them.
- **Touch devices:** the road mirror starts off (`?mirror=1` / `?mirror=0` force it). The tier is not lowered, because MEDIUM and LOW still lack full prebake coverage.
- **Already present:** dt clamp (FrameGate, 0.1 s), load-failure notice, and a fallback for every optional upgrade (HQ crowd, audio, ground textures).

### 12.6 Final QA
**Long mixed run.**
- **Setup:** headless HIGH, player mode, autoplay allowed so the audio really ran. The mirror was off (`?mirror=0`) and the viewport 420×240 so the run could finish. The mirror itself was verified separately in 12.2.
- **Each cycle:** walk or run, two punches, a carjack attempt, a day/night switch through the UI.
- **Length:** 108 s of simulated time, three time switches.
- **Every sample, start to end:**
  - population 1,977–1,978 (1,968–1,969 HQ plus 8 near);
  - 0 legacy bodies or props, 0 Skeleton and 0 Mixer, 0 non-finite;
  - GPU geometries 183 and textures 48, constant from the first sample to the last;
  - JS heap 198 → 186 → 190 → 190 MB (flat);
  - 27 recorded sounds played, 0 dropped, 0 decode errors, 0 left ringing.
- **Console:** 0 errors across all 18 of the page's log entries, replayed on re-attach.
- **Harness notes:** the carjack did not complete inside the harness's real-time wait (boarding takes seconds of simulated time, which is minutes at 0.2 fps). The run hit its 90-minute wall-clock limit inside the third cycle; the final sample was taken by re-attaching to the same page.

**Drive check** (simulated-time waits, same setup):
- boarded a stolen car and drove it into the densest 4 m cell: 10 people hit;
- horn (H) 1, tyre screech on a forced slide 1;
- 21 recorded sounds, including body impacts;
- crowd voices: 63 played (5 of them recorded screams), 159 dropped by the voice cap, as designed for a crowd pass;
- feedback bus: 14 emitted, 10 delivered, at most 3 per frame;
- 0 errors.

**Frame rate here:** 0.1–0.2 fps at both 900×520 and 420×240. The cost is per frame on the CPU, not fill rate, which is in line with RUN 11's headless runs (0.1–1.5 fps). SwiftShader numbers are not a performance result. Real-device fps is the user's check below.

**Console gate.**
- **Setup:** fresh pages, HIGH, the HQ crowd by default, day then night. Day covered walking, running, a punch, boarding, driving and getting out; night covered load and idle.
- **Result:** **0 errors, 0 uncaught exceptions, 0 shader-compile messages, no `[role="alert"]` banner** at any checkpoint.
- **Structure:** 0 Skeleton and 0 Mixer; HQ 1,969 (day) and 1,971 (night); draw calls 473 / 477, the same as RUN 11's gate.
- **Warnings:** only Chrome's AudioContext autoplay notice, as in RUN 11. It is not an app error.

**Final gates:** `npm run typecheck` clean. `npm test` (build included): 496 tests, **491 pass, 5 existing skips, 0 fail**. That is 30 new tests over PR #20's 467 / 462 / 5 / 0, with no regression.

### What the user checks on real hardware
1. **Mirror:** `?qa=1&tier=high&time=night&camera=street`. Look at the wet crossing. Toggle `__SHIBUYA_MIRROR__.enabled` and note fps and draw calls for both.
2. **Audio:** in player mode, walk (steps), stand at the scramble (bed; chirp on the green), punch (E), drive (F), horn (H), brake hard or slide, and hit someone. Say which kinds are too loud or too quiet (`MIX` in `src/audio/bank.mjs`).
3. **Ground:** close up in player mode by day. Compare `?pbr=0`.
4. **Head turns and wind:** drive near a crowd; walkers should turn their heads. Watch the street trees for a few gusts.

### Remaining limitations (added by RUN 12)
- **Audio:**
  - Nothing has been listened to; levels are measured, not balanced by ear.
  - The engine is still the synthesised note.
  - The crowd's words are still formant speech.
  - Freesound transports are the sounds' 128 kbps previews, since originals need an API key.
- **Mirror:**
  - It does not show the crowd or the ground, so reflected people are absent.
  - Its cost on the user's GPU is unmeasured.
  - Off on touch devices.
- **PBR:** only road and pavement. Curbs, crossing paint and tactile paving are flat.
- **Motion:**
  - Far-LOD jam creep remains (see 12.4).
  - The head turn is yaw only.
  - `Hit_Knockback` / a get-up clip is still missing.
- **Tiers:** MEDIUM and LOW prebake coverage is still incomplete (`docs/ISSUE-LOW-TIER-PREBAKE-2026-09-20.md`).

**RUN 12 COMPLETE. This was the final RUN of the GTA Fidelity plan; RUN 13 and 14 are folded in. What is left is the real-device checks above and the limitations listed with them.**

## 9k. After RUN 12 — the punch goes at the person (branch `claude/happy-tesla-dkn52d`, from `master` `c1b89c6`)

**Found on real hardware.** The user's real-device check (a Claude CLI driving Chrome on a
second PC, after PR #21) reported that the punch looked like a sideways swing, arms opening
out to the sides instead of going at the person in front. Measured on the player's own figure,
standing, at the jab's peak:

| | Fist sideways | Fist forward | Fist height |
| --- | --- | --- | --- |
| The clip on its own (`Punch_Jab`) | 0.09 m | 0.76 m | 1.39 m |
| The game before this fix | **0.60 m** | 0.23 m | 1.06 m |
| The game after this fix | 0.07 m | 0.77 m | 1.26 m |

The cross was worse before the fix: its fist ended 0.64 m out to the side and 3 cm *behind* the body.

**Three causes. None of them was in the clips.**
- **The swing was averaged with the idle.** The punch went through the mixer at weight 1 on
  top of a gait blend that already summed to 1, and three.js averages every action that
  animates a bone. The arm was therefore half punch and half hanging at the side: on its own,
  this put the fist 0.45 m sideways.
  - Now a swing *takes* its weight from the gait (`STRIKE` in `src/player/figure.mjs`). The
    total stays 1, the swing fades in over 0.08 s and out over 0.3 s, and during the swing
    the figure is the clip.
  - Other overlays (Hit, Startle, Guard, vehicle entry) still blend the old way. They were not
    reported and are not changed here.
- **The added torso twist ran the wrong way.** RUN 11.2 added `spine.rotateY(±.24k)` and
  `chest.rotateY(±.2k)`. A positive yaw pulls the left shoulder *back*, so a left jab swung
  outward; on its own the twist moved the fist 28 cm off its line.
  - The clips already turn the shoulders into the punch, so the twist is gone.
  - The forward lean stays, reduced from 0.2 to 0.13 rad. At 0.2 the body read as hunched over.
- **The body did not face what it hit.** Standing, the figure only turns to the camera once
  the view is 0.95 rad (54°) away, and the hit arc measured from `bodyHeading`, which is
  updated only while walking. The live run below started with the figure 70° off the camera
  line. Now:
  - A swing locks on to the nearest person within 2.4 m and 1.2 rad of where the player is
    looking (standing) or going (moving); `COMBAT.lockRange` and `lockArc` in
    `src/player/combat.mjs`.
  - The body turns onto that person at 14 rad/s. The aim follows them through the wind-up and
    is then fixed. `attackHeading` and `bodyHeading` are the same value, so the hit arc
    measures from the aim.
  - A swing plants the feet: the player brakes to a stop, and input does not turn the body
    until the fist is back. The clip is a standing punch, and a body carried along under it
    skates.

**Evidence.**
- `qa/gta-upgrade/punchbench.html` renders the player's figure (the game's own update) and a
  target, freezing both swings at their peak from the side and from behind.
- `evidence/run12-punch/punch-before.png` and `punch-after.png` are its output on the code
  before and after this fix.
- **Live headless (HIGH, day, player mode).**
  - A punch locked onto a nearby pedestrian, and the body turned onto the aim exactly:
    figure yaw −3.430 against an aim of 2.853, the same angle.
  - At the peak the fist was 0.77 m forward and 0.08 m to the side, and the hit landed.
  - 0 errors, 0 exceptions.
- `tests/punch-aim.test.mjs` has seven tests. Each fails on the code before the fix:
  - fist in front for both clips, standing and walking;
  - no torso twist;
  - lock-on turns the swing and lands the hit;
  - standing swings go where the camera looks;
  - the aim tracks through the wind-up and then holds;
  - the feet plant;
  - a reset mid-swing hands the whole body back to the gait (caught during this fix: the weights
    outlived `reset()` and blended toward the bind pose).
- **Gates:** typecheck clean; `npm test` 503 tests, 498 pass, 5 skipped, 0 fail;
  `npm run test:ci` 0 fail.

**Still not done.**
- **No lunge.** A hit still registers up to `COMBAT.range` (1.75 m, centre to centre) while
  the fist reaches about 0.9 m. At the far end of the range the victim reacts to a fist that
  stopped short. Closing that needs a step-in clip; sliding the planted feet forward would
  trade one visible fault for another.
- **Not seen at a real frame rate.** Headless runs at 0.1 fps. The swing needs to be watched
  on real hardware.

## 9l. The player bumps into people, fights to four blows, and steers the right way (branch `claude/player-crowd-contact`, from `master` `3e15698`)

**Plan:** `docs/PLAN-PLAYER-CROWD-CONTACT.md`. Implemented in a local Claude CLI session on the
user's Windows PC and checked there in Chrome (HIGH, day). No physics engine, and no
pedestrian-versus-pedestrian collision, as decided.

**What changed, in the plan's order.**
- **Step 0, left and right (`1789913`).** The course sent strafe +1 toward world +x at heading 0,
  where the follow camera's right is world −x, so the touch pad, A/D and the stick all walked
  mirrored. The strafe term is flipped in `controller.step()`; the input sources are untouched.
  The car was already right (right input lowers the heading); both are pinned by
  `tests/steer-direction.test.mjs`, which takes the right vector from the game's own cameras.
- **Step A, contact (`a060c54`).** New `src/player/crowd-contact.mjs`, pure:
  - `bodiesNear` reads the crowd's own 2 m grid, 3×3 cells, and skips the player's slot, the down,
    the dead, and anyone more than 1.2 m above or below.
  - `resolveStep` opens an existing overlap (the player takes at most a third), removes the part
    of the step that would press into a body (a slide), tries the step turned a little either
    side when blocked head-on, and when boxed in still moves the player at 0.45 m/s.
  - It runs in `controller.step()` before `advance()` (walls), through an optional `bodies` hook
    wired to the life system's simulation. With no crowd the step is identical, frame for frame.
- **Step B, giving way (`a76a6c3`).** `yieldToPlayer` extends `reactToRunner`, which it still
  calls at a run. A walking player's cone (1.6 m, 0.7 m either side) and anyone walking squarely
  at them within 2 m step aside with the slow car's dodge flee: 0.35–0.5 m by id, or enough to
  clear the shoulder (at most 0.8 m) for someone right on the line; an oncoming walker on the
  line picks the side by id.
- **Step C, the bump (`e5f8bb6`).** A light flinch (0.25 s) or, at ≥ 3.7 m/s, a strong one and a
  ~0.6 m stagger off rails; a dodge for anyone on rails; ~30% of ids say something, a sprint bump
  a low pain voice and the body thud at low gain; the player loses 40% of their pace on the
  frame; a small camera knock through the feedback bus (`player_bump`). One draw from the
  simulation's seeded rng starts a fight 30% of the time, through `melee.provoke()`, which is the
  same `engage()` a punch uses and counts no swing, hit or witness. The HQ body flinches and then
  looks at the player (`blow` response `'look'`: LOOK is the state that turns the head; the plan
  said `'backoff'`, which does not).
- **Step E, health (`a758742`).**
  - Both sides do 25 (`COMBAT.playerDamage` 34 → 25, `npcDamage` 14–18 → 25): four blows.
  - Everyone punched fights back; temperament still decides what witnesses do.
  - **The kerb rule now holds for the Scramble cast.** `onRails` (exported from `combat.mjs`) is a
    crossing, or a cast member walking the track. Before, `choreographed` alone counted, and since
    the cast is always cast, a punched cast member never fought back anywhere. At a kerb the
    choreography now holds a hostile cast member, and whatever combat moves them is kept as their
    flee offset, so they walk back to their slot afterwards.
  - A traffic car on foot takes 25, throws the player 1–1.5 m through `advance()`, gives control
    back after 1 s, and has a 1.5 s grace; only the hit that reaches 0 is a death.
  - The dashboard health bar (`role=meter`, the number beside it, green / amber at half / red on
    the last quarter), and a game-over dialog (「ゲームオーバー」, 「もう一度」 → `revive()` at 100).
    It is a dialog, not `role=alert`, which is the error banner.

**Found on the device check, and fixed (`50cc98e`, `e90b84f`).**
- **People walked through the player** (minimum gap 0.14 m on the first live walk). A dodge is a
  request; the cast walking a track through the player, someone squaring up, someone fleeing or in
  cooldown did not act on it, and the cast's flee offset closes back onto the track line. Now:
  - whoever is still inside the player's circle after the step is moved out by their share
    (`pushOut`), only onto ground `fleeAllowed` permits, and for the cast through the flee offset;
  - at ~6 fps the crowd takes several 30 Hz steps after the player's step and walked back in before
    it was drawn. `CrowdSimulation.update` calls an optional `postUpdate(dt)` after its steps; the
    scene sets it to `player.settleCrowd()` each on-foot frame (cleared at the start of every
    frame), which moves out whoever the crowd walked in.
- **A fight froze a crossing.** `simulation.move` stopped anyone with a live `combatTarget` where
  they stood, crossing or not. An ordinary walker admitted to a crossing but still on its pavement
  end could be punched or provoked, and held the signal group for 14 s. They now keep walking and
  fight at the far kerb.
- **A stopped car kept hitting.** A van stopped on the player and took 25 each time the grace ran
  out (100 → 50 in 2.5 s), because the throw was along the car's heading. A car under 1.5 m/s no
  longer hits (the old code killed the player for walking into a car waiting at a light), and the
  throw goes sideways out of the car's path.

**Cost.** `qa/gta-upgrade/contact-cost.mjs`: 1,978 walkers, the hero cast mid-crossing, the player
walking 600 frames through the densest 4 m cell; the contact step plus the give-way, per frame.
The first measurement was 0.081 ms mean / 0.219 ms p95 against the plan's 0.05 / 0.15. Hot, the
same calls take ~16 µs; the rest was reading flags off ~50 large pedestrian objects, twice, with
cold caches. `771c735` rejects by distance first, gathers the people round the player once a frame
(`contact.nearby`, shared with the give-way), and gives way once per crowd step (the crowd only
moves on its 30 Hz step). Five runs after that, on this PC with Chrome open: **mean 0.049–0.062 ms,
p95 0.136–0.168 ms** — on the target at best and up to ~25% over it. Machine-dependent; not a
performance acceptance. These runs predate `50cc98e`, which adds the push-out and the settle pass
(both read the frame's `nearby` list; no extra grid scan). In the browser, walking in the crowd was
not slower than standing in it (6.7 / 7.4 fps against 6.3 / 7.2), and the contact step measured
0.03–0.15 ms in ~150 ms frames.

**Device check** (`evidence/player-contact/device-check.json`, with three screenshots).
- **60 s walk**, steered into the densest people every 2 s, HP topped up so fights did not end it:
  - first 40 s, on the pedestrian green: **minGap 0.552 m**, trapped 1.5 s;
  - whole 60 s (the last 20 s after the green, into kerb crowds packed on the cast's 0.32 m slot
    grid): **minGap 0.496 m, trappedSeconds 6.1 s**. The minGap target (0.5) is met on the green
    and missed by 4 mm overall; **trappedSeconds (< 1.5) is missed**: packed kerbs are shoved
    through at 0.45 m/s.
  - 178 bumps, 49 fights (28%, against 30%), signals kept cycling (the end-of-phase hold was six
    cast members still walking, 6–40 m away, the normal clear-out).
- **Left and right:** D walks along the camera's right (1.00), A along its left (−0.92); in the car,
  W+D turns right (heading −2.89 rad, 14.3 m to the right) and W+A left.
- **Four blows both ways:** the HP bar went 100 → 75 (green) → 50 (amber) → 25 (red) → 0 and the
  game-over dialog came up; 「もう一度」 revived at 100. An isolated pedestrian went
  100 → 75 → 50 → 25 → 0 and down on the fourth punch.
- **Cars:** four hits, 100 → 75 → 50 → 25 → 0, thrown 1.28 / 1.40 / 1.49 m, no second hit inside
  3 s, then 「車に轢かれました（taxi）」.
- **Console:** 0 errors, 0 exceptions, no `[role=alert]` banner. Two three.js program-log
  **warnings** (D3D `X4122 ... cannot be represented accurately in double precision`), not errors;
  this branch changes no shader, and they were not traced further.

**Tests.** `tests/steer-direction.test.mjs`, `tests/crowd-contact.test.mjs` and
`tests/player-health.test.mjs` are new and registered. Each behaviour test failed on the code
before its change; the no-crowd, buffer, LOD and wall-throw tests are guards and pass on both.
Tests that encoded the old rules were updated and say so: the diagonal-course test in
`locomotion.test.mjs` (the old sign), the temperament test in `combat.test.mjs` (everyone fights
now), and the punch count in `player-experience.test.mjs` (four, not three).

**Still not done / limitations.**
- **Walking into a dense crowd is deadly.** 30% of bumps start a fight and every fighter does 25,
  so the first live walk (before HP top-up) lost all 100 HP in about 8 s; the 60 s walk lost 275 HP
  in its last 20 s. This is the rule as asked; whether to cap attackers or lower the chance is the
  user's call.
- trappedSeconds in packed kerb crowds (above); the bench is at or up to ~25% over its target.
- The touch pad and the phone cost are not checked here (the phone check is after merge).
- The contact uses the simulated positions (`p.x/p.z`). On the first device walk the drawn
  (`renderX/renderZ`) and simulated minimum gaps were identical; the final walk measured the
  simulated ones only. Colliding against the drawn positions was not needed.
- The two shader warnings above.

## 9m. Looks and fleet, Step A — patterns on clothes (branch `claude/looks-fleet-1`, from `master` `9435b53`)

**Plan:** `docs/PLAN-LOOKS-AND-FLEET.md` Step A. Implemented autonomously in a local Claude CLI
session on the user's Windows PC and checked there in Chrome (HIGH, day and night).

**What changed.**
- **`src/life/garment-pattern.mjs` (new).** Seven patterns: solid, border, pinstripe, check,
  two-tone open jacket, denim and a small print. One GLSL function, `garmentPattern(base, id, p)`,
  drawn on the **bind-pose position** (before skinning), so a stripe is on the cloth and never
  slides across a walking body. Both CC0 rigs are authored at ~1.8 m in model units, y up, facing
  +z, so bind-pose metres are already body-relative; the per-person height scale then scales the
  stripes with the person. Every pattern fades to its flat colour once a pixel covers a good part
  of its period (`fwidth`), which removes moiré at distance.
- **No new attribute.** The top and bottom colours drop to 7 bits a channel and carry a 3-bit
  pattern id in the top bits (`packGarment`): still < 2^24, so float-exact. Skin, hair and shoe
  keep their 8-bit packing. Colour error ≤ 1/255. The HQ fragment shader unpacks with
  power-of-two divisions after rounding (`floor(v+0.5)`), so varying interpolation cannot flip
  the id.
- **Recipe (`appearance.mjs`).** `patternOf(id)` picks a top and bottom pattern with weights by
  life archetype (`PATTERN_WEIGHTS`): office workers solid and pinstripe, young people border,
  check and print, older people solid, joggers plain. The life archetype is read from the id the
  way `CrowdSimulation.spawn` assigns it (`styleOf`), because the HQ layer only has the id and the
  RUN 6.8 rule is that a look is a pure function of it. `deduplicate` still moves only a shirt
  colour, never a pattern.
- **Near characters (`character-asset.mjs`).** The RUN 6.8 garment material embeds the same GLSL
  string, with a `uPattern` uniform. The player's `WARDROBE` stays solid, so the red top stays
  findable.

**Found on the device check, and fixed.** At night about eight near humanoids around the player
wore the player's red top. `dressCitizen`'s `onBeforeCompile` read the palette the material was
**constructed** with; the near pool recolours a slot as soon as it hands it out, often before the
material's first compile, and `recolour` only updates uniforms that already exist. So anyone
handed a slot before its first frame was drawn in `WARDROBE` (red). The compile now reads the
palette as it is at compile time (`material.userData.palette`). This predates Step A.

**Device check** (`evidence/looks-fleet/step-a/`, baseline in `evidence/looks-fleet/baseline/`).
- A/B in one session, `?qa=1&tier=high&time=day&camera=street`: 5.5 fps / 345 draw calls with
  Step A, 5.5 fps / 343 with the Step A shaders stashed. No measurable cost. (The same URL ran at
  8.8 fps earlier in the night; fps between sessions on this PC is noise, compare within one.)
- Night street, player mode: 5.2 fps, 479 draw calls, 8 near humanoids, no `[role=alert]`,
  0 console errors from the page loads after the fix.
- Screenshots: patterns on bodies next to the player by day, the red-top bug and its fix at night,
  and distant figures fading to flat colour.

**Tests.** `tests/garment-pattern.test.mjs` (10, registered in `test:ci`): pure by id, shares
within ±3% per life archetype (200,000 ids), pack/unpack for every palette colour × every id,
the HQ crowd writes the id, HQ and near embed the identical GLSL string and use the bind-pose
position, every preprocessor line starts its line, the crowd attribute set is unchanged (≤ 16
slots), the player stays solid, `deduplicate` keeps patterns, and a slot recoloured before its
first compile is drawn in the new colours. The last one fails on the old `onBeforeCompile`; the
rest fail on the pre-Step-A code (the module did not exist).

**Not done / limitations.**
- Shimmer was judged from stills at ~5 fps, not watched at 60 fps. The phone and MEDIUM on the
  device are not checked.
- The print dots and check squares are drawn in the bind-pose x–y plane, so they stretch on the
  sides of the body (where the surface faces x). Stripes along y are unaffected.
- The open-jacket panel is a band at |x| < 6 cm on the front; on the long-hair body it can meet
  the hair.

## 9n. Looks and fleet, Step B — the fleet on the loft, in five batches (branch `claude/looks-fleet-2`, on `claude/looks-fleet-1`)

**Plan:** `docs/PLAN-LOOKS-AND-FLEET.md` Step B.

**What changed.**
- **`src/traffic/fleet.mjs` (new).** `fleetGeometry(type)` maps the loft (`buildVehicleShape`,
  detail 0) onto the five traffic parts: paint → body, glass → glass, lamp → front, tail → rear;
  dark, the plate and the four wheels (fixed at their anchors) → dark. A taxi gets a roof sign in
  `front` (`VEHICLES.taxi.roofSign`). The scooter keeps its box geometry; the loft has no
  two-wheeler.
- **Five draws for all traffic.** `createFleetBatches` builds one `BatchedMesh` per part holding
  every type's geometry; instance *i* of every batch is pool slot *i*. A slot changes type with
  `setGeometryIdAt`, hides with `setVisibleAt`, and a type that lacks a part (the scooter's glass)
  hides that instance. Names are `traffic-fleet-<part>`, so `day-night.mjs`
  (`^traffic-.*-(front|rear)# GTA Fidelity Master Plan — status and handoff

The one document to read when resuming this work with no conversation history. Read
`AGENTS.md` and `CLAUDE.md` first for the repository rules, then this.

**Latest section: §9i (crowd realism, branch `claude/crowd-realism`).** Earlier header text: **Updated at the close of RUN 7C.** RUNs 0–6, 6.8, 7A, 7B and 7C are complete. RUN 7 proper —
the NPC behaviour work — is still only an unverified WIP commit; see §10.

## 1. Goal

Turn the Shibuya scramble scene into something that reads like a GTA-style street: a player
you can walk, run, fight and drive with, in a crowd that reacts, at a fidelity that holds up
when the camera is two metres from a person's face. Fourteen RUNs, sequential, each closed
with tests, in-browser verification, numbers, and a commit before the next begins.

Not a goal: a physics rewrite, an engine swap, or a photoreal character. The Superhero body
in use now is a placeholder for the pipeline, not the final visual asset.

## 2. Branch and HEAD

- Current work lands on `master` through PRs: #19 (RUN 10–11), #20 (crowd realism, §9i) and
  #21 (RUN 12, the final RUN, §9j, branch `claude/happy-tesla-dkn52d`). The punch fix found on
  real hardware after that (§9k) is on the same branch, restarted from `master` `c1b89c6`. Player crowd contact,
  four-blow fights and the left/right fix (§9l) are on `claude/player-crowd-contact`, from `master` `3e15698`. The historical working
  branch **`claude/gta-fidelity-upgrade`** is merged and no longer where work happens.
- RUN 10.1 handoff HEAD: **`76dc411`**. RUN 10.2–10.5 follow it on this branch; RUN 11 starts
  from `b037bc8` (§9h). Use `git log -1` for the current HEAD. Older HEAD lines and the old
  roadmap lower in this document are historical snapshots and are superseded by §9g.
- RUN 8 and RUN 9 are complete. The old RUN 7 WIP at `f6aa8e8` was found active in production
  and replaced by the single HQ authority in RUN 10.1.
- `master` is untouched by this work and must stay that way. It moved ahead independently
  (PRs #17 and #18 from `codex/prebaked-motion`); the local `master` here is `c538aa2`, a
  clean ancestor of the remote `39175bd`. Nothing has been merged into or pushed from it.

Checkpoint history, newest first:

```
cd5c1bb  RUN 8.4: let a punch reach the crowd it is standing in
986429c  RUN 8.3: pin crossing-safe combat and the death loop against the real controller
04ca156  RUN 8.2: stop the vehicle shadow shader redeclaring what three.js injects
01f57d1  RUN 8.1: melee lands when the fist arrives, not when the button is pressed
9a2e62a  RUN 7C complete: document the colour space fix and the knockdown chain
03fcd5b  RUN 6.8: Break near-humanoid clone appearance
3e9213b  Prepare ChatGPT Work handoff
f6aa8e8  RUN 7 WIP: NPC awareness state machine - NOT verified, NOT complete
b32e5a7  RUN 6 complete: handoff status document
cdb6271  RUN 6.7: near-pool budgets on every tier
09f8841  RUN 6.2: hold the near-humanoid budget at its limit under a real crowd
93085fb  RUN 6.1: stop the shader warm-up polling materials that are already gone
6b1f967  RUN 6: give the nearest citizens the player's body
```

## 3. RUN summary

| RUN | Subject | State |
| --- | --- | --- |
| 0 | Baseline capture | complete |
| 1 | OSS mapping | complete |
| 2 | Humanoid pipeline (Quaternius, CC0) | complete |
| 3 | Vehicle visual fidelity | complete |
| 4 | Locomotion (gait ladder, blends) | complete |
| 5 | Foot IK (player only) | complete |
| 5.5 | Animation audit — the whole candidate pool | complete |
| 5.6 | CMU run retarget POC | complete, not integrated as-is |
| 5.7 | Hybrid run (CMU lower + Quaternius upper) | complete, **adopted** |
| 6 | Near-NPC visual upgrade | **COMPLETE** |
| 6.8 | Near-humanoid clone break | **COMPLETE** |
| 7A | Massive HQ reactive crowd POC | **COMPLETE (POC)** |
| 7B | HQ crowd integrated into Shibuya | **COMPLETE** |
| 7C | HQ crowd colour / lighting integration | **COMPLETE** |
| 7 | Historical NPC awareness WIP | superseded in RUN 10.1; never a second production authority |
| 8 | Melee combat phases + mass crowd reaction | **COMPLETE** |
| 9 | Vehicle occupancy / enter-exit / carjacking | **COMPLETE** |
| 10 | NPC life / awareness consolidation | complete: browser acceptance closed 2026-09-23 (§9g) |
| 11 | Visual / audio / GTA feel polish | **COMPLETE** 2026-09-23 (§9h) |
| 12 | **Final**: performance guard, recorded audio, wet-road reflection, PBR ground, motion, robustness, final QA | **COMPLETE** 2026-09-24 (§9j) |
| 13 | Performance / stability | folded into RUN 12 |
| 14 | Final QA and handoff | folded into RUN 12 |

**Current authority:** `src/life/hq-awareness.mjs` (RUN 10.1 onward). The old
`src/life/awareness.mjs` is deprecated historical code with no production import. The RUN 7
notes below describe the old state at that time, not a second running system.

Each RUN has its own note under `docs/` (`RUN2-…`, `RUN3-…`, `RUN4-…`, `RUN5-…`,
`RUN5-5-…`, `RUN5-6-…`, `RUN5-7-…`). They carry the measurements; this file carries the state.

## 4. Architecture, in one screen

`app/ShibuyaScene.tsx` orchestrates a **module system**: each stage (`ground`, `buildings`,
`heroes`, `station`, `signs`, `streetscape`, `traffic`, `life`, `trains`, `construction`,
`nightglow`) is built asynchronously through a build queue and reports into a startup trace.

Two rules the rest of the code depends on:

- **Physics is the source of truth; visuals follow named anchors.** A `CharacterAsset` or
  `VehicleAsset` exposes anchors, and the figure code positions meshes to them. Keep this
  abstraction — it is what lets a baked figure and a 65-bone humanoid be interchangeable.
- **Prebaking is not optional.** Startup time is a hard constraint. Derived data is baked
  offline (`npm run bake:static`) and loaded, never regenerated at startup.

## 5. Character system

Upstream: **Quaternius Universal Base Characters + Universal Animation Library \[Standard\]**,
CC0-1.0, verified from the bundled `License.txt` and by SHA-256 against independent mirrors
(the official hosts are egress-blocked here; only `github.com` and `raw.githubusercontent.com`
are reachable). Provenance is recorded in `docs/CHARACTER-ASSET-PROVENANCE.md`. Upstream
archives are never committed — `/assets/character/upstream/` is gitignored.

Skeleton: 65 bones, UE naming (`root, pelvis, spine_01..03, neck_01, Head, clavicle/upperarm/
lowerarm/hand_l|r`, fingers, `thigh/calf/foot/ball_l|r`).

**Two facts about this rig that have caused bugs three times each. Read them before touching
bone space:**

- **The skeleton is Z-up in bone space.** `pelvis` rest position is `(0.005, 0.086, 0.877)` —
  the height is the `0.877` on **Z**. Writing a world-space Y into `pelvis.position.y`
  displaces the character *backwards*, and the stats will happily report the displacement you
  asked for. Convert world-down into the parent frame and divide by parent scale.
- **The rig's forward is +Z.** The controller advances by `(sin h, cos h)`.

Variation is a **uniform write, not a second asset**: the garment mask carries skin, top,
bottom, hair and shoes in vertex-colour channels, so recolouring costs no recompile and no
per-body material. Thirty-two unique assets is explicitly not the approach.

## 6. Locomotion

`src/player/locomotion.mjs`. Gameplay speeds are fixed (`PLAYER.walk` 1.5 m/s, `PLAYER.run`
4.2 m/s) and are never moved to suit an animation. A clip is driven at
`period = blended stride / ground speed`.

Constants that encode decisions: `LOCOMOTION.gameplayTop` 4.2, `LOCOMOTION.maxAsymmetry` 0.08
(keeps `Sprint_Loop`, whose contacts are 0.538 not 0.500, out of the gameplay blend),
`LOCOMOTION.minPeriod` 0.62 (0.72 made the feet imply 3.73 m/s at a 4.2 m/s ground speed,
which is foot sliding).

**At a fixed speed, step length and cadence are the same fact** — `step = speed / (spm/60)`.
They are not two things a clip can independently get wrong. At 4.2 m/s, 160–170 spm fixes the
step at 1.48–1.58 m.

## 7. Foot IK

`src/player/foot-ik.mjs`. **Player only.** 13 µs/frame, allocation-free, ~3.9 ground queries
a frame.

Its role is bounded and the boundary is deliberate, stated in the file header and repeated
here because it is the thing most likely to be eroded: **foot IK adapts a correct animation to
the terrain. It does not correct the animation.** If you are adding an absolute-height term to
close a contact number, you are crossing that line. A bad clip pose is an asset problem.

## 8. Hybrid run

`assets/character/hybrid-run.json` (17.8 KiB) — the only CMU-derived artefact in the repo,
carrying provenance for both halves. `scripts/convert-character.mjs` folds it into the `Run`
clip at conversion time, so the runtime sees an ordinary clip: **no second mixer, no second
skeleton, no second SkinnedMesh.**

CMU Graphics Lab Motion Capture Database via the cgspeed BVH conversion: *"CMU places no
restrictions… free for use in research and commercial projects worldwide."* Acknowledgment
requested (mocap.cs.cmu.edu, NSF EIA-0196217), not required.

Lower body is CMU 16_45, within 0.022° of the source across 9 bones × 24 phases (asserted by
`tests/hybrid-clip.test.mjs`); upper body is Quaternius; the hips→spine boundary is corrected.
Gait: stride 2.687 m, speed 3.793 m/s.

**Closed.** Do not reopen run-candidate search, CMU subject search, arm retarget or gait
研究 — RUN 5.7 settled it.

## 9. Near NPCs (RUN 6)

`src/life/near-characters.mjs`. The pool beside the player is **two pools**: the nearest few
wear the same 65-bone humanoid the player wears, the rest keep the offline-baked figure.

```
NEAR_LIMITS     high 32   medium 12   low 4     (total slots)
HUMANOID_LIMITS high  8   medium  4   low 0     (of those, humanoid)
NEAR_IK_LIMITS  high  8   medium  4   low 0     (of those, foot IK)
```

Measured (`qa/gta-upgrade/tierprobe.mjs`, 300 people, 600 frames of churn):

| tier | slots | humanoid | baked | triangles | draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| HIGH | 32 | 8 | 24 | 215k | 168 |
| MEDIUM | 12 | 4 | 8 | 93k | 60 |
| LOW | 4 | 0 | 4 | 15k | 24 |

Per rig, a humanoid is **4.1× the triangles of a baked figure and half the draw calls** —
three meshes against six. What scales here is skinning and bone matrices, not batches.

Three design points that are load-bearing:

1. **A slot's kind comes from the pool's quota, never from a candidate's per-frame rank.**
   Rank churns; keying kind to it makes the pool build a new humanoid every time a holder
   drifts down the list. That shipped once and reached 28 humanoids against a budget of 8.
   Filling the quota first makes the bound structural.
2. **Budget alone is not the goal.** Eight humanoids on the eight furthest people satisfies
   every bound and misses the point. One swap per frame between the furthest-fallen humanoid
   holder and the highest-ranked citizen on a baked figure, with a four-rank hysteresis band,
   moves the aim from 18–35% to 84–85% of the nearest eight.
3. **The humanoid arrives late, exactly as the player's does.** A session that never finishes
   loading it runs on baked figures throughout and nothing waits.

Priority order is unchanged from before RUN 6: combat target, then reacting pedestrian, then
nearest. Body quality follows rank; it does not set it.

### RUN 6.1 — the `isReady` error, root-caused

`TypeError: Cannot read properties of undefined (reading 'isReady')` at city build. It was
**not** caused by RUN 6 (it reproduces with those changes stashed) and it is not three.js
misbehaving.

`WebGLRenderer.compileAsync` polls materials every 10 ms until they report ready, and the poll
has no stop. Each tick reads `properties.get(material).currentProgram`, and `WebGLProperties.
get` returns a fresh empty object for a material it no longer holds — which is what
`deallocateMaterial` leaves behind. Disposing a material mid-wait therefore throws, from
inside a `setTimeout`, where neither the `try/catch` around the call nor the promise's
`.catch` can see it. Every build stage warms up the subtree it just added, and any teardown
disposes those materials.

Reproduced deterministically: tear the page down 4 s into the build and it throws; at 6 s and
8 s, with compilation finished, it does not.

Fixed by owning the warm-up — `src/quality/warmup.mjs`. It drops a material when that material
dispatches its own `dispose` event, treats a vanished property record the same way, cancels
every poll when the owner is disposed, and gives up at a deadline. **Nothing is caught and
nothing is silenced.** `tests/shader-warmup.test.mjs` reproduces the original TypeError
against the unfixed module.

## 9a. RUN 6.8 — near-humanoid clone break

RUN 6 met every criterion it set: humanoid budget held at 8, far crowd 1,978, console errors
0, foot IK bounded, all three tiers within budget. **The visual result was still wrong.**
Eight people who differ only in colour read as one person recoloured eight times, and no
amount of extra palette entries fixes that, because the thing the eye reads is *shape*.

RUN 6.8 gives them different shapes. Evidence, from the same camera:
`node qa/gta-upgrade/lineup.html` — **before: 1 silhouette across eight citizens. After: 4.**
`?before=1` reproduces the RUN 6 appearance model exactly, so the comparison is a comparison.

### Four archetypes, from assets already verified

| archetype | rig | hairstyle | height × | build × |
| --- | --- | --- | ---: | ---: |
| casual | Superhero_Male | `Hair_SimpleParted` | 1.000 | 1.00 |
| long hair | Superhero_Female | `Hair_Long` | 0.955 | 0.95 |
| cropped | Superhero_Male | `Hair_Buzzed` | 1.035 | 1.05 |
| short bob | Superhero_Female | `Hair_SimpleParted` | 0.975 | 0.97 |

Both bodies and all three hairstyles come from the Quaternius pack downloaded and licence-
checked for RUN 2. **No new asset, no new rig, no retargeting.**

### The two rigs do not share a rest pose — this is the load-bearing fact

Bone *names* match, which is all the old single-hairstyle merge ever checked. The rest poses
do not: **64 of 65 bones differ, the upperarms by 7.1 cm and the clavicles by 4.6 cm.**
Binding the female mesh to the male skeleton would have flattened her shoulders by that much.
`qa/gta-upgrade/bindcheck.mjs` prints it.

So each body keeps its own armature, and what is shared is the thing that actually costs:
**one set of AnimationClips**. Clip tracks address bones by name, so one clip array drives
either rig and a mixer binds it to whichever root its instance has. Four archetypes cost four
bodies' worth of geometry and **one** animation library.

### Two things glTF does that will break this if undone

1. **It strips punctuation from node names and suffixes duplicates.** `rig:m` came back as
   `rigm`, and the second rig's hair as `hairHair_Long_1`. Matching is therefore done on
   `userData`, which survives as glTF `extras`.
2. **It renames the second armature's bones** — `pelvis_1`, `thigh_l_1`, … Since a mixer
   resolves tracks by name and foot IK looks its joint chain up by name, the female rig would
   have silently animated nothing. The names are restored **by index** at load (bone order is
   identical and checked at bake time; a pattern would be guesswork, as `spine_01` and
   `index_01_l` already end in digits). Safe because a name only has to be unique within the
   tree it is resolved against, and an instance clones exactly one rig.

Hair is a separate mesh now rather than merged into the body: merging stores a whole body per
hairstyle, separate meshes let the exporter keep each body once and each hairstyle once.

### Appearance is a pure function of the pedestrian id

`src/life/appearance.mjs`. Archetype, skin, hair colour, top, bottom, shoes, height and build
all come from one well-mixed hash read at disjoint bit ranges, so the choices do not
correlate — reading several with `id % n` gives visible repeating runs down a pavement.

**Nothing comes from the pool, the frame, the tier, or the neighbours.** The pool recycles
slots constantly and reorders every frame; anything reading from it would make people change
clothes as the camera moves, which is worse than the clone problem. Walk away from someone
and walk back and they are the same person.

The one exception is `deduplicate`, and it is bounded: among the handful on screen it may move
a **shirt colour** and nothing else, walking them in ascending id so the same set of people
always gives the same answer whatever order the pool holds them in. Silhouette is never
negotiated at runtime.

### Slot allocation — a fixed spread, not demand chasing

Humanoid slots hold a round-robin spread: two of each archetype at HIGH, one at MEDIUM. Every
archetype is therefore on screen whenever the slots are full.

The first version chased demand — rebuild whichever spare slot the crowd currently wanted. At
300 people the near radius churns faster than that can settle: it converged on **two**
archetypes visible out of four, after fifty rebuilds. The fixed spread needs none.

A citizen takes a humanoid of their **own** archetype or a baked figure, never someone else's
silhouette. That costs aim — the RUN 6 swap that pulled good bodies toward the camera had to
become a swap *between people of the same archetype*, and nearest-eight coverage settles at
**71–74%** against RUN 6's 84–85%. A baked figure at four metres is a smaller lie than the
same face on a different body.

### Skeletons per body: 3 → 1

`SkeletonUtils.clone` gives every SkinnedMesh its own `Skeleton`, each owning a bone matrix
texture, although they share one set of bones. A citizen was paying for three and would have
paid for four once hair was split out. They are collapsed onto one.

### Measured

| | RUN 6 | RUN 6.8 |
| --- | ---: | ---: |
| archetypes on screen | 1 | **4** |
| humanoid budget (HIGH / MED / LOW) | 8 / 4 / 0 | 8 / 4 / 0 |
| near baked (HIGH) | 24 | 24 |
| far crowd | 1,978 | 1,978 |
| skeletons per humanoid | 3 | **1** |
| mixers per humanoid | 1 | 1 |
| meshes per humanoid | 3 | 4 |
| pool draw calls (HIGH) | 168 | 176 |
| pool triangles (HIGH) | 215k | 215k |
| slot rebuilds over 900 frames | — | 0 |
| foot IK | 8 | 8 |
| console errors | 0 | **0** |

Feet, with no IK, against a flat floor — the pre-existing Run float is neither introduced nor
worsened:

| clip | RUN 6 | RUN 6.8 (same body) | RUN 6.8 (all four archetypes) |
| --- | ---: | ---: | ---: |
| Idle | −8.3 mm | −8.2 mm | −8.6 … −4.7 mm |
| Walk | −7.5 mm | −7.4 mm | −7.8 … −2.3 mm |
| Run | 61.3 mm | 60.3 mm | 58.3 … 71.2 mm |

Payload:

```
RUN 6    citizen.glb  1,414,612 B   1 body,  1 hairstyle, 15 clips
RUN 6.8  citizen.glb  2,260,380 B   2 bodies, 3 hairstyles, 15 clips SHARED   (1.60x)
naive 4 separate character files   ~5,658,448 B                               (2.50x)
saved by sharing the clip library  ~3,398,068 B
```

### What RUN 6.8 deliberately did not do

No clothing geometry — no skirts, jackets, hoodies or bags. The garment mask paints clothes
onto the body; a skirt is a mesh, and meshes are new assets. No accessories, no faces beyond
the two the base bodies have, no clothing physics. The reference image this run was measured
against shows all of those; they are a future asset question, not a distribution one.

## 9b. RUN 7A — massive high-fidelity reactive crowd (POC)

The question RUN 7A had to answer: can a scramble crossing hold ~2,000 people who all look
like RUN 6.8 citizens **and** can all react to a car, without a skeleton each?

**Yes.** 1,978 of them, in a browser, cost **4 draw calls, 0 skeletons, 0 mixers and 0.3 ms
of CPU per frame.**

### Architecture: a shared GPU bone animation atlas

Chosen by measuring the alternatives, not by preference:

| candidate | payload | verdict |
| --- | --- | --- |
| Vertex animation texture | 5.5 MiB per archetype (22 MiB for four) | rejected — 60× the size |
| **Bone matrix atlas** | **618 KiB total, shared by every archetype** | **chosen** |
| Baked vertex frames | same order as VAT | rejected |
| Extend the old primitive crowd | cheap, but the bodies stay capsules | rejected |

A VAT stores every vertex at every frame. A bone atlas stores every *bone* at every frame —
65 bones × 203 rows × a 4×3 matrix — and works precisely because RUN 6.8 already gave every
archetype **one shared clip set**; they differ only in which vertices hang off those bones.

What that buys:

- **No `Skeleton` and no `AnimationMixer` per citizen, at any population.** A test asserts it.
- Clip and phase live in instanced attributes; the vertex shader turns them into an atlas row
  and skins from it. **Time advances on the GPU**, so a walking crowd costs the CPU nothing
  between state changes.
- **Draw calls follow the archetype count, not the population** — four meshes, two thousand
  people.
- State is typed arrays. A citizen is an index, not an object graph.

### The ladder (STEP 7 / 20)

CPU per frame, Node, `qa/gta-upgrade/hq-ladder.mjs`:

| citizens | update ms | µs/citizen | draws | tris (L1) | tris (L2) | heap |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 32 | 0.077 | 2.41 | 4 | 176k | 73k | 0.5 MB |
| 128 | 0.056 | 0.44 | 4 | 701k | 290k | 0.6 MB |
| 256 | 0.081 | 0.32 | 4 | 1.39M | 574k | 2.0 MB |
| 512 | 0.134 | 0.27 | 4 | 2.73M | 1.13M | 1.9 MB |
| 1024 | 0.298 | 0.29 | 4 | 5.51M | 2.27M | 1.8 MB |
| **1978** | **0.519** | **0.26** | **4** | 10.7M | **4.41M** | 1.8 MB |

Per-citizen cost is **flat in the population** (0.26–0.44 µs), which is the property that
matters: nothing here is O(N²) or allocating per person.

**PLATINUM and the ~1978 target are both reached** on the CPU side. The remaining limit is
GPU vertex throughput, not this code — which is why the LODs exist (L2 is 14% of L0's
triangles). SwiftShader frame rates are recorded in the bench and are explicitly **not** used
as acceptance, per the project rule.

### Mass reaction (STEP 9–13)

A car at 14 m/s through 1,978 in a dense block, **simultaneously**:

```
200 looking   286 fleeing   37 down        <- at the same instant, not cumulative
172 knocked down in ONE frame, in 0.45 ms
```

The requirement was twenty. In the browser, 1,200 with a car running through them holds 188
looking and 104 fleeing at 6 draw calls and 0.3 ms.

The spatial grid is why that is affordable, and the claim is checked: the same population
queried at four densities gives 1369 → 625 → 289 → 121 candidates. **Cost follows the radius
and the density, never the population.**

Knockdown is an impulse, a drag and a ground clamp — no rigid body, no ragdoll. Which side of
the car's centreline a body is caught on decides where it goes, so a row of people is not a
row of dominoes, and a test pins that.

**Identity survives everything.** Appearance, archetype, phase and height are the same
function of the pedestrian id used by RUN 6.8, so being hit by a car cannot change who
someone is — asserted directly.

### Three things found by looking rather than reasoning

- **The first bake gave everyone claws.** Forty of the sixty-five bones are finger joints;
  their vertices are dense and adjacent, and vertex clustering merged them into one
  representative carrying a single finger's weights. Finger weights are now folded into the
  hand before decimating.
- **The crowd looked bare-legged.** The garment mask was correct; the palette was not. Beige
  trousers read as skin when a hem is four vertices wide at LOD2. Every trouser colour is now
  darker than every skin tone, pinned by a luminance test.
- **three's `SimplifyModifier` is unusable here** — it keeps position, normal and uv and
  discards exactly the skin indices and garment mask this crowd is built on. Hence the
  attribute-preserving clustering decimator in the baker.

### Payload and startup

```
public/data/crowd/hq-crowd.bin   2,761 KiB
  bone atlas                       618 KiB   shared by all four archetypes
  geometry, 4 archetypes x 3 LODs  2,143 KiB
build 1,978 citizens at runtime        ~9 ms
```

Everything is baked offline by **`npm run bake:crowd-hq`**. Nothing is generated at startup,
which is the constraint the old crowd's fast start depends on.

### What RUN 7A is not

A POC. It is **not wired into the live Shibuya scene** — it runs in `qa/gta-upgrade/
hqcrowd.html` against its own crowd. Integration with the real pedestrian simulation, the
crossing queues and the signal groups is RUN 7 proper. The RUN 7 awareness WIP was not
touched.

## 9c. RUN 7B — the HQ crowd in the real Shibuya scene

RUN 7A proved the architecture in its own bench. RUN 7B connects it to the game, and **all
1,978 pedestrians in the crossing now carry a high-fidelity body.**

### The rule the integration is built on

**The simulation is the source of truth.** `src/life/hq-layer.mjs` READS `sim.pool`. Position,
heading, speed, route, crossing membership, queue membership and signal group all stay in
`src/life/simulation.mjs`. The layer changes what a pedestrian *looks like* and nothing else —
a test asserts that a sync pass leaves `crossing`, `queueKey`, `edge`, `route`, `x` and `z`
untouched.

One bounded exception: a body thrown by a car is moved by the reaction system for the length
of its knockdown, because it is not walking anywhere. `onDisown` / `onReclaim` hand that
authority over and back, and the scene uses the simulation's own `leave()` so a crossing is
**released**, never abandoned.

`?hq=` switches the renderer (`hq=1` tier default, `hq=512` a budget, absent for legacy), so
the legacy instanced bodies remain a one-parameter rollback. Both renderers share one mask:
the ids the HQ layer draws are unioned with the near-character pool's and skipped in the
legacy meshes, so nobody is drawn twice.

### The integration ladder, measured in the scene

HIGH / day / scramble, each rung a separate build:

| budget | drawn / held | dup | crowd draws | scene draws | HQ tris | skel / mix | sync | errors |
| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 128 | 128 / 128 | OK | 4 | 367 | 492k | 0 / 0 | 0.9 ms | 0 |
| 256 | 256 / 256 | OK | 4 | 367 | 566k | 0 / 0 | 1.1 ms | 0 |
| 512 | 512 / 512 | OK | 4 | 365 | 1.14M | 0 / 0 | 2.4 ms | 0 |
| 1024 | 1024 / 1024 | OK | 4 | 367 | 2.28M | 0 / 0 | 1.9 ms | 0 |
| **1978** | **1978 / 1978** | **OK** | **4** | **341** | **4.41M** | **0 / 0** | **2.3 ms** | **0** |

**The scene's draw call count goes DOWN** — 341 against legacy's 367 — because four instanced
lanes replace thirteen legacy instanced meshes. There is still no `Skeleton` and no
`AnimationMixer` at any rung.

`sync` is the layer's own cost: it ranks all ~1,978 pedestrians by distance to spend the
budget nearest the camera. That ranking, not the drawing, is where its 2.3 ms goes, and it is
the clearest remaining CPU target.

In player mode at full budget: 1,975 drawn, 23 at L0 and 1,952 at L2, 8 draw calls (four
archetypes across the two levels in use).

### LOD, and not popping

Three bands with hysteresis — L0 ≤14 m (released at 17), L1 ≤38 m (released at 44), L2 beyond
— reviewed four times a second, at most 24 moves a frame.

A camera swept across every band for 400 frames (`qa/gta-upgrade/lodpop.mjs`) produced
**8,611 level-of-detail changes** with all three levels in use and **zero** changes to body,
hairstyle, height, build, walk phase or archetype. A lane change carries the citizen's
palette, phase and clip with them, so detail is the only thing distance can alter. A test
pins it.

### The real vehicle, in the real crossing

The player's own car — the same one that already calls `alertPedestrians` — hands its state to
the layer, which runs RUN 7A's bounded query over the pedestrians it is drawing.

```
peak        265 reacting + 49 down SIMULTANEOUSLY
sustained   218 reacting + 95 down
query       413 candidates of 1,945 (21%), 0.4 ms
disowned    25 bodies under the reaction system at once
```

The requirement was twenty.

### Crossings and signals survive it

Thirty seconds of simulation after driving through the crowd — the check that matters more
than the spectacle:

```
crossings completed   29 -> 40      queue size    0
abandoned crossings    0            stuck         0
population         1,977 (steady)   console errors 0
```

The signals keep running and nothing locks. **Not claimed:** a full signal cycle was not
observed. The cycle is 108 s with a 20 s pedestrian phase, and the sim clock runs about 0.75×
wall under SwiftShader, so a 30 s sample covers roughly 22 s of simulation and sat inside one
pedestrian window.

### Two defects found by looking, not by measuring

- **The crowd held 224 citizens while drawing 128.** A citizen that fell out of the budget was
  never released: still rendered, no longer positioned — a frozen body standing beside the
  legacy pedestrian it was meant to replace, which is exactly the duplicate-crowd failure this
  integration must not have. It only appears when the nearest set keeps changing, which a
  static bench never does. `release()` now swap-removes from both the lane and the state
  arrays, and a test drives a moving camera over 900 people asserting population never exceeds
  what is drawn.
- **The HQ bodies read washed out in the scene, and this is NOT fixed.** The crowd material
  did have one flat roughness where RUN 6.8 gives each garment its own, so skin, cotton,
  denim, hair and a shoe were all the same plastic; that is corrected and is an improvement on
  its own. **It did not fix the wash-out.** The cause is now isolated rather than guessed: the
  identical palette and shader render correctly in `qa/gta-upgrade/hqcrowd.html` — dark
  trousers, distinct tops, varied skin — and only go pale in the scene, so it is the scene's
  environment, tone mapping, exposure or fog acting on the crowd material, not the crowd
  material itself. Carried into RUN 7C. See the limitations in §18.

### Quality tiers

`HQ_TIER_BUDGET` is HIGH 1978, MEDIUM 512, LOW 0. LOW keeps the legacy crowd entirely, which
is why the legacy renderer is worth keeping beyond this run.

## 9d. RUN 7C — the HQ crowd's colour space

RUN 7B put 1,978 high-fidelity bodies in the crossing and they looked washed out. RUN 7C is
why, and the answer is one line of shader.

### Root cause

`ColorManagement` is enabled, so the renderer's working space is **linear**. The RUN 6.8 near
characters pass their palette through `new THREE.Color(hex)`, which applies sRGB → linear for
them — which is exactly why they were correct in the scene all along. The HQ crowd packs its
palette as an 8-bit sRGB hex and divided it by 255, handing **sRGB values straight to
`diffuseColor` in a linear pipeline**.

The error is not uniform, and that is the entire symptom:

| colour | correct (linear) | HQ used | error |
| --- | ---: | ---: | ---: |
| `#1c2028` dark navy trousers | 0.0116 | 0.1098 | **9.5×** |
| `#2a2f38` | 0.0232 | 0.1647 | 7.1× |
| `#3a414c` | 0.0423 | 0.2275 | 5.4× |
| `#6b7280` mid grey | 0.1470 | 0.4196 | 2.9× |
| `#e7e3da` cream top | 0.7991 | 0.9059 | 1.1× |

Dark clothing was up to **9.5× too bright** while light clothing was nearly right. Dark
trousers stopped reading as dark, every tone trended pale, and the crowd lost its separation.

**Why the bench looked correct.** With dim lighting, no tone mapping and no environment, an
over-bright albedo still lands low enough in the final image to read as clothing. Under the
scene's exposure and environment it saturates toward white. The bench was not disproving the
bug; it was hiding it.

### The fix

three's own `SRGBToLinear` applied inside `unpackRGB`, verified to deviate from `THREE.Color`
by **0.000e+0 across the entire colour cube**.

Done in the shader rather than at pack time on purpose: a linear value for a dark colour is
about 0.012, and eight bits of that is three levels, which would band. Eight bits of sRGB
expanded in the shader is what an sRGB texture does, and it puts the precision where the eye
needs it.

**Cost: none.** No extra draw call, no extra uniform, no extra texture — a few ALU operations
in a shader that was already running.

### Hypotheses tested and rejected

- **Scene exposure / global tone mapping.** Rejected on principle before testing: the Shibuya
  environment already works, and darkening the whole scene to hide a crowd bug would damage
  buildings, signage and vehicles to fix pedestrians.
- **Per-garment roughness.** A real mismatch — the crowd had one flat roughness where RUN 6.8
  gives each garment its own — and worth correcting on its own, but it demonstrably did not
  fix the wash-out. I said in a commit that it had; that was wrong and was withdrawn.
- **Fog, environment intensity, bloom.** Never reached: the numeric comparison against
  `THREE.Color` identified the cause outright.

### Also found here: the knockdown chain never closed

The full-signal-cycle harness (`qa/gta-upgrade/signalcycle.mjs`, 240 simulated seconds at
30 Hz, covering all four phases of the 108-second cycle) found what a 30-second scene test
could not: **132 bodies permanently DOWNED and permanently disowned from their own routes.**
`DOWNED` was excluded from the state fall-through on the theory that it "waits to be
recovered", and nothing recovered it.

The chain now closes: **HIT → KNOCKDOWN → DOWNED → RECOVER → NORMAL.** Ownership is reconciled
from `sync` as well as from `vehicle`, because a body stands up on its own timer and the
player may have parked by then.

Telling a steady state from a leak requires removing the cause, so the harness drives for half
the run and parks for the rest. A car that never stops *should* hold a steady population on
the ground; that is not a leak. With the car parked:

```
132 disowned -> 0 in 2.9 s      crowd returns to 1,978 NORMAL
population steady at 1,978      non-finite values 0
signal phases covered           NS, ALL, EW, PEDESTRIAN (full 108 s cycle)
peak reacting 459               peak down 132
```

And a metric that lied: `inspect()` recomputed its reacting and down counts only inside
`vehicle`, so the moment the player parked it kept returning the figures from the last
drive-by. My own new test believed it and reported 67 citizens on the ground when none were.
The counts are now recomputed on every sync.

### Day and night

| | HQ drawn | byLod | crowd draws | scene draws | skel / mix | sync | errors |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| day | 1,974 | L0 23 / L2 1,951 | 8 | 359 | 0 / 0 | 1.5 ms | 0 |
| night | 1,974 | L0 23 / L2 1,951 | 8 | 367 | 0 / 0 | 2.7 ms | 0 |

**Day:** hair reads black, tops separate (white, navy, teal, red, cream), skin separates from
clothing, archetypes are readable, and the RUN 6.8 near characters now blend in instead of
being the only coloured bodies in frame.

**Night:** the crowd is not white, dark clothing reads dark without crushing, skin stays warm
rather than grey, and the bodies sit naturally in the billboard lighting. Day was not altered
to achieve it — the fix is in the crowd's own shader, and nothing scene-wide was touched.

**LOD colour consistency:** L0→L1 differs by a mean of 7.1/255 over the whole frame and L1→L2
by 12.1/255, and those deltas are dominated by silhouette edges moving under decimation rather
than tone. Structurally the colour cannot shift with detail: every lane shares one shader, and
`moveLane` copies the per-instance palette across.

### Scale preserved

1,974–1,978 HQ pedestrians, 0 skeletons, 0 mixers, 4 crowd lanes (8 draw calls with two LODs
in use), offline prebake unchanged, 295/295 tests, typecheck and build clean.

## 9e. RUN 8 — melee with a hit window

The old melee applied damage in the same tick as the input: `request()` set a flag, the next
update chose a target and subtracted health, and `attackTime` was only a countdown for the
renderer. A punch could land before the arm moved, and **could not miss** — anyone in range at
the press was hit.

### Attack state machine

`IDLE → WINDUP → ACTIVE → RECOVERY → IDLE`. A swing is an object with a clock; the hit test
runs inside the clip's own active window, at most once per swing. A press during recovery is
dropped rather than queued — there is no input buffering, so you cannot punch faster than the
arm moves.

### The timings are measured, not chosen

`qa/gta-upgrade/punch-timing.mjs` samples each clip at 120 steps, finds which hand travels
furthest from the pelvis, and reads the window where that hand is within 12% of full
extension — the part of the swing where a fist would be touching someone.

| clip | duration | hand | wind-up | **ACTIVE** | recovery | peak |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| `Punch` | 0.867 s | LEFT | 0–0.188 | **0.188–0.368** | 0.368–0.867 | 0.202 |
| `PunchCross` | 1.000 s | RIGHT | 0–0.233 | **0.233–0.508** | 0.508–1.000 | 0.400 |

They turn out to be a natural one-two — a left jab and a right cross — so alternating them
reads as combination punching rather than the same arm twice. That is a property of the clips,
found by measuring. `PunchCross` was baked and unused until this run.

### Crossing the window, not landing in it

The hit test asks whether the **step crossed** the active window, not whether it landed inside
it. A frame long enough to step over a 180 ms window would otherwise skip the punch entirely.
At 60 Hz that never happens, but a stall, a background tab, or a test on coarse steps all
produce it — and a punch that silently does nothing when the frame rate dips is worse than one
that lands a frame late. **The NPC swing uses the same rule**; having one and not the other
meant a long frame quietly disarmed the crowd while the player kept punching.

### Combat on a crossing, without breaking the crossing

Pedestrians mid-crossing used to be excluded from targeting entirely, which made the middle of
a scramble crossing — most of this map — a place where combat silently did nothing.

They are now valid targets. What protects the signals is not refusing to hit them; it is
refusing to take them off their route for anything short of going down:

- a **survivable** hit damages and alarms them, and they keep crossing. `crossing`, `queueKey`
  and their signal group are untouched, and they are never stopped to fight.
- a **fatal** hit goes through `crowd.strike()`, which calls `leave()` first — so the group is
  **released**, never abandoned.

Both halves are pinned by tests, because a pedestrian stopped mid-crossing holds their signal
group, and the controller stops the clock for the whole map while any group is held.

### One authority

The **simulation** decides who was hit, how much health they lost, and whether they go down.
The HQ crowd renderer only shows it — it reads `struck` and `combatDead` off the pedestrian,
exactly as it already does for a car. Nothing in `combat.mjs` reaches into the HQ crowd.

### The crowd sees it

A punch raises a **witness event** — where it happened, how bad, and how far that carries —
which `src/life/hq-layer.mjs` turns into reactions. `combat.mjs` never scans the crowd itself;
it hands the event to whoever is listening and the listener owns the bounding.

| | value |
| --- | --- |
| radius | 11 m |
| severity, connecting punch | 0.72 |
| severity, punch that misses | 0.40 (0.72 × 0.55) |
| bands | `felt ≥ 0.52` FLEE · `≥ 0.30` AVOID · `≥ 0.12` LOOK |

`felt = severity × (1 − d/radius) / nerve`, and **nerve is per-citizen**, hashed from the same
id their appearance comes from, spread over 0.55–1.45. So one punch produces a spread of
responses rather than a chorus, and the same person is reliably the nervous one. The rule is
borrowed from `src/life/awareness.mjs`; the storage deliberately is not, because two thousand
JS state objects is the thing this architecture exists to avoid.

A punch that misses still raises an event at reduced severity. Bystanders reacting to a swing
that connected with nobody is the correct behaviour — they saw someone throw a punch.

Someone already fleeing, or already off their feet, is **not made to react again**. The second
punch in a fight therefore moves far fewer people than the first, and that is not the crowd
ignoring it.

### NPC retaliation

A struck pedestrian becomes hostile for 14 s, closes to `range × 0.72`, and swings on the same
phase model the player does: a wind-up, then damage when the arm is out. A player who has to
respect a hit window while the crowd lands instantly is not fighting, they are being audited.

| | player | NPC |
| --- | ---: | ---: |
| damage | 34 | 14 (+0–4 by id) |
| reach | 1.75 m | 1.75 m |
| arc | ±1.05 rad | — |
| cooldown | clip recovery | 1.05 s (+0–0.36 by id) |

Three punches kill a pedestrian; eight kill the player. The arc matters: a punch is not a
radius, and someone directly behind you cannot be hit.

### Player death and restart

`hurt()` takes health, holds a 0.34 s hurt lock so one frame of overlap cannot delete the
player, and at zero sets `alive=false` with `hitBy='fight'`. The scene shows
**「喧嘩で倒れました」** and a **「やり直す」** button, which calls `revive()` → `place()`:
health 100, alive, timers cleared, back at the start point. A dead player cannot swing and
cannot take further damage.

### Cost

`qa/gta-upgrade/combat-cost.mjs`, 600 frames at 1/60 s with 12 hostiles already engaged.
CPU only — no frame rate is claimed from this hardware.

| people | melee µs/frame | witness ms/punch | reacted (first punch) | seen |
| ---: | ---: | ---: | ---: | ---: |
| 64 | 14.5 | 0.074 | 60 | 60 |
| 256 | 14.0 | 0.098 | 93 | 163 |
| 1024 | 17.1 | 0.330 | 93 | 206 |
| 1978 | 11.5 | 0.558 | 93 | 206 |

**`melee.update` is flat in population** — 1,978 people cost no more than 64, because the fight
only ever walks the grid cells inside `notice` (4.5 m). At ~15 µs it is under 0.1% of a 16.7 ms
frame.

**`witness` is not flat**, and the reason is `grid.rebuild`, which is O(population) per call.
0.56 ms at full crowd, against roughly two punches a second, is ~1.1 ms/s — acceptable, and
recorded here because it is the term that would matter if punches ever became rapid.

The people reacting saturates at 93 of 206 seen, which is the bounding working: density inside
11 m stops growing once the disc is full, so a bigger city does not make a bigger reaction.

### Tests

`tests/combat.test.mjs` is new — the PRE-RUN 8 audit found **zero** combat tests. 22 cases.
Two of them contradict each other on purpose, so neither can pass vacuously:

- *DAMAGE DOES NOT HAPPEN ON THE INPUT TICK* — the bug this run exists for.
- *damage lands inside the active window* — and it does happen, later.

The rest pin the things that were previously unpinned: a punch at nobody misses; someone out
of range, or behind, misses; a target who walks away during the wind-up is missed and one who
walks **in** is hit; one swing damages at most once; a press during recovery does not start a
second swing; the two clips alternate; a fatal hit goes through `crowd.strike`, not around it;
a pedestrian on a crossing **can** be hit; a light hit does **not** take them off the crossing
and a fatal one **does** use the formal `leave` path; a witness event fires once per swing and
a miss fires a weaker one; the NPC swings on the same model the player does; a dead player
cannot swing; and nothing produces a NaN or a stuck phase.

`tests/hq-layer.test.mjs` gained three: a punch is seen by the people near it **and only by
them**; witnesses do not all react the same way and they recover; a punch in a dense crowd is
seen by a useful number of people.

The death loop (case 22) runs against the **real controller**, not the stub the rest of the
file uses — testing a copy of `hurt` would have proved nothing about the game. Both of its
guards were mutation-checked: removing `state.alive` from the swing start, and clamping health
to 1 instead of 0, each fail it.

### A bug RUN 8's QA found, which was not RUN 8's

The browser QA raised the scene's shader-error banner —
「描画シェーダーのコンパイルに失敗しました」— and the first read of it was wrong: the
browser had been open for over an hour, so a stale WebGL context looked like the obvious
answer. It was not. A **fresh** browser raised the same banner, at a reproducible moment: about
35 seconds into player mode, never in observer mode.

The captured log says exactly what happened:

```
ERROR: 0:76: 'instanceColor' : redefinition
```

`src/traffic/vehicle-shadow.mjs` declared `attribute vec3 instanceColor` inside its own vertex
shader. A `ShaderMaterial` — unlike a `RawShaderMaterial` — is given three.js's vertex prefix,
and that prefix already declares `instanceColor` under the very same `#ifdef`
(`WebGLProgram.js`). The second declaration is a redefinition, so:

- the program never compiled,
- the renderer logged `useProgram: program not valid` on every frame,
- **every vehicle in the scene lost its contact shadow**, and
- the scene told the user that roads and buildings might be missing, which was not the problem.

Why it only appeared in player mode: `USE_INSTANCING_COLOR` is defined only once an
`instanceColor` buffer exists, and that buffer is created by the first `setColorAt`. Until a
vehicle shadow is given its falloff exponent, the define is absent, the redundant declaration
is compiled out, and the shader is fine. Nothing to do with combat.

Fixed by deleting the declaration and keeping the guard. `tests/vehicle-shape.test.mjs` now
pins it: no custom shader may declare an attribute the renderer already injects. The test was
checked against the unfixed file and fails there.

**The lesson for the next RUN.** No unit test could have caught this — it needs a real GL
context, a real compile, and a coloured instance. The banner had been on screen in earlier
QA screenshots and was read as scenery. A red banner is a blocker whatever RUN raised it.

### Browser QA, in the real scene

`?qa=1&tier=high&time=day&camera=scramble&hq=1`, headless Chromium on SwiftShader. **No frame
rate is reported** — this hardware cannot produce performance evidence, only counts, CPU
timings, errors, and whether a thing renders at all.

| scenario | result | evidence |
| --- | --- | --- |
| player mode enters | **WORKS** | alive, health 100 |
| witnesses react to a punch | **WORKS** | peak **251** people reacted, `witnessMs` 2.1 |
| witnesses recover | **WORKS** | `reacting` 88, `down` 0, `disowned` 0 |
| **crossings keep running during combat** | **WORKS** | **22 completed, 0 abandoned, 0 stuck, 0 queued** |
| HQ scale preserved | **WORKS** | 1,945 HQ bodies, **0 skeletons, 0 mixers**, 12 draw calls |
| first air punch | inconclusive | sampled before the HQ crowd had spawned: `candidates=0` |
| player takes damage from the crowd | **NOT OBSERVED** | health stayed 100 — see below |

The line that matters most is the crossing one. Combat now happens in the middle of a scramble
crossing, and across the run the signals kept cycling with **nothing abandoned and nothing
stuck** — which is the failure mode this design was shaped around.

`witnessMs` in the live scene is **2.1 ms**, against 0.56 ms in the offline bench at the same
population. The bench does not carry the scene's grid occupancy; the live figure is the one to
believe, and it is the number to watch if punching ever becomes rapid.

### The bug that mattered: combat could not touch the crowd

RUN 8's first browser QA reported witnesses reacting in the hundreds and **not one knockdown**.
Six punches at a pedestrian **8 cm away**, standing still, `waiting`, not crossing — nothing.
`melee.snapshot()` was not exposed to QA at the time, so the run could see the crowd *react*
to a punch but could not tell a hit from a miss. That metric was added
(`__SHIBUYA_QA__.metrics.melee`) and the answer arrived immediately:

```
punch 5  melee={"swings":2,"hits":0,"misses":1,...}
```

Two swings, **zero hits**. Reproducing `eligible`'s clauses against the live simulation named
the failing one straight away — every pedestrian within reach carried `choreographed: true`:

| id | distance | in range | in arc | choreographed |
| --- | ---: | --- | --- | --- |
| 1115 | 0.06 m | yes | no | **yes** |
| 88 | 0.08 m | yes | no | **yes** |
| 669 | 0.24 m | yes | **yes** | **yes** |
| 149 | 0.40 m | yes | no | **yes** |
| 59 | 0.43 m | yes | no | **yes** |

`eligible` excluded `p.choreographed`. The choreographed Scramble cast is **74–85% of the
population** (`ScrambleChoreography.refill`: `target = total × 0.74…0.85`) — it *is* the crowd
in the crossing. Combat was therefore switched off exactly where the game happens, and the
one pedestrian in arc was cast like all the others.

**Why the exclusion was wrong.** `simulation.step` tests `struck` **before** it hands a
choreographed pedestrian to `choreography.move`:

```js
if(p.struck!==undefined){p.struck+=dt;p.speed=0;this.fly(p,dt); ... continue;}
...
if(p.choreographed)return this.choreography.move(p,dt);
```

A falling body is carried by the knock-down path, not by its track. **A car has always been
able to knock the cast down through `strike`.** Only a fist could not.

**The fix** is the crossing rule, generalised. `onRails(p) = p.crossing || p.choreographed`:

- they **can** be hit, damaged, alarmed and killed;
- they are **never** stopped to fight, because `choreography.move` would put them back on the
  track the next tick and the two would write over each other every frame — and because
  stopping one mid-crossing holds their signal group;
- the hostility window still opens, so a cast member who is punched and later leaves the cast
  turns and fights.

**Verified in the live scene, end to end**, over two runs at different viewport sizes:

| | before the fix | after (480×320) | after (900×620) |
| --- | ---: | ---: | ---: |
| swings | 2 | 3 | 5 |
| hits | **0** | **3** | **5** |
| misses | 1 | 0 | 0 |
| NPC deaths | 0 | **1** | **1** |
| `sim.struck` | 0 | **1** | **1** |
| GPU crowd `down` | 0 | **1** | **1** |
| GPU crowd state reached | — | `KNOCKDOWN` | `KNOCKDOWN` → **`DOWNED`** |

Five swings, five hits, no misses. The longer run also watched the body move through the
knockdown chain — `KNOCKDOWN` and then `DOWNED` — which is **RUN 7C's chain being driven by a
punch for the first time**; until now only a car had ever put a body on the ground.

**Why no unit test caught it.** Every NPC in `tests/combat.test.mjs` was built with
`choreographed` falsy — the helper never set it, so 23 passing cases all tested the 15–26% of
the population combat already worked on. Four cases now build a cast member explicitly, and
each fails against the old `eligible`.

**A frame-rate artefact, not a bug.** Sixteen key presses produced three swings. `FrameGate`
clamps `dt` to 0.1 s, so on a renderer reporting 0.2 FPS a 0.867 s clip needs nine frames and
takes about six real seconds; a press during that recovery is dropped by design. At 60 Hz the
clamp never engages. This is measurement noise from SwiftShader, and it is the reason the kill
needed a small viewport to reach in reasonable time.

### Not verified live

- **A visual frame of a body on the ground.** The knockdown is proven by numbers above
  (`KNOCKDOWN` → `DOWNED`, `down=1`, `sim.struck=1`, `npcDeaths=1`) and was captured at
  900×620 with the scene healthy — but the body is not identifiable in it. To reach a kill the
  player has to stand inside the crowd, and from there the camera looks at a wall of standing
  people that hides anyone lying at their feet. The same position hides the player's own arm,
  so the impact frames do not read as a punch either. **What is missing is a camera angle, not
  a behaviour.** A free or raised camera, or a kill at the edge of the crowd, would settle it.
- **NPC retaliation damaging the player.** Health stayed at 100 throughout. At 0.2 FPS an NPC
  needs its own wind-up plus a 1.05 s cooldown per swing, and the player was never held still
  long enough near a non-cast pedestrian. Pinned by unit tests, not observed in the browser.
- **A full 108-second signal cycle under combat load** — as before RUN 8.


## 9f. RUN 9 — vehicle occupancy, staged entry, and a real carjack

The PRE-RUN 8 audit found that driving worked, entry existed as one smoothstep, exit existed
behind a safe-doorstep rule, doors animated, and the anchors were already authored. What was
missing was underneath all of it: **traffic vehicles had no driver entity at all**. Nothing in
the project could say who was in a car, so "carjacking" was `takeOver(slot)` at the moment the
button went down — there was nobody to take it from.

### Occupancy is one authority

`src/traffic/occupancy.mjs`. Occupancy is never inferred from a mesh, from `controlled`, or
from whether a driver happens to be drawn.

```
OCCUPANT   NONE | TRAFFIC_DRIVER | PLAYER
DRIVER     SEATED -> ALERT -> BEING_EXTRACTED -> EXTRACTED
```

Data-oriented: the traffic pool is a fixed 146 slots, so occupancy is parallel typed arrays
indexed by slot id. No object per car, no allocation per spawn, **a driver costs 13 bytes
rather than a skeleton**. A driver is an *identity* — `driverId` and an appearance seed — not
an actor.

The model enforces its own invariants rather than trusting call sites:

| invariant | how it is guaranteed |
| --- | --- |
| one seat, one occupant | `seat` and `takeSeat` refuse a seat that is not `NONE` |
| the player is in at most one car | the seat they are in is a **single value**, so a second cannot exist |
| a driver cannot vanish from the seat | `advance` moves one state at a time; `extract` refuses unless `BEING_EXTRACTED` |

That last one is the instant takeover this RUN exists to remove, expressed as a state machine.

**Seats are reconciled, not assigned.** A vehicle becomes active in three places — `spawn`,
the central streams, and the rotary service — and seating at each means the next one added
forgets. `reconcileOccupancy` walks the pool once per frame instead, so no activation path can
be missed. The same reasoning produced `reconcileOwnership` in the HQ crowd layer.

Three cars stay empty on purpose: **parked** cars (an empty parked car *is* the normal-entry
case), the car the player is **controlling**, and a car whose driver has just been **dragged
out** — without that last marker a fresh driver appears in the seat while the player is still
walking round the bonnet.

### The driver you can see

`src/traffic/drivers.mjs` is deliberately the cheapest thing that stops a car reading as empty.
**No skeleton, no AnimationMixer, no clip, no per-frame AI.** Head, shoulders and a hint of
arms is the whole silhouette a cabin shows through glass.

| | |
| --- | ---: |
| draw calls, any traffic count | **3** |
| skeletons / mixers | **0 / 0** |
| CPU | ~0.1 ms/frame |
| budget | nearest 48 occupied cars within 46 m |

Bounded by **distance, not population**, so a city full of traffic costs what a street does.
Identity comes from `src/life/appearance.mjs`, the same recipe the crowd uses.

Two things had to be fixed before any of it was visible:

- the layer ranked cars by distance **from the camera body**, and the scramble preset sits
  sixty metres back and above the crossing, so every cabin fell outside the radius and it drew
  nobody. It now focuses on what is being *looked at*.
- **the cabin was a solid dark box.** `glass` had no transparency at all, so the seated driver
  was being drawn correctly and hidden completely, and no car in the scene could ever show that
  someone was in it. Now tinted (opacity .62) rather than clear.

### Anchors, finally used

`driverSeat`, `driverDoor`, `driverEntry`, `driverExit` have existed since the vehicle assets
were built and **nothing used them** — enter and exit invented their own offsets, so the
authoritative numbers and the numbers actually used were two different things.
`src/traffic/vehicle-anchors.mjs` is the one place that turns them into world poses, memoised
per body. Measured, for a sedan: seat `[-0.418, 0.591, 0.989]`, entry `[-1.630, 0, 0.897]`,
exit `[-1.690, 0, 0.598]`.

The side mirrors, because the player may approach from whichever side is clear. **The seat does
not** — walking round the far side of a car does not move the steering wheel to meet you.
`doorPose` still chooses the side, because it also tests the ground for solids.

### Entry and exit are sequences now

```
enter    ALIGN -> DOOR_OPEN -> ENTRY -> SEAT -> DOOR_CLOSE            1.62 s
exit     DOOR_OPEN -> EXIT -> STAND -> DOOR_CLOSE                     1.24 s
carjack  ALIGN -> DOOR_OPEN -> GRAB -> PULL -> THROW ->
         ENTRY -> SEAT -> DOOR_CLOSE                                  2.72 s
```

Each stage carries its own duration, waypoints and door state. That buys three things the old
`Math.sin(phase * PI)` could not express:

- the door **opens before** the body moves through it and **shuts after** it has cleared. The
  old shape opened the panel as the player set off walking and had it shut again as they sat.
- **the seat is a real destination.** Entry used to end at the *door*; sitting down was the
  renderer hiding the player while the car started drawing them.
- there is a defined moment when **control transfers**, and it is the end.

### Ownership is split in two

`takeOver` became `reserve` + `commit`.

`reserve` does what the animation needs: the car is frozen so traffic cannot pull away
mid-sequence, permits are released so a held signal group does not stall the map while the
player walks round the bonnet, and the slot becomes the one the player's renderer draws so its
door can swing. It deliberately does **not** set `active` — every driving path is gated on
that, so a reserved car sits there, input does nothing, `step` returns immediately, and nothing
is struck by it.

`commit` takes the wheel, and it **asks the occupancy model** whether the seat is free rather
than assuming. A car whose driver is still in it cannot be driven away. An entry that cannot
commit unreserves rather than stranding.

`vacateSeat` ends occupancy without giving up the car — the player still owns it and is still
offered it back as `own`, but a car nobody is sitting in must not report an occupant.

### The carjack

The carjack list is the entry list with three stages spliced in, so getting into a stolen car
is the same animation as getting into an empty one **with a fight in the middle**.

| stage | what happens |
| --- | --- |
| `GRAB` | the driver notices → `ALERT` |
| `PULL` | hauled across the sill → `BEING_EXTRACTED` |
| `THROW` | the body lands on the road, the seat is free |

Consequences hang off stage *changes* and replay any stage a long frame crossed, so none is
skipped — the same rule RUN 8's hit window needed.

Splitting it this way is what makes the seat **empty for a beat** before the player is in it.
Between `THROW` and `SEAT` the car has no occupant at all, which is the honest description of
a carjacking in progress and is what stops the player driving off with the driver still there.

**The person thrown out is the person who was sitting in it.** `appearanceId` carries the
driver's seed onto the pedestrian and the crowd renderers prefer it over the pool id.
Arriving on the pavement as somebody else would undo the whole reason a driver has an identity.

They are handed to `crowd.strike` — the simulation's own knock-down, the same path a car uses.
That buys the existing `HIT → KNOCKDOWN → DOWNED → RECOVER` chain, the blood and the scream,
rather than a second knockdown architecture to keep in step with the first.

A car doing more than **0.35 m/s refuses**: the same threshold `nearestEntry` already uses.
Pulling someone out of a car doing thirty is a different feature, and RUN 9 is not it.

Aborts are handled rather than hoped about. Leaving player mode mid-carjack settles the driver
back into the seat, shuts the door and hands the frozen slot back to traffic. `abort` is legal
only before the throw — once there is a person on the road, putting them back in the car is not
an abort, it is a resurrection.

### Browser QA, in the real scene

`?qa=1&tier=medium&time=day&camera=scramble`, headless Chromium on SwiftShader. Counts, states
and errors only — **no frame rate is reported**, and the small viewport is not cosmetic:
`FrameGate` clamps `dt` to 0.1 s, so on a renderer at 0.2 FPS a 1.62 s entry takes eighty
seconds of wall clock.

| scenario | result | evidence |
| --- | --- | --- |
| A enter an empty parked car | **WORKS** | door 0 → 1.00 → 0, seat becomes `PLAYER` at the end |
| B drive | **WORKS** | 3.7 m, 17 km/h |
| C exit | **WORKS** | `playerVehicle` → −1 |
| D safe-doorstep rule | intact | a spot existed, so the refusal path was not exercised |
| E occupied car, driver visible | **WORKS** | 14 drawn of 88 seated; HUD offers 「奪う・F」 |
| F no instant takeOver | **WORKS** | one frame after the press: `stage=ALIGN`, `playerVehicle=-1`, `active=false` |
| stages observed | **WORKS** | `ALIGN → DOOR_OPEN → GRAB → PULL → THROW → ENTRY → SEAT → DOOR_CLOSE` |
| G driver leaves the seat | **WORKS** | `driverId 6` out of vehicle 5 |
| H driver becomes a world body | **WORKS** | pedestrian 1527, thrown, same appearance seed |
| I player takes the seat | **WORKS** | `playerVehicle=5`, door shut |
| J drive the stolen car | **WORKS** | 3.9 m |
| K exit the stolen car | **WORKS** | `playerVehicle` → −1, first car left `NONE` |
| L a second carjack, another car | **WORKS** | driver 8 out of the sedan as pedestrian 1528, `playerVehicle=7`, first car still `NONE` |
| console errors | **0** | |

**Two of the three failures this QA reported were the QA's own fault**, and both were worth the
time it took to prove it rather than assume it. With each corrected, L passes:

- a second carjack "failed" because after getting out the player stands 1.4 m from the car they
  just left, and `nearestEntry` quite correctly offers the **nearer** car — their own.
- it failed again because the script stops the victim by writing `speed = 0` for one frame and
  then waited three seconds, during which the traffic simulation drove it away. A stopped car
  is only jackable *while* it is stopped.

The third was real, and is the reason G and H are green above. See below.

### Two bugs the suite could not see

**The driver vanished.** At HIGH the crowd pool is saturated — nearly two thousand people, all
active — so `crowd.spawn` fails, and the driver left the seat with no body arriving. Extracted
from the occupancy model, never delivered to the world. Every unit test passed because a test
pool always has a free slot. One distant pedestrian is now retired to make room, through
`despawn`, which calls `leave` first and releases any signal group they were holding.

**A scream took the frame down with it.** `say(kind, id, x, z, listener, urgency)` was called
as `say(pedestrian, 'scream', 1)`, so `listener` was undefined and `listener.x` threw — inside
the frame loop, at the `THROW` stage, every time a driver was pulled out. The sequence stopped
dead at `THROW`, the door stayed open at 1, and the player never reached the seat; three
"failures" after it were all this one exception. The call is deleted rather than corrected,
because `crowd.strike` already says the scream. `voices.say` now keeps the contract its own
comment makes — *"Never throws: a browser that refuses audio must not stop the game"* — which
it did not.

### Regression, at HIGH with the HQ crowd up

Everything RUN 7 and RUN 8 established, re-checked with occupancy, drivers and the carjack in
the scene. `?qa=1&tier=high&time=day&camera=scramble&hq=1`.

| gate | result | evidence |
| --- | --- | --- |
| HQ crowd alive | **WORKS** | 1,971 bodies, 12 draw calls |
| **no skeletons or mixers added** | **WORKS** | crowd 0/0, drivers 0/0 |
| seated drivers alongside the HQ crowd | **WORKS** | 5 drawn of 88 seated |
| RUN 8 melee still lands | **WORKS** | 2 swings, 1 hit, 0 misses |
| witness reaction still fires | **WORKS** | 277 people reacted |
| crossings still complete | **WORKS** | 0 → 7 |
| nothing abandoned or stuck | **WORKS** | abandoned 0, stuck 0 |
| no shader banner | **WORKS** | none |
| console errors | **0** | |

RUN 7's architecture is intact: **RUN 9 added no skeleton and no AnimationMixer anywhere**, and
the seated drivers coexist with 1,971 GPU crowd bodies for three extra draw calls.

### Not verified live

- **A frame of the driver lying in the road.** The extraction is proven by state
  (`thrown: true`, pedestrian 1527, the same appearance seed, in the knockdown chain) and the
  screenshot is of a healthy scene, but the camera sits at the driver's door during the
  sequence, and a body at the player's feet is below frame. Same shape of limitation as RUN 8's
  knockdown: a camera angle, not a behaviour.
- **Enter and exit at every body type.** Checked on a sedan, a taxi and a kei; the anchors are
  measured for all seven, but bus and scooter entry has not been watched.
- **A full 108-second signal cycle with a carjack in it** — as before.


## 9g. RUN 10 — NPC life / awareness consolidation

**RUN 10.1 (`76dc411`):** audit found that the old RUN 7 `awareness.mjs` really was
imported by `render.mjs` and scanned every ~1,978-person simulation pool on every frame.
It is now marked DEPRECATED / NOT PRODUCTION. The production import count is zero;
`hq-awareness.mjs` is the single rule authority. Its HQ states and three additional clocks
(`noticed`, `ready`, `attention`) are typed arrays. The near-character pool calls the same
`playerThreat` function for its at most eight excluded bodies; there is no second rule system.
The old module's stable ID-based nerve, 60–400 ms delay, thresholds, downward hysteresis and
cooldown were ported. Per-person JS AI, full-population perception, cell-to-cell panic, and a
second spatial alarm grid were rejected. The baked Startle clip needed no asset or mixer.

**RUN 10.2:** player perception evaluates only cells within 13 m and now rebuilds the HQ
spatial grid only on the 12 Hz perception tick rather than on every render frame. Distance,
player pace, closing time-to-contact and orientation drive LOOK → STARTLE → AVOID; the close
range bypasses FOV. The pass reports candidate count, accepted changes, query CPU and update
CPU separately, and the HQ layer reports grid-rebuild CPU. A 60-frame test bounds rebuilds
at 8–15 per second. A standing player is not a permanent attention magnet.

**RUN 10.3 / 10.4:** RUN 8 witnesses enter through `hq-layer.witness()` into the same
personality/priority rules. A fresh strong melee event interrupts RECOVER; a weak glance
does not. A vehicle still uses the existing urgent `applyVehicleThreat` path: proximity
contact forces HIT/KNOCKDOWN immediately, and a fast approach can override RECOVER. A new
simulation strike also interrupts HQ recovery and requests movement handoff through the
scene's formal `sim.leave()` callback. LOOK cannot interrupt physical states.

**State priority:** the numeric enum orders NORMAL, LOOK, STARTLE, AVOID, FLEE, HIT,
KNOCKDOWN and DOWNED. RECOVER is index 8 for its existing atlas lookup, but an explicit
`priority()` ranks it below a new AVOID/FLEE or physical threat. Physical hits take precedence
over visual attention. Each LOOK/STARTLE/AVOID drains to NORMAL; FLEE drains through RECOVER
to NORMAL. The cooldown starts at the actual timer transition. `byState` has nine entries,
including RECOVER, so QA cannot silently omit recovery.

**RUN 10.5:** visual awareness never writes crossing, queue, route or signal ownership.
Knockdowns call the scene's existing `onDisown → sim.leave()` path. Choreographed pedestrians
can show LOOK and STARTLE while retaining their crossing membership. A driver extracted in
RUN 9 retains `appearanceId` and `cameFromVehicle`; when their fall ends, they remain an
ordinary pedestrian, get a nearby unoccupied walkable node and route, and can again be noticed
or flee. The ejection landing point can be in a traffic lane, so the driver is placed at the
nearest safe node at the end of their fall; this curb transition needs visual QA. Recycling
the pedestrian slot clears both driver-only fields. The carjack/occupancy state machine is
unchanged. There are no per-citizen mass Skeletons or AnimationMixers.

**Headless HIGH QA:** `qa/gta-upgrade/awareness-cycle.mjs` runs the real traffic signals,
choreography, pedestrian simulation and 1,978-budget HQ layer for 120 simulated seconds at
30 Hz. Initial run: peak/end population 1,978; 12 HQ draws; 0 mass Skeletons and Mixers;
maximum 233 local candidates, 113 accepted changes, 189 simultaneous active reactions;
peak grid build 0.637 ms, candidate query 0.115 ms, awareness evaluation 0.891 ms on this
host. Melee reactions spread across LOOK/STARTLE/AVOID/FLEE; urgent vehicle contact threw
18 bodies. At the end FLEE/STARTLE/AVOID, physical ownership and disowned count returned to
zero. Four signal phases appeared; 904 crossings completed, 0 abandoned and 0 signal
violations, with 5 recorded stuck recoveries. These are diagnostic timings, not FPS or
portable budgets. The mass HQ sync still ranks the crowd every frame for rendering; that
existing O(N) render ranking is distinct from the local awareness query.

**Local browser acceptance — partial, NOT COMPLETE (2026-09-23):** Chrome loaded the real
HIGH/day scene. Local screenshots are under `qa/gta-upgrade/run10-browser/` (ignored local
evidence, not included in Git). Idle and normal walking showed no obvious circular gap;
direct running showed local STARTLE/AVOID, punches produced mixed local reactions, and
LOOK/STARTLE/AVOID/FLEE subsequently drained to zero. Punch and PunchCross landed. A real
carjack transferred occupancy to PLAYER for vehicle 0 and extracted driver 1 as pedestrian
1527 with appearance seed 506952114; the stolen taxi was driven. These observations do not
close all A–L scenarios.

One live walking snapshot reported total population 1,978, HQ population 1,945 (near bodies
are excluded), 12 HQ draws, 771 scene draws, zero mass Skeletons/Mixers and 0.3 ms grid
rebuild CPU. Counts and timings are snapshots, not maxima or portable performance results.
Console error checks returned zero; final fresh-page console/shader acceptance remains open.
Do not substitute the headless candidate/query/update measurements above for browser data.

**Provisional visual fix:** the working-tree change in `src/player/vehicle.mjs` increases
static-solid body padding from 0.05 m to 0.55 m. The same taxi route stopped visibly clear
of the station platform afterward (`vehicle-wall-before.png`, `vehicle-wall-after.png`).
This changes clearance around all static solids, so tight-clearance driving still needs
acceptance before this fix is finalized. Post-change `npm test` completed with 383 pass,
5 existing skips and zero failures, including its successful build; typecheck also passed.

**Still required:** close-pass judgement; frontal versus parallel/rear visual comparison;
individual flicker and state readability; combat/vehicle knockdown visual confirmation;
complete crossing/queue/signal measurements; extracted-driver curb transition judgement;
and a final browser console/shader audit. A prior trace measured a 1.83 m driver relocation
at fall completion, but its visual acceptability is unresolved. Browser automation later
stopped on URL verification; the latest resume exposes no browser-control tool. Keep RUN 10
pending until these checks can actually run. The reported mix of legacy/new character
models remains a later-plan item; no character replacement or RUN 11 work was started.

**Final gates:** `npm test`: 388 total, 383 pass, 5 existing skips, 0 fail;
`npm run typecheck`: clean; `npm run build`: successful. The RUN 8 combat/crossing and RUN 9
occupancy/carjack suites are included. The headless signal cycle is integration evidence, not
a screenshot or live console audit. **RUN 10 remains pending visual acceptance** until these
scenarios and console errors are checked in a real browser. RUN 11 was not started.

### RUN 10 — browser acceptance closed (Claude, 2026-09-23)

This follows Codex's partial QA above and does not replace it. Codex's patch `f6fe7bb` is
preserved as `6fee7d2` (identical content, different committer). All of it ran in the real
HIGH/day scene with `?qa=1&hq=1`, driven over the DevTools protocol in headless Chromium on
SwiftShader. At that frame rate the scene runs at about 0.2–1.5 fps and `FrameGate` clamps each
frame to 0.1 s, so every check waits on *simulated* progress, not wall time. No FPS here is a
performance result. Screenshots and traces are local QA evidence and are not committed.

**Legacy / old-style characters (`b87ca60`).** Measured per pedestrian from the renderer's own
ownership split (a new QA `ownership()`): the procedural legacy renderer drew **0** people. Every
old-looking body was a *baked* near-pool slot, the eleven-bone offline figure, in the ring
around the player where the HQ crowd would have drawn the same person better. While the HQ crowd
covers the scene, the near pool now keeps only its humanoid slots (`setHQCovered`). Live: 8
humanoids, 0 baked, 0 drawn twice. Without HQ, the baked fallback is unchanged.

**Player vehicle transparency (`1ee9e3f`).** Not a material problem. `loft()` in
`src/traffic/vehicle-shape.mjs` wound its side quads and caps inside-out, so every lofted body
had negative signed volume. With back-face culling the far inner walls were drawn and the car
read as hollow. The winding is fixed at the generator and the pack rebaked; all seven bodies now
have positive paint and glass volume, which two tests pin. Checked in the browser, day and night.
Traffic cars use a different builder and were never affected.

**Collision clearance (`f767029`).** Codex's .55 m on every side was measured against every
sedan lane pose on the map (`qa/gta-upgrade/clearance-cost.mjs`). It made **35 of 2,467**
undrivable, a narrow street near (−200, 55) that the AI's own sedans use. All of the cost was
lateral. The margin is now .55 m at the ends and .25 m at the sides, which loses **0** lane poses.
Browser: that street drives through at 35 km/h. Head-on into a station-area pillar the car stops
with its nose **0.61 m** clear and the bonnet visibly outside the structure. The car-to-car pad
is unchanged. `tests/vehicle-clearance.test.mjs` drives the real player vehicle onto every lane
pose; with the uniform .55 restored it fails on exactly the 35.

**E — parallel versus direct (4 people, after the cooldown fix below).** The player runs at
4.2 m/s from 12.5 m: straight at them, or past them 2.5 m to the side.

| person | direct: first / max | parallel: first / max |
| --- | --- | --- |
| 1913 | LOOK @ 9.05 m / AVOID | LOOK @ 9.09 m / STARTLE |
| 1890 | LOOK @ 7.27 m / AVOID | LOOK @ 7.30 m / STARTLE |
| 1516 | LOOK @ 8.37 m / AVOID | LOOK @ 8.75 m / STARTLE |
| 1637 | LOOK @ 9.17 m / FLEE | LOOK @ 11.02 m (near-held) / STARTLE |

Parallel is weaker every time. First notice is at about the same distance, as it should be: the
collision term only applies inside the 1.25 s time-to-contact, and the difference shows up
there. Per awareness pass there were 7–22 candidates and 3–17 evaluated inside 13 m.

**F — rear versus frontal.** Rear first notice / max: 1913 LOOK @ 6.63 m / LOOK; 1516 LOOK @
4.73 m / LOOK; 1637 LOOK @ 6.58 m / LOOK; and before the fix, 1654 LOOK @ 7.49 m / AVOID against
8.11 m / FLEE frontal. So rear is later and weaker in 4 of 5. The exception is **1890**: LOOK @
8.51 m, max AVOID, while held by the near pool. By the rule itself (`playerThreat`,
behindScale .35, nerve .73), a rear approach at 8.5 m scores 0.03, far below LOOK, and cannot
reach LOOK beyond about 4 m. So this person was almost certainly facing the player, having
turned on their route. That was not instrumented in that trial.

**A bug E found (`7fc1d69`).** Direct approach, before: NORMAL → LOOK → **NORMAL** → FLEE at
2.3 m. The LOOK hold (0.5 s) drained, the drain started the 1.15 s `REACTION_COOLDOWN`, and
`settle()` refused everything above NORMAL. The person strolled on while the runner closed about
six metres. The crowd now records the level the cooldown is for (`calmed`), and awareness blocks
only re-entry at or below it; a stronger reaction gets through. The threshold-wobble flicker
test is unchanged and passes. A LOOK → NORMAL blip of one reaction delay (60–400 ms) remains
before an escalation. It is invisible, because on the HQ crowd LOOK plays the same `Walk` clip
as NORMAL and `attention` is not rendered (see known limitations).

**I — real vehicle contact (2 runs, player's own car).** At 10.3 and 9.5 m/s: target
KNOCKDOWN + disowned + `reactionOwned` → DOWNED + disowned. 64 and 15 bystanders went
AVOID/FLEE from the car. Across 912 recorded transitions (every person within 14 m of the path,
each frame, with the hold timer), awareness downgraded a vehicle or damage state **0** times.
Closing layer snapshot: population 1,970, 12 HQ draws, 0 Skeletons, 0 Mixers, 0 console
errors. Screenshots show the thrown bodies with the blood decal in front of the car.

**A bug I found (`a6eb2c0`).** The eight near humanoids picked
`lifeReaction(p) ?? trafficReaction`, so player awareness always won. While driving, awareness
sees the rider in the car as a standing player, and people a few metres from the bonnet sat at
LOOK. Live: in **8 of 32** frames where the car's own warning asked for guard/startle, the body
showed a head turn instead, for example with a car 2.8 m away at 5.8 m/s. `nearReaction()` now
puts a live guard/startle/escape first and keeps the old order otherwise. The same
deterministic run afterwards has the same 8 input conflicts and **0** wrong reactions, read from
the body (`reactionOf`).

**L — extracted driver (`a7eb2c0`).** Carjack of taxi 5; the driver is pedestrian 1527 (seed
894229037), the same as Codex's run. Before: KNOCKDOWN → DOWNED → RECOVER → **KNOCKDOWN** → DOWNED.
The sim holds a thrown body for `struck` 4.9 s, but the HQ chain reached RECOVER at 3.9 s, was
handed back, and was knocked down again because `struck` was still set. Then the sim stood the
driver at the nearest safe node, **4.41 m** away this run, and walked them off at 1.91 m/s,
while the HQ body lay disowned at the old spot. On hand-back it jumped 2.2–6.57 m in one frame.
Fixed in the render layer only (sim, occupancy, carjack, identity and destination untouched).
While `struck` is set the layer holds DOWNED. From hand-back, a gap above 0.5 m closes at a
bounded rate, finishing within 1.2 s (`HQ_RISE`). Keying it on RECOVER was not enough: the parked
player car replaced RECOVER with AVOID on the next frame. After: KNOCKDOWN → DOWNED (until the sim
lets go) → RECOVER → AVOID → NORMAL → walking, one knockdown, largest move 0.55 m per clamped
0.1 s frame (the bounded 5.5 m/s glide, about 9 cm a frame at 60 fps), arriving at the safe node.
A side effect worth knowing: any body the sim holds down (car and punch victims, 14 s) now lies
for that long instead of standing up at 3.9 s and falling again.

**K — signal phases, live (`cd4ba03`).** SwiftShader renders this scene at 0.2–0.3 fps, so one
108 s signal cycle took about 90 minutes of wall time. K therefore ran in the live page with
the page's own traffic and pedestrian simulations stepped from inside the page, at their own
1/30 s fixed step, while the renderer kept drawing on its own frames. `hq=128` kept the HQ layer
live at a smaller draw budget; the simulated crowd is the full 1,978.

The first two attempts found the real problem. **In player mode the signals froze.** Entering
player mode parks the player's car beside the player, and from the start (12, 24) the first
legal road pose was *on* the scramble, at (9.2, 25.1). The scramble cast stops for any vehicle
on its track, so 24 of them stood on the crossing for good. The controller holds its cycle
until a crossing clears, so every signal on the map stayed at the end of the first pedestrian
phase for 850 simulated seconds. Moving the car off the crossing parked it in the lane the
central stream leaves by, and an 8-car platoon (ids 83–90) stopped behind it inside the scramble
holding the crossing's locks: signals cycled, but nobody was ever given WALK. The parking search
now skips crossings and the plaza, and prefers a pose whose whole body is at least 1.9 m from
every lane and junction centreline, falling back to the old rule only when there is none within
40 m. From the start the car now parks at (−13.5, 49.5).

After the fix, two complete live pedestrian phases (deltas from phase start to end; each end
includes the controller's hold while the crossing clears, 37.1 s at most):

| phase (signal time) | entries | completed | abandoned | violations | stuck recoveries (cumulative Δ) | currently stuck: all / on a crossing (start → peak → end) | on crossing (peak → end) | queues |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 196 | 1,301 | 1,455 | 0 | 0 | 14 | 60 → 65 → 26 / 0 | 1,463 → 0 | 0 |
| 304 | 1,301 | 1,450 | 0 | 0 | 13 | 37 → 67 → 33 / 0 | 1,463 → 0 | 0 |

"Stuck recoveries" is the cumulative count of ambient walkers despawned after being blocked for
35 s. "Currently stuck" is the live number with `stuck > 1 s` at that moment: ambient walkers
held up by others, and never anyone on a crossing. The queue map was empty throughout: the
waiting crowd at the scramble is the choreographed cast, which waits at its kerb rather than in
a crossing queue. 0 console errors.

**Not fixed, recorded:** the *third* live phase (signal time 412) admitted nobody. A route-2
central-stream taxi (id 80) stood inside the scramble area holding its lock. Route 2's 18-car
ring was jammed: its 6 downstream cars waited at the path end, because recycling to the start
needs the start clear and the route's own upstream tail occupied it, and that upstream queue was
stopped mid-route. The same scene headless (traffic + choreography + pedestrian simulation, HIGH,
hero start), with or without the player car parked at the same pose, runs five consecutive
healthy phases (1,301 entries each). So this is a browser-only central-stream spillback that was
not isolated here. It is traffic-stream behaviour outside RUN 10's scope, left for a later plan
rather than widened into this RUN.

**Console.** Fresh pages, HIGH, `hq=1`, day then night, on the RUN 10 code. Day covered walking, running,
a punch and a boarding request; night covered load and idle. Result: **0 errors, 0 uncaught
exceptions, 0 shader-compile messages, no `[role="alert"]` banner** at any checkpoint.
0 Skeletons, 0 Mixers, 1,969–1,971 HQ. The only warnings were 3 per page of Chrome's "AudioContext
was not allowed to start" (autoplay policy without a user gesture), which is not an app error.
No X4122 appears (that is a Windows D3D warning; SwiftShader does not produce it). At 0.1 fps
the boarding sequence may not have finished inside that script's wait, but driving ran in the
I, near-reaction and L sessions, all with 0 console errors.

**Known limitations found here, not fixed (no RUN 11 work):**
- On the HQ crowd LOOK is invisible: it plays `Walk` like NORMAL, and `attention` is not
  rendered.
- The near pool applies the threat rule with no reaction delay or hysteresis ("no clocks"), so
  its eight bodies notice earlier than the mass crowd and can cross thresholds faster.
- A stationary player car still makes people within 8 m ahead AVOID (`THREAT.avoid` ignores
  speed).
- The HQ body falls where it is hit; the simulation carries its own pedestrian through the
  throw. The gap is now closed smoothly on hand-back but the throw itself is not drawn on the HQ
  body.
- Without `hq=1` the scene draws the legacy crowd by design (the RUN 7B rollback).
- A player can still park the car across a crossing themselves, and the signal hold then waits
  for them. Only the automatic parking was fixed.
- Third-cycle central-stream spillback in the browser (see K above).

**RUN 10 is COMPLETE.** RUN 11 was not started.

**After RUN 10 — signal-waiting Idle (`0d8c0d3`).** This is the one item authorised after the
RUN closed. On the HQ crowd, NORMAL played `Walk`, so everyone at a kerb walked on the spot.
`clipFor(behaviour, waiting)` in `hq-crowd.mjs` plays the pack's existing `Idle` clip instead,
only for NORMAL and only while the simulation says `p.state === 'waiting'` (a crossing queue, or
the scramble cast at its kerb). It never keys on speed. Priority is physical > awareness >
waiting/locomotion. This is a visual mapping only: no movement, queue or signal state is
touched. Browser, in a vehicle-green phase: 1,455/1,455 waiting HQ citizens Idle, 0 others Idle,
and the 142–155 stopped-but-not-waiting citizens keep `Walk`. The near humanoids already choose
Idle through their speed-driven locomotion blend and are unchanged.

**Final gates for this handoff (HEAD after `0d8c0d3`):** `npm run typecheck` clean; `npm test`
403 total, **398 pass, 5 existing skips, 0 fail** (up from 383/5/0: 15 new tests, no
regression); `npm run build` successful, and its static re-bake left the tree unchanged. Final
fresh-page console gate on this code, day and night: 0 errors, 0 uncaught exceptions, 0 shader
messages, no banner.


## 9h. RUN 11 — Visual / audio / GTA feel polish

Started from `b037bc8` (RUN 10 complete). Work was done on a local worktree branch and
fast-forwarded onto `claude/gta-fidelity-upgrade`; `master` was not touched. Browser QA ran in
the real HIGH/day scene with `?qa=1&hq=1`, driven over the DevTools protocol in headless
Chromium on SwiftShader at 0.1–1.5 fps. With `FrameGate` clamping dt to 0.1 s, every live check
waits on simulated progress, and no frame rate here is a performance result.

### 11.0 Regression cleanup (`401334e`)

**Old-looking bodies.** Re-diagnosed live rather than trusting RUN 10's count. For every
pedestrian within 20 m of the player the QA pass recorded owner, near body type, HQ lane LOD and
state:
- all were HQ (L0) or near humanoids;
- the legacy renderer drew **no bodies**;
- it DID still draw **971 props** on those same citizens: 657 phones, 174 bags, 63 canes,
  63 suitcases and 14 cone umbrellas.

The prop parts were never masked with the body. HQ and near citizens therefore wore the legacy
capsule's box phone, bag and suitcase and a floating cone umbrella, sized for a capsule, and
after a hit these tumbled on the legacy arc. That is what read as blocky old bodies around the
player, on crossings, in dense crowds and after contact. Props are now drawn only with a legacy
body. Live afterwards: 0 legacy props, 0 legacy bodies, 0 drawn twice, 1,969–1,970 HQ plus 7–8
near humanoids and 0 baked. `tests/crowd-legacy-props.test.mjs` builds the real crowd renderer
with the HQ pack and pins this.

**Walking on the spot at red lights.** RUN 10's Idle keyed on `p.state === 'waiting'` alone.
Measured at a red phase, the defect was a waiting citizen who glanced at the player: they went
to LOOK, and LOOK borrows the Walk clip. LOOK now keeps the stance underneath; STARTLE, AVOID,
FLEE and every physical state still win.
`src/life/stance.mjs` also counts as waiting:
- the scramble cast standing at the kerb between crossings (`exiting`/`recycle`);
- the queue behind the front row, through a `kerbQueue` flag the simulation sets when a blocked
  walker is within 8 m of a closed crossing.
Speed alone never decides. Live at a red phase: **1,455/1,455** waiting HQ citizens and
**8/8** near humanoids Idle. The 120 other stopped walkers were ordinary congestion across the
city (87 of them for under 2 s), none at the scramble, and keep Walk.

### 11.1 Vehicle impact realism (`db1d180`)

**Why hits read wrong.** Two unrelated models ran on one contact:
- *Simulation:* it threw every body along the car's course, whatever part of the car struck
  it, and put 57% of the horizontal speed upwards. A 20 m/s hit flew about 36 m.
- *HQ body:* it ran its own second impulse and usually dropped almost where it stood, so the
  body the player saw did not follow the simulation.
- *Car:* its speed bled off at a flat rate per frame of contact, which double-counted a crowd
  and ignored mass.

**One contact model** (`src/player/vehicle-impact.mjs`, pure):
- *Inputs:* the car's velocity vector, which face hit (front, side or rear), where on that
  face, the closing speed along the contact normal, and the victim's own motion.
- *Output:* an impulse, a lift, a state and the speed the car loses.
- *Kinds:* push (closing < 2.2 m/s: a light HIT that stumbles and stays standing), knock,
  heavy (≥ 7) and launch (≥ 14). The throw is 0.8 × closing, capped at 14 m/s, with a low lift
  (≤ 3.2 m/s), so a body is thrown rather than launched into the air.
- *Direction:* a corner deflects the body off that corner, weighted by how far off-centre the
  contact is. A side swipe throws sideways.

**Following the throw.** Both the simulation's throw (`strike` now takes the impulse) and the HQ
contact use the model. A disowned HQ body now follows the simulation's flight, arc included,
through `crowd.follow`, instead of its own. Thrown bodies get 3.5 m/s² of sliding friction on
the ground, so they come to rest definitively.

**Weight and crowd resistance.** Each contact costs the car speed by momentum exchange: 75 kg
against the vehicle's own mass, 20% restitution, plus a little contact drag. The flat bleed is
gone. A body already lying in the road is shoved forward at most three times (every 0.35 s),
keeps its sideways motion and is never carried along.

**Numbers** (`tests/vehicle-impact-live.test.mjs`, real player vehicle, real flight):

| Case | Result |
| --- | --- |
| Travel after the hit at 4 / 10 / 18 m/s | 1.37 / 5.73 / 10.86 m |
| 10 m/s sedan, one contact | 9.20 m/s |
| … then over that body lying in the road | 8.49 m/s |
| … ten people in a line | 1.95 m/s |
| … a dense block of 30 | 0.95 m/s |

### 11.2 Melee feel (`efb6fbf`, `6162a32`)

**Why a punch looked like a touch.** `controller.startAttack` ignored the attack's name and
length, so the figure always played `Punch` (never the cross), squeezed into the last 0.42 s
of a 0.87–1.0 s swing. That is double speed, and it came 0.2–0.35 s AFTER the measured hit
window had already run the damage. The swing now carries its name and duration, and the clip
plays at its own speed, so the frame the fist is out is the frame the hit test runs.

On top of the clip, an additive envelope (`punchEmphasis`):
- winds the torso up away from the punching side;
- drives spine_02/03 through with the shoulder, leans in and steps the body 11 cm forward;
- peaks exactly at the measured fist-out time and settles to zero.

`tests/melee-feel.test.mjs` pins the peak to the measured `peak` and inside the hit window.
`Hit_Knockback` (UAL2) was not integrated: the repository's character sources are fetched
through `assets/character/upstream.lock.json` with hashes of the official archive, and UAL2 has
no such pinned provenance here. See limitations.

**Victims** (`src/life/temperament.mjs`):
- *How a blow lands:* `blowOn()` gives each blow a strength (jab = light flinch, 0.34 s,
  0.9 m/s push; cross = strong stagger, 0.55 s, 1.7 m/s) and a direction away from the fist,
  classified by the victim's own quarter (front, back, left, right).
- *Movement:* the simulation owns a short stagger, counted down by the frame and never applied
  to anyone on a crossing or the cast.
- *HQ bodies:* a light HIT that stays owned by the simulation (no disown), then gives way to
  the chosen answer through a new `then` state.
- *Near bodies:* they play `Hit` for the blow's hold. Before, the victim was handed
  `combatAction = 1` and played its own Punch.

**Retaliate / flee / back off.** Everyone punched used to turn and fight for 14 s. The answer is
now a deterministic temperament on the same nerve awareness uses:
- fight (nerve > .68) engages as before;
- flee (< .42) runs through the simulation's scatter and HQ FLEE;
- back off (in between) takes a short scatter and AVOID.

Kids and the elderly never fight. Over the 1,978 ids each answer covers more than 15%, and fewer
than half fight. The crossing/cast rule is unchanged: they take the blow and are not stopped.

### 11.3 / 11.4 Witnesses, feedback, audio, camera (`082f702`, `4225ab8`)

**Witnesses** (`hq-awareness.witness`, `WITNESS`):
- *Close:* inside 5 m the whole reaction is immediate.
- *Middle distance:* the witness LOOKs first. The rest arrives after their own reaction delay
  (×1.6), plus 0.035 s per metre and 0.3 s if they were facing away.
- *Far edge:* the outer 20% of the radius only looks.
- *Queue:* escalations wait in a bounded queue (256) that the layer flushes every frame. A
  knocked-down witness is never lifted by one.
- *Vehicle accidents:* a car hit raises an accident witness event (severity 0.55 + closing/15,
  16 m radius), at most one pass per 0.25 s because a pass rebuilds the grid. Three or more
  reacting produce a `crowd_gasp`.

**Event hooks** (`src/app/feedback-bus.mjs`): `vehicle_impact`, `vehicle_runover`,
`pedestrian_scream`, `punch_swing`, `punch_hit`, `pain_voice`, `crowd_gasp`, `panic_voice`.
Each kind has a cooldown, coincident events of one kind merge into one (the loudest), and a frame
delivers at most 6.

**Audio.** Still entirely synthesised: no samples are shipped and there are no new assets or
licences.
- *New sounds:* a swing (a band of noise sweeping up), a punch hit (a body thump plus a short
  slap), a vehicle–person impact (heavier and lower), and a run-over thump.
- *Pooling and caps:* noise buffers are generated once per length and shared (it was a fresh
  random buffer per hit). At most 6 one-shots ring at once, and nothing starts on a suspended
  context, which never releases a source and would have pinned the cap.
- *Voices:* pain (うっ／いたっ／ぐっ) and gasp (えっ) go through the simulation's own voice queue,
  so its per-person cooldown and the 4-voice cap apply.

**Camera and visual.** Person hits added shake multiplied by the number hit in the frame, so a
crowd pinned the camera at full throw (0.42 m). There is now one bounded knock per frame of
contact (max 0.45) and a small punch knock (max 0.25). A contact raises a low road-dust puff from
the existing 72-particle effects pool, adding no draw call. The existing blood marks were not
increased.

### 11.5 Browser acceptance

Real HIGH/day scene, `?qa=1&hq=1`, headless Chromium on SwiftShader. Every scenario opened a
fresh page, and each checkpoint took the same census: population, owners, legacy props and
bodies, Skeleton and AnimationMixer counts, draw calls, non-finite transforms, behaviour
histogram, disowned and struck bodies, and feedback bus statistics.

**A. Old-looking bodies.** Checked at start, middle and end of every scenario below:
- 0 legacy props and 0 legacy bodies on HQ or near citizens;
- 0 citizens drawn twice and 0 baked;
- HQ 1,968–1,970 plus 7–8 near humanoids, population 1,976–1,978 (the gap is victims
  recycling).

**B. Signal waiting** (two full red → green cycles, simulations pumped to each phase and then
40 s of real frames to apply the clips):

| Cycle | Red: HQ waiting Idle | Red: near Idle | Green: HQ crossing Walk | Green: near Walk |
| --- | --- | --- | --- | --- |
| 1 (signal 140 s / 200 s) | 1,455 / 1,455 | 8 / 8 | 1,455 / 1,455 | 8 / 8 |
| 2 (signal 248 s / 308 s) | 1,456 / 1,456 | 7 / 7 | 1,455 / 1,455 | 8 / 8 |

No waiting citizen was on Walk and no crossing citizen on Idle.

**C. Vehicle impacts** (player car aimed at a single pedestrian, then at the densest 4 m cell):

| Case | Kind | Face | Closing | Travel | Direction vs expected |
| --- | --- | --- | --- | --- | --- |
| Low, 4 m/s | knock | front | 6.51 m/s* | 1.15 m | 6.6° |
| Mid, 9 m/s | knock | front | 5.62 m/s | 1.47 m | −2.3° |
| High, 15 m/s | heavy | front | 9.69 m/s | 3.88 m | 0° |
| Diagonal, 9 m/s, 0.8 off-centre | heavy | front | 8.77 m/s | 2.97 m | −12.3° (deflected off the corner) |

\* The low-speed pedestrian was walking into the car, which adds to the closing speed.

- *Every victim:* HQ went DOWNED on `Fall`, with the HQ body 0 m from the simulation's and a
  flight arc of at most 0.28 m.
- *Dense cell of 88 at 10 m/s:* 5.1 m/s after 7 hits, 0.68 after 18, then stopped. The car
  was not carried through.
- *After the hits:* 17 DOWNED and disowned, 56 AVOID, 83 LOOK (witness tiers). Eighteen
  seconds later there were 0 disowned and 0 struck, and the victims had recycled.
- *Feedback:* 70 events emitted, 23 merged, 6 throttled, 41 delivered, at most 3 in one frame.
- *Smoke (§F):* a dense cell of 122 took 7 hits and stopped the car.

**D. Melee** (12 swings next to walking pedestrians, 10 hits):
- *Clips:* both `Punch` and `PunchCross` played. The hit landed at clip progress 0.115 / 0.20,
  inside the measured window (one frame of ordering offset).
- *Victims:* every near-body victim played `Hit` for the blow's hold.
- *Answers:* back off 5, fight 4, flee 1.
- *Afterwards:* all NORMAL again after 16 s, and no hostile left.
- *Feedback:* 32 events, at most 2 in a frame.

**E. Witnesses.** Tiers were seen live in C (AVOID close, LOOK further out). Escalation from LOOK
to AVOID/FLEE is pinned by `tests/awareness.test.mjs`, including the 256-entry bound.

**F. Long mixed smoke** (one page, in order): walk → run → wait at red at the scramble kerb →
cross on the green → three punches on one pedestrian → carjack → drive → hit → dense crowd →
get out → walk → 20 s settle.
- *Punches:* three hits, light/back, strong/left, then light/left and fatal. The victim, a
  fleer, went DOWNED on `Fall` under HQ ownership.
- *Carjack:* succeeded, and the thrown driver was later milling with `cameFromVehicle` set.
- *Hit:* the single-pedestrian hit in this run found no clear line (a building stood between
  car and target) and was skipped. C covers it.
- *Dense crowd:* 7 hits, car stopped.
- *Settled:* population 1,978 (HQ 1,969, near 8), every HQ citizen NORMAL, 0 reacting, 0 down,
  0 disowned, 0 struck. 62 drivers seated, 0 legacy props or bodies, 0 non-finite.
- *Feedback:* 19 emitted, 5 merged, 1 throttled, 13 delivered, at most 3 in a frame.
- *Harness notes:* the harness stepped the player onto the road after getting out, and a
  passing kei car ran the player over. That is existing behaviour (the `轢かれました` retry
  banner). The run hit its 90-minute wall-clock limit before the last two steps; they were
  finished on the same open page.
- *Errors:* all 50 page log entries of the run were replayed on re-attach: 0 errors,
  0 exceptions, 0 shader failures. The only warnings were Chrome's headless AudioContext
  autoplay notices.

**G. Structure.**
- 0 `Skeleton` and 0 `AnimationMixer` on crowd citizens in every census.
- HQ draws stayed at 12; total draw calls 442–461 (RUN 10: 444–458).
- No per-pedestrian physics bodies.
- Audio: 0 one-shots ringing in any census (the headless context stays suspended). The pool
  cap and the suspended guard are pinned in `tests/player-audio.test.mjs`.
- No new startup work: the noise buffers are built lazily, once per length.

**Console gate.** Fresh pages, HIGH, `hq=1`, day then night, on the RUN 11 code. Day covered
walking, running, a punch, boarding, driving and getting out; night covered load and idle.
- **0 errors, 0 uncaught exceptions, 0 shader-compile messages, no `[role="alert"]` banner.**
- 0 Skeletons and 0 Mixers. HQ 1,969 (day) and 1,972 (night); draw calls 473 / 477.
- The only warnings were 3 per page of Chrome's AudioContext autoplay notice, as in RUN 10.

**Final gates** (HEAD `6162a32`, before this document):
- `npm run typecheck`: clean.
- `npm test`: 439 total, **434 pass, 5 existing skips, 0 fail**. That is 36 new tests over
  RUN 10's 403/398/5/0, with no regression.
- `npm run build` (run by `npm test`): successful, and the static re-bake left the tree
  unchanged.

**RUN 10 limitations closed by this RUN:**
- LOOK no longer walks a waiting citizen on the spot.
- The throw is now drawn on the HQ body (`crowd.follow`).
- A light push no longer knocks anyone down.
- The NPC hit reaction is directional in movement: the push goes away from the fist and is
  classified by quarter. It still uses the same `Hit` clip, so it is not directional in
  animation.

**Remaining known limitations:**
- **`Hit_Knockback` is not integrated.** UAL2 is CC0 by its authors' statement, but this
  repository fetches character sources only through `assets/character/upstream.lock.json`, with
  the official archive's hash, and UAL2 has no pinned lock here. Adding it is an asset-pipeline
  change, not a RUN 11 polish item. The victim's `Hit` still barely moves, and a front blow and
  a back blow play the same clip; the stagger and push carry the direction.
- **HQ and near citizens carry no props.** Masking the legacy props removed the capsule-sized
  box phones and cone umbrellas. The HQ pack has no prop meshes, so no citizen near the player
  shows a phone, bag or umbrella now. That needs new assets.
- **Crossing and cast victims are not stopped.** A victim on a crossing or in the scramble cast
  takes the blow (HQ HIT and near `Hit`) but is not staggered by the simulation, for the reason
  in §18.
- **The kerb queue flag rarely fires in practice.** The cast's own `exiting`/`recycle` states
  cover most of the scramble. It exists for non-cast queues behind a closed crossing.
- **A stationary player car still makes people within 8 m ahead AVOID** (RUN 10, unchanged).
- **The near pool has no reaction clocks** (RUN 10, unchanged). Its eight bodies react on the
  frame.
- **Audio could not be heard in this environment.** The headless AudioContext never leaves
  `suspended`. Scheduling, pooling, caps and the suspended guard are unit-tested against a fake
  context, but loudness and mix balance need a listening pass in a real browser.
- **Third-cycle central-stream spillback in the browser** (RUN 10 K) stays a known limitation.
  RUN 11 does not touch traffic or signals, and the two signal cycles above ran without it.
- The player can be run over by traffic after getting out in a road. This is existing
  gameplay and is unchanged.

**Performance observations** (structural only; SwiftShader frame rates are not a result):
- Nothing new per frame is O(population). The feedback bus is O(events), with a 6-event cap.
- The witness escalation queue is bounded at 256 and flushed in O(pending).
- A vehicle contact costs a grid lookup of the car's cells, as before.
- The accident witness pass reuses `witness`, at most 4 times a second.
- No new draw calls: dust uses the existing particle pool, and props were removed.
- Noise buffers are built lazily, once per length.

**Carried to RUN 12:**
- The HQ layer ranks all ~1,978 citizens every frame (~2.3 ms).
- `witness` rebuilds the grid on every call (0.56 ms at 1,978). The accident pass makes this
  more frequent in dense crashes, capped at 4 per second.
- The QA-only `ownership()` census is O(population); it is QA-gated.
- LOW/MEDIUM prebake coverage.

**New assets and licences:** none. Every RUN 11 sound is synthesised at runtime. No samples, no
models, no textures and no new dependencies.

**Commits** (on `claude/gta-fidelity-upgrade`, on top of `b037bc8`):

```
401334e  RUN 11.0: fix crowd render and signal-idle regressions
db1d180  RUN 11.1: directional vehicle impact, weight, and crowd resistance
efb6fbf  RUN 11.2: a punch that reads as a punch, and victims who answer it
082f702  RUN 11.3/11.4: witness panic, feedback events, audio, camera, dust
4225ab8  RUN 11.4: never start a one-shot on a suspended AudioContext; QA hooks for feedback and audio
6162a32  RUN 11.5: report the last landed blow (victim, answer, strength) in the melee snapshot for QA
```

This document is committed on top of `6162a32`; `git log -1` is the final HEAD.

**RUN 11 COMPLETE.** RUN 12 was not started.

## 9i. Crowd realism (branch `claude/crowd-realism`, from `master` `a940ce4`)

Real Chrome on Windows (not SwiftShader), HIGH, `?qa=1`, scene frame rate about **6–7 fps**
on this machine (`__SHIBUYA_QA__.metrics.fps`), so every live check here ran at a real frame
rate, not a clamped headless one. A second dev server was started from this checkout on
**port 5175**; the user's own server on 5174 was left running (see Bug 1).

### Bug 1 — old-model bodies around the player, even with `hq=1`

**Measured cause 1: the 5174 server was not serving this code.** The dev server on
`127.0.0.1:5174` (PID 30036, started 2026-09-22) is rooted at a different checkout,
`Documents/shibuya-run10-play`, and served code older than RUN 10's fixes: its page had no
`ownership()`, no `setHQCovered`, and `/src/life/stance.mjs` returned 404. On that page, in player
mode at the scramble: near pool **24 baked** (the eleven-bone offline figure with the big eared
head and the white back plate) + 8 humanoids, and **971 legacy props** (657 phones, 174 bags,
63 canes, 63 suitcases, 14 cone umbrellas) on HQ/near citizens — exactly what `b87ca60` and
`401334e` fixed. The same probe on this code (5175): within 25 m, 676 HQ + 8 near, 0 legacy,
0 baked, 0 props. That is why the cloud QA never saw it.

**Measured cause 2 (a real bug in current code): the HQ crowd was requested once per page.**
`hqRequested` in `app/ShibuyaScene.tsx` was set on the first request. Toggling traffic rebuilds
the life module; the new crowd came up with no HQ layer, forever, and the humanoid asset was not
handed to its new near pool either. Live after one traffic toggle: `hq:false`, **442 legacy +
21 baked within 25 m**, 1,978 legacy bodies, 972 props.

**Fix:** `src/app/hq-request.mjs` keys the request on the crowd instance: the pack is fetched
once and shared, each rebuilt crowd gets its own layer, a crowd replaced while the pack is in
flight is never enabled, and a tier change re-applies the budget (LOW turns it off, HIGH back
on). A rebuilt crowd is handed the loaded humanoid. `hq-layer.dispose()` hands disowned bodies
back. `?hq=` absent now means the tier default (`hqBudget` → −1); `?hq=0` / `?hq=false` remain
the legacy rollback. Live after the same toggle: HQ back, 455 HQ + 8 humanoids, 0 legacy /
0 baked / 0 props, with no `hq` in the URL.

### Bug 2 — stepping on the spot when stopped

Idle came only from the simulation's waiting flags and Walk played at a fixed cadence
(`writeClip` claimed to scale by speed but did not). **Fix:** `src/life/pace.mjs`, one rule for
the HQ crowd and the eight near humanoids: pace is the smoothed velocity **vector** of the drawn
position (not `p.speed`, which is intent), with hysteresis (start 0.30, stop 0.12 m/s). The
vector matters: jammed ambient walkers sidestep left/right on alternate ticks (0.4 m/s of path,
0.05 m/s of progress); a scalar read that as walking. Walk/Run cadence = stride / measured speed
(Walk 1.30 m, Run 2.687 m per cycle from `citizen.json`), bounded 0.5–1.75×, and a rate change
shifts the phase so the pose never jumps. Stopped NORMAL/LOOK → Idle; stopped AVOID/FLEE →
Guard (never running on the spot); Run above 2.2 m/s for reactions, 3.2 m/s for strollers
(far-LOD walkers move in 0.2 s bursts that read ~3 m/s).

Live, two full signal cycles (~7 fps):

| cycle | red: kerb Idle | green: crossing Walk | near stepping |
| --- | --- | --- | --- |
| 1 | 1,455 / 1,455 | 1,455–1,456 / same | 0 |
| 2 | 1,455 / 1,455 | 1,457 / 1,457 | 0 |

Residual "Walk while net displacement < 0.1 m over 1.5 s": 2–9 of 1,969, mostly far-LOD patrol
walkers 60–200 m away, plus walkers reversing on a patrol route (real movement the metric
cannot tell from dither).

### Bug 3 — running on the spot after a car hit

The HQ body went AVOID/FLEE and played Run, but nothing moved the pedestrian: the choreographed
cast (74–85% of the crowd) never ran `move()`, so `scatter` could not reach it. **Fix, in the
simulation (the source of truth):** `sim.flee` — away from the threat with a deterministic
per-person spread (±0.62 rad; ±0.22 for a dodge), 3–5 m/s, 1–1.8 s or 2.4–5.5 m, accel 10 /
decel 7 m/s², walkable ground or the person's own crossing only, steering round solids and cars,
and a step may not add overlap inside 0.44 m. Flights run first each tick, furthest from the
danger first, so a packed kerb unpacks from its far edge. `sim.vehicleThreat`: in the path with
< 1.5 s to contact → sideways dodge; close → away, but not ahead of the car; below 2 m/s anyone
inside the car's footprint steps out at 1.5 m/s. `sim.panic`: accident witnesses scatter.
Cast members carry their displacement as an offset and walk it back with checked steps (never
into a car). No crossing or queue is released; `isWaiting` is false while fleeing/returning.

Live, same cell (−26, 14), same signal moment, car at 9 m/s:

| | before | after (kerb) | after (on the crossing) |
| --- | --- | --- | --- |
| reacted | 361 | 363 | 371 |
| median moved in 2 s | **0 m** | **2.54 m** | **3.50 m** |
| moved < 30 cm | 323 / 347 | 22 / 353 | 0 / 353 |
| moved > 1 m | 17 | 297 | 353 |
| left / right of the car | 6 / 18 | 163 / 168 | 210 / 161 |
| peak flee speed | — | 4.97 m/s | 4.96 m/s |

Crossing run, direction at each person's farthest point: sideways 197, away 135, toward 39;
compass peaks E 154 / W 121 against a northbound car — the crowd parts to both sides. Bodies
inside the car at the end: 0. Headless on the real network (`tests/crowd-flee.test.mjs`): 347
fled, median 2.22 m, 26 under 30 cm; dodges go across the path; everyone stops, the cast is back
on its track within 12 s, signals keep cycling, 0 signal violations.

### The previous implementer's twelve "might look wrong" items

| # | item | live result | action |
| --- | --- | --- | --- |
| 1 | running on the spot after a hit | wrong (median 0 m) | fixed (Bug 3) |
| 2 | stagger counted in frames | it was already seconds, but the start-of-frame speed made a cross carry ~45% further at 7 fps than at 60 | fixed: exact integral, `push·hold/2` at any fps |
| 3 | sliding: punch push, ground friction, runover | stagger 0.15–0.47 m over its hold under `Hit`/`Startle` reads as a stumble; a lying body sliding is correct | friction retuned (item 9); push kept |
| 4 | bodies inside the car | wrong: a car below 2 m/s left people in its panels | fixed: step-out rule; 0 inside at the end of both live runs |
| 5 | punch emphasis slides the feet | wrong: the root moved 11 cm with both feet planted | fixed: spine lean 0.2 rad instead, no root translation |
| 6 | victim's `Hit` too weak | wrong (baked `Hit` barely moves) | improved: additive spine/head recoil away from the blow, jab 0.2 / cross 0.38 rad; live: a cross from the right played `Hit` for its 0.55 s hold with the direction handed over |
| 7 | pose jumps on HIT→FLEE, Idle↔Walk, KNOCKDOWN→RECOVER | wrong: every clip change popped; one-shots started at a random frame; DOWNED froze mid-fall; getting up snapped | fixed: GPU crossfade (0.25 s, 0.1 s into a hit, 0.6 s getting up), one-shots from frame 0 timed to their state, DOWNED holds the last frame. Live: 813 / 813 clip changes in 4 s blended |
| 8 | Idle bodies sliding | ~4% of Idle bodies drift 0.15–0.3 m/s (jam creep) | band narrowed to 0.30 / 0.12 m/s; residual listed below |
| 9 | throw too flat / short; clip vs direction | wrong: gravity was 16 m/s², slide mostly viscous; the baked Fall goes over backwards whatever the flight | fixed: g 9.81, Coulomb-dominant slide, cap 16 / lift 4 m/s → 1.3 / 8.0 / 17.8 m at 4 / 10 / 18 m/s (was 1.4 / 5.7 / 10.9; reconstruction bands ~6.5–8.5 and 17–25 m); a thrown body turns to face against its flight (live 1.79 → 0 rad) |
| 10 | car stopping in a dense crowd | natural: now most of the crowd dodges, so fewer are hit (7–17 per run instead of every body in front); through a parted crossing the car kept 10.4 m/s | unchanged |
| 11 | LOOK looks like nothing | wrong on standing citizens | fixed: a standing LOOK/STARTLE/RECOVER turns up to 0.9 rad towards what was noticed; walkers don't crab |
| 12 | audio, shake, dust, fighters | fighters **32.7%** (flee 31.6%, back off 35.7%), not ~40%. Shake 0.45 / 0.25 caps unchanged. **Audio not verified:** synthetic clicks are not user gestures, so the page never created its AudioContext, and this session cannot listen | recorded; see next steps |

### Structure and gates

Population 1,978; HQ 1,969 + 8 near humanoids; 0 legacy bodies, 0 baked, 0 props; 12 HQ draws
(8 at night in one census); total draw calls 471–481 (RUN 11: 473–477); 0 Skeleton, 0
AnimationMixer; no new per-pedestrian objects, physics bodies or R3F. Fresh pages day and
night: **0 console errors, 0 exceptions, no error banner.** The only warning is the Windows D3D
`X4122` precision note, logged before the HQ crowd is enabled, so not from its shader.

**Final gates** (HEAD `e2956e3`, before this document): `npm run typecheck` clean; `npm test`
(build included) **467 total, 462 pass, 5 existing skips, 0 fail** — 28 new tests over RUN
11's 439/434/5/0, no regression; the build's static re-bake left the tree unchanged.

### Remaining issues

- **Jam creep in Idle.** Ambient walkers the simulation holds in a jam creep continuously at
  0.15–0.3 m/s and keep Idle below the 0.30 m/s start threshold (a few percent of Idle bodies).
  Real people step-and-stop; the fix is in the walker model (stop-and-go), not the renderer.
- **Far-LOD dither.** 2–9 walkers 60–200 m away still read as Walk with near-zero net progress
  (0.2 s throttled ticks are slower than the pace smoothing).
- **Flee is local.** People flee on ground they can see (walkable or their crossing), never
  across a road, and a packed kerb against a wall has nowhere to go; they press, then walk back.
- **The HQ LOOK turn is the whole body** (standing only). There is still no head turn on the
  mass crowd; that needs an additive bone in the atlas shader.
- **Crossfades are matrix lerps**, not quaternion blends; fine over 0.1–0.6 s at crowd distance,
  and getting up is a 0.6 s blend from lying to Guard, not a get-up clip (the pack has none).
- **Audio is unheard**, and the fighter ratio (32.7%) is a design choice left as is — for a
  Shibuya setting fewer people squaring up may read truer.
- The user's dev server on 5174 still serves the old checkout until it is restarted from this
  repository.

### Next

1. Restart the 5174 dev server from this checkout (`npm run dev:local`) and re-check by eye.
2. Stop-and-go creep for jammed walkers in `simulation.move` (removes the Idle creep).
3. An additive head-look bone in the crowd shader for LOOK while walking.
4. Pin `Hit_Knockback` / a get-up clip (UAL2) through `upstream.lock.json`.
5. A listening pass on the synthesized audio with a real gesture; decide the fighter share.

## 9j. RUN 12 — the final RUN: performance guard, recorded audio, wet-road reflection, PBR ground, motion, robustness, final QA

**Scope and working method.**
- **Base:** started from `master` `6c779cb` (PR #20 merged) on branch `claude/happy-tesla-dkn52d`, PR #21. RUNs 13 and 14 of the old roadmap are folded in here.
- **Choosing what to do:** TIDELIGHT (a small WebGL scene, studied from outside) was used as a checklist of methods, never as a source of code or assets. Taken from it: recorded CC0 sound, a planar reflection, CC0 PBR surfaces, one shared definition for CPU and GPU, and graded quality and robustness. Left out: sun shafts (little use at night) and the no-bundler layout.
- **Verification:** everything was checked in headless Chromium on SwiftShader (0.1–1.5 fps) and by the test suite. **Nothing here has been listened to or watched at a real frame rate.** Those are the user's real-device checks listed at the end of this section.

### 12.0 Performance guard (`ae7e546`, `86110e3`)
- **Ranking:** the HQ layer sorted every pedestrian by distance every frame, allocating a record for each, only to take the nearest `budget`. It now keeps pooled records, orders nothing when everyone fits (HIGH), and runs an in-place O(n) nearest-k selection (`selectNearest`) otherwise.
- **Grid:** the crowd grid (O(population)) is built at most once per synced frame and shared by the vehicle threat, every witness event and the perception tick (`ensureGrid`). It used to be rebuilt up to three times a frame.
- **Cost:** `qa/gta-upgrade/sync-cost.mjs` measures 1,978 walkers over 600 frames, CPU only.

  | Budget | Mean before → after | p95 before → after |
  | --- | --- | --- |
  | 1,978 | 1.355 → 0.975 ms | 1.821 → 1.455 ms |
  | 512 | 0.876 → 0.321 ms | 1.329 → 0.449 ms |

**Quality tiers, as they stand** (collected from the modules that own them):

| | HIGH | MEDIUM | LOW |
| --- | --- | --- | --- |
| Pixel ratio × render scale | ≤1.5 × 1 | ≤1.25 × .6 | 1 × .3 |
| Frame cap | 60 | 30 | 24 |
| Shadows / GTAO / SMAA / bloom | 4096 / on / on / on | off | off |
| Night point lights / spots | 6 / on | 2 / off | 0 / off |
| Environment map | on | on | off |
| HQ crowd budget | 1,978 | 512 | 0 (legacy) |
| Near humanoids / near slots | 8 / 32 | 4 / 12 | 0 / 4 |
| Moving / parked cars | 62 / 12 | 30 / 7 | 14 / 3 |
| Road mirror (12.2) | on at night, 1/2 res, every 2nd frame (4th below 25 fps) | off | off |
| PBR ground (12.3) | on | on | off |
| Recorded audio (12.1) | on | on | on |

### 12.1 Recorded CC0 audio (`0064309`, `deb6415`, `51cd72f`)
- **Sources and pipeline:**
  - `assets/audio/upstream.lock.json` pins 33 CC0-1.0 sources: 32 Freesound sounds, each licence read from the sound's own page, plus Kenney's Impact Sounds.
  - `npm run fetch:audio` verifies every file by SHA-256.
  - `npm run convert:audio` does the rest in a local Chrome:
    - cuts each clip to its window and trims the silence;
    - normalises one-shots to −12 dBFS on their loudest 50 ms, beds to −20 dBFS and the chirp to −16 dBFS, with peaks ≤ −1 dBFS;
    - crossfades loop tails into their heads;
    - encodes to MP3 (lamejs, dev only);
    - records the encoder's 25 ms lead-in.
  - Output: 40 clips, 1.73 MB, in `public/audio/`. Credits are in `docs/AUDIO-ASSETS.md`.
  - Commit `0064309` carries both the pipeline and its runtime. A broken command chain merged two intended commits; it was pushed and not rewritten.
- **Playback** (`src/audio/bank.mjs`, `src/audio/soundscape.mjs`):
  - Clips load after the entering-player gesture and are never awaited; every sound keeps its synthesised fallback until they decode.
  - Variants rotate and detune ±3%.
  - Placed sounds are HRTF panners with the listener on the camera.
  - Caps: 4 voices per kind and 18 in total; a safety compressor guards the output.
  - Two beds scale with the people and moving cars near the ears: Heigh-hoo's real `cross_road_shibuya` and `ginza_ambience` recordings.
  - A Japanese "cuckoo" crossing chirp sits at the scramble during the pedestrian green.
  - Footsteps play per stride actually covered, and tyres squeal on a real slide or a hard stop. Crashes duck the beds, and **H** sounds the horn.
  - Crowd screams, gasps and low grunts use recordings through the voices' own cap, gaps and scream priority. The words stay synthesised.
- **Live** (headless with autoplay allowed):
  - 40 clips decoded, 0 errors, 0 fallbacks once loaded;
  - 3 loops playing and 10 steps over a 5 s walk;
  - punches played as recordings;
  - 0 voices left ringing.

### 12.2 Wet-road reflection (`a5d8bc6`, `06541c9`)
- **Method:** the asphalt's night patch now samples a real mirror (`src/nightglow/road-reflection.mjs`).
  - The mirror camera sits below the road with an oblique near plane.
  - It is sampled along a ripple-perturbed reflected ray and blurred more along the view, the way wet asphalt streaks light.
  - It is weighted by Fresnel and the existing wet mask, and faded at the texture edges.
- **Budget:**
  - HIGH at night only, half resolution capped at 960 px, every 2nd frame (every 4th below 25 fps).
  - Ground, crowd and wet decals are hidden from the mirror.
  - The texture is unbound while it is drawn into, so it can never form a feedback loop.
  - The painted streaks and patches step back (×0.45, ×0.4) instead of doubling.
- **Headless HIGH night:** at CAM-03 and CAM-08 the lit frontage, signs and street lamps now appear in the crossing. 0 errors, 0 shader messages. `__SHIBUYA_MIRROR__.enabled` gives an A/B.
- **Found this way:** the GLSL snippet lacked a trailing newline, so the three.js shader it was prepended to began `}#define STANDARD` and the asphalt failed to compile. A test now checks every preprocessor line.

### 12.3 PBR ground (`612dc5e`, `fd976a0`, `2dbe71f`, `692c110`, `d0512cd`)
- **Sets:** two Poly Haven CC0 sets. `asphalt_track` is 2 m, dark and crack-free, so no repeating cracks. `concrete_pavement` is 1.8 m grey rectangular pavers.
- **Pipeline:** pinned by hash and re-encoded in Chrome's canvas at 1024 px, 4.7 → 1.33 MB.
- **Runtime** (`src/ground/pbr.mjs`):
  - The maps are swapped onto the same materials once the city stands (idle callback), so draw calls are unchanged and the night patches carry over.
  - They tile at real scale.
  - Each material is tinted per channel, in linear light, so the photograph averages exactly what the procedural texture did. The lighting was calibrated against that average.
  - LOW and `?pbr=0` keep the procedural ground.
- **Headless:** applied to both sets day and night, draw calls unchanged (341 / 349), 0 errors. The difference is detail in close-up, not grade.

### 12.4 Motion (`eedfc73`, `63c03dd`, `429ef3a`, `51a4a8d`)
- **Returning cast stay on the pavement.** The walk-back after fleeing a car used a single fallback: once held up for a second, any non-solid step. It is now tiered: after 1 s, walkable ground with a thin 5 cm margin or their own crossing; only after 3 s, any clear step. In one crowd arrangement 7 of 347 fleers had ended off walkable ground; now 0.
- **The head.**
  - A walker who notices something turns the head (≤0.75 rad), and a standing one's head takes whatever the body turn left over.
  - Only bind-pose vertices above the neck turn, faded over 3.5% of the height and pivoting on the neck carried by its own skin matrix.
  - The yaw shares the shoe attribute's slot (`aShoe` is now `vec2`). The crowd shader already uses the 16 vertex attributes WebGL guarantees, and a separate `aHead` failed to link ("Too many attributes"). A test pins it.
- **Wind in the street trees.**
  - The shared leaf material sways in the vertex shader in two unequal gusts per 11 s cycle.
  - The front travels at 3.2 m/s across the street, and the sway is weighted by height so planters barely move.
  - The shadow depth material carries the same patch.
- **Tried and reverted: stop-and-go for jammed walkers.** Measured on the real network over 60 s:
  - the renderer-visible creep (smoothed pace 0.12–0.3 m/s) fell only from 7.6% to 5.9%;
  - stopped walkers went from 12% to 30%, and stuck recycles from 5 to 19.

  The creep is almost all far-LOD walkers 60–200 m out, updated every 0.2 s. Near the player it is ≈0.3% of samples and the renderer's start threshold hides it.
- **Not done, by decision:**
  - Velocity-matched (Hermite) pose transfer: PR #20's crossfades already remove the pops, and the GPU atlas keeps no per-bone state to match.
  - `Hit_Knockback`: its provenance still cannot be pinned.

### 12.5 Robustness (`85ba0f0`, `d6f2c1e`)
- **Hidden tab:** the AudioContext is suspended if it was running, and resumed on return. Live: running → suspended → running.
- **Lost WebGL context:** the sound stops with the picture.
- **Reduced motion:** `prefers-reduced-motion` quarters camera knocks, and `?shake=0` removes them.
- **Touch devices:** the road mirror starts off (`?mirror=1` / `?mirror=0` force it). The tier is not lowered, because MEDIUM and LOW still lack full prebake coverage.
- **Already present:** dt clamp (FrameGate, 0.1 s), load-failure notice, and a fallback for every optional upgrade (HQ crowd, audio, ground textures).

### 12.6 Final QA
**Long mixed run.**
- **Setup:** headless HIGH, player mode, autoplay allowed so the audio really ran. The mirror was off (`?mirror=0`) and the viewport 420×240 so the run could finish. The mirror itself was verified separately in 12.2.
- **Each cycle:** walk or run, two punches, a carjack attempt, a day/night switch through the UI.
- **Length:** 108 s of simulated time, three time switches.
- **Every sample, start to end:**
  - population 1,977–1,978 (1,968–1,969 HQ plus 8 near);
  - 0 legacy bodies or props, 0 Skeleton and 0 Mixer, 0 non-finite;
  - GPU geometries 183 and textures 48, constant from the first sample to the last;
  - JS heap 198 → 186 → 190 → 190 MB (flat);
  - 27 recorded sounds played, 0 dropped, 0 decode errors, 0 left ringing.
- **Console:** 0 errors across all 18 of the page's log entries, replayed on re-attach.
- **Harness notes:** the carjack did not complete inside the harness's real-time wait (boarding takes seconds of simulated time, which is minutes at 0.2 fps). The run hit its 90-minute wall-clock limit inside the third cycle; the final sample was taken by re-attaching to the same page.

**Drive check** (simulated-time waits, same setup):
- boarded a stolen car and drove it into the densest 4 m cell: 10 people hit;
- horn (H) 1, tyre screech on a forced slide 1;
- 21 recorded sounds, including body impacts;
- crowd voices: 63 played (5 of them recorded screams), 159 dropped by the voice cap, as designed for a crowd pass;
- feedback bus: 14 emitted, 10 delivered, at most 3 per frame;
- 0 errors.

**Frame rate here:** 0.1–0.2 fps at both 900×520 and 420×240. The cost is per frame on the CPU, not fill rate, which is in line with RUN 11's headless runs (0.1–1.5 fps). SwiftShader numbers are not a performance result. Real-device fps is the user's check below.

**Console gate.**
- **Setup:** fresh pages, HIGH, the HQ crowd by default, day then night. Day covered walking, running, a punch, boarding, driving and getting out; night covered load and idle.
- **Result:** **0 errors, 0 uncaught exceptions, 0 shader-compile messages, no `[role="alert"]` banner** at any checkpoint.
- **Structure:** 0 Skeleton and 0 Mixer; HQ 1,969 (day) and 1,971 (night); draw calls 473 / 477, the same as RUN 11's gate.
- **Warnings:** only Chrome's AudioContext autoplay notice, as in RUN 11. It is not an app error.

**Final gates:** `npm run typecheck` clean. `npm test` (build included): 496 tests, **491 pass, 5 existing skips, 0 fail**. That is 30 new tests over PR #20's 467 / 462 / 5 / 0, with no regression.

### What the user checks on real hardware
1. **Mirror:** `?qa=1&tier=high&time=night&camera=street`. Look at the wet crossing. Toggle `__SHIBUYA_MIRROR__.enabled` and note fps and draw calls for both.
2. **Audio:** in player mode, walk (steps), stand at the scramble (bed; chirp on the green), punch (E), drive (F), horn (H), brake hard or slide, and hit someone. Say which kinds are too loud or too quiet (`MIX` in `src/audio/bank.mjs`).
3. **Ground:** close up in player mode by day. Compare `?pbr=0`.
4. **Head turns and wind:** drive near a crowd; walkers should turn their heads. Watch the street trees for a few gusts.

### Remaining limitations (added by RUN 12)
- **Audio:**
  - Nothing has been listened to; levels are measured, not balanced by ear.
  - The engine is still the synthesised note.
  - The crowd's words are still formant speech.
  - Freesound transports are the sounds' 128 kbps previews, since originals need an API key.
- **Mirror:**
  - It does not show the crowd or the ground, so reflected people are absent.
  - Its cost on the user's GPU is unmeasured.
  - Off on touch devices.
- **PBR:** only road and pavement. Curbs, crossing paint and tactile paving are flat.
- **Motion:**
  - Far-LOD jam creep remains (see 12.4).
  - The head turn is yaw only.
  - `Hit_Knockback` / a get-up clip is still missing.
- **Tiers:** MEDIUM and LOW prebake coverage is still incomplete (`docs/ISSUE-LOW-TIER-PREBAKE-2026-09-20.md`).

**RUN 12 COMPLETE. This was the final RUN of the GTA Fidelity plan; RUN 13 and 14 are folded in. What is left is the real-device checks above and the limitations listed with them.**

## 9k. After RUN 12 — the punch goes at the person (branch `claude/happy-tesla-dkn52d`, from `master` `c1b89c6`)

**Found on real hardware.** The user's real-device check (a Claude CLI driving Chrome on a
second PC, after PR #21) reported that the punch looked like a sideways swing, arms opening
out to the sides instead of going at the person in front. Measured on the player's own figure,
standing, at the jab's peak:

| | Fist sideways | Fist forward | Fist height |
| --- | --- | --- | --- |
| The clip on its own (`Punch_Jab`) | 0.09 m | 0.76 m | 1.39 m |
| The game before this fix | **0.60 m** | 0.23 m | 1.06 m |
| The game after this fix | 0.07 m | 0.77 m | 1.26 m |

The cross was worse before the fix: its fist ended 0.64 m out to the side and 3 cm *behind* the body.

**Three causes. None of them was in the clips.**
- **The swing was averaged with the idle.** The punch went through the mixer at weight 1 on
  top of a gait blend that already summed to 1, and three.js averages every action that
  animates a bone. The arm was therefore half punch and half hanging at the side: on its own,
  this put the fist 0.45 m sideways.
  - Now a swing *takes* its weight from the gait (`STRIKE` in `src/player/figure.mjs`). The
    total stays 1, the swing fades in over 0.08 s and out over 0.3 s, and during the swing
    the figure is the clip.
  - Other overlays (Hit, Startle, Guard, vehicle entry) still blend the old way. They were not
    reported and are not changed here.
- **The added torso twist ran the wrong way.** RUN 11.2 added `spine.rotateY(±.24k)` and
  `chest.rotateY(±.2k)`. A positive yaw pulls the left shoulder *back*, so a left jab swung
  outward; on its own the twist moved the fist 28 cm off its line.
  - The clips already turn the shoulders into the punch, so the twist is gone.
  - The forward lean stays, reduced from 0.2 to 0.13 rad. At 0.2 the body read as hunched over.
- **The body did not face what it hit.** Standing, the figure only turns to the camera once
  the view is 0.95 rad (54°) away, and the hit arc measured from `bodyHeading`, which is
  updated only while walking. The live run below started with the figure 70° off the camera
  line. Now:
  - A swing locks on to the nearest person within 2.4 m and 1.2 rad of where the player is
    looking (standing) or going (moving); `COMBAT.lockRange` and `lockArc` in
    `src/player/combat.mjs`.
  - The body turns onto that person at 14 rad/s. The aim follows them through the wind-up and
    is then fixed. `attackHeading` and `bodyHeading` are the same value, so the hit arc
    measures from the aim.
  - A swing plants the feet: the player brakes to a stop, and input does not turn the body
    until the fist is back. The clip is a standing punch, and a body carried along under it
    skates.

**Evidence.**
- `qa/gta-upgrade/punchbench.html` renders the player's figure (the game's own update) and a
  target, freezing both swings at their peak from the side and from behind.
- `evidence/run12-punch/punch-before.png` and `punch-after.png` are its output on the code
  before and after this fix.
- **Live headless (HIGH, day, player mode).**
  - A punch locked onto a nearby pedestrian, and the body turned onto the aim exactly:
    figure yaw −3.430 against an aim of 2.853, the same angle.
  - At the peak the fist was 0.77 m forward and 0.08 m to the side, and the hit landed.
  - 0 errors, 0 exceptions.
- `tests/punch-aim.test.mjs` has seven tests. Each fails on the code before the fix:
  - fist in front for both clips, standing and walking;
  - no torso twist;
  - lock-on turns the swing and lands the hit;
  - standing swings go where the camera looks;
  - the aim tracks through the wind-up and then holds;
  - the feet plant;
  - a reset mid-swing hands the whole body back to the gait (caught during this fix: the weights
    outlived `reset()` and blended toward the bind pose).
- **Gates:** typecheck clean; `npm test` 503 tests, 498 pass, 5 skipped, 0 fail;
  `npm run test:ci` 0 fail.

**Still not done.**
- **No lunge.** A hit still registers up to `COMBAT.range` (1.75 m, centre to centre) while
  the fist reaches about 0.9 m. At the far end of the range the victim reacts to a fist that
  stopped short. Closing that needs a step-in clip; sliding the planted feet forward would
  trade one visible fault for another.
- **Not seen at a real frame rate.** Headless runs at 0.1 fps. The swing needs to be watched
  on real hardware.

## 9l. The player bumps into people, fights to four blows, and steers the right way (branch `claude/player-crowd-contact`, from `master` `3e15698`)

**Plan:** `docs/PLAN-PLAYER-CROWD-CONTACT.md`. Implemented in a local Claude CLI session on the
user's Windows PC and checked there in Chrome (HIGH, day). No physics engine, and no
pedestrian-versus-pedestrian collision, as decided.

**What changed, in the plan's order.**
- **Step 0, left and right (`1789913`).** The course sent strafe +1 toward world +x at heading 0,
  where the follow camera's right is world −x, so the touch pad, A/D and the stick all walked
  mirrored. The strafe term is flipped in `controller.step()`; the input sources are untouched.
  The car was already right (right input lowers the heading); both are pinned by
  `tests/steer-direction.test.mjs`, which takes the right vector from the game's own cameras.
- **Step A, contact (`a060c54`).** New `src/player/crowd-contact.mjs`, pure:
  - `bodiesNear` reads the crowd's own 2 m grid, 3×3 cells, and skips the player's slot, the down,
    the dead, and anyone more than 1.2 m above or below.
  - `resolveStep` opens an existing overlap (the player takes at most a third), removes the part
    of the step that would press into a body (a slide), tries the step turned a little either
    side when blocked head-on, and when boxed in still moves the player at 0.45 m/s.
  - It runs in `controller.step()` before `advance()` (walls), through an optional `bodies` hook
    wired to the life system's simulation. With no crowd the step is identical, frame for frame.
- **Step B, giving way (`a76a6c3`).** `yieldToPlayer` extends `reactToRunner`, which it still
  calls at a run. A walking player's cone (1.6 m, 0.7 m either side) and anyone walking squarely
  at them within 2 m step aside with the slow car's dodge flee: 0.35–0.5 m by id, or enough to
  clear the shoulder (at most 0.8 m) for someone right on the line; an oncoming walker on the
  line picks the side by id.
- **Step C, the bump (`e5f8bb6`).** A light flinch (0.25 s) or, at ≥ 3.7 m/s, a strong one and a
  ~0.6 m stagger off rails; a dodge for anyone on rails; ~30% of ids say something, a sprint bump
  a low pain voice and the body thud at low gain; the player loses 40% of their pace on the
  frame; a small camera knock through the feedback bus (`player_bump`). One draw from the
  simulation's seeded rng starts a fight 30% of the time, through `melee.provoke()`, which is the
  same `engage()` a punch uses and counts no swing, hit or witness. The HQ body flinches and then
  looks at the player (`blow` response `'look'`: LOOK is the state that turns the head; the plan
  said `'backoff'`, which does not).
- **Step E, health (`a758742`).**
  - Both sides do 25 (`COMBAT.playerDamage` 34 → 25, `npcDamage` 14–18 → 25): four blows.
  - Everyone punched fights back; temperament still decides what witnesses do.
  - **The kerb rule now holds for the Scramble cast.** `onRails` (exported from `combat.mjs`) is a
    crossing, or a cast member walking the track. Before, `choreographed` alone counted, and since
    the cast is always cast, a punched cast member never fought back anywhere. At a kerb the
    choreography now holds a hostile cast member, and whatever combat moves them is kept as their
    flee offset, so they walk back to their slot afterwards.
  - A traffic car on foot takes 25, throws the player 1–1.5 m through `advance()`, gives control
    back after 1 s, and has a 1.5 s grace; only the hit that reaches 0 is a death.
  - The dashboard health bar (`role=meter`, the number beside it, green / amber at half / red on
    the last quarter), and a game-over dialog (「ゲームオーバー」, 「もう一度」 → `revive()` at 100).
    It is a dialog, not `role=alert`, which is the error banner.

**Found on the device check, and fixed (`50cc98e`, `e90b84f`).**
- **People walked through the player** (minimum gap 0.14 m on the first live walk). A dodge is a
  request; the cast walking a track through the player, someone squaring up, someone fleeing or in
  cooldown did not act on it, and the cast's flee offset closes back onto the track line. Now:
  - whoever is still inside the player's circle after the step is moved out by their share
    (`pushOut`), only onto ground `fleeAllowed` permits, and for the cast through the flee offset;
  - at ~6 fps the crowd takes several 30 Hz steps after the player's step and walked back in before
    it was drawn. `CrowdSimulation.update` calls an optional `postUpdate(dt)` after its steps; the
    scene sets it to `player.settleCrowd()` each on-foot frame (cleared at the start of every
    frame), which moves out whoever the crowd walked in.
- **A fight froze a crossing.** `simulation.move` stopped anyone with a live `combatTarget` where
  they stood, crossing or not. An ordinary walker admitted to a crossing but still on its pavement
  end could be punched or provoked, and held the signal group for 14 s. They now keep walking and
  fight at the far kerb.
- **A stopped car kept hitting.** A van stopped on the player and took 25 each time the grace ran
  out (100 → 50 in 2.5 s), because the throw was along the car's heading. A car under 1.5 m/s no
  longer hits (the old code killed the player for walking into a car waiting at a light), and the
  throw goes sideways out of the car's path.

**Cost.** `qa/gta-upgrade/contact-cost.mjs`: 1,978 walkers, the hero cast mid-crossing, the player
walking 600 frames through the densest 4 m cell; the contact step plus the give-way, per frame.
The first measurement was 0.081 ms mean / 0.219 ms p95 against the plan's 0.05 / 0.15. Hot, the
same calls take ~16 µs; the rest was reading flags off ~50 large pedestrian objects, twice, with
cold caches. `771c735` rejects by distance first, gathers the people round the player once a frame
(`contact.nearby`, shared with the give-way), and gives way once per crowd step (the crowd only
moves on its 30 Hz step). Five runs after that, on this PC with Chrome open: **mean 0.049–0.062 ms,
p95 0.136–0.168 ms** — on the target at best and up to ~25% over it. Machine-dependent; not a
performance acceptance. These runs predate `50cc98e`, which adds the push-out and the settle pass
(both read the frame's `nearby` list; no extra grid scan). In the browser, walking in the crowd was
not slower than standing in it (6.7 / 7.4 fps against 6.3 / 7.2), and the contact step measured
0.03–0.15 ms in ~150 ms frames.

**Device check** (`evidence/player-contact/device-check.json`, with three screenshots).
- **60 s walk**, steered into the densest people every 2 s, HP topped up so fights did not end it:
  - first 40 s, on the pedestrian green: **minGap 0.552 m**, trapped 1.5 s;
  - whole 60 s (the last 20 s after the green, into kerb crowds packed on the cast's 0.32 m slot
    grid): **minGap 0.496 m, trappedSeconds 6.1 s**. The minGap target (0.5) is met on the green
    and missed by 4 mm overall; **trappedSeconds (< 1.5) is missed**: packed kerbs are shoved
    through at 0.45 m/s.
  - 178 bumps, 49 fights (28%, against 30%), signals kept cycling (the end-of-phase hold was six
    cast members still walking, 6–40 m away, the normal clear-out).
- **Left and right:** D walks along the camera's right (1.00), A along its left (−0.92); in the car,
  W+D turns right (heading −2.89 rad, 14.3 m to the right) and W+A left.
- **Four blows both ways:** the HP bar went 100 → 75 (green) → 50 (amber) → 25 (red) → 0 and the
  game-over dialog came up; 「もう一度」 revived at 100. An isolated pedestrian went
  100 → 75 → 50 → 25 → 0 and down on the fourth punch.
- **Cars:** four hits, 100 → 75 → 50 → 25 → 0, thrown 1.28 / 1.40 / 1.49 m, no second hit inside
  3 s, then 「車に轢かれました（taxi）」.
- **Console:** 0 errors, 0 exceptions, no `[role=alert]` banner. Two three.js program-log
  **warnings** (D3D `X4122 ... cannot be represented accurately in double precision`), not errors;
  this branch changes no shader, and they were not traced further.

**Tests.** `tests/steer-direction.test.mjs`, `tests/crowd-contact.test.mjs` and
`tests/player-health.test.mjs` are new and registered. Each behaviour test failed on the code
before its change; the no-crowd, buffer, LOD and wall-throw tests are guards and pass on both.
Tests that encoded the old rules were updated and say so: the diagonal-course test in
`locomotion.test.mjs` (the old sign), the temperament test in `combat.test.mjs` (everyone fights
now), and the punch count in `player-experience.test.mjs` (four, not three).

**Still not done / limitations.**
- **Walking into a dense crowd is deadly.** 30% of bumps start a fight and every fighter does 25,
  so the first live walk (before HP top-up) lost all 100 HP in about 8 s; the 60 s walk lost 275 HP
  in its last 20 s. This is the rule as asked; whether to cap attackers or lower the chance is the
  user's call.
- trappedSeconds in packed kerb crowds (above); the bench is at or up to ~25% over its target.
- The touch pad and the phone cost are not checked here (the phone check is after merge).
- The contact uses the simulated positions (`p.x/p.z`). On the first device walk the drawn
  (`renderX/renderZ`) and simulated minimum gaps were identical; the final walk measured the
  simulated ones only. Colliding against the drawn positions was not needed.
- The two shader warnings above.

## 9m. Looks and fleet, Step A — patterns on clothes (branch `claude/looks-fleet-1`, from `master` `9435b53`)

**Plan:** `docs/PLAN-LOOKS-AND-FLEET.md` Step A. Implemented autonomously in a local Claude CLI
session on the user's Windows PC and checked there in Chrome (HIGH, day and night).

**What changed.**
- **`src/life/garment-pattern.mjs` (new).** Seven patterns: solid, border, pinstripe, check,
  two-tone open jacket, denim and a small print. One GLSL function, `garmentPattern(base, id, p)`,
  drawn on the **bind-pose position** (before skinning), so a stripe is on the cloth and never
  slides across a walking body. Both CC0 rigs are authored at ~1.8 m in model units, y up, facing
  +z, so bind-pose metres are already body-relative; the per-person height scale then scales the
  stripes with the person. Every pattern fades to its flat colour once a pixel covers a good part
  of its period (`fwidth`), which removes moiré at distance.
- **No new attribute.** The top and bottom colours drop to 7 bits a channel and carry a 3-bit
  pattern id in the top bits (`packGarment`): still < 2^24, so float-exact. Skin, hair and shoe
  keep their 8-bit packing. Colour error ≤ 1/255. The HQ fragment shader unpacks with
  power-of-two divisions after rounding (`floor(v+0.5)`), so varying interpolation cannot flip
  the id.
- **Recipe (`appearance.mjs`).** `patternOf(id)` picks a top and bottom pattern with weights by
  life archetype (`PATTERN_WEIGHTS`): office workers solid and pinstripe, young people border,
  check and print, older people solid, joggers plain. The life archetype is read from the id the
  way `CrowdSimulation.spawn` assigns it (`styleOf`), because the HQ layer only has the id and the
  RUN 6.8 rule is that a look is a pure function of it. `deduplicate` still moves only a shirt
  colour, never a pattern.
- **Near characters (`character-asset.mjs`).** The RUN 6.8 garment material embeds the same GLSL
  string, with a `uPattern` uniform. The player's `WARDROBE` stays solid, so the red top stays
  findable.

**Found on the device check, and fixed.** At night about eight near humanoids around the player
wore the player's red top. `dressCitizen`'s `onBeforeCompile` read the palette the material was
**constructed** with; the near pool recolours a slot as soon as it hands it out, often before the
material's first compile, and `recolour` only updates uniforms that already exist. So anyone
handed a slot before its first frame was drawn in `WARDROBE` (red). The compile now reads the
palette as it is at compile time (`material.userData.palette`). This predates Step A.

**Device check** (`evidence/looks-fleet/step-a/`, baseline in `evidence/looks-fleet/baseline/`).
- A/B in one session, `?qa=1&tier=high&time=day&camera=street`: 5.5 fps / 345 draw calls with
  Step A, 5.5 fps / 343 with the Step A shaders stashed. No measurable cost. (The same URL ran at
  8.8 fps earlier in the night; fps between sessions on this PC is noise, compare within one.)
- Night street, player mode: 5.2 fps, 479 draw calls, 8 near humanoids, no `[role=alert]`,
  0 console errors from the page loads after the fix.
- Screenshots: patterns on bodies next to the player by day, the red-top bug and its fix at night,
  and distant figures fading to flat colour.

**Tests.** `tests/garment-pattern.test.mjs` (10, registered in `test:ci`): pure by id, shares
within ±3% per life archetype (200,000 ids), pack/unpack for every palette colour × every id,
the HQ crowd writes the id, HQ and near embed the identical GLSL string and use the bind-pose
position, every preprocessor line starts its line, the crowd attribute set is unchanged (≤ 16
slots), the player stays solid, `deduplicate` keeps patterns, and a slot recoloured before its
first compile is drawn in the new colours. The last one fails on the old `onBeforeCompile`; the
rest fail on the pre-Step-A code (the module did not exist).

**Not done / limitations.**
- Shimmer was judged from stills at ~5 fps, not watched at 60 fps. The phone and MEDIUM on the
  device are not checked.
- The print dots and check squares are drawn in the bind-pose x–y plane, so they stretch on the
  sides of the body (where the surface faces x). Stripes along y are unaffected.
- The open-jacket panel is a band at |x| < 6 cm on the front; on the long-hair body it can meet
  the hair.

) and the no-AO list still match. `sortObjects` is off (nothing
  needs it; InstancedMesh never sorted either), per-object frustum culling is on.
- **Paint per car** (`paintOf(id, type)`, pure): the plan's table (pearl white 30, black 20,
  silver/grey 20, dark blue 8, red 5, others 17) with a few shades per entry; vans and trucks draw
  from a white-heavy mix and kei cars from one with pastels. Taxis: black, deep indigo,
  yellow-and-green and cream-and-maroon (no company name). The bus: green lower, cream upper.
- **Liveries in the body shader.** The batch colour's RGB is the lower colour; its **alpha**, which
  an opaque material ignores (`#define OPAQUE` sets `diffuseColor.a = 1`), carries
  `livery*8 + band` (band in metres). The shader mixes to the livery's upper colour above the
  band on the bind-space height. `LIVERY.police` (black lower, white upper) is ready for Step C.
- **Roofs.** One-box and cab-over silhouettes take `roof: .94`: their steel roof panel now covers
  every station above 94% height instead of 98.5%, which had left a van with a mostly glass roof.
  Sedans and hatches are unchanged, and so is the player's car.

**Found on the device check, and fixed.**
- **The livery compiled out.** It was guarded by `USE_BATCHING_COLOR`, which three defines only in
  the *vertex* prefix; the fragment prefix gets `USE_COLOR_ALPHA` for a batch colour. Every taxi
  was drawn in its lower colour. A test now forbids the vertex macro in the fragment snippet.
- **Glass roofs on vans** (above).

**Device check** (`evidence/looks-fleet/step-b/`): whole-scene draw calls at the street camera
345 → 285 by day and 353 → 293 at night; 7.8 / 8.0 fps against 8.8 / 8.2 in an earlier session
(this PC's between-session spread is larger; not a performance result). 0 console errors, no
banner. Head- and tail lamps still ramp at night.

**Tests.** `tests/traffic-fleet.test.mjs` (8, registered): the general mix within ±3% of the table,
vans whiter and kei pastel, taxis only the generic schemes, paint pure by id, every lofted type
has all five parts, traffic is five `BatchedMesh`es named as day-night expects (34 before), every
active car is one visible instance at its pose (scooter glass hidden), the livery snippet is in
the compiled body shader with every directive at line start and no vertex-only macro. They fail
on the code before (the module did not exist). `s9-traffic` / `s12-day-night` are legacy
stage locks (`test:legacy`) and fail the same 4 tests on the base commit as with this change.

**Not done / limitations.**
- The loft at detail 0 is heavier per car than the old boxes (≈870 body vertices, ≈1,800 dark
  with the wheels). Triangles went down at the street view (24.7 M → 23.0 M whole scene), but the
  per-car vertex cost is unmeasured on the phone.
- Only the cream taxi was inspected close up; the other liveries were checked in tests, not by eye.
- The glass reflects the sky strongly by day and can read as clear.
- The ☆ name guard test comes with Step C.

## 9o. Looks and fleet, Step C — the Japanese street classes (branch `claude/looks-fleet-3`, on `claude/looks-fleet-2`)

**Plan:** `docs/PLAN-LOOKS-AND-FLEET.md` Step C.

**What changed.**
- **Seven types** in `VEHICLES` with fictional names: `longVan` "Cargo Hauler", `minivan` "Grand
  Voyage", `tallKei` "Tall Box K", `cityTaxi` "Metro Cab", `truck2t` "Delivery 2t", `police`
  "Patrol", `coupe` "Street GT". Each has a silhouette (new loft profiles `semibonnet`, `minivan`,
  `tallbox`, `mpv`, `coupe`; the truck is the cab-over plus a cargo box, the patrol car the saloon),
  a mass in `VEHICLE_MASS`, a spawn weight and the loft's anchors. Seated drivers use the same
  anchors, so they sit in every new type.
- **Spawn mix** is the plan's table (taxis 25, minivan 14, kei 12, vans 10, trucks 8, scooter 5,
  coupe 2, police 1.5, bus on major roads; the sedan takes the rest) and the weights sum to 100.
  The parked mix (`PARKED_MIX`) now includes tall kei, minivans, long vans and 2t trucks.
- **The patrol car.** Black lower body and white upper (band at 58% of the height, so bonnet and
  boot lid are white — tuned on the device from 70%), a red roof bar and no text or emblem. The
  bar is in the tail-lamp part, so it is dark red at rest and can be lit with the rear lamps for
  the siren (PLAN-POLICE W3); `anchors.lightbar` marks it.
- **Handling per body.** `VEHICLES.steer / grip / slide` feed `vehicle-dynamics.mjs` (defaults are
  the old single tuning): a long van turns less than a saloon, a coupe more.
- **Rebaked** the static pack (lanes now list the new types in `allowed`) and the playable pack
  (13 close-range bodies), both as generated commits.
- **Hero staging** (the opening scene's queues at the Scramble) now stages the shortest bodies
  first and retries once. The longer mix had cut the default seed from 15 to 13 staged cars
  (`ui-commercial-mobility` wants ≥ 14); now 14. Across seven seeds it was 13–15 before and is
  12–14 now: the queues are only so long and the plan's mix is longer on average.
- **Name guard** (`tests/name-guard.test.mjs`): fails on real maker, model, body-kit, film or
  agency names (including 警視庁 and the emblem) in `src/` and `app/`. "Skyline" and "Crown" are
  matched only as proper nouns, because the codebase uses a building's crown and a city skyline;
  chassis codes like s15 are left out because the stage ids are s1–s16.

**Device check** (`evidence/looks-fleet/step-c/`): all 14 types on the street at once by day;
287 draw calls by day (285 with Step B) and 293 at night; 0 console errors, no banner.

**Tests.** `tests/fleet-types.test.mjs` (7) and `tests/name-guard.test.mjs` (3), registered: each new
type has a silhouette, mass, weight, anchors, a seat inside the body and all five parts; the mix;
every type is allowed on the baked lanes and the new bodies park; the player can take every new
type and it is drawn from the playable pack; a long van turns less than a saloon and a coupe more;
the patrol car's livery and roof bar; the truck's box height. They fail on the code before (the
types and exports did not exist; the guard's label test fails without fictional names).

**Not done / limitations.**
- No door text on the patrol car (the plan allowed a generic "POLICE"; there are no textures in
  the fleet batches, and none is the safe side).
- Not driven by hand on the device; the take-over and close-up model are tested.
- The opening scene holds 12–14 staged cars depending on the seed, one fewer than before on
  average.

## 9p. Police plan, Step H — the player's own car, "Kaze FR" (branch `claude/looks-fleet-4`, on `claude/looks-fleet-3`)

**Plan:** `docs/PLAN-POLICE-AND-OWN-CAR.md` Step H (takes over `heroWide` from PLAN-LOOKS Step D).

**What changed.**
- **Shape.** A `fastback` loft silhouette: a low nose that slopes to the bumper, a long sloping
  backlight and a short tail. The kit is geometry in the dark part — a bonnet skin that follows
  the belt from the screen to the nose, side skirts between the arches, a front lip and a small
  wing — so the orange-and-black two-tone needs no shader and looks the same in traffic and
  close up. Round tail lamps (two a side), dark rims (`VEHICLES.ownCar.rim`), and no badge or text.
- **Pop-up lamps.** Two pods hinged at their rear top edge on the bonnet. Shut, the top is flush and
  the lamp face (on the pod's underside) is hidden; a quarter turn stands the pod up and the face
  looks ahead. On the close-up model they follow the head lamps: `day-night.mjs` ramps the lamp
  emissive at dusk, and `popupTarget(level)` opens them above 0.45 (day .14, night ~0.84), moving
  at 3.2 rad/s. The traffic batch draws the car with its pods shut.
- **Ownership.** `CAR.type` is `ownCar` (weight 0, `owned`). Traffic never spawns it (the initial
  one-of-each spawn skips weight-0 types), never drives it, and `setTier` never despawns an
  `owned` slot. `spawn` parks it near the player as before; `keepOwn(dt, x, z)`, called every
  on-foot frame, parks it again near the player 6 s after it is gone from the pool, left more than
  160 m away, or left with damage ≥ 0.95 (`OWN`). The parking search (`findParking`) always uses
  the own car's body, not whichever car the player holds.
- **Handling and sound.** `steer .74, grip 7.5, slide 1.5` (sedan .62 / 13 / 2.8); the engine
  takes an optional voice (`engineVoice`): 74–236 Hz square waves against the default 46–132 Hz
  saws. Synthesised; nothing recorded.
- **Not done:** the neon underglow (optional in the plan).

**Device check** (`evidence/police-own-car/step-h/`, HIGH night): the player starts with the own car
36 m away, F gets in (occupancy PLAYER SEATED), 406 draw calls in the car, 0 errors. The kit,
wing and round tail lamps are visible; the pods rising is covered by the test, not seen from the
chase camera.

**Tests.** `tests/own-car.test.mjs` (6): anchors, doors, pods, parts, fixed paint, close-up pack;
the pods rise and the lamp faces forward open and down shut, and are up at night and down by
day; the drift tune slides more than the sedan under the same handbrake turn; traffic never spawns
it and a tier change never despawns it; walked 200 m away it returns near the player only after
the delay, and rebuilt when despawned; the engine voice. Fails on the code before (no `ownCar`,
`POPUP`, `OWN`, `engineVoice`).

**Limitations.** The drift and the engine note need a person at the wheel. The pods are a box
shape. The implementation commit also carries the regenerated `src/player/generated/vehicles.mjs`.

## 9q. Police plan, W1 + W3 — the wanted level, the siren and the roof bar (branch `claude/looks-fleet-5`, on `claude/looks-fleet-4`)

**Plan:** `docs/PLAN-POLICE-AND-OWN-CAR.md` W1, W3 and the HUD half of W4.

**What changed.**
- **`src/police/wanted.mjs`** (pure). The crime table in one `WANTED` object: the 2nd fight kill ☆1;
  a run-over kill ☆1 at once and a 2nd inside 60 s ☆2; punching an officer ☆1 or +1; ramming a
  patrol car or 4 kills ☆2; taking a patrol car, killing an officer or 8 kills ☆3; 15 kills,
  2 officers or 90 s at ☆3 ☆4; 25 kills or 4 officers ☆5; a carjack an officer sees ☆1. A crime
  an officer (for now: a patrol car within 45 m) sees is known at once; one only civilians saw is
  reported after 4–8 s (fixed by the crime id) and dropped if every listed witness is gone; one
  nobody saw is unknown. Run-overs, a stolen patrol car, rams and crimes against officers are
  known at once. Escape is GTA V's: solid while seen (`lastSeen` follows the player), flashing
  while not, a search circle of 60/90/120/160/200 m on `lastSeen`, and 12/18/25/35/45 s outside it
  unseen clears the level. Being seen restarts the clock. Arrest, death and respawn clear it.
- **`src/police/siren.mjs`.** The Japanese electronic wail: a triangle sweep 650 → 1450 → 650 Hz,
  1.6 s each way, eased at the ends; a 0.34 s yelp; a Doppler factor from the closing speed. Two
  oscillators (saw + square) through a band-pass into an HRTF panner at the car, on the sound
  bank's effects bus (`bank.bus`, new), so its master and safety compressor hold. Only the two
  nearest sirens within 260 m get a voice. The loudspeaker says 「そこの人、止まりなさい」 /
  「前の車、止まりなさい」 through `speechSynthesis` in `ja-JP` at most every 8 s, and is silent when
  there is no Japanese voice.
- **Lamps.** A patrol car with `siren` flashes its roof bar (and its rear lamps, as real ones do)
  at 2.4 Hz through the rear batch colour; the close-up model does the same through `setRear`.
  **No point lights:** the plan allowed two within the night budget, but adding lights changes the
  light count every lit material is compiled for, and the HIGH budget is already at 6. The bar
  is emissive and blooms.
- **`src/police/director.mjs`** wires it: fight kills (from `melee.snapshot().npcDeaths`, witnesses
  = people within 25 m), run-overs (`impacts` of kind `runover`, once per body), rams (the patrol
  car the player's car touched, `state.rammed`, ≥ 2 m/s), a stolen patrol car (once per slot), and a
  carjack. While the player is wanted, patrol cars within 300 m run their sirens (they do not
  chase yet: W2). **H** in a stolen patrol car toggles its siren instead of the horn.
- **HUD.** Five stars above the speed readout beside the health bar, solid or flashing
  (`prefers-reduced-motion` stops the flash), and a 2.5 s banner 「手配度 ☆N」 when a level is
  reached.

**Device check** (`evidence/police-own-car/w1-w3/`, HIGH night): a run-over fed to the director gave
☆1, the star and banner, two responding patrol cars with sirens (two voices running) and the roof
bar lit red on the wet road; 0 errors. The siren was not listened to.

**Tests.** `tests/wanted.test.mjs` (12): every row of the table, the user's three rules, the officer
assault step, reported versus seen and a cancelled report, solid/flashing and the escape per star
(not inside the circle, not before its time), being seen restarts it, 90 s at ☆3, clearing on
arrest/death/respawn, the sweep period and range, the nearest two, silence without audio or a
Japanese voice, and the director end to end (two fight kills → ☆1 and a responding siren; a
run-over once per body; a stolen patrol car ☆3 and H). New modules, so they fail on the code before.

**Limitations.** "Seen" is distance to a patrol car; there is no line-of-sight test yet and no foot
officers (W2). Civilian witnesses are a count, so a report is never cancelled in the game (the
module supports ids). The siren's sound is unheard and untuned.

## 9r. Police plan, W2 — pursuit, giving way, officers and the arrest (branch `claude/looks-fleet-6`, on `claude/looks-fleet-5`)

**Plan:** `docs/PLAN-POLICE-AND-OWN-CAR.md` W2. New `src/police/units.mjs`, driven by the director.

**What changed.**
- **Patrol cars.** Caps 1/2/4/5/6 by star. One is added every 1.5 s below the cap, in a free traffic
  slot, at a lane sample 80–200 m from the player that the camera frustum does not contain
  (`inView` in the scene) and the flow field can reach. It is a `controlled` slot, so traffic sees
  it and stops behind it but does not drive it.
- **How they drive: a flow field, not a route.** Measured on the HIGH graph, fewer than one lane
  pair in ten is connected (lanes are one-way segments that traffic leaves at the end of a route);
  a routed chase wandered off, and look-ahead steering with `safePose` stalled in narrow streets.
  So the carriageway is a 4 m grid (a cell is road when its centre or one of four inner points is:
  centre-only sampling left 56 islands, this leaves 6 with 98.8% in one piece), built ~150 cells a
  frame from entering player mode (1.3 s of `ctx.onRoad` in total; fps unchanged while building),
  with a breadth-first distance from the player's cell refreshed every second. A car steers at the
  point three cells down the field, slows for sharp turns, drives the last 30 m straight in and
  stops 4.5 m short.
- **Traffic gives way.** Cars within 40 m ahead of a siren and going the same way (±60°) brake and
  hold (`givingWay`). They do not pull to the kerb yet.
- **Officers.** Caps 2/4/6/8/8. A pedestrian 40–140 m away and out of view (near the koban at ☆1)
  is taken out for one frame, so the HQ layer drops the old body, and comes back with
  `appearanceId = OFFICER_BASE + id`: `appearanceOf` gives that id the same body in a navy
  uniform with no pattern (still a pure function of the id, and `deduplicate` never recolours a
  uniform). They run in (3.4 m/s), cross roads (only walls stop them), come to arm's reach, grab
  a player who is not fighting — 2 s is an arrest, a punch breaks it — and use the baton, 15 a
  hit every 1.1 s, on one who is. The civilian fight loop skips them. A punch on an officer is an
  assault, a kill an officer kill (W1).
- **In a car.** Stopped (< 1 m/s) with a patrol car against it for 3 s is an arrest.
- **The arrest** freezes the player, gets them out of a car, and shows the game-over dialog as
  「逮捕 / 警察に捕まりました。交番から再開します」; 「もう一度」 revives them at the koban (the station
  koban POI) with 100 HP and the stars cleared. A baton death reads 「警官に取り押さえられました」.
- **Leaving.** When the level clears, cars drive away down the field and officers stop; each is
  freed only when out of view and more than 60 m away, so nothing pops out in sight.

**Found on the device check, and fixed.** Officers stopped 4 m short — the civilian fight loop only
acts on people standing on pavement; units now own officers. The arrested player respawned at the
start — `revive()` re-places the player, so the koban placement moved after it.

**Device check** (`evidence/police-own-car/w2/`, HIGH night, standing still): at ☆2 two patrol cars
came from 167/172 m to 4–5 m, four officers from 40–120 m to arm's reach, then 逮捕 and a respawn
4.7 m from the koban at 100 HP, stars cleared; 0 errors; fps unchanged while the field built.

**Tests.** `tests/police-units.test.mjs` (9): a lane route; cars never spawn in view or nearer than
80 m and reach each star's cap; a car closes in and stops short, stays while in view after the
level clears and is freed out of view; traffic ahead of a siren slows (not beside, not oncoming);
officers are converted out of view in uniform with their own body and return to being people;
uniforms are pure and not deduplicated, and the baton is 15; the arrest on foot (2 s, broken by a
punch); the arrest in a car (3 s, reset by driving off); officers close in and the baton hits a
player who fights back.

**Limitations.** No line-of-sight test (a patrol car or officer within 45 m "sees"). Patrol cars do
not collide with traffic or box the player in (no PIT at ☆3). Officers do not get out of the patrol
cars; they are pedestrians from the street. The grab has no animation of its own. Traffic brakes
for a siren but does not pull over.

## 9s. Police plan, ☆4–☆5 extras and the W4 balance cap (branch `claude/looks-fleet-7`, on `claude/looks-fleet-6`)

- **Unmarked car** (`unmarked`, "Unmarked"): the saloon loft in a fixed dark paint with one small
  red beacon dome on the driver's side of the roof (tail-lamp part, so it flashes with the siren).
  One joins the chase at ☆4.
- **Riot transport** (`riotBus`, "Riot Transport"): the one-box loft at bus size in a blue lower,
  white upper livery (`LIVERY.riot`). One joins at ☆5. No lettering on either.
- Both have weight 0 (never ordinary traffic) and share a `police` flag with the patrol car
  (`isPolice`), so sight, sirens, rams and "taking a police car" (☆3) cover all three.
- **Roadblock** at ☆4, once per episode: two patrol cars parked across the road, side by side,
  80–140 m from the player and out of view, on a cell the flow field reaches, turned across the
  direction the field runs there. They stand until the level clears, then leave like other units,
  and count toward the cap (5 at ☆4).
- **Balance cap** (W4): while wanted, a crowd bump starts a fight only while fewer than two
  civilians are already fighting the player (`POLICE.bumpFightCap`, `allowBumpFight`); officers and
  finished fights do not count. A tuning constant for the user.
- **Not done:** cones at the roadblock, riot officers with shields (officers are the ordinary
  uniform), the riot transport unloading anyone, and a PIT manoeuvre.
- **No device check.** Claude Code stopped the dev server because the PC ran low on memory while
  this step was being built, and the rule is not to restart it unasked. Covered by tests only.
- **Tests:** `tests/police-extras.test.mjs` (3): the extra types are police, weight 0, fixed or
  liveried paint, with a beacon; ☆4 gives a parallel, stationary two-car roadblock and an unmarked
  car within the cap, ☆5 a riot transport; the balance cap. New exports, so they fail on the code
  before.

## 9t. Looks and fleet, Step D (the rest) — two parked night cars (branch `claude/looks-fleet-8`, on `claude/looks-fleet-7`)

The orange widebody became the player's own car (§9p). The other two:
- **"Tsuki S"** (`heroSilver`): the coupe loft at 4.3 × 1.72 m in silver-blue, side skirts, lip and a
  **big** wing (taller posts, wider plank), no black bonnet. **"Yoru Z"** (`heroDark`): 4.2 × 1.84 m,
  gunmetal on black rims, the small wing. `kit` now takes `{bonnet, wing:'small'|'big'}`; `true`
  still means the own car's full kit.
- **Where.** `HERO_SPOTS`: two unclassified side streets 6.5–7 m wide, 72 m and 98 m from the
  Scramble (found with a lane query, not guessed). `placeHero` parks each at the nearest legal kerb
  pose, deterministic, on the initial refill at HIGH and MEDIUM; `setTier` keeps them above LOW. They take two of the parked budget (HIGH stays at 12 parked, which `static-mobility` pins): they are placed first and the ordinary parked mix fills the rest.
  Weight 0: never ordinary traffic. The plan's "one sometimes drives the loop at night" is not done.
- **Handling and sound.** Drift tunes like the own car (steer .74/.72, grip 8/8.5, slide 1.6/1.7) and
  higher-revving saw-wave voices (64–220 / 58–205 Hz).
- **Not done:** the neon underglow, the night loop drive, and a device check (the dev server had
  been stopped by Claude Code for low memory; not restarted unasked).
- **Tests:** `tests/hero-cars.test.mjs` (4): fictional one-offs with fixed paint in the close-up
  pack; parked within 25 m of their spots at HIGH and MEDIUM and staying parked, none at LOW; the
  player can take both, they slide more than the sedan and rev higher; the big wing and no bonnet
  skin. `ui-commercial-mobility` (the opening staging) still passes with the two extra parked cars.

## 9u. Police voice/Kaze detail, Step P — the patrol car reads as a Japanese black-and-white (branch `claude/police-voice-kaze`, from `master` `b2a39ef`)

**Plan:** `docs/PLAN-POLICE-VOICE-KAZE-DETAIL.md` Step P.

**Diagnosis.** The livery band was a height *fraction* (`LIVERY.police.band` in `src/traffic/fleet.mjs`)
multiplied by the vehicle's height to get a metres threshold the body shader splits on
(`liveryCode`, `FLEET_LIVERY_GLSL`). At `.58` that threshold (0.853 m on a 1.47 m-tall patrol car)
sat well below the sedan silhouette's real beltline (`SILHOUETTE.sedan.belt` reaches 1.110 m across
the doors, `src/traffic/vehicle-shape.mjs`) — deep in the lower door. The car was mostly the upper
(white) colour with a thin black sliver at the rocker: not black-and-white, closer to a plain pale
car, which read as "grey" rather than a crisp two-tone. The shader/batching pipeline itself
(`installLivery`, the `USE_COLOR_ALPHA`-not-`USE_BATCHING_COLOR` guard from §16a/§9n) was already
correct — this was purely the wrong threshold. A second, smaller effect was found and left
unfixed: see Limitations.

**What changed.**
- **Livery band.** `LIVERY.police.band` is now `.74` (band 1.088 m, within 2 cm of the sedan
  profile's actual beltline at the car's centre). Black now covers the bonnet front, doors, boot
  sides and both bumpers (which live in the same `paint`/body group, so they fall out of this fix
  automatically); white covers the doors' top edge, pillars and roof.
- **Light bar.** The flat `BoxGeometry` plank pushed into the `tail` part is replaced with a
  roof-width bar on a low dark mount (`parts.dark`): two 12-segment `CylinderGeometry` lens
  sections (rounded, not boxy) in a new sixth fleet batch (`lightbar`, `src/traffic/fleet.mjs`
  `FLEET_PARTS`), either side of a clear/white centre section that shares the existing headlamp
  batch (`lamp`/`front`, always lit, never flashing). A pair of small cylinder lamps low in the
  front grille share the `lightbar` batch. `render.mjs`'s `sync()` gives `meshes.lightbar` its own
  per-instance colour (`flashPhase()`-driven red flash while `v.siren`, a dim red rest state)
  independent of `meshes.rear`, so the siren no longer ties the light bar to the tail lamp's colour.
- **Draw calls.** `traffic-fleet-lightbar` is a new BatchedMesh, contributed to only by the police
  type (like `glass` already skips the scooter) — `stats.batches` goes up by exactly 1 for the
  whole fleet, the plan's allowed budget.

**Tests.** `tests/traffic-fleet.test.mjs` (11, 4 new/changed): the livery band sits within 0.15 m of
the profile's real beltline vertex and above 55% of the vehicle's height (not down in the door);
the light bar geometry has more than 150 vertices (a rounded cylinder, not a handful of box
corners), sits above the roof, and is not part of `tail`; the fleet still draws in exactly 6
batches (was 5) both directly and through `buildTraffic`'s `stats.batches`. All four fail against
the pre-fix code (checked with `git stash` before writing the fix).

**Device check.** Traffic spawns police at only 1.5/100 weight and the Scramble camera keeps every
car small, so the precise colour comparison was done by rendering the exact production code
(`buildVehicleShape`, `fleetGeometry`, `installLivery`, `paintOf`, `liveryCode`, unmodified) under
the exact `DAY_NIGHT` day/night light constants, standalone, in a same-origin dev-server page — see
`evidence/police-voice-kaze/step-p/metrics.json` for the numbers and
`day-and-night-near-far-taxi-sedan.jpg` for a live in-game render beside a taxi and a sedan. A
single-pixel vertical probe through the door and roof: day, door `rgb(0,0,0)` / roof
`rgb(210,208,203)` — crisp black-and-white; night, door `rgb(0,0,0)` / roof `rgb(96,98,98)` — the
split is in the right place and the roof is clearly not black, but it is a mid-grey rather than a
crisp white (see Limitations). The live app was reloaded at HIGH/night with the new code active
through HMR: 0 console errors, drawCalls 269, scene otherwise unchanged.

**Limitations.**
- **Traffic paint is not registered for night emission.** `src/environment/day-night.mjs`'s
  `installNightEmission`/`DayNightSystem.register()` only matches building, window, ground, sign
  and train mesh names — nothing under `traffic-fleet-*`. At night every traffic material gets only
  the global 8%-intensity key light and 22%-intensity hemisphere fill with no per-material
  compensation, so the police livery's white now sits at the correct height but renders at about
  38% of its daytime brightness (a visible light grey, not a crisp white) — see the probe numbers
  above. This is a second, smaller contributor to the original "looks grey at night" report,
  separate from the beltline bug, and is **not fixed in this step**: it would mean either adding
  traffic to the night-emission registry or giving the livery shader its own night boost, and
  either changes how every other traffic colour reads at night too, which deserves its own look
  rather than folding into this PR. Flagged for the user's own eyes.
- No live screenshot of a spawned patrol car at the Scramble crossing was captured (police is rare
  in ordinary traffic; forcing its spawn weight up on the shared dev session was tried, then
  reverted, without a clean screenshot landing before time ran out — see the standalone render
  instead).
- The player's own close-up vehicle asset (`src/player/vehicle-asset.mjs`, used if the player ever
  drives a stolen patrol car up close) has no livery mechanism at all — it paints the whole body one
  flat colour (`VEHICLES.police.color`, near-black). This predates Step P and is out of its scope
  (Step P is the traffic-rendered patrol car only, per the plan), but is worth a future step if the
  player drives a stolen patrol car often enough to notice.

## 9v. Police voice/Kaze detail, Step V — a human-sounding loudspeaker, no VOICEVOX (branch `claude/police-voice-kaze-2`, on `claude/police-voice-kaze`)

**Plan:** `docs/PLAN-POLICE-VOICE-KAZE-DETAIL.md` Step V (V1 and V2 together, per the plan's order).

**What changed.**
- **V1 (`src/player/voices.mjs`).** Three new onsets in `ONSETS`: `m` and `n` are now both a short
  nasal hum at the `n`-vowel formant (`VOWELS.n`, already the nasal-murmur triple) rather than pure
  silence before the vowel; `r` is a ~20 ms flap with no burst; `sh` is band-passed noise at 3.5 kHz
  for 85 ms, lower than an `s` would be. Six new `POLICE_LINES` (`kind: 'police'`, never drawn by
  the crowd's `chooseLine`, never overlapping `LINES`'s kinds): 止まれ！, 停車！停車！ (said twice —
  a lone 停車 read stiff on the device, per the plan's 2026-09-25 note), 動くな！, 逃げるな！,
  降りろ！, 確保！, picked by `policeLine(situation)` rather than by urgency. Two `POLICE_THROATS`
  (lower `f0`, smaller `formant` than any crowd persona), deterministic by car id via
  `policePersona`. The glottis-plus-three-formants synthesis core is factored out of
  `createCrowdVoices` into `synthesizePoliceLine`, which builds one line into a caller-supplied
  output node instead of straight to the destination — the crowd's own scheduling (range culling,
  the concurrent-voice cap, scream headroom) does not fit the loudspeaker's much slower, global gap.
  The noise-burst helper (`burst`) was hoisted to module scope, unchanged, so both paths share it.
- **V2 (`src/police/siren.mjs`, `src/police/director.mjs`).** `createMegaphone`: a band-pass
  (350–3,500 Hz) into a `WaveShaperNode` (mild `tanh` saturation) into a dry/echo mix (a ~90 ms
  slapback at low level) into an HRTF panner at the car, with a synthesised mic click just before
  each line — built only when a police line plays, never for the crowd's own voices. Scheduling is
  its own: a 6 s gap across every car regardless of which one speaks, never the same line twice
  running (the second candidate of a two-option situation is tried instead, or the line is dropped),
  both waived for the arrest line (`force: true`, "outside the gap rule" per the plan). `director.mjs`
  picks the situation each frame: driving → `stop`/`stopCar` (or `getOut` if stopped and pinned,
  reusing the arrest-in-a-car pin detection `units.arrest.car`); on foot → `chase`/`stop`; an officer
  within 3 m or a grab already in progress (`units.arrest.foot > 0`) → `freeze`; the frame an arrest
  completes → `arrest`, bypassing the gap. `createSirens` gained `duck()`: since `update()`
  re-asserts the siren's gain every frame, a one-shot ducking ramp would be overwritten by the very
  next frame, so `duck()` instead holds a deadline `update()` itself checks and discounts by ~6 dB
  while it is live.
- **The machine voice.** `speechSynthesis` (`createLoudspeaker`) is no longer called during play.
  `director.mjs` checks `?voice=tts` once at creation (guarded so a plain Node environment, which has
  no `location`, reads false and never throws) and only then falls back to the old two Japanese
  phrases through the browser's own speech; by default every code path uses the megaphone.

**Device check.** Rendered all six lines through the real production path in a same-origin dev-server
page: `import('/src/police/siren.mjs')`, a real `AudioContext`, `createMegaphone(...).speak(...)` for
each of `stop/stopCar/freeze/chase/getOut/arrest` — every line returned its tag and the full chain
(`WaveShaperNode`, `DelayNode`, `PannerNode`) built without a single exception. **Not done: actually
listening to a line in a live chase.** The plan is explicit that "the user judges the result by ear,"
and the render environment this session (a memory-constrained shared dev machine, `evidence/police-
voice-kaze/step-p/metrics.json` already recorded ~2 GB free of 16 GB) made the live scene unstable
enough (renderer timeouts under Chrome automation, <2 fps) that a recorded in-chase listening pass was
not attempted; the synthesis path itself is confirmed correct and exception-free. This is squarely the
plan's own fallback point: **if the five lines do not read as intended on the user's own listen, the
documented next step is a paid TTS (ElevenLabs/OpenAI) or a commissioned voice actor** — only the
audio source would change, not the V2 playback/scheduling built here.

**Tests.** `tests/police-voice.test.mjs` (7): every police line built only from defined vowels and
onsets and tagged `kind: 'police'`, separate from the crowd's kinds; the six lines exist one per
situation; `m`/`n` have no noise burst, `sh` is high-frequency noise, `r`'s gap is under 30 ms; the two
throats are lower/smaller than any crowd persona and deterministic by id; a line synthesises into a
real-shaped audio graph without throwing, and never throws when the context refuses.
`tests/police-loudspeaker.test.mjs` (7): the megaphone's band-pass/saturation/echo chain is built only
when a police line plays, never by the crowd's own voices; the 6 s gap holds across different cars and
the same line never repeats (the second candidate is used instead, and a single-candidate repeat is
refused outright); the arrest line bypasses the gap; a missing context, bus, or unknown situation is
silent, never an error; by default the director never touches `speechSynthesis` while the megaphone
plays lines, and `?voice=tts` (set via `globalThis.location` in the test, since Node has none) flips
that exactly the other way round. New modules/exports, so all 14 fail on the code before. Both files
had to be added to `scripts/test-current.mjs`'s explicit list — see §16a.

**Limitations.**
- No recorded, judged-by-ear device check this session (see above) — this is the one thing the user
  should check personally before this PR is trusted for feel, per the plan's own design.
- "An officer within 3 m" and "the player's car stopped or pinned" are read from the same proxies W2
  already uses for the grab and the in-car arrest (`units.arrest.foot`/`units.arrest.car`, a distance
  check), not a dedicated line-of-sight or contact model; §9r's own limitation (no line-of-sight test)
  still applies here.
- The megaphone always uses the single nearest siren-active car within 40 m as the speaking car; with
  several patrol cars converging, which one "speaks" can jump between frames if their distances cross.
  Not perceptible against the plan's ≥6 s gap in practice, but worth knowing.

## 9w. Police voice/Kaze detail, Step K1 — Kaze FR's proportions, sections, cabin, wheels (branch `claude/police-voice-kaze-3`, on `claude/police-voice-kaze-2`)

**Plan:** `docs/PLAN-POLICE-VOICE-KAZE-DETAIL.md` Step K1.

**What changed (`src/traffic/vehicle-shape.mjs`, `src/traffic/config.mjs`, `qa/gta-upgrade/
carbench.html`, `.gitignore`).**
- **Proportions.** `SILHOUETTE.fastback.axle` moved from `.310` to `.2826`, which is the plan's
  2.43 m wheelbase on a 4.30 m body (`VEHICLES.ownCar.length/width/height` already matched the
  plan's numbers exactly and were not touched). Front overhang comes out at 0.935 m against the
  plan's "about 0.85 m" — the axle position is shared symmetrically with the rear in this loft
  (front and rear overhang are equal), so hitting the wheelbase number exactly means the overhang
  is close but not exact; not worth an asymmetric-axle rework for a single "about" figure.
- **16 belt stations, 13 house stations** (was 11 and 9). The belt table's width column now
  swells to a full 1.00 at both wheel arches and pinches to .94 at the waist between them — the
  coke-bottle the plan asks for, entirely in a column the loft already had; the house table adds
  a flat run at the roof's centre (a canopy) where the previous 9 points had none.
- **Fender peaks.** `bodyRing()` gained a `dip` parameter: two points down the centreline that
  sit `dip` below the fender-top crease, defaulting to 0 (so every other silhouette's flat bonnet
  top is untouched — a test pins this). `fastback.fenderPeak: {at:.28, span:.22, amount:.055}`
  drives it, centred on the front axle, so Kaze FR alone gets the classic two-fenders-over-a-low-
  bonnet cross-section the reference photo has and the plan's Step P/K1 note calls out by name.
- **Wheels hidden under a skirt, found on the device.** The shared wheel-anchor formula tucks a
  wheel's centre in from the outer skin by 80% of the wheel's own width
  (`W/2 - width*.80`); on a body this low, that buries most of the wheel behind the arch wall
  instead of exposing it (side render: the wheel read as a thin dark crescent, not a wheel). A new
  per-type `track` field (`d.track`, default `.80`, unused by anyone else) lets `ownCar` use `.55`
  instead, moving the wheel a further 5 cm toward the outer skin without clipping through the
  painted flank. **Honest result:** the geometry measurement (below) confirms 63% of the wheel's
  height is unobstructed by paint, clearing the plan's 60% bar, and a second render after the fix
  still *reads* the wheel as mostly hidden from a straight side angle -- 63% of a circle bounded by
  a horizontal sill line is a narrower-looking crescent than 63% of a rectangle would be, and 5 cm
  is small next to the car's ~2 m width. The number is real and tested; whether it *looks* enough
  like an exposed wheel is worth the user's own eyes on a clean `carbench` capture, not just this
  session's render (see Limitations).
- **Not changed, and out of Step K1's scope:** the black pillars/roof panel (they are still
  painted the body colour; K2 owns paint, including making them separate dark panels rather than
  colour alone, per its own point 7); a dark brake disc behind the spokes (the wheel is one shared
  geometry across every vehicle type and the close-up rim/tyre split has no third "disc" slot —
  worth a future step, not part of the plan's K1 test list).

**Device check.** Rendered `ownCar` through the real production path (`createVehicleAsset`,
unmodified) in a same-origin dev-server page, side and front-3/4 views, before and after the
`track` fix. The front view shows the fender-peak dip as a faint wave along the top edge of the
black lower bumper/bonnet lip — the geometry does what §9w's belt-table note says. The wheel is the
honest miss: the grid render before the fix (`before-track-fix-grid.jpg`) shows it almost entirely
hidden behind the flank, and a second render after the fix (`side-front3q-after-track-fix.jpg`)
still reads it as mostly hidden from a straight side angle, even though a direct vertex query
confirms the sill sits at 63% of the wheel's diameter (see `evidence/kaze-detail/step-k1/
metrics.json`) — a circular wheel cropped by a horizontal sill line shows less area than a
rectangle cropped the same way, and this session's 5 cm track move is modest next to a ~2 m car.
`qa/gta-upgrade/carbench.html` (side/front/front-¾/rear-¾, day and night, 1280×720, cost readout) is
added per the plan, following `vehiclebench.html`'s pattern — **this dev server 404s every path
under `/qa/` this session** (only `/`, `/src/**` etc. resolve; `punchbench.html` and the existing
`vehiclebench.html` do too, so this is a pre-existing environment/routing limitation, not something
this step broke), so the renders above were captured by importing the same modules into an
already-loaded page instead. The machine's free memory (~2 GB of 16 GB, same as §9v) made the
renderer time out repeatedly under Chrome automation, so these are two renders that succeeded out
of several attempts, not a systematic sweep — the `carbench` file itself is untested by a real page
load this session and should be opened once routing/resources allow it, and the wheel is worth the
user's own eyes before deciding whether `track` needs to move further.

**Tests.** `tests/kaze-detail.test.mjs` (6): the four headline dimensions (length, width, height,
wheelbase, wheel diameter) are within 3% of the plan's numbers; the body has at least 15 authored
stations; the fender peaks stand higher than the bonnet valley at the front axle; every other
silhouette keeps an exactly flat bonnet (the dip is opt-in); the arch cut-out exposes at least 60%
of the front wheel's height from the side; the front wheels sit at the new wheelbase. New file, so
it had to be added to `scripts/test-current.mjs`'s explicit list (§16a, found in Step V) or
`test:ci` would silently never run it. All fail on the code before (`SILHOUETTE_TABLES` did not
exist; the old axle/track numbers do not clear the ±3%/60% bars).

**Limitations.**
- No real page-load device check this session (see above) — `carbench.html` itself should be
  opened once the dev-server routing or the machine's memory allows it, and the renders in
  `evidence/kaze-detail/step-k1/` are a same-origin substitute captured through injected modules,
  not the bench file itself.
- **The wheel reads as more hidden than the 63%-exposure number suggests.** A tested, geometry-true
  number is not the same as a convincing photo; if the user's own look at `carbench` agrees it still
  reads wrong, the next lever is `VEHICLES.ownCar.track` (currently `.55`, default `.80`) moved
  further, or narrowing the floor pan near the axle instead of just moving the wheel outward — not
  attempted here, since it touches the shared `bodyRing`/`sillAt` floor-width logic more deeply.
- The front overhang (0.935 m vs "about 0.85 m") and the reference-photo checklist items the plan
  mentions (items 1–9 of an analysis this session did not have the source text for) were judged
  from the plan's own K1 prose, not a side-by-side photo comparison.
- Black pillars/roof, the wing, mirrors, lamps, paint and the triangle/draw-call budget are K2.

## 9x. Police voice/Kaze detail, Step K2 — Kaze FR's parts, paint, lamps (branch `claude/police-voice-kaze-4`, on `claude/police-voice-kaze-3`)

**Plan:** `docs/PLAN-POLICE-VOICE-KAZE-DETAIL.md` Step K2.

**What changed (`src/traffic/vehicle-shape.mjs`, `src/traffic/config.mjs`, `src/player/vehicle-asset.mjs`).**
- **Parts, all in `buildVehicleShape`'s `d.kit` block.** End plates on the rear wing (two thin dark
  panels at the blade's own ends — a wing without them reads as a shelf, not an aerofoil). A modest
  side intake behind each front wheel (a small recessed dark box, deliberately smaller than a real
  kit's). A large black front opening with a lip (a wide dark panel low on the nose, on top of the
  lip Step H already had). A rear diffuser (a panel plus four ribs) and two exhaust tips (small dark
  cylinders) at the tail. Slim clear fixed lamps under the pop-up pods, in the `lamp`/`front` batch
  so they ramp with every other head lamp at dusk. Body-colour door mirrors and round tail lamps
  were already there from Step H and are unchanged.
- **Black roof and pillars, as separate panels, not colour.** A new `blackRoof` flag
  (`d.kit===true||d.kit?.roof`) moves the roof loft and the three pillar posts from `parts.paint`
  into `parts.dark` for whichever kit says so — the own car, not the hero cars (§9t already decided
  they keep no black bonnet either, so they get no black roof by the same logic). Confirmed by a
  test that checks the actual highest point of each geometry group, not just a vertex count (a
  vertex-count comparison against a sedan would have passed even before this change, since the own
  car's `dark` group is already bigger than a sedan's for unrelated kit-panel reasons — caught while
  writing the test, not left in).
- **Paint.** `VEHICLES.ownCar.color` is now `0xf39a1d` (the plan's orange, was `0xe0661c`).
  `materialsFor` in `vehicle-asset.mjs` takes a `clearcoat` flag; when the vehicle definition sets
  `clearcoat:true` (only `ownCar` does), the paint material is a `MeshPhysicalMaterial` with
  `clearcoat:1` instead of the `MeshStandardMaterial` every other type gets. It reflects the scene's
  environment map the same way any `MeshPhysicalMaterial` does — no extra wiring needed, since the
  game already sets one.
- **Budget, honestly.** Triangles: 5,916 for the whole close-up car, comfortably inside the plan's
  60k. **Draw calls: 20, not the plan's 10.** Six body-part meshes (paint/glass/dark/plate/front/
  rear) plus four independently-steered-and-suspended wheels (2 meshes each: tyre, rim) plus two
  hinged pop-up pods (2 meshes each: shell, lamp) plus two hinged doors add up to 20, and this was
  already the count before Step K2 — none of this step's additions cost a new mesh (everything above
  merges into an existing part). Closing the gap to 10 would mean sharing one mesh across wheels,
  pods and doors that currently move independently (steering angle, suspension travel, hinge angle),
  which needs a different technique (instancing with per-instance bone/morph state, or a skinned
  rig) rather than more geometry work, and was not attempted here — see Limitations.

**Device check.** Measured (not estimated) via `createVehicleAsset('ownCar')` traversal, matching
the method `carbench.html`/`vehiclebench.html` already use (`renderer.info.render.calls`/triangle
count would give the same number, since there is one draw call per `Mesh` in this non-batched
close-up model). The same renderer instability noted in §9w applied again this session; the paint
material and new parts were confirmed structurally (the tests below) and via the same same-origin
injected-module technique as §9w, not a full `carbench` page load.

**Tests.** `tests/kaze-detail.test.mjs` grows from 6 to 10: the wing sits behind the rear axle and
below the roof peak (computed from the actual belt/house tables, not a repeated magic number); the
own car alone gets `0xf39a1d` and a `MeshPhysicalMaterial` with `clearcoat:1` (a sedan does not); the
roof and pillars reach `dark`'s highest point and drop out of `paint`'s (a sedan's roof stays in
`paint`, for contrast); the whole car holds the 60k triangle budget, and the 20-draw-call count is
pinned as a regression guard, explicitly labelled as not meeting the plan's number rather than
silently passed. All new/changed assertions confirmed failing against the code before (`git stash`):
the paint-material and dark-roof tests failed outright; the wing-position test already passed before
K2 (the wing's own position did not move in this step, only its end plates were added) and is kept
as the plan's literal K1+K2 test bullet.

**Limitations.**
- **The 10-draw-call target is not met (20).** See "Budget, honestly" above. A future step could
  merge the four wheels into one skinned/instanced mesh and the two doors and two pop-ups into their
  own, which would plausibly reach 6 (body parts) + 3 (wheels, doors, pops) = 9, but that changes how
  RUN 10/11's steering, suspension and hinge code addresses these parts and was judged too large to
  fold into this step.
- No real `carbench.html` page load this session (§9w's dev-server routing/memory limitation still
  applies); the paint/parts changes were confirmed structurally and via injected modules, not a
  fresh render set.
- §9w's wheel-exposure honesty note stands: the geometry clears 60%, the visual read is still worth
  the user's own eyes.
- Not done: the drift-feel and night-drive in-game check the plan's device-check section asks for
  ("a night drive, lamps, reflections, and the drift feel unchanged") — the handling numbers
  (`steer`, `grip`, `slide`) were not touched by K1 or K2, so there is no code reason to expect a
  change, but this was not driven and felt on the device this session.

## 9y. Weapons, W1 — fists / pistol / katana, the weapon rig, the katana, the bench (branch `claude/shibuya-weapons-implementation-28u1y1`, from `master` `7d4637e`)

**Plan:** `docs/PLAN-WEAPONS.md` W1 (imported from `claude/happy-tesla-dkn52d`). Implemented in a
cloud session with no GPU and no speakers: stills and console errors only (headless Chrome,
SwiftShader); feel, frame rate and sound are for the device check listed in the PR.

**What changed (`600c938`).**
- **Clips.** `scripts/convert-character.mjs` adds ten clips from the CC0 Quaternius library that
  `npm run fetch:character` fetches: `PistolIdle`, `PistolAimUp/Neutral/Down`, `PistolShoot`,
  `PistolReload`, `SwordIdle`, `SwordAttack`, `Roll`, `CrouchWalk`. Every existing clip, the gait
  table and `gaitDetail` for Walk/Run/Sprint are byte-for-byte the same values; `analyse-gait.mjs`
  had to be rerun because the converter rewrites `citizen.json` without `gaitDetail`. The pack
  grows **2.26 → 2.77 MB** (downloaded only on entering player mode). The HQ crowd atlas is not
  rebaked: far bodies carry no weapon (plan default).
- **Inventory** (`src/player/weapons.mjs`): fists / pistol / katana, 1/2/3, the wheel, the pad's Y
  and a touch button 「武器」. Refused mid-swing, mid-reload and in a car; a car holsters, and
  stepping out brings back the fists, never the last weapon (R18).
- **Weapon rig** (`src/player/weapon-mesh.mjs`): generic procedural pistol, revolver, katana,
  scabbard and holster, one shared vertex-coloured material, one geometry per shape for the scene.
  The grip frames are measured on `hand_r` (fingers +Y, index +Z, palm −X); the pistol's barrel
  axis is read off `Pistol_Aim_Neutral` (world forward seen from the hand). Holstered: the pistol at
  the right hip, the katana on the back; drawn, the scabbard stays on the back. Up to 3 draw calls
  for the armed player.
- **The katana** (R4 option (a), R5, R6). `qa/gta-upgrade/sword-timing.mjs` follows the blade tip
  through `Sword_Attack` at 120 steps: the cut's window is **0.383–0.473 s of 1.533 s**, the tip
  sweeping from −69° (right, over 2 m up) to +44° (left, at the knee), 1.59 m out; the sampled
  bearings are `SWORD.sweep`. `combat.mjs katanaSweep` cuts everyone the tip crosses inside the
  window, once each (50 a cut, two cuts down); a wall or a car on the blade line stops it there
  with sparks and a synthesised clank, and the clip holds that frame for 0.16 s before the gait
  takes the body back. Every other cut plays 12% faster. The cut takes the whole body (`STRIKE`,
  §9k), and the weapon idles take the gait's Idle share.
- **Bench:** `qa/gta-upgrade/weaponbench.html` (four angles per pose, grip-to-palm and muzzle-ray
  numbers under each row) and `weaponbench-capture.mjs` (headless PNG + console).
- **Name guard** (`tests/name-guard.test.mjs`): real gun makers and models in English and Japanese
  are banned everywhere; `SAKURA`/サクラ and model codes are banned in the weapon code only, because
  a reconstructed Center-gai sign already reads サクラ美容外科 (a fictional clinic). The freesound
  titles of the recordings (one says "357 Magnum") are in the audio lock and manifest under
  `assets/` and `public/`, which the guard does not read; `src/` has no such name.

**Measured.** Grip to palm 0.7 cm (katana), 1.3 cm (pistol, revolver) on the bench; ≤ 3 cm through
every frame of every weapon clip in the test.

**Tests.** `tests/weapons.test.mjs` (11): the clips exist and SWORD was measured on this pack;
inventory rules; the magazine and reload length; R3 grip within 3 cm through every frame, and the
stowed weapons ride their bones while walking; R4 one-handed; R6 no cut outside the window, a wall
or car stops the blade and nobody past it is cut, the cut lands inside the window in combat and
hits two people in its arc, two cuts kill, a wall clanks and holds the clip; the fists unchanged.
All fail before (the modules do not exist). Name guard +2 (a guard: it passes on the old code too).

**Limitations.**
- **One-handed katana (R4 (a)).** The left hand hangs about 1 m from the handle through the cut,
  as the clip has it. A two-hand IK is the follow-up if it reads wrong on the device.
- **One cut, no combo (R5).** The rhythm varies by speed only; a spine twist was not added (§9k: any
  twist swings the blade off its measured line).
- The blade passes through bodies (shown as a hit, R6), and through a wall for the 0.16 s hold.
- In a dense kerb crowd one cut can catch five or six people (measured in the scene: 6).

## 9z. Weapons, W2 — the player's pistol (same branch)

**What changed (`93b83e7`).**
- **Aim while walking (R1, R2)** — `src/player/aim-layer.mjs`. §9k's lesson applied: the aim pose is
  **not averaged with the walk**. After the mixer has posed the legs, spine_02 up, both arms and the
  head are *set* to the aim pose (slerped in by the aim weight alone), pitch-blended between
  `Pistol_Aim_Up/Neutral/Down` (measured at about +90°, 0°, −90° of barrel pitch); the shot's
  recoil and the reload ride on it as local deltas. Then **an aim correction** turns spine_01,
  spine_02 and spine_03, a share each, three passes, until the muzzle ray passes through the
  target. Standing, the body turns onto the aim; walking, the legs keep to the walk (the library
  has no strafe clips) and the upper body twists, up to 100°, past which the body turns round.
  Measured (10 m target, full walk cycle): **with the correction the ray passes within 1 mm at 0°,
  ±45°, ±90°, walking and standing; without it, 2.6 m (0°) to 10 m (±90°) off while walking** and
  0.26 m standing.
- **Where a bullet goes (R7, R8, R10)** — `src/player/ballistics.mjs castShot`: hitscan from the
  muzzle, no drop; the 2D solid grid marched at 0.25 m and bisected (a building stops a round at
  any height), the ground, car boxes with their real height, people as vertical capsules
  (r 0.27 m) with the head above 1.5 m scaled to the person. People come from the crowd's own 2 m
  grid along the ray. Children are never hit: they are not combat targets in this game
  (`combat.mjs eligible`), and a round is not stopped by one either.
- **The pistol** — `src/player/arsenal.mjs`: the aim point is where the camera's centre ray first
  meets something (≤ 60 m), or, with a mouse, a person within 0.05 rad of it (soft lock); on a
  phone the attack button locks on to the nearest person in a 30° cone and 30 m (R16). A click
  without aiming raises the gun and fires when it is up (no hip fire). 8 rounds, R or an empty
  magazine reloads (`Pistol_Reload`, 1.667 s), refire 0.28 s. 50 to the body, a headshot kills;
  `combat.wound()` puts a killed body down with a 0.7 m/s push along the bullet and no lift (R11 —
  a car's throw is 2.4 m/s and up), and a survivor flinches and runs unless on rails.
- **Flash (R12):** an emissive, additive flash, sparks, dust and a tracer, three draw calls at most
  and no light; `BLOOM_KICK` in `src/fidelity/pipeline.mjs` raises the bloom for the shot's
  ~60 ms.
- **Sound (R13):** five CC0 recordings from Freesound, each licence read on its own page on
  2026-09-25 and recorded in `assets/audio/upstream.lock.json` with its page, author, bytes and
  SHA-256: 427592 (michorvath), 253736 (Kodack), 668348 (DeltaCode) as `gunshot`, 683186
  (Shark_Anthony) as `gunshot-revolver`, 345413 (Artmasterrich) as `ricochet`. Converted by
  `npm run convert:audio`; **every existing clip came out byte-identical**. `src/audio/gunfire.mjs`
  adds a synthesised street slapback timed from the actual facade distances left and right
  (`2d/343` s, low-passed, weaker each bounce), and a ricochet on 35% of wall/car hits. Until the
  recordings decode, a **synthesised crack plays instead, and it is marked temporary (仮)** in the
  code. The katana's clank is synthesised.
- **Panic (R14):** `gunfirePanic` sends the nearest people within 40 m running, at most 60 per shot,
  and never takes anyone on rails (a crossing, the cast's track) off it; they cry out instead
  (§16a). The HQ crowd's visual reaction goes through the existing bounded witness pass.
- **Camera (R17):** aiming pulls the follow arm in to 2.1 m over the right shoulder, FOV 50 → 40,
  through the same `clipCameraArm`. A crosshair (red when locked) and the magazine in the HUD.
- **Wanted (§2):** `shooting` (reported like any crime, at once if an officer sees it) and
  `weaponKill` are at least ☆2; `weaponSeen` — an officer seeing a drawn pistol or katana — is ☆1.

**Tests.** `tests/pistol.test.mjs` (16): R1 at 0°/±45°/±90° walking and standing, and that the
uncorrected pose misses by metres (so the test would catch a regression); R2 facing rules; R7 a
building blocks, a car box stops but a shot over its roof goes on, the ground stops, the range
ends; R10 over the head misses, head and body zones; the grid lookup; R14 the cap, nearest first,
nobody on rails moved; the pistol end to end (no hip fire, 50 damage, the gentle push, the
reload, R18); the wanted rules; the shoulder camera; the echo taps. All fail before.

**Limitations.**
- **Aiming while walking slides nothing but twists a lot.** Without strafe clips the legs walk
  forward while the chest turns up to 100°; that is what GTA-style strafing would replace.
- **R8:** low walls, fences, planters and bollards do not stop a round; a building stops it at any
  height, including over a low roof.
- The HUD crosshair is the centre of the view; with the shoulder offset the muzzle converges on it
  (the aim point is the camera ray's hit), so parallax is right only as far as that hit is.
- Recorded shots are Freesound previews (MP3 at ~128 kbps), as the rest of the bank.

## 9aa. Weapons, W3 — police revolvers (same branch)

**What changed (`5d70b3f`).**
- **R15** — `src/police/guns.mjs`: ☆1–☆2 batons and the arrest only; at ☆3+ officers within 35 m
  draw. The **first round of the incident is a warning shot into the air with 「撃つぞ！」**; from
  1.6 s later an officer fires **only while the player is a threat** — holding a drawn pistol or
  katana, attacking (a swing, or a shot in the last 2.5 s) or ramming — and covers a player who is
  not. 「銃を捨てろ！」 to an armed player every 5 s at most. Hit chance 0.72 at point blank falling
  to 0.12 at 45 m; a hit is 10–15. A five-round cylinder with a 3.5 s reload.
- **R9:** no shot without a clear line over the same 2D solid grid (`lineOfSight`). The director's
  `officersSee` and `officersOnFootSee` take the same wall test, so **the police no longer see
  through buildings** — §9s's limitation. Without a wall test (older callers, tests) they keep the
  old radius.
- Officers covering an armed threat stop ~11 m out instead of walking into baton range
  (`units.mjs`, `gunHold`); an unarmed player is still walked up to and arrested.
- The revolver is drawn and aimed by near-humanoid officers only, through the same aim layer as the
  player; the far crowd shows no weapon.
- **Voices:** 「銃を捨てろ！」 and 「撃つぞ！」 added to `POLICE_LINES` (`kind: 'police'`), with three
  new onsets (`j`, `s`, `z`), shouted dry from where the officer stands (`createOfficerVoice`),
  not through the loudspeaker chain.
- The scene draws each officer round: flash, tracer, sparks where a miss lands, the recorded
  revolver shot with the street echo; a hit on the player bleeds and knocks the view; in a car a
  hit marks the car instead.

**Tests.** `tests/police-guns.test.mjs` (10): no draw or shot at ☆1/☆2; at ☆3 draw, a warning shot
into the air first with 撃つぞ！, then fire at an armed player; an unarmed, still player is covered
not shot, an attack draws fire; no shot through a building, and the rules resume (warning first)
out of cover; patrol cars and officers on foot do not see through a building; accuracy and damage;
clearing holsters and forgets the warning; the two lines; the dry shout's gap and silence without
audio; the director end to end. `tests/police-voice.test.mjs` now expects eight lines (was six).

**Limitations.**
- The officer's muzzle is estimated (in front of the chest at 1.42 m), not read from the drawn
  revolver's mesh, because the pool's figures are not reachable from the director.
- An officer does not take cover or reposition to find a line; they hold or approach as before.
- 撃つぞ！/銃を捨てろ！ are the formant synthesiser; how they read is for the ear on the device (§9v's
  fallback applies: a paid TTS or a voice actor only changes the source).

## 9ab. Weapons, W4 — dodge roll and crouch (same branch)

**What changed (`ca10d2e`).**
- **Roll** (Q, pad RB): along the input direction, covering the clip's measured travel (4.99 m in
  1.467 s, from the root-motion library via `gaitDetail`) with a linearly falling push, integrated
  exactly per frame (the same distance at 30 and 60 Hz); walls stop it; 0.25 s recovery. It owns
  the whole body (`STRIKE`). Police rounds miss inside the dodge window, 0.08–0.95 s in.
- **Crouch** (C, pad R3): 0.9 m/s, no running; the gait gives way to Crouch_Idle (a separate copy
  of the Guard clip, so it never fights the Guard reaction for one action) and Crouch_Fwd_Loop at
  the pace made. Crouched on foot, the police see the player from 55% of their range.

**Tests.** `tests/roll-crouch.test.mjs` (5): distance and frame-rate independence; direction, walls,
no chaining; the dodge window and that officers never hit inside it; crouch speed and sight; the
roll owns the body (hips drop below 0.6 m) and the crouch lowers the hips. All fail before.

**Limitations.** No touch buttons for roll or crouch yet. The roll is not aimed (no shooting
mid-roll); crouching does not change the NPCs' noticing of the player, only the police's sight.

**Headless check of all four steps (`81baa95`, `evidence/weapons/`).** No GPU and no speakers in
this session, so stills and console only. `qa/gta-upgrade/weaponbench.html`: every pose from four
angles, grip to palm 0.7–1.3 cm, muzzle ray 0.0 cm from the target in every aim pose, 0 console
errors. `qa/gta-upgrade/weapons-scene.mjs` on the real scene (HIGH, day, 960×540, SwiftShader at
~0.1 fps): player mode by the button, moved to the quietest spot facing a facade 11 m away; katana
drawn and cut; pistol aimed over the shoulder with the crosshair; three shots, each stopped by the
facade at 9.65 m; then ☆3 by the police-car rule: an officer drew and fired the warning shot with
the 撃つぞ！ shout (`guns.snapshot()`: drawn, warnings 1, shouts 1). **21 console messages, 0
errors.** Not visible in the stills: the muzzle flash (it lives 50 ms, one 0.1 s-clamped frame
here), and the officer (behind the camera at the moment of the still). No frame rate is reported.

**Gates at `81baa95`.** `npm run typecheck` clean; `npm test` (the portable build, then `test:ci`)
**674 tests, 669 pass, 0 fail, 5 skipped** (630 before this branch: the four new files add 42 and the
name guard 2). Before the build, `test:ci` alone reports 2 failures that need `dist/`
(`rendered-html`, the catalog utilities); they are the same on `master` and pass under `npm test`.

## 9ac. Performance P0 — an on-device profiler and an automatic A/B sweep (branch `claude/shibuya-weapons-implementation-28u1y1`, restarted from `master` `01a3be3`)

**Plan:** `docs/PLAN-PERFORMANCE-AND-PAD.md` (approved 2026-09-25): the target is 60 fps on the
user's Windows PC in Chrome (HIGH today: 6–7 fps, §9h/§9l). The cloud only has SwiftShader, so
P0 is the instrument and P1–P4 wait for the user's measurement.

**What changed (`b349b1a`).**
- `?perf=1`: an overlay (`src/quality/perf-overlay.mjs`) with fps and frame interval (mean, p95),
  CPU frame time split by section — every scene module's update (`ModuleSystem.probe`), the
  player's frame, the late player work (audio, HUD, police), seated drivers, camera, render — GPU
  frame time where `EXT_disjoint_timer_query_webgl2` exists, draw calls and triangles.
- `?perf=sweep` (or the overlay's button): baseline, then shadow, GTAO, bloom, SMAA, all post, the
  road mirror, the crowd, the HQ crowd, the near characters, traffic, trains, signs, streetscape,
  nightglow, buildings and rendering itself each switched off in turn, then baseline again
  (`src/quality/perf-sweep.mjs`); the costs table on screen and a JSON to save or copy.
  `?off=a,b` holds features off for a manual A/B. `?sweep=` / `?sweepFrames=` shorten it.
- Switching off is live and reversible: modules are paused (`ModuleSystem.paused`), not disposed,
  and their root hidden; passes via `PIPELINE_OFF`; the shadow map stops updating; the HQ budget
  goes to 0 and back; the near characters pause (`setNearPaused`). The JSON records per feature
  whether its root could be hidden, so a module with no root is reported as update-only.
- Nothing runs without `?perf=`.

**Headless check (`bff6455`).** A short sweep on the real scene ran end to end: overlay, costs
table, JSON, 0 console errors; the GPU timer query was available (SwiftShader). Its timings are
software rendering and are not used. One figure does not depend on the renderer: **10.35 M
triangles at the scramble camera, HIGH, day** — more than twice the 4.5 M recorded in RUN 6.

**Tests.** `tests/perf-probe.test.mjs` (6): frame statistics; sections add up and the interval is
the fps; the GPU timer is a silent no-op without the extension; the module system times and pauses
modules without disposing them; the sweep's order, reset and cost against the two baselines;
the pass switches default on. Fails before (no modules, no probe or pause).

## 9ad. Controller C1–C4 — the Switch Pro Controller (same branch)

**What changed (`2eb5ace`).**
- `src/player/input-map.mjs`: the pad as actions, polled once a frame. Chrome and Edge present the
  Switch Pro Controller in the positional standard mapping (Nintendo A on the right = index 1,
  B at the bottom = index 0), so one GTA-style layout serves it and any standard pad; only the HUD's
  names change (`GLYPHS`). The layout (approved): ZR fire / throttle, ZL aim / brake, B run, A
  reload, Y roll, X get in / out, L / R weapons (R handbrake in a car), left-stick press crouch /
  horn, d-pad up siren, − map, + menu. The old fixed indices (0 drive, 2 attack, 3 cycle, 4 aim,
  5 roll, triggers) are gone.
- Feel (C3): ZL/ZR on the Switch Pro are digital, so throttle and brake ramp (0.3 s up, 0.15 s
  down); analogue triggers pass through. Sticks have a radial deadzone (0.16, full at 0.94) and the
  camera a response curve (1.6). `?padLook=` (≤ 3) and `?invertY=1` are kept in this browser.
  While a pad aims, the soft lock-on is 0.12 rad (a mouse keeps 0.05).
- Rumble (C4) on shots, cuts, damage and crashes through `vibrationActuator` ('dual-rumble'),
  spaced 60 ms; nothing where the browser exposes none.
- The HUD's controls line follows the last device used; `?pad=1` names every index as the Switch
  button and says whether the pad was recognised.
- A pad outside the standard mapping keeps its sticks, and no button is read.

**Headless check (`bff6455`).** A scripted fake Switch Pro Controller in the real scene: recognised
as `switch`, R switched to the pistol, ZL held aimed (aim weight > 0.9), ZR fired one shot and
issued a dual-rumble effect (strong 0.35, weak 0.75, 90 ms); the HUD read 「ZR 攻撃 · ZL 構える ·
L/R 武器 · A 装填 · Y 回避 · B 走る · X 乗る …」; 0 console errors. **Not checked: a real controller.**
Whether this Chrome exposes rumble for it, and how the sticks and the ramp feel, are the device
check.

**Tests.** `tests/input-map.test.mjs` (11): recognition; every foot and car binding; a held button
fires once; the ramp and analogue pass-through; the radial deadzone and curve; a raw pad; the HUD
names; rumble spacing and absence; and through the controller: ZR attacks, ZL aims while held, R
cycles, B runs; in a car X gets out and ZR ramps `input().forward`, R is the handbrake; the right
stick turns the camera; the settings persist. `player-experience`'s pad-look test now expects the
curved stick (said in the test). Fails before (no module).

**Gates at `bff6455`.** `npm run typecheck` clean; `npm test` **691 tests, 686 pass, 0 fail, 5 skipped**
(674 before: +6 perf probe, +11 input map).

**Limitations.** C5 (gyro aim through WebHID) is not done. Joy-Con pairs are recognised by name
but untested. Steam Input can capture the controller before Chrome sees it.

## 9ae. After the device check of §9ac/§9ad — the measurement button, the patrol-car ram, the officer's muzzle (same branch, from `master` `d3b4785`)

The user's check on the Windows PC (Chrome, HIGH): the Switch Pro Controller "works quite well";
the scene ran at **13.1 fps** at the scramble camera (the header's own counter, one screenshot,
not a sweep); and there was **no 「JSON を保存」**.

- **No save button (`2b7dcf8`, `9c6a342`).** The panel only existed with `?perf=` in the URL, and
  its save button stayed hidden until a sweep had finished. Now 詳細設定 has a 「パフォーマンス計測
  （約2分）」 button that starts the sweep without any URL and returns to the full scene view first
  (the inspection layout shrinks the canvas); the save and copy buttons are always visible,
  disabled until the result exists; and the JSON downloads by itself when the sweep ends.
  Headless: the button flow brings the panel up, the sweep starts, 0 console errors
  (`evidence/perf-pad/p0-button.png`).
- **Rammed by a patrol car, the player's car stopped (`553307b`).** A chasing patrol car stopped
  4.5 m centre to centre — inside two car half-lengths — so it sat pressed into the player's car,
  and the player's move test refused every move, away from it included (the car reported
  `stalled`). Now the player's car may always move *out of* an overlap it is already in (a move
  that increases the distance to that car); driving further into any car is still a contact. And
  a patrol car stops at both half-lengths plus 1.2 m and never steps into the player's box.
  Standing still next to it for 3 s is still the in-car arrest. `tests/police-ram.test.mjs` (3):
  two fail on the old code with exactly the device symptom (0.00 m moved; the patrol car inside
  the player's car).
- **The officer's flash (`5e5030a`)** now starts at the drawn revolver's own muzzle when a near
  humanoid draws the officer (`near-characters muzzleOf`), the estimate only otherwise.

**Checked and not possible with these clips: the two-handed katana (R4 option (b)).** Measured
through `Sword_Idle` and the whole cut, the handle is 0.73–1.02 m from the left shoulder; the left
arm reaches 0.48 m (upper arm 0.243 + forearm 0.236). No IK can close that without moving the
torso and the right arm, which would change the measured cut. It needs a two-handed sword clip.
Quaternius' Universal Animation Library 2 (CC0, same skeleton, a sword theme) might have one, but
it has no pinned source in `assets/character/upstream.lock.json` (§9h, `docs/RUN5-5-ANIMATION`), so
adding it is an asset decision for the user, not something to fetch from an unverified mirror.

**Gates at `9c6a342`.** `npm run typecheck` clean; `npm test` **695 tests, 690 pass, 0 fail, 5 skipped**.

## 9af. The two-handed trial — CMU motion capture for the katana and a shouldered gun (same branch; bench only, not in the game)

The user asked for the two-handed motions §9ae found missing. UAL2 (the user's zip, CC0) has no
two-handed sword or long-gun clip. The CMU Graphics Lab database does (licence: "may be copied,
modified, or redistributed without permission"; the acknowledgment to carry if adopted: "The data
used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding
from NSF EIA-0196217."). Screened by forward kinematics of the official ASF/AMC, hands apart:

| trial | hands apart | verdict |
| --- | --- | --- |
| 02_07 swordplay | 0.14–0.23 m for all 18.8 s | two-handed sword; 6.8–7.6 s is an overhead cut |
| 02_08, 02_09 swordplay | > 1 m half the time | mixed one/two-handed |
| 80_03 shooting a gun | 0.44 m, steady, left ahead | long gun, raised and held |
| 79_96 shooting a gun | 0.35–0.6 m | long gun, less steady |
| 139_05 Pulling a Gun | left hand down | one-handed pistol |

**What was built (offline + a bench; nothing in `src/` changed).**
- `scripts/cmu/asf.mjs` reads ASF/AMC (units 1/0.45 inch; a bone's rotation is C·Rz·Ry·Rx·C⁻¹;
  the zero pose is a T facing +Z, as the game rig is bound).
- `scripts/cmu/weapon-clip.mjs <cmu dir> <preset> <out>` retargets onto `citizen.glb` and puts both
  hands on the weapon: the weapon's axis from the SOURCE hands, the right hand turned to hold it
  (the edge in the plane of the cut for the katana; level for the gun), the left hand placed on
  the handle / fore-end by two-bone IK. Presets `katana-cut` (02_07 6.2–8.4 s, mirrored — see
  §16a), `rifle-raise` (80_03 1.9–7.0 s) and `rifle-shouldered` (80_03 4.2–6.8 s with the stock in
  the shoulder, levelled, both arms by IK). Output in `assets/character/cmu-weapons/` with the
  source files' SHA-256; the raw CMU files are not committed.
- `qa/gta-upgrade/cmu-weaponbench.html` plays the clips on the game's humanoid with the game's
  katana and a grey proxy gun (仮). `?only=<clip>&times=…` for close-ups.
  `weaponbench-capture.mjs` takes the page name as a third argument.

**Result (`evidence/weapons/cmu-two-handed/`).**
- **Katana: works.** The arms do not break: right hand at the guard, left hand 0.15 m behind at the
  pommel end, both wrapped round the handle through the whole cut (left palm off its place by at
  most 5.2 cm). The overhead cut reads clearly: raised at 0.3–0.95 s, the cut at 1.1 s,
  follow-through to 1.5 s, back to guard at 2.0 s. Against it: the subject bends deep at the
  follow-through; the hand speed is about 3–4 m/s (slower than the current one-handed cut); the
  wrists are 68–77° from rest at median (forearm twist lands in the wrist, since CMU keeps it in
  `lwrist`).
- **Gun as captured: hands right, pose not a shooting stance.** Both hands on the gun (3.1 cm), but
  aimed about 17° up and held in front of the chest, the butt 15–17 cm off the shoulder joint.
- **Gun shouldered: usable for a short weapon.** Levelled, the butt 5.8 cm from the shoulder joint,
  both hands on. With the stock at the shoulder the left hand misses the source's 0.46 m fore-end
  by 13 cm (the arm is 0.48 m), so the support hand is 0.28 m ahead — a submachine gun's length.
  The gun sits at chin height; the head does not lower to the sights.

Not done, and needed before any of it is in the game: timing (hit frame, reach) measured on the
clip like `SWORD` (§9y); a loopable hold and a fire recoil for the gun; the walk with the upper
body layered over it (as the pistol aim is); citizen.glb conversion; a device look. `tests/cmu-weapon-clip.test.mjs` (6).

## 9ag. The two-handed trial, made natural — every concern §9af listed, fixed in the bake (same branch; still bench only)

The user: "今実装したところで気になる点は全部治して自然な感じにして". Each §9af concern, what
`scripts/cmu/weapon-clip.mjs` now does about it, and the number before → after (the clip's own
`measured` block, asserted by `tests/cmu-weapon-clip.test.mjs`, 10 tests; 6 of them fail on the
§9af clips):

| concern (§9af) | fix | before → after |
| --- | --- | --- |
| cut too slow (hands ~3 m/s) | a time warp (`warp` knots): raise 1.25x, the cut 2x, recovery 1.3x | grip peak 3.3 → **6.7 m/s**; the clip 2.2 → **1.53 s** |
| trunk folds deep in the follow-through | past 28° off vertical only a third of the excess is kept, spread over spine_01-03 (iterated, since the tilt is measured from the pelvis); the blade turns with the chest | 52° → **36°** |
| wrists bent 68-77° (median) | 70% of each hand's twist moves into its forearm (a wrist cannot twist; the rig has no twist bones, and the hand sits on the forearm's +Y so the wrist does not move); the elbow swivels ±40° about the shoulder-wrist line to the least bend; the left hand may roll ±60° round the handle/fore-end | katana R 68 → **50** (max 62), L 77 → **21** (max 32); gun R 78 → **28**, L 38 → **11** |
| gun 17° up, in front of the chest | the raise goes from a low ready (butt in the shoulder, muzzle 40° down, the gun pivoting about the butt) to level, blended by the source's own hand height, so the timing is the capture's | 17° → **0°** at the hold; −40° at the start |
| butt off the shoulder, head not on the sights | the chest bladed up to 15° more (the neck turns back so the face stays on the target); the butt in the pocket 8 cm inside the shoulder joint, moved across the line of fire until the sight line is within 2.5 cm of the eye; the head brought down to the sights (≤25°, neck 60% / head 40%, aimed at where the sight line crosses the sphere the eye can reach) | eye to sight line 12 → **0.1 cm** (max 2.1 in the raise) |
| left hand out of reach | if the fore-end is past 97% of the left arm, the gun comes toward the left shoulder by the shortfall | 13 cm → **0** |
| hold not loopable | the last 0.4 s eases back onto the first key | loop closes exactly |

The katana's left palm can still sit up to 4.4 cm from its intended place on the handle (along
the handle, in the overhead frames; the hand stays on it — `katana-close.png`). Pulling the sword
into reach instead bent the right wrist to 92°, so that was reverted. The right wrist at 50°
(max 62°) is set by the edge having to lead the cut.

Still not done before the game: the cut's hit frame and reach measured like `SWORD`, a fire
recoil, the walk under the upper body, citizen.glb, and a device look.

## 9ah. The two-handed weapons in the game — the katana (slot 3) and a submachine gun (slot 4) (same branch)

The user: "残っている点とゲームに組み込むための作業を行なってほしい" — the two points §9ag left on the
katana, and everything §9ag listed as missing before the game.

**The two remaining katana points (the bake, `scripts/cmu/weapon-clip.mjs`).**
- *The left palm 4.4 cm off its place on the handle* in the overhead frames: the left clavicle now
  turns toward the handle (≤ 20°) when the place is past 97% of the left arm, which brings the
  shoulder joint closer. **4.4 → 0 cm.** (Pulling the sword into reach with the right arm instead
  bent the right wrist to 92°; that was reverted in §9ag.)
- *The right wrist at 50°* (median): the right hand may turn the blade up to 15° off the plane of
  the cut, at a cost of 0.6° of bend per degree so the edge still leads, together with the elbow
  swivel. **50 → 10° at median** (max 60°).

**Into citizen.glb (`scripts/convert-character.mjs`).** A CMU-weapons section, like the hybrid
Run, reads `assets/character/cmu-weapons/` and replaces or adds clips:
`SwordAttack` ← katana-cut and `SwordIdle` ← katana-guard (the SAME names, so the hit test, the
hold on a wall and the stance play them unchanged), `SmgLow` ← the raise's first key (the low
ready), `SmgAim` ← the shouldered hold (looped). A new `katana-guard` preset is 02_07's one quiet
stretch with both hands on the handle (17.95–18.7 s). The report carries each clip's trial,
window and AMC SHA-256, and CMU's acknowledgment text. The upstream `SwordAttack` travel is
dropped from `gait` (these clips play in place; the cut's pelvis moves 7 cm). `citizen.glb`
2.77 → 2.75 MB. The bake now reads the gun's grip frame and shape from `GRIP.smg` / `SHAPE.smg`
(its output was byte-identical after the change), so the clips and the mesh cannot drift apart.

**The katana's hit timing and reach, measured (`qa/gta-upgrade/sword-timing.mjs` → `SWORD`).**
The two-handed cut is raised over the head and comes down as a diagonal from high on the LEFT
(the tip 2.25 m up) to the right knee (0.69 m) — the one-handed Quaternius cut ran right to
left. Window **0.674–0.890 s** of 1.526 s (peak 0.814), the tip at **17 m/s**, tip reach
**1.42 m**; `WEAPONS.katana.reach` 1.9 → 1.7 (tip reach + a body radius), `hands` 1 → 2. The R6
tests now assert the left-to-right sweep, the wall on the starting side, and a tip from over the
head to below the waist.

**The submachine gun (slot 4).** Generic (`サブマシンガン`), no real model or maker.
- `weapons.mjs`: 30 rounds, a 0.085 s refire (about 700 a minute), 25 per body hit (a head hit
  still kills), 50 m, a 2.0 s reload; spread 0.004 rad on the first round, +0.006 a round to
  0.06, closing at 0.25/s when the trigger is let go; recoil 0.035 rad of climb a round, settling
  at 9/s, the camera taking 35% of it. Each gun keeps its own magazine (`state.ammo`).
- The mesh (`weapon-mesh.mjs`) is built to the numbers the clips were baked against: the butt
  0.33 m behind the grip, the fore-end the left hand closes on 0.28 m ahead, the rear sight's top
  0.115 m up. Hidden when not in the hand.
- **Walking with it (the upper-body layer, `aim-layer.mjs`).** Drawn, the upper body holds SmgLow
  over whatever the legs do; aimed it blends to SmgAim (shouldered, the head down to the sights,
  looped) and the pistol's spine correction puts the muzzle on the target; each round's recoil
  is added after the correction so the climb shows. Reloading drops it to the low ready with a
  dip. Walking 45° off the aim the muzzle ray passes within 0.25 m at 10 m (the pistol's R1 bound).
- **Firing (`arsenal.mjs`).** The attack button HELD — the mouse's left, E, the pad's ZR
  (`input-map` `fire`), the touch button — keeps an automatic firing (`hold()`); the pistol still
  fires once a press. Each round's direction is the aim plus the recoil so far inside the burst's
  spread (`spreadDirection`, a deterministic spiral). The crosshair opens with the spread. The
  gunshot is the recorded CC0 clip a little higher and lighter with one reflection each side, so a
  burst does not smear.
- **The street and the police.** A burst is heard 55 m out and can send up to 80 running; an
  officer counts it as a weapon out, a kill with it as a weapon kill (`WEAPON_IDS`).
- The head tilt at the aim was 30° in the game figure (read as lolling); the bake now keeps the
  head's turn to 10° and moves the stock under the eye instead: 15° sideways, eye on the sights.

**Checks.** `tests/smg.test.mjs` (8), `tests/cmu-weapon-clip.test.mjs` (12),
`tests/weapons.test.mjs` updated (the inventory's four slots, the SMG's magazine and rate, the
two-handed cut); the game-figure bench `qa/gta-upgrade/weaponbench.html` gains smg-low, smg-aim,
smg-aim-walk, smg-recoil and smg-walk; `qa/gta-upgrade/weapons-scene.mjs` gains the SMG steps.

## 9ai. Hits that land — hit-stop, the wound, a flinch by where it struck, a light ragdoll (same branch)

The user: a cut or a shot "passes through" (通り抜けている感じ); wanted hits that feel physical, **no
camera shake and no rumble** added for it. What was missing, read in the code: damage came off at
the right frame, but the swing sailed on through the body at full speed; a round into a person
made no sound (`bullet_hit` had no handler); the victim's Hit clip barely moves and figure.mjs's
recoil bent every blow the same way; and a killed pedestrian was handed straight to the mass
crowd, which plays one fall whatever the blow was.

- **H1 hit-stop (`src/player/hit-stop.mjs`).** On a landed blow the attacker's swing and body
  (`melee.update` and the player's figure run on `hitStop.scale(dt)`) and the victim's body
  (`victimScale`, via `p.hitStopUntil`) run at 6% for 0.07 s on a cut, 0.045 s on a pistol round,
  0.025 s on a submachine-gun round (at most one per 0.12 s, so a burst does not stutter). The
  city, the traffic and the crowd run on, so it never reads as a dropped frame.
- **H2 the wound.** Blood sprayed out along the blow from its own opaque particle pool
  (`weapon-effects.mjs` `blood()`, one more draw call while live; sparks are additive and would
  glow red), with a little back-spatter: at the round's hit point, and for a cut at the height
  the blade met them. A synthesised thump for a round and a hiss-and-thump for a cut
  (`gunfire.mjs` `flesh()`/`slice()`), on top of the existing blow sound.
- **H3 a flinch by where it struck (`src/player/hit-reaction.mjs`).** Each blow is an impulse
  into damped springs on the bones that would take it, in the body's frame: head → the head
  snaps (about 35°) and the neck after it; body → the trunk folds away (about 40° over three
  bones) with the head lagging; legs → the knees buckle and the trunk folds forward. Rounds add
  up over a burst (an automatic's are 0.6 each), bounded per bone. Where it struck: for a round
  the new `castShot` `part` (legs below 0.85 m on a 1.76 m body; `zone`, and so damage, is
  unchanged); for a cut the blade tip's height at the victim's bearing (SWORD's sweep comes down
  from 2.25 m to 0.69 m), and its direction is across the body left→right and away.
- **H4 a light ragdoll (`src/player/ragdoll.mjs`).** 18 points on the joints, taken from the pose
  the blow found; Verlet with gravity, a ground plane, every bone's length, a braced torso box and
  a few "no closer than" limits (a knee or elbow cannot fold shut, the head stays off the
  shoulders); the blow is a velocity at the point it struck on top of the crowd's own knock-down
  push. The skeleton follows the points (pelvis and chest by their frames, limbs by aiming, the
  head by the point above it) and it sleeps once still (about 1 s). The near pool keeps a body it
  was already holding when it was killed (at most `RAGDOLL_LIMIT` 3) so the fall plays out; a body
  picked up afterwards would stand up and then fall, so those stay with the mass crowd as before.

**Checks.** `tests/hit-feel.test.mjs` (13): each zone falls to the ground along the blow with no
bone stretched more than 5% and nothing below the ground; the fall follows the blow's direction;
a head round moves the head more than the chest; a chest hit comes back; a leg hit closes the
knee angle; the hit-stop runs a swing at under 10% through its stop and resumes, and an automatic
stops at most once per gap; a cut records where and which way and hands a kill its ragdoll with
the knock-down push; a round below the hips is `legs` without changing `zone`; blood is its own
opaque pool, sprays along the blow and falls; a figure told it is a ragdoll stays where it fell
and ends lying down. `qa/gta-upgrade/hitbench.html` draws the flinches and the falls (the flinch
was sized on it: the first kicks moved the neck 11 cm for 0.2 s, a twitch at play distance).

## 9aj. Every pedestrian you hit reacts like it — who gets the detailed body, the crowd's falls, a smoother frame (same branch)

The user: "結局少人数しか実装無理か。…本物のgtaみたいに滑らかにみんなプレイできるようにしたい". GTA
does not simulate every pedestrian in detail either; what it guarantees is that the one you
shoot is. So:

- **G1 who gets the detailed body (`near-characters.mjs`).** Whoever is on the crosshair (the
  lock-on, or the person the camera ray meets: `arsenal.mjs` writes `aimedUntil`), whoever the
  katana is thrown at (`combat.mjs`), and anyone hit in the last 4 s (`hitAt`) outranks everyone
  merely nearer for a humanoid slot, out to `PRIORITY_RANGE` 55 m (the submachine gun's 50 m
  reach). The flinch (§9ai H3) and the ragdoll (H4) therefore play on the person you hit, not
  only on the eight nearest. A body killed this instant is picked up for its ragdoll even if it
  was not held (it was standing, which is the pose the ragdoll starts from); one killed a while
  ago is left alone (it would stand up and then fall). `RAGDOLL_LIMIT` 3 → 4.
- **G2 the mass crowd's falls (`hq-layer.mjs`).** A body felled by a blade or a round is turned at
  once to face against the blow (`hitX/hitZ`), so the baked backward fall goes along it. Before,
  only a strong push turned it, and a gunshot's 0.7 m/s never did. (The HQ atlas has one fall;
  more fall clips would need a new bake — not done.)
- **G3 smoothness without device numbers.** Dynamic resolution
  (`src/quality/dynamic-resolution.mjs`): over budget and GPU-bound (≥ 35% of the frame not CPU
  work), the render scale drops 10% (floor 60%, one change per 1.25 s); comfortably inside, it
  climbs back 5% at a time; CPU-bound frames are left alone; `?dynres=0` turns it off; fixed
  during the `?perf` sweep; the overlay shows `res`. The far HQ band (L2) doing nothing in
  particular is placed every third frame, staggered, its skipped time carried into its pace.
  Not done: a lighter default tier (the user plays HIGH, which stays as it is) and anything the
  device JSON should decide (P1–P4 remain waiting on it).

**Checks.** `tests/hit-feel.test.mjs` +4 (the aimed-at person 45 m out is promoted past 40
nearer people and let go after the hold; a fresh kill is picked up, an old one is not; the mass
crowd's felled body faces against the blow with a slight push; aiming marks the target; the far
band is skipped yet never more than two frames behind), `tests/dynamic-resolution.test.mjs` (3).
`npm run test:ci` **736, 731 pass, 0 fail, 5 skipped**.

## 9ak. Hits from how people actually react — a flexion reflex, and a collapse inside joint ranges (same branch)

The user, on the §9ai bench: "のけぞりの角度おかしくね？実際の人間のシミュレーションから考えて欲しい". Two things
were the film convention, not a body:

- **The flinch** bent the trunk back 40° from a chest hit. A pistol round's momentum moves a 70 kg
  body a few centimetres per second and a cut is a slice; what a hit visibly causes is the
  flexion (startle/withdrawal) reflex within about 0.1 s — the trunk curls forward around the
  wound, the head drops, the shoulders come in. `hit-reaction.mjs` now gives each bone a forward
  curl whichever way the blow came plus a small lean along it (trunk ~20° over three bones; a head
  round snaps the head ~15°; a leg round gives both knees ~20° from any direction — a blow from
  behind used to flip them into hyperextension). Bound per bone 0.6 rad.
- **The fall** had no joint ranges, and swept the feet back at the start: that was the split and
  the backward knee in the user's picture. `ragdoll.mjs` now keeps human ranges — knee and elbow
  as one-way hinges, the hip to 110° flexion / 15° extension / 45° out / 20° across (front to back
  at most 125°), the head within 50° of the chest — and falls as people do: a collapse (hips drop
  1.0 m/s, knees give 0.35, the trunk goes forward 0.5) tipped by a modest blow (0.4 m/s for a
  head shot, which drops a body where it stands; 1.1 for the body; 0.9 for the legs). A killing
  cut pushes 0.9 m/s along the blade (`COMBAT.cutPush`), not a car victim's 2.2 m/s with lift.
- Two physics faults found on the way: a joint correction that moves only one point pushes the
  whole body (it drifted 0.5–0.9 m sideways whatever the blow) — every correction is now split so
  it conserves momentum; and a point lifted out of the ground kept its old position, which in
  Verlet is an upward velocity — the body bounced itself back onto its shoulders; the ground is
  now inelastic. The hip limit is soft (35% a pass) so it does not fight the ground while seated.

The bodies now end as a heap on the side or slumped over the knees, the knees never bend the
wrong way and the legs never split (`evidence/weapons/hit-bench/hitbench.png`). Tests
(`tests/hit-feel.test.mjs`, 18): the old "fall along the blow by 0.4 m" became "tip along it by
0.2 m and go down within 0.9 m of where it stood"; new: no knee bent backward at any step, legs
never over 125° apart, no thigh far behind the trunk; the chest flinch curls forward from front,
back and side with only a small lean along the blow; the knees give from front and behind.

## 9al. Roadmap stage 0 — gyro aim on the Switch Pro Controller (branch restarted from `master` `90429ad`)

The staged roadmap the user approved (stage 0 gyro; 1 gun feel and HUD; 2 people's reactions; 3
wanted 4–5 and escape; 4 onlookers, emergency services, time-of-day population — no rain; 5
missions, money, shops, save; 6 car damage, an original GTA-style radio, a motorcycle), one PR
per stage.

- **Why WebHID.** The Gamepad API gives sticks and buttons only. `src/player/gyro.mjs` opens the
  Pro Controller (057e:2009) over WebHID (Chrome/Edge), turns its IMU on (subcommand 0x40) and
  asks for full reports (0x03 → 0x30). Each 0x30 report carries three samples 5 ms apart
  (accel xyz, gyro xyz, int16 LE, 0.061 dps/count, at data offset 12 — the report id is not in
  `event.data`).
- **Feel.** One to one at sensitivity 1 (default 1.5, 0.25–4), + yaw turning left as `heading`
  grows. Default **only while aiming** (ZL or the right mouse button), as the Switch's own shooters
  do; "always" is a choice. Off while driving (and drained, so turning in a car is not dumped on
  the camera when you get out).
- **Drift.** The first 0.5 s (100 samples) decide the at-rest offset, and only if the controller
  was still (spread under 2.5 dps) — a controller being waved does not calibrate. After that the
  offset keeps learning slowly whenever it is still for 0.6 s; rates under 0.6 dps are dropped.
- **UI.** 詳細設定 → ジャイロ照準: the switch (the browser's device picker opens from the click;
  a controller allowed before is reopened on load without asking), 構え中のみ/常時, sensitivity,
  left-right and up-down invert. Kept in `shibuya.pad` with the stick settings.
- **Not yet seen on a device.** Which IMU axis is yaw and pitch (Z and Y) and their signs are from
  the controller's documented layout, not from a controller in hand; the invert switches cover a
  wrong sign. On the device check: gyro left/right and up/down directions, whether the sticks and
  buttons keep working through the Gamepad API while WebHID has the controller open (both over USB
  and Bluetooth).

Tests (`tests/gyro.test.mjs`, 8): report parsing; offset learned before any turn and a still
controller never drifts; 90 dps for 1 s is a quarter turn; no calibration while moving; the offset
followed as it creeps; bounded settings; the subcommand bytes; a fake WebHID device (the two
subcommands sent, aim-only drains when not aiming, sensitivity and invert, saved to storage);
no WebHID → "unsupported".

## 9am. Roadmap stage 1 — the gun's feel and its HUD (branch `claude/shibuya-weapons-implementation-28u1y1`, from `master` `261b89c`)

- **Hit marker.** A short X over the crosshair when a round or a cut lands (white), red and longer
  on a kill. Driven by the shot's outcome (`onShot`), `blade_hit`, and a new `npc_killed` combat
  event (`combat.mjs kill()`), so fists, the katana and both guns all mark it.
- **The automatic zooms.** `WEAPONS.smg.aimFov` 30 (the pistol keeps `PLAYER.aimFov` 40): the
  shouldered gun closes the view further, as sights do.
- **The ammunition panel.** Top right (above the controls on a phone): the weapon's name, the rounds
  large with the magazine small, amber on the last quarter, and a bar that empties with the
  magazine and fills with the reload (`snapshot().reloadProgress`). The dashboard line keeps only
  the weapon's name.
- **The weapon wheel** (`weapon-wheel.mjs`). Tab held (a tap still takes/gives the pointer, now on
  release), the pad's L or R held (a tap is the previous/next weapon, now on release —
  `input-map.mjs`), or the phone's weapon button held; the four weapons clockwise from the top in
  key order; the mouse's travel, the right stick or a drag picks; letting go draws it. The world
  runs at 0.3 speed while it is open (the frame's `dt`, eased).
- **What a fight leaves** (`impact-marks.mjs`, one draw call per kind, none while empty, generated
  textures): bullet holes on walls (the normal from the open air around the hit) and the ground,
  90 s, 64 at most; brass casings out of the port to the gun's right, bouncing and lying on their
  side with a synthesised tink (`gunfire.tink`), 14 s, 40 at most; muzzle smoke, ~1 s; the
  automatic's dropped magazine, 30 s; blood pools that wait 1.1 s for the body to go down, then
  spread to 0.45–0.8 m over ~9 s, 120 s, 12 at most.
- **Draw and holster** (`hands.mjs`). A weapon change is a hand movement: the right hand goes to
  where the weapon out is carried (0.22 s) and puts it away, then to where the next one is (the
  hip holster, the handle over the right shoulder, and — new — the submachine gun slung behind the
  right shoulder) and brings it up (0.3 s). The weapon in the hand swaps when the hand is at the
  carry; mid-change the figure poses the weapon actually held, lowered; a shot waits for it
  (`arsenal` checks `figure.hands.busy`). Two-bone IK over the finished pose (foot-ik's solver).
- **The automatic's reload.** The magazine is its own mesh now. Over the 2 s reload the left hand
  leaves the fore-end, takes the magazine, pulls it, lets it fall (it drops to the pavement),
  fetches a fresh one from the left hip, seats it and returns; the magazine follows the palm.

Tests: `tests/stage1.test.mjs` (11 — wheel geometry and picking, wall normals, casings to the
right and resting, bounded pools, a pool's delay and spread, hole on the wall's face from a real
shot, the draw's timeline, the reload's key points, the draw and the reload on the humanoid);
`input-map` (L/R on release, held is the wheel, never in a car); R3 in `weapons.test.mjs` now waits
for the draw. Stills: `evidence/roadmap/stage1/stage1bench.png` (qa/gta-upgrade/stage1bench.html
on the game's modules: holes, casings, smoke, a dropped magazine, a pool at 0/3/9 s; the pistol to
submachine gun change from behind; the reload from the left front). A full in-scene capture script
is committed (qa/gta-upgrade/stage1-scene.mjs, force-added like the other benches): in
this container's headless SwiftShader it runs at 0.1 fps and the WebGL context was lost mid-burst at
HIGH and MEDIUM, so no in-scene stills were kept. The bench on the same modules did not lose its
context; the scene loss is unexplained and should be checked on a real GPU.

Not yet seen on a device: the whole of stage 1 in the real scene (HUD layout at phone width, the
wheel with a real pad and on a phone, the tink's level, whether 0.3 slow-down feels right).

## 9an. Roadmap stage 2 — people answer a weapon (branch restarted from `master` `ea42b64`)

- **Hands up** (`street-reactions.mjs`, `body-states.mjs`). The person the raised gun is on
  (`arsenal.aimedAt`: the lock-on or the crosshair's ray), within 22 m, stops, turns to face it and
  raises both hands beside the head (two-bone IK, elbows bent, 0.2 s in). They hold while the aim
  stays (the simulation's `surrender` state, `speed 0`); 0.9 s after it leaves, or after 6 s of it
  anyway, they run from the player. Held people get a humanoid body (near-characters priority).
- **Limp and crawl.** A non-fatal round in the legs (`part === 'legs'`, combat.mjs) leaves them
  limping at 0.45 of their pace: the right knee kept nearly straight and the pelvis dropping as it
  takes the weight. A second leg wound, or one at 45 health or less, puts them on the ground:
  `Crawl`, a new clip baked from the pack's Swim_Fwd_Loop (prone, head first, arms reaching and
  pulling), set down at the pavement (`CRAWL.lift` 0.36 m) and played at the pace they drag
  themselves (0.22 of their pace). `citizen.glb` rebaked: 28 clips (CMU weapon clips preserved).
- **The armed few.** 5% of adults (fixed by id; never a child or an officer) carry a handgun. Hurt by
  the player, aimed at, or within 16 m of a gunshot, they draw instead of running and shoot back from
  where they stand (`shooting` state) while they have a line to the player, every ~1.35 s, less
  accurately than the police (50% at point blank falling to 6% at 30 m, 8–14 damage), for 14 s after
  the last provocation. Their rounds go through the police revolver's drawing and sound path
  (`enemyShot` in the scene, now shared) and hurt the player directly. The drawn gun is the humanoid
  slot's revolver mesh, as an officer's is.
- **A falling body meets walls and cars** (`ragdoll.mjs`, `setRagdollWorld`). Each ragdoll point
  that steps into a solid cell is put back where it was across the ground (inelastic, like the
  floor); a point inside a nearby car's box is pushed out through the nearest face (onto the roof if
  it came from above). The scene hands the ragdolls the cars within 40 m every frame.
- **The katana held in both hands while walking** (`createUpperPose`): walking with the katana out,
  the upper body keeps Sword_Idle's two-handed guard over the walk, faded over 0.2 s.

Tests: `tests/stage2.test.mjs` (11 — armed share, hands up / hold / run / give up, leg wounds, the
armed drawing and firing only with a line and worse than the police, hands up on the body, limp and
crawl on the body, katana hands together while walking, ragdoll stopped by a wall and a car, the
simulation's hold and wounded pace). Stills: `evidence/roadmap/stage2/stage2bench.png`
(qa/gta-upgrade/stage2bench.html).

Not yet seen in the real scene or on a device: the whole of stage 2 (the headless scene capture is
at 0.1 fps and lost its WebGL context in stage 1). The crawl is a laid-down swim and should be
judged by eye; `CRAWL.lift` is a first guess.

## 9ao. Roadmap stage 3 — ☆4–5 and getting away (branch restarted from `master` `4f30a57`)

The wanted model already had ☆4–5, the search circle and escaping by staying outside it unseen
(wanted.mjs, PLAN-POLICE W1) and a ☆4 roadblock in a random direction (units.mjs). Stage 3 makes
them something the player can see and has to play against:

- **The helicopter** (`police/helicopter.mjs`, driven by the director). At ☆4+ it comes in from
  260 m out, holds a 26 m orbit at 42 m over the player and keeps a searchlight on them. Its crew's
  eye counts for the wanted level's `seen`: in the light's 7 m spot (not under cover), or by day
  within 70 m. When it loses the player it sweeps the light in a widening spiral round where they
  were last seen; below ☆4 it climbs away and is gone. Drawn as a merged white-and-navy body, two
  spinning rotors, and a fake light (an additive cone and a spot on the ground, bright at night,
  barely there by day) -- no real light (§16a). A synthesised rotor (`audio/rotor.mjs`: low noise
  chopped at the 13 Hz blade pass, a faint turbine whine), panned and fading with distance.
- **The search circle on the minimap.** While the stars flash, a circle of the level's search
  radius round where the police last saw the player, red and blue in turn; the helicopter as a white
  cross and its light as a ring.
- **The pincer.** units.mjs now estimates the player's travel (a smoothed velocity). At ☆4+ every
  other new patrol car comes from ahead of it (within the `aheadCone` 0.55 cosine) when there is a
  lane sample there, and the roadblock is set across the road 80–140 m ahead of a player moving
  faster than 3 m/s (random, as before, when they are not).

Tests: `tests/stage3.test.mjs` (7 — the helicopter's arrival, orbit and light; the lost sweep and
the light finding them; day sight and leaving; the mesh; the pincer and the roadblock ahead on the
real HIGH lane graph, and nothing "ahead" of a player standing still; the director keeping the player
seen in the searchlight so the escape clock does not run; the rotor's fall-off). Stills:
`evidence/roadmap/stage3/stage3bench.png` (qa/gta-upgrade/stage3bench.html: the helicopter by day,
at night with the light on the player, at night sweeping after losing them; a top-down ☆4 chase
with the cars from ahead, the roadblock ahead and the search circle).

Not yet seen in the real scene or on a device: the helicopter over the real skyline, the rotor's
level against the sirens, whether ☆4–5 are escapable (the searchlight makes night escapes harder,
day escapes need 70 m from the helicopter).

## 9ap. Roadmap stage 4 — onlookers, the aftermath, the crowd by time of day (branch restarted from `master` `418c7e1`)

- **Onlookers** (`life/onlookers.mjs`). Three seconds after the last gunshot (anyone's), for each
  body the nearest five people between 4 and 20 m (not children, officers, anyone crossing,
  fleeing, fighting, armed, at gunpoint or crawling) stop, turn to it and take out a phone for
  12–28 s: about two in three hold it up to film, the rest put it to the ear to call it in (fixed by
  the person and the body). The simulation holds them (`watching`); the drawn body raises the phone
  (`body-states.mjs` `createPhone`: two-bone IK of the right arm, the phone held out in front at
  chest-to-chin height to film or at the right ear to call, and a small phone mesh in the hand,
  built on first use).
- **Found on review: the arm through the chest.** The owner saw the filming hand sunk into the
  chest. A two-bone solve keeps the bend plane the animation had, and for an arm hanging at the
  side that put the elbow in front of the chest once the hand came up; with the target too far out
  the arm also went straight. `swivelElbow` now turns each solved arm about its shoulder-wrist line
  so the elbow points at a pole down and out to the side (the phone arms and both hands-up arms), and
  the filming target is nearer and lower. Test: the elbow outside the shoulder's line and the upper
  arm's middle outside the trunk's section (an ellipse 0.17 × 0.12 m) for filming, calling and
  hands up.
- **The aftermath** (`life/aftermath.mjs`). A body killed in a fight or by a weapon now stays down
  until it is collected (at most 180 s), instead of vanishing after FALL_SECONDS (14 s). With no
  chase on (☆0), 18 s after the newest death, an ambulance and a patrol car are taken from the
  traffic pool 70 m up the nearest police-usable lane (within 35 m of the bodies), driven by hand
  along it with their lamps flashing, stop by the scene (the patrol car 7.5 m behind), stay 14 s,
  take the bodies within 25 m and wash the blood pools there (`impact-marks.clearNear`), drive on to
  the end of the lane and are gone. A body nowhere near a lane is taken off-screen. The ambulance is
  a new vehicle type (weight 0, `handDriven`: never ordinary traffic, never takeable; the fleet test
  exempts it from needing lanes of its own) with a red-below-white livery and a red lightbar.
- **The crowd by time of day** (`life/population.mjs`): the share of the tier's crowd that is sent
  out -- dawn 0.35, day 1, dusk 0.9, night 0.6 -- set on the simulation every frame
  (`setPopulation`); a drop thins the crowd as walks end rather than removing anyone in view. No
  rain (the owner's call).

Tests: `tests/stage4.test.mjs` (6 — who stops to watch and who never does, one gathering per body,
phones away after; the simulation's watching hold and bodies staying down; the population shares
and the clamp; the ambulance's config; the whole aftermath on the real HIGH lane graph -- not
while chasing, not before the wait, the two near bodies one scene, the patrol car behind, the far
body left, the blood washed only there, gone after; the phone on the body, filming and calling).
Stills: `evidence/roadmap/stage4/stage4bench.png` (qa/gta-upgrade/stage4bench.html; the bench draws
the ambulance plain white: the livery band is the fleet shader's).

Not yet seen in the real scene or on a device: the onlookers among the real crowd, the ambulance's
livery in the fleet renderer, how far the lane stop is from bodies in narrow streets, the crowd
thinning at night.

## 9aq. Roadmap stage 5 — missions, money, the shop, saving (branch restarted from `master` `664a3ce`)

- **The mission board** (`game/missions.mjs`, shown by play-ui's mission panel; the delivery is one
  of the five now). Each is paid once, on success:
  - 配達 (delivery, ¥3,000 + 5 × its score) — the existing three-stop run.
  - 追跡 (chase, ¥8,000) — a car (a traffic slot, controlled and not takeable) appears 45–80 m
    away, ahead if it can, and drives off over the carriageway flow field (police/units.mjs's
    `createRoadField`, run away from the player) at 12.5 m/s, easing to 8 when more than 60 m
    ahead. Staying within 7 m of it for 2.5 s makes it give up; it is then left parked. More than
    220 m away, or 150 s, fails.
  - 逃走 (escape, ¥6,000) — reported (☆2, seen by an officer) on start; completes only when the
    level is cleared by escaping (an arrest or a death fails it).
  - 護送 (escort, ¥7,000) — the nearest adult within 25 m follows a step behind the player
    (walking, running when left behind) to an address 90–150 m away; left more than 35 m behind for
    10 s, or hurt, fails.
  - ひったくり犯を追え (snatch, ¥5,000, +¥1,500 if the thief is taken alive) — a thief by a victim
    6–25 m away grabs a bag (the victim screams) and runs a pedestrian route 140–220 m long at
    3.9 m/s (the player runs 4.2). A blow, a round or a tackle (1.6 m on foot) stops them; they put
    their hands up. More than 110 m away, the route's end, or 120 s, fails.
  The client and the thief are moved by a new `follow` hold in the simulation (walls stop them;
  they get a detailed body); when a mission ends they are left standing where they are.
- **Money** (`game/economy.mjs`): ¥5,000 to start; dying costs 10% and an arrest 15% of the wallet
  (at most ¥20,000, never into debt). Shown in the dashboard.
- **The shop** (`game/shop.mjs`): a convenience store's door on the pavement by the crossing (a
  yellow dot on the map). Standing at it opens the counter: 救急キット ¥1,500 (full health),
  防弾ベスト ¥4,000 (takes 70% of each blow until 50 is used up; lost on death), 車の修理 ¥2,500.
  It refuses what would do nothing or cannot be paid for.
- **Saving** (`game/save.mjs`): one slot in the browser (`shibuya.save`, versioned and sanitised):
  money, the vest, missions completed and the best pay. Saved at the shop's counter, after every
  paid mission, every purchase, and after a death or arrest bill; loaded when the page opens.

Tests: `tests/stage5.test.mjs` (8 — the wallet and its capped bills; the save round trip and its
refusal of other versions and garbage; the shop and the vest; the board; the chase on the real
HIGH lane graph, caught and lost; the escape, escaped and arrested; the escort on the real
pedestrian network, delivered and abandoned; the snatch, stopped by a blow with the bonus).
Stills: `evidence/roadmap/stage5/stage5bench.png` (qa/gta-upgrade/stage5bench.html: the HUD at
960×540 -- the board, a chase running, the shop's counter, a mission paid -- and a chase and a
snatch top-down on the real map). The bench capture serves `.css` now and takes a page size.

Not yet seen in the real scene or on a device: the chase car among real traffic (it ignores other
cars), the thief and the client on the real crowd's pavements, the shop's place, and the balance of
the rewards and prices.

## 9ar. Roadmap stage 6 — dents and glass, the motorbike, the car radio (branch restarted from `master` `4cc1a9b`)

- **Dents and broken glass** (`player/car-damage.mjs`). The wear is data on the traffic slot
  (`slot.wear`: up to 24 dents and four panes, each 0 whole / 1 cracked / 2 gone), so it stays with
  the car -- shoot a parked car's windows, get in, and they are broken. Every spawn in the pool
  (traffic, police units, the mission car, the ambulance, the own car) starts it clean
  (`wear: null`); the shop's repair clears it.
  - A crash (the same contact that already cost speed and `damage`) dents the body at the point
    of contact, pushed in along the hit, deeper and wider with the speed it took away, merging
    with a dent already there. 7 m/s lost cracks the pane on that side; 13 m/s takes it out.
  - A round meeting a car above 55% of its height hits glass: the first cracks the pane it came
    through, the next takes it out. Below that it leaves a small dent. Shards (pale points on the
    blood pool) and a synthesised glass sound (`audio.glass`).
  - A person thrown onto the bonnet at 9 m/s cracks the windscreen, at 15 takes it out.
  - Drawn on the player's close-range model only (vehicle-visual.mjs): the paint shell's
    vertices are pushed in round each dent with a crumple term, normals recomputed. The glass is
    split by pane from each triangle's normal; a cracked pane is redrawn with a generated crazed
    texture (`vehicle-glass-cracked`), and a pane that is gone is collapsed. Traffic cars are
    batches and are not deformed.
- **The motorbike** (`traffic/motorbike-shape.mjs`, type `motorbike`). No CC0 model small and clean
  enough to ship was at hand, so it is built from primitives: tank, tail, cowl and screen, an
  engine block, a tubular frame, forks, a swingarm, an exhaust down the right, spoked wheels.
  - Weight 0 and `handDriven`, so it is never traffic. Three stand parked (`kept`, so a tier change
    does not recycle them): one 10 m from where the player first appears, two further out
    (`BIKE_SPOTS`). Traffic draws a parked one leaning on its side stand.
  - It is faster than any car (17 m/s) and quicker off the line (`power` 1.4 in the handling),
    narrow, and on its own model it leans into turns (tan lean = v·ω/g, at most 0.72 rad). Both
    wheels spin and the front steers.
  - The rider is on show, not hidden like a car's driver: the seated Drive clip, the trunk leant
    over the tank, the hands IK'd to the grips and the feet to the pegs (`createRideGrip`), all
    leaning with the bike.
  - A hit that takes 6.5 m/s or more throws the rider off (the knock-down a car gives, 25 health).
- **The car radio** (`audio/radio-music.mjs`, `audio/radio.mjs`). Original instrumental music,
  written by rule and played on a synthesised band -- no samples, no licences. Six stations:
  Shibuya Night FM (city pop), Concrete 93.1 (boom-bap hip-hop), Neon Pulse 101.7 (house),
  Rewind 80s (synthwave), Loud Garage 97.8 (rock), Tokyo Drill 104.2 (trap). Each has three
  songs with made-up titles and artists; a song is a 52-bar form (intro, verse, chorus, verse,
  chorus, bridge, chorus, outro) over the style's stock progression and grooves, with a lead
  motif per song, and a station jingle between songs.
  - Stations are live: each runs on its own clock, so tuning lands mid-song, with a burst of
    static. Notes are scheduled 0.3 s ahead on the AudioContext, through a car-speaker filter and
    a compressor.
  - Controls: R in a car (Shift+R back), the pad's d-pad ←/→, a ラジオ button on touch. The dial
    runs through the six stations and then off.
  - Each car remembers its station; a patrol car starts with it off. The station and song show at
    the top of the screen for 4 s when they change. Getting out fades it.

Tests: `tests/stage6.test.mjs` (9 — crash dents and panes; rounds on glass and body; the deform;
the close-range model dented, cracked, broken and repaired; the motorbike type, model, fleet parts,
anchors and lean; the rider's hands and feet on the grips and pegs; the six stations' songs (their
grooves, determinism, ranges); a station's live programme; the dial and its controls).
Stills: `evidence/roadmap/stage6/stage6bench.png` (qa/gta-upgrade/stage6bench.html). The radio
is rendered offline by qa/gta-upgrade/radiobench.html (a waveform and band-energy strip per
station, `evidence/roadmap/stage6/radiobench.png`); the bench capture now writes files a bench
hands back (the 12-second WAVs), which are not committed.

Not yet heard or seen on a device: how the radio sounds on real speakers and its level under the
engine and the city (tuned by measured RMS only), the bike's handling and the rider seen from the
chase camera, the dents on a real crash, and whether the ラジオ button crowds the touch layout.

## 9as. The katana's blade swung back when setting off (owner report after stage 6)

On a phone the blade was seen pointing back behind the body. Measured (the blade's direction,
hand to tip, in the body's frame, over a stand/walk/stop/creep/run profile): for the first fifth
of a second of every walk the blade pointed back and down (forward component -0.9). The stage 2
two-handed guard (`createUpperPose` on Sword_Idle) was faded in only while moving, so as a walk
began, the walk's own swinging right arm held the sword. A touch stick starts and stops all the
time, so it showed constantly.

The guard is now held whenever the katana is in the hand and the body is not cutting, falling or
in a car -- standing as well as walking -- so there is no fade at the start of a walk. The blade's
forward component now stays at 0.55 or more through the whole profile and after a cut. The pistol
and the submachine gun were measured the same way and never point back.

Test: `tests/weapon-orientation.test.mjs` (fails on the old code at -0.91). Stills:
`evidence/roadmap/katana-setoff/before.png` and `after.png` (1, 3, 5 and 7 frames after setting
off, from the side).

## 9at. The katana guard's elbows (owner report: "is the right arm right? check the joints")

Measured in the guard (standing, walking, running): the Sword_Idle clip holds the right elbow
above the shoulder (1.54 m against 1.48 m standing) and pointing up and in across the chest, and
the left elbow pointing in and back -- a raised chicken wing, the right upper arm across the face
seen from the front.

`createKatanaGrip` (body-states.mjs) runs after the guard pose whenever it is on: each elbow is
swung round its shoulder-wrist line toward a point below and outside the shoulder
(`BODY.katanaGuard`, ±0.4, 0.7, 0.2 in the body frame), so the fists and the blade stay where they
were, and each hand is put back to the world orientation it had, so the blade does not turn and
the left hand stays on the handle. Elbows now point down (-0.91) and out; the blade's direction
and the swing are unchanged.

Test: `tests/weapon-orientation.test.mjs` (elbows below the shoulder, pointing down and out, the
left hand on the handle, at 0, 1.4 and 3.5 m/s; fails on the old code). Stills:
`evidence/roadmap/katana-guard/before.png` and `after.png` (standing and walking, four views each).

## 9au. Real-scene stills, the frame's cost per situation, and where the stages meet

**1. Real-scene stills headless** (`qa/gta-upgrade/scene-stills.mjs`, `__SHIBUYA_QA__.render/view/frames`).
Measured first (`qa/gta-upgrade/scene-probe.mjs`): SwiftShader draws the scene at 0.2 fps
(about 10 M triangles at 960×540), and the game advances one clamped 0.1 s step per frame, so a
scripted play-through took hours. The WebGL context was NOT lost this time. Under `?qa=1` the
capture now turns drawing off (the existing `perfOff` 'render' switch) so the game runs its own
loop at full speed, and on again for each still; `view({dist,height,yaw,target})` places a camera
round the player for a close still, and the HUD panels are hidden unless they are the point. Stills
in `evidence/roadmap/scene/` (JPEG): the crossing; the katana guard walking and standing (elbows
down, as §9at); the pistol; mounting the motorbike, riding, leaning into a turn; the radio's banner
in a car and on the bike; a car into the crowd (a dent and the windscreen cracked by a person on
the bonnet); a parked car shot through a side window (the crack seen on its close model).

**2. The frame's CPU cost per situation** (`qa/gta-upgrade/scene-cost.mjs`, `evidence/roadmap/scene/cost.json`).
Drawing off, `?perf=1`, HIGH, the stages' systems each timed as a probe section (`timed(...)` in
ShibuyaScene), 120 frames each, in this container's CPU:

| situation | frame mean / p95 ms | crowd (life) | traffic | stages 1–6 systems |
|---|---|---|---|---|
| on foot, idle | 18.0 / 31.9 | 13.1 | 2.8 | 0.9 |
| SMG firefight into the crowd, ☆2 | 36.1 / 68.0 | 26.5 | 5.1 | 2.3 (arsenal 1.5, reactions 0.5) |
| ☆3, units closing | 16.5 / 26.3 | 12.5 | 2.6 | 0.4 |
| aftermath (onlookers, ambulance) | 13.2 / 18.1 | 9.2 | 2.4 | 0.35 |
| motorbike, radio on | 16.2 / 25.5 | 8.3 | 6.3 | 0.4 |
| chase mission, riding | 16.9 / 26.5 | 8.9 | 6.6 | 0.4 |

The stages' own systems are small everywhere (the radio's scheduling 0.004 ms; its audio thread is
not measured here). The worst case, the firefight, is the crowd: a CPU profile of it
(`PROFILE=b-firefight`) is the fleeing crowd's walkable and collision queries (the solid grid's
query 5.8 %, ground height 4.1 %, vehicle overlap 3.6 %, ring tests 3.4 %, `safe` 2.9 %, `blocked`
2.9 %), all older than the roadmap. Nothing was trimmed: the stages' systems do not need it, and
the crowd's flee is a core system tuned over many runs -- a candidate for its own change (cap how
many fleeing people probe directions per frame) if the device shows the firefight dropping frames.

**3. Where the stages meet** (`tests/integration.test.mjs`). Bugs found and fixed:
- A motorbike was treated as having glass: a round at rider height "cracked a pane" and a hard
  crash "shattered the windscreen" (sound and shards). A bike now only dents (`car-damage.mjs`).
- On a motorbike the rider was bulletproof: the police's hits went to the vehicle as for a car, and
  the scene ignored hurt while driving. The rider is hit now, bleeds, and a rider shot dead falls off
  (director.mjs, ShibuyaScene).
Also covered: riding into a wall throws the rider off; a recycled pool slot comes back with no dents
and not `kept`; the parked bikes survive a change of tier; a chase mission can be ridden.

## 9av. Fights: fewer, bare-handed only, one at a time; nobody on the street armed (owner's plan, item 1)

Measured before: everyone punched hit back (the victim's response was forced to FIGHT since Step E),
a bump started a fight 30% of the time, and 5% of adults carried a gun that they drew at a nearby
gunshot. With a crowd round the player, a fight quickly became several.

Now (`life/temperament.mjs` `FIGHT_SHARE` .03, `fighter`; `player/combat.mjs`):
- Only about 3% of adults (by id; never a child or an elderly person) fight. They are the only
  ones a punch or a bump turns hostile; everyone else punched runs (screaming) or steps back.
- Only against bare fists. With any weapon drawn (katana, pistol, SMG) nobody starts a fight --
  a katana's victim runs screaming -- and the moment a weapon comes out every fist fight breaks up:
  they scream and run.
- One at a time: a second would-be fighter backs off while someone is already squaring up.
- Nobody on the street carries a gun (`REACT.armedShare` 0); only the police shoot. The
  armed-civilian machinery stays, and its tests run at the share it was built with.

Tests: `tests/combat.test.mjs` (the few fight and the rest run; ~3% and never a child or an elderly
person; one at a time; a weapon breaks the fight and the katana starts none), `tests/temperament.test.mjs`,
`tests/crowd-contact.test.mjs` (about 3% of 1,000 people bumped fight), `tests/player-health.test.mjs`
and `tests/stage2.test.mjs` updated to the rule.

## 9aw. The police: taken only when shot dead; crews get out; their cars can be taken (owner's plan, item 2)

Before: an arrest on foot was an officer's hands on the player for 2 s; in a car, a patrol car
pinning a stopped car for 3 s. Officers were pedestrians re-dressed out of view; revolvers came out
at ☆3 and were fired only at a threat.

Now:
- **No arrest by hands or by a pinned car** (`units.mjs`). The only way to be taken is to be **shot
  dead by the police**: a death within 1.5 s of a police round (or baton) is the arrest
  (`director.mjs` returns `arrested`; the scene shows the arrest and charges the arrest fee, not the
  death fee). Dying any other way is a death.
- **In a car** the police chase, ram and block as before; revolvers only at ☆3 and only at a threat
  (`GUNS.carFromStars`).
- **On foot, with a patrol car within 25 m** (`UNITS.dismountAt`): the car stops and its crew
  (`UNITS.crew` = 2, at most `crewMax` 10 officers) gets out at its doors -- pedestrians from out of
  view converted the way foot officers are -- and they shoot: on foot, revolvers come out from ☆1
  and fire after the warning shot whether or not the player is a threat (`GUNS.fromStars` 1).
- **The empty car is left parked** (lights off, not controlled): an ordinary car to get into. Taking
  it is a stolen police car as before (`policeCarTaken`), so shooting the crew and driving off in
  their car works.

Tests: `tests/police-units.test.mjs` (no arrest by hands or pinning; a car reaching a player on foot
stops within 25 m, its crew at the doors, the car left free), `tests/police-guns.test.mjs` (in a car
holstered at ☆1–2, on foot drawn from ☆1; on foot fired on after the warning, in a car only at a
threat; shot dead by the police is the arrest, a fight death is not), `tests/police-ram.test.mjs`,
`tests/integration.test.mjs` (the crew's car can be got into and taken).

## 9ax. Aiming on the Switch Pro Controller: ZL locks on, ZR attacks (owner's plan, item 3)

Before: ZL raised the gun with only a soft lock (a 0.12 rad cone), and ZR on its own raised the gun
and fired (a click-to-fire rule carried over from the mouse).

Now, on the pad only (the keyboard, mouse and touch keep their rules):
- **ZL held** raises the gun and **hard-locks** the person nearest the centre of the view (within
  0.6 rad and 40 m, never a child, not through a wall), at the chest (`ARSENAL.hardLock`,
  `hardRange`). The lock holds while they move (the camera turns onto them), is retaken on the next
  nearest when they drop, and is lost past 50 m (`hardKeep`). **Letting go of ZL unlocks.**
- **Right stick, while locked**: a flick ← / → takes the next person to that side of the screen;
  a flick ↑ aims at the head (`ARSENAL.head` 1.62 m on a 1.76 m body, above ballistics' head line),
  ↓ back to the chest. A flick is the stick out past 0.7 from rest, once until it comes back inside
  0.35 (`flickOf`, `INPUT.flick`/`rest`). While locked the stick does not turn the camera.
- **ZR** attacks: fires the gun **only while ZL is held** (owner's choice ②: ZR alone does not
  fire, and the press is not turned into a punch); with the fists or the katana ZR punches or cuts
  as before. Holding ZR and then pressing ZL starts the automatic.
- **Gyro**: turning the controller more than 0.08 rad while locked lets go into free aim (the soft
  lock) until ZL is pressed again, so gyro aiming still works.
- HUD hint (Pro Con names): `ZL 構える・ロックオン · ZR 攻撃 · 構え中 右スティック弾き ←→ 標的切替 ↑ 頭 · …`.

Files: `src/player/input-map.mjs` (`flickOf`, the `flick` in a poll), `src/player/arsenal.mjs`
(`lockCandidates`, the hard lock, `aim/hold/trigger({pad})`, `lockFlick`, `lockGyro`, `lock`),
`src/player/controller.mjs` (pad calls carry `{pad: true}`; the stick flicks while `locked()`),
`app/ShibuyaScene.tsx` (wiring; the camera turns onto the lock). Tests: `tests/pad-aim.test.mjs`.
Not checked on the device yet: how the 0.6 rad cone, the flick thresholds and the camera's turn
rate feel in the hand.

## 9ay. Lock-on that finds whoever is shooting; the reticle on the target (roadmap ④)

Owner's report: with ZL held the reticle sat somewhere odd, and while chased it did not go to the
officers firing. Cause of the first: the lock was working (the round went to the person) but the
reticle was fixed at the middle of the screen, which the shoulder camera keeps off the target.

Now (pad only):
- **The reticle is drawn on the locked person** (the lock point projected through the view camera,
  `app/ShibuyaScene.tsx`; `play-ui.mjs` `setWeapon({at})`), and the hit marker with it. Locked on
  someone shooting (or with a gun out), the reticle is ringed (`data-threat`).
- **Order** (`arsenal.mjs` `threatTier`, `lockOrder`): tier 0 someone who has fired at the player in
  the last 6 s (`shotAtPlayerLeft`, set by `director.mjs` on each warning shot or round, `SHOOTER_MEMORY`),
  tier 1 a drawn gun, tier 2 anyone else; within a tier, distance + 8 m per radian off the view.
  Tier 0 is taken from **any side** within 60 m (`shooterCone` π: the camera swings round), tier 1
  within ±100°, tier 2 within the view (0.6 rad, 40 m) as before.
- **ZL let go and pressed again within 0.4 s** (`regrab`) takes the next in that order (round to the
  first); from a non-shooter while someone is shooting, it goes to the shooter. Let go longer, the
  lock is dropped and the next ZL locks afresh.
- **Automatic**: when the target drops, the next in the order is taken with ZL still held (ZR keeps
  firing); held on a non-shooter, the lock moves to someone who starts shooting within 0.25 s
  (`threatCheck`) -- unless the player chose that target by hand (ZL again, a flick) in the last 3 s
  (`manualHold`).
- The right-stick flicks (←/→ switch, ↑ head, ↓ chest) are unchanged.

Tests: `tests/pad-aim.test.mjs` (the order; a shooter to the side taken over a pedestrian in front,
then the next threat when one drops; ZL re-press cycles and a late press locks afresh; the
automatic kills two shooters in turn; the lock moves to a new shooter, a hand-picked target is kept
for `manualHold`; a shooter behind is taken, a drawn gun behind is not; the reticle point).
Real scene (headless, `qa/gta-upgrade/lock-probe.mjs` → `evidence/roadmap/lock/`): ZL on foot
locks a pedestrian with the reticle on them; a pedestrian 60° to the side marked as shooting is
taken, the camera turned onto them and the reticle ringed. The probe waits by game time -- headless
Chrome can stall for seconds with no frame, and a poll-count wait then lets no game time pass. The
ZL re-press is not probed there (the harness cannot hold a release under 0.4 s of game time); the
unit tests cover it.

## 9az. Police rounds reach the player in a car (roadmap ②)

Owner's report: chased in a car, no round ever reached the player (on the motorbike they did). Cause:
in a car the revolvers stayed holstered below ☆3, fired only at a threat (a ram, an attack), and a
hit only added 2% to the car's damage.

Now (owner's call: a car should last "a little longer than the motorbike"):
- In a car or on a motorbike the police draw from **☆2** (`GUNS.carFromStars`), and after the warning
  shot a fleeing player is fired on -- no ram or attack needed.
- A hit on a **car** still batters it (+2% damage) and now strikes it where the round's line meets the
  body: a dent, a cracked or shattered pane (stage 6 `shootCar`), glass or sparks.
- **70%** of hits on a car reach the cabin (**90%** once the car's damage is over 50%) and wound the
  driver for **90%** of the round (`director.mjs` `CAR_ROUNDS`, deterministic `intoCabin`). That is
  about 1.6x the hits a rider takes in a new car, 1.2x in a battered one
  (`tests/integration.test.mjs` asserts 1.1x-2.2x).
- Shot dead at the wheel is the arrest (as on foot, §9aw).
- The motorbike is unchanged except that it too is fired on from ☆2 without a ram.

Tests: `tests/police-guns.test.mjs` (☆1 in a car holstered, ☆2 fired on; a fleeing driver fired on
after the warning; the cabin share new and battered; shot dead at the wheel = arrest),
`tests/integration.test.mjs` (rider full rounds, driver through the car, a car lasts 1.1x-2.2x a
bike). Not checked in the real scene: the hit marks on the player's own car during a chase.

## 9ba. Soft smoke off a crash and a damaged car (roadmap ③)

Owner's report: the smoke when a car crashed was square and did not look real. Cause: each puff was
a faceted solid (an icosahedron at detail 0) at one flat opacity, so its facets and silhouette showed.
(The muzzle smoke, impact-marks.mjs, was already a soft sprite and is unchanged.)

Now (`src/player/effects.mjs`):
- Each particle is a **camera-facing quad drawn by a small shader**: a soft disc whose edge has a few
  fixed ripples (no two puffs the same shape), a little billow inside, and no hard rim anywhere. One
  InstancedMesh, one draw call, the same fixed pool of 72.
- A puff **fades in** over the first tenth of its life, **grows** fast then slower (0.3 m to 1.6 m),
  **turns** slowly, drifts and slows, and **thins out** to nothing.
- A damaged car (over 40%) smokes grey off the bonnet; over 70% dark grey, over 90% darker still,
  each puff a slightly different shade. A crash throws sparks and a burst of six pale puffs off the
  front. Road dust where a body met the car goes through the same shader.
- The shader is unlit, so the scene dims it at dusk (0.6) and night (0.3) (`setLight`); sparks keep
  their own glow.

Tests: `tests/smoke-fx.test.mjs` (a quad and a soft shader, not a solid; a puff fades in, grows,
turns and thins to nothing; a crash's sparks and puffs, dark smoke from a wrecked car, the pool
bounded). Real scene: `qa/gta-upgrade/scene-stills.mjs` step `smoke` (ONLY=smoke) →
`evidence/roadmap/smoke/{before,after,after-night}/` -- a moment after a crash, standing at 60% and
at 95% damage. The first version was drawn but faint (opacity 0.1-0.3 against a bright day sky) and
invisible in the stills; the opacities were raised after that capture.

## 9bb. The police speak in recorded voices; the dispatcher on the radio (roadmap ①)

Owner's report: the loudspeaker's 「止まれ」 was mechanical, with odd syllables (「れられら」). Cause:
every police line was built by the crowd's formant synthesiser (§9v), which can shape a scream but
not words.

Now:
- **Pre-rendered speech**, made once with engines whose licences allow shipping the output
  (`scripts/police-voice/`: `generate.py`, `audition.py`, `ship.mjs`; the lines in
  `assets/police-voice/lines.json`; the environment in `requirements.txt`). The owner listened to three
  candidates (a listening page with each line as it sounds in the game) and chose: **loudspeaker and
  radio Kokoro-82M jm_kumo** (Apache-2.0), **officers' shouts Style-Bert-VITS2 JVNV M1, Angry**
  (CC BY-SA 4.0). 16 clips, 475 KB, in `public/audio/police/` with a manifest; credits in
  `public/licenses/police-voice.txt`.
- **The words police use**: to a car 「前の車、止まりなさい！」 / 「前の車、左に寄せて止まりなさい！」, to a
  motorbike 「そこのバイク、止まりなさい！」, on foot 「止まりなさい！」 / 「待ちなさい！逃げるんじゃない！」,
  stopped 「車から降りなさい！」; officers 「動くな！」「武器を捨てなさい！」「撃つぞ！」「被疑者確保！」.
- **The loudspeaker** (`siren.mjs createMegaphone({clips})`) plays the recording through its existing
  chain (band-pass, saturation, slapback, HRTF at the car, the siren ducked). 「動くな！」 and
  「被疑者確保！」 are now an officer's own shout from the nearest officer (`createOfficerVoice({clips})`).
  Until the clips have decoded nothing is said -- the formant voice is not a fallback in play (it
  remains for the tests' stand-in and `?voice=tts` is unchanged).
- **The dispatcher** (`src/police/dispatch.mjs`): not placed in the street; a transmission is the
  opening beep (1.85 kHz) and a burst of hiss, the voice through a 300-3000 Hz driven radio band with
  the channel's hiss under it, then hiss and a lower closing beep. Cues (`dispatchCue`, pure): the
  incident's opening (「警視庁から各局。渋谷区道玄坂方面、逃走車両あり…」 in a car, 「…被疑者は徒歩で逃走中」
  on foot), a backup call each time the stars rise to ☆3 or more, the helicopter, the player armed,
  and 「被疑者を見失った」 after 2.5 s out of sight. One channel: a cue waits until the last
  transmission and a 4 s gap have passed.

Intelligibility, measured rather than assumed (`audition.py`: faster-whisper `small` transcribing the
processed clips, compared in katakana): about 93% for the chosen loudspeaker/radio voice, 92% for the
shout voice; the misses are mostly police vocabulary (被疑者) that the recogniser does not know.

Tests: `tests/police-recorded-voice.test.mjs` (every line shipped in the chosen voices with licences;
the wording; rotation; recordings played, silence before they load and never the formant voice; a car
addressed as a car and a motorbike as a motorbike; the dispatcher's opening; the radio cues and the
one-channel gap); `tests/police-loudspeaker.test.mjs` (the director given recorded stand-ins).
Real scene (headless): the 16 clips decode with no error; wanted to ☆3 the radio opened the incident
and called backup, the loudspeaker and an officer spoke. Not checked: how it sounds in the hand.

## 10–15. Historical roadmap (superseded by §9g)

NPC behaviour (RUN 7 — **WIP only, see below**), melee combat (8), knockdown (9), vehicle
enter/exit (10), carjacking (11), lighting polish (12), performance pass (13), final QA (14).

### RUN 7, precisely

Commit `f6aa8e8` adds `src/life/awareness.mjs`: a seven-state perception machine
(calm / look / startle / avoid / flee / recover) driven by player proximity and speed, combat,
downed bodies, and the existing oncoming-car reaction, which it **consumes as an input rather
than duplicating**. It has minimum state durations, downward-only hysteresis, a per-citizen
reaction delay, and a post-recovery cooldown. Traits come from the citizen id rather than
storage, because the pool is recycled. Alarm spreads across a 3×3 cell ring and decays, capped
below the evasion threshold so second-hand alarm can turn a head but cannot start a stampede —
there is no global trigger. It moves nobody: the only motion primitive is the simulation's own
`scatter`, and nothing in it touches `crossing`, `edge`, `route` or queue state.

`tests/npc-awareness.test.mjs` has 10 passing tests, including one asserting that a reaction
never mutates crossing or signal state.

**What has not been done, and why it is not complete:**

- it has never been loaded in a browser
- no signal / crossing / traffic regression check — the exact risk this change carries
- no screenshots, no in-scene metrics
- no acceptance judgement against RUN 7's own criteria

Do not treat the passing tests as verification. Do not build RUN 8 on it. Do not revert it.

## 16. Metrics

### At the close of RUN 9

`qa/gta-upgrade/occupancy-cost.mjs`, real Shibuya graph, CPU and counts only.

| tier | cars | drivers | `reconcileOccupancy` | drivers drawn | driver layer | draws | skeletons | mixers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low | 17 | 14 | 6.2 µs/f | 3 | 22.2 µs/f | 3 | **0** | **0** |
| medium | 37 | 30 | 7.2 µs/f | 4 | 36.3 µs/f | 3 | **0** | **0** |
| high | 74 | 62 | 3.3 µs/f | 11 | 15.6 µs/f | 3 | **0** | **0** |

Both terms are noise against a 16.7 ms frame. `reconcileOccupancy` is O(pool) on a fixed 146
slots over typed arrays; the driver layer is bounded by its 46 m radius rather than by the
traffic count, which is why HIGH with 62 drivers is no dearer than LOW with 14. Occupancy
storage is **1,460 bytes for the whole city**. In the live scene the layer drew 8 at the
scramble camera and 14 standing beside a taxi, at ~0.1 ms.

**RUN 7's architecture is intact.** Nothing in RUN 9 added a skeleton or an AnimationMixer.

### At the close of RUN 8

Scene, HIGH / day / scramble, HQ crowd on, headless SwiftShader. CPU and counts only.

| | value |
| --- | ---: |
| draw calls, player mode with the city settled | 763 |
| HQ crowd drawn | 1,945–1,973 |
| HQ skeletons / mixers | **0 / 0** |
| HQ draw calls | 12 |
| shader compile failures | **0** (was 1 — see §9e) |
| console errors | **0** |
| `melee.update` | 11–17 µs/frame, flat from 64 to 1,978 people |
| `witness`, offline bench at 1,978 | 0.56 ms/punch |
| `witness`, live scene | 2.1 ms/punch |
| people reacting to one punch, live | 206–278 |
| crossings completed during combat | 22, **0 abandoned, 0 stuck** |
| tests | **326 / 326** |

No frame rate is reported. This hardware cannot produce performance evidence.

### At the close of RUN 6

Scene, HIGH / day / scramble, headless SwiftShader:

| | build only | player mode, near pool full |
| --- | ---: | ---: |
| draw calls | 357 | 721 |
| triangles | 4,167,735 | 4,572,118 |
| far crowd | 1,978 | 1,978 |
| near humanoids | — | 8 |
| near baked | — | 23 |
| foot IK solvers | — | 8 (+ player) |
| console errors | **0** | **0** |

### Test / build status at the handoff (HEAD `f6aa8e8`)

```
npm run typecheck   clean
npm run test:ci     273 / 273 pass
npm run build       succeeds
```

**273 passing tests does not mean RUN 7 is complete.** Ten of those tests are the RUN 7 WIP's
own unit tests. They exercise the state machine in isolation against a stub crowd; they say
nothing about whether the live scene still runs its signals and crossings correctly with
awareness wired in, which is the check that has not been done. RUN 6's own figure was 254/254.

**SwiftShader FPS is not a performance acceptance signal** and is not used as one. Geometry,
proportions, pose, material and visual bugs are reviewed from screenshots.

## 16a. Bugs already solved — do not reintroduce

Each of these cost real time to find. They are recorded so the next session recognises the
symptom instead of rediscovering the cause.

**Weapons W1 (§9y): a new swing name fell through to `Punch`.** `characterAction` maps
`attackName` by name and defaults to `Punch`; the katana cut played the jab (arm out at shoulder
height, blade pointing up) until `SwordAttack` was named there too. Every place that names a swing
(`characterAction`, `SWINGS`, the clip-time scrub) has to learn a new one. The bench showed it at
once; no unit test did until `tests/weapons.test.mjs` checked `attackName`.

**Weapons W1 (§9y): a rig placed on the bind pose.** The holster and back positions are converted
into bone space when the weapon rig is built; built before `createPlayerFigure` had set the Idle
pose, they were computed against the T-pose and the holster sat 9 cm behind the hip. Build
anything that is placed relative to the body AFTER the first `mixer.update(0)`.

**Weapons W1 (§9y): the converter drops `gaitDetail`.** `npm run convert:character` rewrites
`citizen.json` without the `gaitDetail` block that `scripts/analyse-gait.mjs` adds. Rerun the
analysis after every conversion and diff the Walk/Run/Sprint entries.

**Weapons W2 (§9z): an aim layered like a punch misses by metres.** Setting the upper body to the
aim pose is not enough while walking: the walk still sways the pelvis and spine_01 under it, and at
10 m that is 2.6 m of miss at 0° and ~10 m at 90°. The muzzle correction (spine_01..03) is what
makes the aim hold; `tests/pistol.test.mjs` pins both numbers.

**Weapons W2 (§9z): `cond ? 1 : 0 - x` is `cond ? 1 : (0 - x)`.** The aim-camera blend was written
that way and would have snapped the camera away from the player on the first unaimed frame.
Parenthesise every ternary inside arithmetic.

**Weapons (§9y–§9aa): inserting a function between a JSDoc block and its function.** The katana's
`katanaSweep` went in above `createMeleeCombat`'s JSDoc, which then documented the new function;
`tsc` inferred the options from the defaults (`null`) and rejected the scene's callbacks. Move the
JSDoc with its function.

**Headless QA: do not edit sources while a dev-server run is open.** Vite hot-reloads the page on
any change in the module graph, so a scene run (10–25 minutes under SwiftShader) stalls or starts
over when a file is saved mid-run. Commit, then run the scene check with nothing in flight. And
`pkill -f <pattern>` inside a shell command matches that shell's own command line: kill by PID.

**Headless QA: the start point is inside the kerb crowd.** A shoulder camera there sees only heads
and the muzzle is often inside a pedestrian (a shot at 0–6 cm). `qa/gta-upgrade/weapons-scene.mjs`
moves the player to the quietest walkable spot facing a facade before any weapon still.

**Looks A (§9m): a pooled material compiled with its construction palette.** `dressCitizen`'s
`onBeforeCompile` built its uniforms from the palette the material was created with, and
`recolour` only updates uniforms that exist. The near pool recolours a slot before its first
compile, so those people were drawn in the default (the player's red top). Build uniforms from
the palette as it is at compile time. `tests/garment-pattern.test.mjs` recolours before compiling.

**Looks A (§9m): a pattern id rides in the packed colour, not a new attribute.** The crowd is
still at 16 attributes; the top and bottom colours are 7 bits a channel with a 3-bit pattern id.
Unpack with power-of-two divisions after `floor(v+0.5)`, never by dividing by a non-power of two.

**Looks B (§9n): a fragment snippet guarded by a vertex-only macro.** three defines `USE_BATCHING_COLOR` for the vertex stage only; the fragment stage gets `USE_COLOR_ALPHA`. Code guarded by the vertex macro in a fragment shader silently compiles out. `tests/traffic-fleet.test.mjs` checks the livery snippet.

**Police W3 (§9q): do not add point lights for sirens.** Every lit material is compiled for the scene's light count; two more lights recompile everything and exceed the HIGH night budget (6). The roof bar is emissive.

**Police W2 (§9r): the lane graph is not a road map.** Fewer than one lane pair in ten connects; route a chase over the carriageway flow field in `units.mjs`, not over lanes. And `revive()` re-places the player: anything that moves them on respawn goes after it.

**Player crowd contact (§9l): a dodge is a request, not a guarantee.** People who do not act on it
(the cast walking a track through the player, a fighter, someone fleeing or in cooldown) walked
straight through the player, and at a low frame rate the crowd's own 30 Hz steps walked them back
in after the player's step and before the frame was drawn. Whoever is inside the player's circle is
moved out (`pushOut`), and again after the crowd's update (`CrowdSimulation.postUpdate` →
`player.settleCrowd`). Test at clamped 0.1 s frames, not only at 60 Hz.

**Player crowd contact (§9l): a live `combatTarget` froze a pedestrian on a crossing.**
`simulation.move` stopped anyone hostile where they stood. Combat never stops someone on rails
itself, but the simulation did, and one held group freezes every signal. Never stop anyone with
`p.crossing` for a fight. Likewise `choreographed` is not the same as "on the track": the cast is
always cast, so treating it as on rails meant a punched cast member never fought back anywhere
(`onRails` in `combat.mjs`).

**Player crowd contact (§9l): a stopped car hit the player every time the grace ran out.** The
throw went along the car's heading and left the player in front of it. A car has to be moving
(≥ 1.5 m/s) to hit, and the throw goes out of its path.

**Player crowd contact (§9l): left and right were mirrored on foot.** At heading 0 the follow camera
looks toward +z and its right is world −x. Derive a screen direction from the camera, never by hand
(`tests/steer-direction.test.mjs`).

**After RUN 12: a one-shot layered on the gait at full weight is only half of itself.**
three.js averages every action that animates a bone. A punch at weight 1 over a gait blend
that sums to 1 put the fist 0.6 m out to the side. A swing must take its weight from the gait
(`STRIKE`, §9k). Any extra spine yaw on an extended arm swings the fist off its line, and a
positive yaw on this rig pulls the left shoulder back. `tests/punch-aim.test.mjs` measures
the fist on the real figure.

**RUN 12: a GLSL snippet without a trailing newline.** A shader string prepended to a three.js
shader that opens with `#define` glued the two into `}#define STANDARD`, and the asphalt failed to
compile ("'#' : invalid character") only in the browser. Every injected snippet must end in `\n`.
`tests/road-reflection.test.mjs` and `tests/street-wind.test.mjs` check that every preprocessor
line starts a line.

**RUN 12: the crowd shader is at WebGL's 16 vertex attributes.** A new instanced `float` failed to
link ("Too many attributes"). Pack new per-instance data into a spare component of an existing
attribute (the head yaw is `aShoe.y`), never into a new attribute. `tests/hq-crowd.test.mjs` pins
this.

**RUN 12: a filtered converter run wiped the shipped clips.** `AUDIO_ONLY` debugging used to clear
`public/audio` and rewrite the manifest with only the filtered clips. Filtered runs now write to
a scratch folder.

**`isReady` TypeError at city build.** `compileAsync` polls materials every 10 ms with no
stop; `WebGLProperties.get` returns a fresh empty object for a material that has been
disposed, so the next tick reads `undefined.isReady()` — thrown inside a `setTimeout` where
neither the surrounding `try/catch` nor the promise's `.catch` can see it. Every build stage
warms up the subtree it just added, and any teardown disposes those materials. Root-caused by
reproducing it deterministically (teardown at 4 s throws, at 6 s and 8 s does not) and fixed
by owning the warm-up in `src/quality/warmup.mjs`.
**Do not reintroduce a suppression workaround** — no try/catch swallow, no console filter, no
deleting `compileAsync`, no reducing humanoid count to dodge it.

**Humanoid budget exceeded: 28 generated against a budget of 8.** The slot's *kind* was chosen
from the rank of whichever candidate was asking, and rank churns every frame — a citizen who
was third-nearest kept its humanoid while drifting to twentieth, so the new third-nearest
built another. Only visible at crowd density (40 people never reproduced it; 300 did). Fixed
by taking kind from the pool's own quota, which makes the bound structural.

**Hybrid Run reintroduced foot sliding.** `LOCOMOTION.minPeriod` at 0.72 clamped the gait so
the feet implied 3.73 m/s against a 4.2 m/s ground speed. Fixed by lowering it to 0.62.

**Sprint re-entered the gameplay blend.** RUN 4's exclusion of `Sprint_Loop` held only
arithmetically, and the new Run native speed let it back in. The intent is that an
*asymmetric* clip (contacts at 0.538, not 0.500) is never blended into normal locomotion;
`LOCOMOTION.maxAsymmetry` now expresses that directly rather than relying on a speed
threshold. Two speed-only filters were tried first and each broke a different configuration.

**Pelvis displaced backwards instead of down, three separate times.** The skeleton is Z-up in
bone space. See §5 — this is the single most repeated mistake in this project.

**`'instanceColor' : redefinition` — every vehicle lost its shadow.** A `ShaderMaterial` is
given three.js's vertex prefix, which already declares `instanceColor` under `#ifdef
USE_INSTANCING_COLOR`; `src/traffic/vehicle-shadow.mjs` declared it a second time. The program
never compiled, the frame log filled with `useProgram: program not valid`, and the scene told
the user roads and buildings might be missing. It only appeared once a `setColorAt` had
created the buffer that defines the macro, which is why it looked like a player-mode problem.
Found by RUN 8's browser QA; no unit test could see it, so `tests/vehicle-shape.test.mjs` now
asserts that no custom shader declares an attribute the renderer injects.
**A red banner in a QA screenshot is a blocker, not scenery** — this one had been on screen in
earlier runs and was read past.

**Combat silently did nothing to 74-85% of the crowd.** `eligible` excluded
`p.choreographed`, and the choreographed Scramble cast IS the crowd in the crossing. Punches at
a pedestrian 8 cm away all missed. A car could always knock the cast down through `strike` --
`simulation.step` tests `struck` before it hands a choreographed pedestrian to
`choreography.move` -- so only the fist was blocked. Every NPC in the combat tests was built
with `choreographed` falsy, so 23 passing cases tested only the minority the code already
worked on. **When a test helper omits a flag, it is testing the flag's absence.**

**A carjack that never took the car.** The commit branch tested `pose.kind === 'enter'`, so a
carjack ran its whole sequence -- driver alerted, hauled across the sill, thrown on the road --
and then handed the car straight back, because the line that takes the wheel did not recognise
the kind that had just earned it. **When a sequence is a variant of another, every branch that
names the original has to be checked, not just the ones that obviously matter.**

**A camera that shot the entry from inside the bodywork.** The follow camera framed the player
until `driving`, which is the END of the sequence, so through the ENTRY and SEAT stages it
tracked a point inside the vehicle and the eye sat on the roof. `seated` arrives before
`driving` does, and that is the moment the framing has to change.

**A driver drawn perfectly and hidden completely.** The seated driver was correct from the
first run; the cabin `glass` was an opaque MeshStandardMaterial, so no car in the scene could
ever show an occupant. Before concluding that something is not being drawn, check whether it
is being drawn behind something.

**Reading a browser symptom as environment before testing it.** The first diagnosis of the
banner above was "the browser has been open for an hour". A clean browser reproduced it in 35
seconds. Check the fresh case before blaming the harness.

**RUN 10 closing bugs (§9g).** Do not reintroduce any of these:
- **Baked eleven-bone figures in the near ring while the HQ crowd covers the scene.** The near
  pool keeps humanoids only (`setHQCovered`).
- **An inside-out `loft()`.** Keep the signed-volume tests; a hollow-looking car is a winding
  bug, not an opacity bug.
- **A uniform .55 m solid margin.** It closes 35 lane poses; the ends need it and the sides do
  not.
- **A reaction cooldown that blocks escalation.** It blocks repeats only, at or below `calmed`.
- **Near bodies choosing awareness over a live car warning.** Use `nearReaction()`.
- **Handing back a body the simulation still holds down** (double fall), or snapping it to the
  simulation position on hand-back.
- **Auto-parking the player car on a crossing or in a traffic lane.** One parked car can
  freeze every signal on the map through the crossing-clear hold.
- **Timing a live check on wall time under SwiftShader.** `FrameGate` clamps each frame to
  0.1 s, and at 0.2 fps a 14 s wall window is about 0.3 s of simulation.

**Police voice/Kaze Step P (§9u): a livery band is a fraction of height, not of the profile.**
`LIVERY.police.band` was `.58` of `VEHICLES.police.height`, but the sedan silhouette's beltline
(where the plan wants black-below/white-above to split) is at `.755` of height at the car's centre
— a different number living in a different table (`SILHOUETTE.sedan.belt` in
`vehicle-shape.mjs`, not `VEHICLES`). Tuning the band against the vehicle's overall height alone
put the split well down in the door. Check a livery band against the actual profile vertex it is
meant to land on, not just against a plausible-looking fraction.

**Police voice/Kaze Step V (§9v): `npm run test:ci` is an explicit file list, not a glob.**
`scripts/test-current.mjs` names every test file by hand; a new `tests/*.test.mjs` is silently never
run by `test:ci` or `npm test` until it is added to that list. Two new files
(`tests/police-voice.test.mjs`, `tests/police-loudspeaker.test.mjs`) passed on their own but did not
change the CI test count until added. Always diff the `test:ci` test count before and after adding a
test file, not just its own green run.

**Police voice/Kaze Step K1 (§9w): `.gitignore` allowlists `qa/gta-upgrade/*` by filename.** A new
QA bench file there is silently untracked until its name is added (`!/qa/gta-upgrade/<file>.html`),
the same shape of trap as the test-file list above: `git status` shows nothing wrong because there
is nothing to show. Also worth knowing: geometry changes to `src/traffic/vehicle-shape.mjs` are read
by `bake:static` (the traffic fleet, not just `bake:playable`'s close-up pack) — `tests/static-key
.test.mjs` and `tests/static-models.test.mjs` catch a stale bake, but only if the bake is rerun
before the PR, not just the playable pack.

**The two-handed trial (§9af): two T poses are not the same T.** Copying each bone's turn from
rest onto the target's rest (RUN 5.6) assumes the rests agree. CMU's ASF rest splays the thighs
20° out (`axis 0 0 20`, direction 0.34 −0.94 0) where the game rig's legs hang straight: every
frame came out with the legs crossed by that 20°. Each target bone is now swung onto the source
bone's rest direction first. The same step is what RUN 5.7's "shoulder 10° high" was.

**The two-handed trial (§9af): check which hand leads on a grip before retargeting a weapon.**
02_07's subject holds the sword with the LEFT hand at the guard (the left→right hand line points
back at the chest in 170 of 188 samples). Taking the blade axis as left→right turned the katana
backwards and the yaw that aligns it turned the whole figure away from the camera. The take is
mirrored left for right, since the game's katana is in the right hand.

**The two-handed trial (§9ag): a low ready tilts the gun about the butt, not the grip.**
Dipping the muzzle 40° about the pistol grip swung the stock up through the chest. A low ready
keeps the butt in the shoulder; pivoting there keeps the stock outside the body.

**The two-handed trial (§9ag): a head can only swing its eye on a sphere about the neck.** Aiming
the eye at the nearest point of the sight line never converged (that point is inside the
sphere): the target is where the line crosses the sphere. And when the line is 15 cm to the side,
no neck reaches it — the body has to blade and the stock move in, or the head ends ear-on-shoulder.

**Hits that land (§9ai): a new JSDoc'd helper between a function and its JSDoc breaks the
types again.** `spreadDirection` was inserted between `createArsenal`'s `@param` block and the
function (W1 hit this with `katanaSweep`); TypeScript then read the options as `null` and
rejected the scene's callbacks. Put helpers ABOVE the documented function's comment.

**Hits that land (§9ai): editing ANY module the app imports reloads a running headless capture.**
Already known for `src/player/*`; it bit again through `src/player/ballistics.mjs` while
`weapons-scene.mjs` was waiting on its police step, which then could never finish. New modules
that nothing imports yet, tests and docs are safe to write during a run.

**§9aj: rerun every test that reads a baked clip after rebaking it.** The §9ah rebake (the stock
moved in under the eye) pushed the butt to 16–18 cm from the shoulder joint; the §9ah test's 18
cm bound was not rerun after that last rebake and only `test:ci` caught it two sections later.

**§9ak: in a Verlet ragdoll a position fix IS a velocity.** Two faults came from it: a joint
limit that moves only the joint drifts the whole body (split every correction so it conserves
momentum), and a ground clamp that lifts the point but not its previous position launches it
upward (make contact inelastic: lift the previous position too).

## 17. Files that matter

| Path | What it is |
| --- | --- |
| `app/ShibuyaScene.tsx` | orchestration, module system, QA metrics |
| `src/life/near-characters.mjs` | the near pool — humanoid/baked split, budgets |
| `src/life/render.mjs` | instanced far crowd, near-pool wiring |
| `src/player/figure.mjs` | `createPlayerFigure`, `bakedAsset` |
| `src/player/character-asset.mjs` | `humanoidCitizen`, `WARDROBE` |
| `src/player/locomotion.mjs` | gait ladder and blending |
| `src/player/foot-ik.mjs` | the solver, and its bounded role |
| `src/quality/warmup.mjs` | cancellable shader warm-up (RUN 6.1) |
| `scripts/convert-character.mjs` | offline character bake, folds in the hybrid run |
| `assets/character/hybrid-run.json` | the adopted run clip + provenance |
| `src/life/appearance.mjs` | **RUN 6.8** — the deterministic appearance recipe |
| `src/life/hq-crowd.mjs` | **RUN 7A** — the GPU crowd: no skeleton, no mixer, typed arrays |
| `src/life/hq-layer.mjs` | **RUN 7B** — the bridge: reads the simulation, draws the crowd |
| `tests/hq-layer.test.mjs` | pins source-of-truth, no duplicates, identity, LOD, mass hits |
| `qa/gta-upgrade/lodpop.mjs` | LOD popping QA |
| `qa/gta-upgrade/signalcycle.mjs` | full signal cycle + drain test, headless |
| `src/life/hq-threat.mjs` | **RUN 7A** — spatial grid + mass vehicle reaction |
| `scripts/bake-crowd-hq.mjs` | **RUN 7A** — offline bake: LOD geometry + bone atlas |
| `tests/hq-crowd.test.mjs` | pins no-skeleton, draw calls, identity, multi-hit, query bound |
| `qa/gta-upgrade/hqcrowd.html` | the HQ crowd bench, with a vehicle mode |
| `qa/gta-upgrade/hq-ladder.mjs` | the scale ladder |
| `qa/gta-upgrade/hq-vehicle.mjs` | the mass reaction measurement |
| `src/life/awareness.mjs` | **RUN 7 WIP** — NPC perception / life states, unverified |
| `src/life/simulation.mjs` | crowd sim: routes, crossings, `scatter`, `strike`, signals |
| `src/player/controller.mjs` | player movement and input |
| `src/player/combat.mjs` | **RUN 8** — phased melee: swing clock, hit window, witness events |
| `src/player/attack-timing.mjs` | **RUN 8** — the measured clip windows; generated, not chosen |
| `tests/combat.test.mjs` | **RUN 8** — 23 cases; the audit found zero before this |
| `qa/gta-upgrade/punch-timing.mjs` | **RUN 8** — measures each punch clip's active window |
| `qa/gta-upgrade/combat-cost.mjs` | **RUN 8** — melee and witness CPU against population |
| `src/traffic/occupancy.mjs` | **RUN 9** — the one authority on who is in which car |
| `src/traffic/drivers.mjs` | **RUN 9** — seated drivers: 3 draw calls, no skeletons |
| `src/traffic/vehicle-anchors.mjs` | **RUN 9** — seat / door / entry / exit in world space |
| `src/player/carjack.mjs` | **RUN 9** — what happens at each carjack stage |
| `src/player/vehicle-transition.mjs` | **RUN 9** — staged enter / exit / carjack |
| `tests/vehicle-occupancy.test.mjs` | **RUN 9** — 33 cases, including an invariant fuzz |
| `qa/gta-upgrade/occupancy-cost.mjs` | **RUN 9** — occupancy and driver CPU per tier |
| `src/player/vehicle-dynamics.mjs` | driving model |
| `src/player/pedestrian-threat.mjs` | oncoming-car prediction; feeds awareness |
| `tests/npc-awareness.test.mjs` | **RUN 7 WIP** — 10 tests, passing, browser-unverified |
| `tests/shader-warmup.test.mjs` | pins the `isReady` regression |
| `tests/near-humanoid.test.mjs` | pins the near-pool budgets at 300-person density |
| `qa/gta-upgrade/asset-audit.mjs` | what the citizen asset contains |
| `qa/gta-upgrade/bindcheck.mjs` | rest-pose comparison across rigs — why two armatures |
| `qa/gta-upgrade/lineup.html` | the RUN 6.8 acceptance shot; `?before=1` for RUN 6 |
| `qa/gta-upgrade/archetype-feet.mjs` | sole height per archetype per clip |
| `tests/appearance.test.mjs` | pins the recipe: pure, spread, bounded, non-correlated |
| `qa/gta-upgrade/poolprobe.mjs` | near-pool budget and aim under churn |
| `qa/gta-upgrade/tierprobe.mjs` | budgets across HIGH / MEDIUM / LOW, and tier demotion |
| `qa/gta-upgrade/` | the other benches; the numbers above come from here |
| `scripts/test-current.mjs` | the test list that gates this work |

## 18. Known limitations

- **See §9j for RUN 12's limitations**: unheard audio, mirror cost unmeasured and crowd-free,
  PBR only on road and pavement, far-LOD jam creep, yaw-only head turn.
- **See §9i for the crowd-realism limitations** (jam creep in Idle, far-LOD dither, local-only
  flight, body-only LOOK turn, matrix-lerp crossfades, unheard audio). §9i also supersedes two
  entries below: the HQ crowd is now the default without `hq=` (`hq=0` is the rollback), and
  the thrown HQ body now falls along its flight.

- **No clothing geometry.** RUN 6.8 gave the near citizens four silhouettes, but clothes are
  still painted onto the body by the garment mask. No skirts, jackets, hoodies, bags, caps or
  glasses — each of those is a mesh, and meshes are new assets. This is the largest remaining
  gap against the reference image.
- **Two faces.** The archetypes share the two base bodies' heads. At close range the faces
  repeat.
- **The mass crowd has no foot IK.** It plays baked clips on a flat assumption; terrain
  adaptation at that count is unmeasured. The RUN 6.8 near pool still has it.
- **The layer ranks all ~1,978 pedestrians by distance every frame** to spend its budget
  nearest the camera — about 2.3 ms, and the clearest remaining CPU target. Re-ranking on a
  slower cadence would cut most of it.
- **A 120-second signal cycle was measured headlessly in RUN 10** (§9g). RUN 11 captured two
  live browser red → green cycles with the awareness pass running (§9h B); the RUN 10
  third-cycle central-stream spillback is still open.
- ~~The HQ crowd looks washed out in the scene.~~ **Fixed in RUN 7C** — it was a colour-space
  bug in the crowd shader, not the scene. See §9d.
- **The garment boundary softens at LOD2.** Decimation blurs the mask, so a sleeve fades into
  the arm over several centimetres. Acceptable at the distance L2 is used, visible if L2 is
  ever brought close.
- **Near-humanoid aim is 71–74%**, down from RUN 6's 84–85%: a citizen only takes a humanoid
  of their own archetype, so when three of the nearest share one archetype the third waits on
  a baked figure. Deliberate — see §9a.
- The body is Quaternius' Superhero base. Proportions are stylised and the face is minimal.
  It is a pipeline placeholder and is deliberately not polished — but "not the final asset"
  is not a defence of the clone problem, which is a distribution problem, not a quality one.
- **Old RUN 7 awareness is deprecated.** It was discovered running in production and
  replaced in RUN 10.1; see §9g for the sole current authority and browser QA limitation.
- `hit` is still a **C**: the current `Hit` clip barely moves. `Hit_Knockback` in Quaternius
  UAL2 (CC0, verified, identical 65-bone skeleton, 2.93 m of travel) is very likely the answer
  and needs no retargeting. Not implemented — RUN 5.5 was the Run slot only.
- LOW and MEDIUM prebake coverage is incomplete — see
  `docs/ISSUE-LOW-TIER-PREBAKE-2026-09-20.md`. RUN 13 is where this is scheduled.
- Foot IK is player-only in the solver's *design intent*; RUN 6 gives it to up to 8 near
  humanoids under an explicit budget. Beyond that is unmeasured.
- `npm run test:legacy` is an audit tool, not a merge gate.
- **A punched pedestrian on a crossing, or in the choreographed Scramble cast, keeps walking.**
  They take the damage, the alarm and the reaction, and they can be killed — but they are not
  stopped to fight. Stopping one mid-crossing holds their signal group and freezes every signal
  on the map, and a cast member would be put back on their track by `choreography.move` the
  next tick. Since the cast is 74–85% of the population, this means **most of the crowd can be
  hit and killed but will not brawl with you**; the ones that fight back are the sidewalk
  pedestrians and anyone who has left the cast inside their 14 s hostility window. A deliberate
  trade, not an oversight: see §9e.
- **`witness` rebuilds the crowd grid on every call**, which is O(population): 0.07 ms at 64
  people, 0.56 ms at 1,978. Two punches a second is ~1.1 ms/s and acceptable; anything faster
  than that would need the rebuild shared with `sync` rather than repeated.
- **There is one punch combination and no combos.** `Punch` and `PunchCross` alternate. There
  is no input buffering — a press during recovery is dropped, not queued — so the rhythm is
  the clips' own. Blocking, dodging, grappling and weapons do not exist.
- **The NPC hit animation is the existing `Hit`/knockdown chain, not a directional one.** A
  punch from the front and a punch from behind produce the same clip; since RUN 11 the push and
  stagger go away from the fist (§9h). `hit` remains a
  **C** for the reason recorded above.
- ~~The shader-compile banner appears in this headless SwiftShader browser.~~ **Fixed in RUN 8**
  — see §9e; it was a real redefinition in the vehicle shadow shader, not the environment.
- **Drivers sit on the left.** The vehicle anchors put `driverSeat` at −X, which for a Tokyo
  scene is the wrong side. Changing it would move the seat, door, entry and exit for all seven
  bodies and everything that reads them, and RUN 9's brief makes the anchors authoritative. It
  is cosmetic in play, because `doorPose` already approaches from whichever side is clear.
- **The seated driver is head, shoulders and a hint of arms.** No hands on the wheel, no head
  turn, no idle. It is what a cabin shows through tinted glass at the distance it is drawn, and
  it is deliberately not a character — see §9f.
- **The cabin glass is tinted at a fixed 0.62.** It was fully opaque before RUN 9, which is why
  no car could show an occupant. The value has not been checked against every time of day.
- **A carjack cannot be started on a moving car** (over 0.35 m/s). Pulling someone out at
  speed is a different feature.
- **Nobody steals a car back.** Traffic drivers do not react to the player beyond being thrown
  out, and no NPC ever takes a vehicle. Out of scope for RUN 9 by the brief.
- **One driver, one seat.** No passengers, and no occupancy for any seat but the driver's.

## 19. Optional future polish

Hit reaction from UAL2. Facial detail if the base body is ever replaced. Crowd wardrobe
beyond eight entries. None of these are blockers.

## 20. How to resume

```powershell
git switch claude/gta-fidelity-upgrade
git pull --ff-only origin claude/gta-fidelity-upgrade
npm ci
npm run typecheck
node scripts/test-current.mjs
npm run dev:local
```

Then open `http://127.0.0.1:5174/?qa=1&tier=high&time=day&camera=scramble`.

`window.__SHIBUYA_QA__.metrics` carries the numbers in the table above, including
`nearCharacters`, which is the near pool's own `inspect()`, `hqCrowd`, and — in player mode —
`melee`, which is `createMeleeCombat().snapshot()`: swings, hits, misses, npcDeaths, witness
events and the current phase and clip. **Use it.** RUN 8 spent a whole QA round unable to tell
a hit from a miss because it did not exist, and read "the crowd reacted" as "the punch landed".
In player mode `window.__SHIBUYA_FIGURE__`, `__SHIBUYA_PLAYER__`, `__SHIBUYA_LIFE__` and
`__SHIBUYA_CTX__` are exposed.

**A caution about browser QA on this hardware.** The software renderer reports around 0.2 FPS
with the HQ crowd up, and `FrameGate` clamps `dt` to 0.1 s, so a 0.9 s animation takes about
six real seconds and inputs during its recovery are dropped by design. Anything paced against
wall-clock time will under-count. Shrink the viewport to raise the frame rate, or drive the
check off state rather than off delays. **Never report a frame rate from it.**

**Use §9g for the current RUN 10 awareness authority.** Older RUN 7 and old numbering
statements are historical; the next session should first obtain a real browser capture of
the RUN 10 awareness scenarios if a browser becomes available.

`window.__SHIBUYA_TRAFFIC__` is exposed under `?qa=1` as well, and
`__SHIBUYA_QA__.metrics` now carries `occupancy`, `seatedDrivers`, `transition` and
`lastCarjack`. **Use occupancy as the signal for whether the player got into a car** --
`car.state.active` is not one, because `ensureCar` spawns the player's own car already active,
and a probe waiting on it reports success before the sequence has even run.

Work one RUN at a time and close each one completely — implement, unit test, verify in a real
browser, capture screenshots and numbers, check for regressions, commit, push, update this
file — and stop and report before opening the next.

**Verify in the scene, not only in the suite.** RUN 8's two real defects were both invisible to
unit tests and both obvious in the browser: a shader that never compiled, and a punch that
could not touch 74–85% of the crowd. In each case the tests passed and the game was broken. If
a test helper omits a flag, the suite is testing that flag's absence — check what the live
simulation actually sets.

### The rules that are not negotiable

- Stay on `claude/gta-fidelity-upgrade`. Never merge to or push `master`.
- No `reset`, `rebase`, `force push`, or history rewriting. Do not revert `f6aa8e8`.
- Do not drop a stash you did not create.
- No engine rewrite, no React-Three-Fiber, no Rapier, no skeletons for the full ~2,000 crowd.
- No GTA V assets, source or leaks. No asset whose licence has not been verified **from the
  bundled licence file**, not from a web page.
- Do not reopen run-clip search, CMU subject search, arm retargeting, or gait research.
