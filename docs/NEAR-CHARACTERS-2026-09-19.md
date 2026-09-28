# Stage 3: bounded nearby character rigs

Continues character foundation 1952a79 on codex/prebaked-motion.

- HIGH / MEDIUM / LOW caps: 32 / 12 / 4 animated near characters.
- Enter radius 25 m, retained radius 30 m, with incumbent preference to reduce churn.
- Combatants receive selection priority within range. Children and struck/thrown bodies
  retain their existing renderer; collision, combat and signal simulation are unchanged.
- No allocation at city startup or in observation mode. A shared baked template is parsed
  on first demand; the pool grows by at most one skeleton/mixer per rendered frame.
- Six shared geometry buffers and a four-color shared jacket palette. Skeletons/mixers
  are per slot, bounded by the tier. No additional model or motion download.
- Near motion updates every frame inside 12 m and at 30 Hz beyond; positions remain updated.
- Existing instanced head/body/hair are suppressed for selected identities. Accessories remain.
- Returning to observation restores all base representations. Tier reduction disposes excess
  slots; crowd disposal releases skeletons, shared template buffers and palette materials.
- Pool statistics expose active count, capacity, limit, triangle count and draw-call bound.

## Self-review fixes

Added reset on reassignment to avoid retaining the preceding NPC's pose; offset locomotion
phase by actor identity; shared jacket variants; release allocations on tier downgrade;
regression test proves exactly one body representation and observer restoration.

## Limits

No screen-frustum filtering or opacity crossfade yet; hysteresis reduces but does not remove
visible switching. Near characters inherit the stylized stage-2 art, not Cabsolutely realism.
HIGH can add up to 192 character draw calls, so measured device tuning remains required.
The ground/traffic/crowd prebuilt city pack is unchanged. CPU rig allocation and GPU upload
still have a cost despite offline geometry/clip creation. No startup/FPS speedup is claimed.
Live HIGH day/night WebGL acceptance remains pending.

## Remaining four planned stages

4. Predictive NPC reactions and escape behavior.
5. Remaining vehicle collision impulse/contact integration.
6. Consolidated asset loading/compression and measured startup acceptance.
7. Real-device visuals/performance and final tier tuning.

Stages 1–3 are implementation increments; their outstanding visual acceptance and art
refinement are tracked above rather than being treated as completed quality acceptance.

## Validation

TypeScript check and production build passed. Full maintained suite passed with no failures.
Final focused tests: 18 passed, including demand allocation, shared buffers, distinct skeletons,
tier downgrade, hysteresis, struck-body fallback and exact base-body restoration.
