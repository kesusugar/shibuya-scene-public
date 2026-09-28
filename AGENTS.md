# Shared agent instructions

These rules apply to Codex, Claude, and other coding agents working in this repository.

## Objective

Build a performant interactive Shibuya scramble-crossing scene toward the visual target documented in `docs/IMPLEMENTATION-STATUS.md`. Preserve working systems while improving geometry, materials, lighting, traffic, crowds, and visual fidelity.

## Before editing

1. Read `docs/IMPLEMENTATION-STATUS.md` and the relevant focused document under `docs/`.
2. Run `git status --short` and preserve changes you did not create.
3. Work on a dedicated branch named `codex/<topic>`, `claude/<topic>`, or `human/<topic>`. Do not mix unrelated work in one branch.
4. Inspect the current implementation before replacing it. Most scene systems have lifecycle, quality-tier, determinism, and draw-call constraints.

## Implementation rules

- Keep HIGH, MEDIUM, and LOW tiers functional.
- Reuse geometries, materials, atlases, and instancing where practical. Avoid one light, material, or mesh per repeated object.
- Any new scene module must support disposal and must not resurrect after being disabled during asynchronous work.
- Traffic signals must preserve the separation between pedestrian crossing and vehicle flow.
- Do not claim exact real-world placement, current advertising inventory, FPS, or visual acceptance without corresponding evidence.
- Do not download or commit third-party brand assets without clear authorization. Reconstructed artwork must be documented as reconstructed.
- Never overwrite, discard, or stage another contributor's unrelated working-tree changes.
- Do not force-push shared branches.

## Validation

For normal changes, run:

```powershell
npm run typecheck
npm run test:ci
```

For final or integration changes, run `npm test` from PowerShell, another shell, or CI. Visual changes also require settled HIGH day/night inspection at fixed camera presets. Record visual limitations honestly.

## Evidence policy

Files under `evidence/` are tracked validation snapshots, not scratch files. Update them only by intentionally running their producing verification script. Commit evidence separately from implementation whenever practical. Machine-dependent timing values are diagnostic and are not portable performance acceptance.

`npm run test:legacy` executes frozen historical stage tests. Several intentionally assert that later stages do not exist, so it is an audit tool rather than a merge gate. Do not weaken current behavior merely to satisfy an obsolete stage lock.

## Handoff

Update `docs/IMPLEMENTATION-STATUS.md` when a stage materially changes. A handoff must identify changed files, tests run, visual checks performed, known limitations, and the commit SHA. Push only when the user explicitly requests it.
