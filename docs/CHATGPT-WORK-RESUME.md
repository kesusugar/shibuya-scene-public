# Resume prompt — hand this to the next session

Short version. The full state is in `docs/GTA-FIDELITY-STATUS.md`; this file is the starting
instruction.

## Read first, in this order

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/GTA-FIDELITY-STATUS.md` — especially **§2** (branch/HEAD), **§9a** (RUN 6.8),
   **§16a** (bugs already solved) and **§5** (the two rig facts that keep costing time)

You do not need any prior conversation. Everything required is in those files.

## Then verify the state before touching anything

```bash
git branch --show-current          # expect: claude/gta-fidelity-upgrade
git rev-parse HEAD                 # expect: f6aa8e8…
git rev-parse origin/claude/gta-fidelity-upgrade   # must match HEAD
git status --short                 # expect: empty
git stash list                     # expect: empty
```

If any of these disagree, stop and report rather than reconciling them.

## What is already done — do not redo it

**RUN 0 through RUN 6 are complete**, including RUN 5.5 (animation audit), RUN 5.6 (CMU run
POC) and RUN 5.7 (Hybrid Run, adopted). Re-implementing any of them is wasted work.

In particular, these questions are closed. Do not reopen them:

- run-clip candidate search, CMU subject search, arm retargeting, gait research
- foot IK research — its role is bounded on purpose (§7)
- whether the character pipeline should use a different rig

**RUN 7 is NOT complete.** Commit `f6aa8e8` is a **WIP only**:

- `src/life/awareness.mjs` + `tests/npc-awareness.test.mjs`
- unit tests pass, typecheck passes, build passes
- **it has never been run in a browser**, and no signal / crossing / traffic regression check
  has been done — which is the actual risk that change carries

Do **not** revert or delete it. Do **not** build on it. Do **not** count its passing tests as
verification.

## Your first task: RUN 6.8 — Near Humanoid Clone Break Pass

Not RUN 7. RUN 6.8.

**Why.** RUN 6 hit every number — humanoid budget 8, far crowd 1,978, console errors 0 — and
the result still looks like one person recoloured eight times. Same hair silhouette, same
head, same proportions, same clothing geometry. Colour variation cannot fix a shape problem.

**Goal.** Reduce the visible clone effect among the 8 near humanoids using **3–4 appearance
archetypes**, while preserving the current skeleton, animation set, near/far crowd
architecture, performance budget, and far crowd count.

**Priority order:** hair / head silhouette → height → shoulder / torso width → clothing
silhouette impression → colour.

**The audit is already done for you.** `node qa/gta-upgrade/asset-audit.mjs` reports it, and
§9a records it:

- the shipped `citizen.glb` has **3 meshes, no morph targets, no optional parts, and the hair
  merged into the body mesh** — so it has no runtime silhouette lever at all
- the upstream CC0 pack already downloaded (`assets/character/upstream/`, gitignored, licence
  verified from the bundled file) contains **2 bodies and 3 hairstyles**, and **all of them
  share the identical 65-bone skeleton**

So the archetypes can be baked offline from assets that are already licence-checked. **No new
downloads, no asset hunting, no new rig.** Start from `scripts/convert-character.mjs`.

Read §9a before designing the bake — there is a payload decision to make first, because the
fifteen animation clips dominate `citizen.glb` and four archetypes must not become four
copies of them.

**Forbidden:** 8 unique GLBs, 32 unique character assets, a new rig, a larger skeleton budget,
humanoid far crowd, animation system rewrite.

## How to close RUN 6.8

Do all of it before doing anything else:

1. implement
2. unit / integration tests
3. **verify in a real browser** — `npm run dev:local`, then
   `http://127.0.0.1:5174/?qa=1&tier=high&time=day&camera=scramble`
4. screenshots + numbers (`window.__SHIBUYA_QA__.metrics`, and the probes in
   `qa/gta-upgrade/`)
5. regression check: budgets per tier, far crowd count, console errors, signals and crossings
6. judge against the acceptance criteria in §9a — including the one that is a screenshot, not
   a number: **eight near citizens who are visibly different people**
7. `npm run typecheck && npm run test:ci && npm run build`
8. commit, push to `claude/gta-fidelity-upgrade`
9. update `docs/GTA-FIDELITY-STATUS.md`
10. **stop and report**

Do not start RUN 7 until RUN 6.8 is accepted.

## Rules that are not negotiable

- Stay on `claude/gta-fidelity-upgrade`. Never merge to or push `master`.
- No `reset`, `rebase`, `force push`, or history rewriting.
- Do not drop a stash you did not create.
- No engine rewrite. No React-Three-Fiber. No Rapier. No skeletons for the full ~2,000 crowd.
- No GTA V assets, source or leaks. No asset whose licence has not been verified **from the
  bundled licence file**, not from a web page.
- Never suppress the `isReady` error with try/catch, console filtering, removing
  `compileAsync`, or reducing the humanoid count. It is root-caused and fixed (§16a); a
  recurrence means a real new lifecycle bug.
- One RUN at a time. Close it fully, then stop and report.

## Two facts about the rig that have each cost three debugging sessions

- **The skeleton is Z-up in bone space.** `pelvis` rest position is `(0.005, 0.086, 0.877)` —
  the height is the `0.877` on **Z**. Writing a world-space Y into `pelvis.position.y` moves
  the character *backwards*, and the stats will cheerfully report the displacement you asked
  for.
- **The rig's forward is +Z.** The controller advances by `(sin h, cos h)`.
