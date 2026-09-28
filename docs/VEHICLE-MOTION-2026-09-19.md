# Vehicle motion and offline model bake — first integration

Base: merged master 23e3d8f. Branch: codex/prebaked-motion.

## Changes

- Planar forward/lateral momentum, speed-dependent steering, wheelbase-based turning,
  handbrake grip reduction, and bounded 120 Hz substeps.
- Four road-height samples drive sprung body pitch/roll and individual wheel displacement.
- Driver camera follows a blend of body and travel direction; speed changes distance and FOV.
- Shift/Space or the existing run control while driving operates the handbrake.
- Six existing controlled-vehicle models are generated offline with `npm run bake:playable`.
  Runtime uses indexed BufferGeometry data and does not construct rounded boxes/cylinders.
  Scooter retains its existing traffic model. Body/door/wheel bindings retain takeover behavior.
- Geometry deduplication and four-decimal quantization reduced serialized buffer data
  from 15.2 MB to approximately 1.69 MB (149 KB gzip before JS wrapping).
- Existing static city pack and its input key are unchanged.
- Cabsolutely-inspired handling/suspension attribution is in LICENSES/cabsolutely.txt.
  No excluded third-party model, texture or animation was copied.

## Review loop

1. Existing gameplay tests passed after handling integration.
2. Bake validation caught unsupported parametric geometry deserialization; switched all
   baked geometry to explicit vertex/index buffers.
3. Size review caught a 15.2 MB output; indexed and quantized buffers reduced it by 89%.
4. Physics tests compare 30/120 Hz trajectories, creeping steering, handbrake slip and slopes.
5. Vehicle render review corrected wheel height for the root-level wheel transform hierarchy.

## Scope and limits

This is the first vehicle-focused increment, not completion of the seven-step adoption plan.
Collision still uses the existing safe-pose rejection (no vehicle-to-vehicle impulse exchange).
No airborne/rollover solver. Character replacement, baked animation clips, near-NPC pools
and predictive reactions remain to implement. Current character/crowd appearance is unchanged.
No live WebGL day/night or real-device FPS acceptance has been established for this change.
Prebaking eliminates geometry construction, not JSON parsing, object allocation or GPU upload;
startup improvement must be measured in a browser before claiming a speedup.

## Validation

- TypeScript check and production build passed during integration.
- First integration full current suite: 162 passed, zero failures.
- Final focused suite after buffer optimization and wheel-height correction: 16 passed.
- Final generated module transfer estimate: 149,456 bytes gzip; source file is ~1.7 MB.
- No third-party character model was imported, and no performance or visual claim is made.
