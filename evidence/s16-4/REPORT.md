# RUN S16.4 — Reference Look Calibration

Base: fd8a7f6b88872d5e5570e5d751e5f9a9a0310b46 / Visual QA v14.

Scope: art-direction calibration only. The supplied night image is the final visual target; this implementation is not a visual PASS.

- DAY: key 2.2 → 1.65, hemisphere 1.15, PMREM .8 → .48, exposure 1 → .9. Disable registered inspection lighting while the environment owns lighting, eliminating accumulated fill. Disabling the environment restores inspection lighting.
- NIGHT: blue-gray wall-only diffuse multiplier (.32,.37,.46); independent window/storefront emission retained. Ground-floor shop emission raised from 1.25× to 1.65×. Ambient .95 → .65, key .22 → .16, PMREM .55 → .28, exposure 1.05 → 1. Central emissive asphalt pool removed, four corner pools narrowed to 11m.
- Facades: extend floor bands and selected mullions on central generic frontages; add shallow bands to selected Magnet/Seibu concrete masses in the existing shared trim batch. No new material or draw-call channel.
- Signs: retain all existing placement IDs/counts and Hero/roof/blade sizes; vary generic sign aspect ratios and vertical alignment within accepted rectangles. No new advertisements or sign assets.
- Crowd: preserve simulation, 420/210/95 budgets, 85% allocation, signals and waiting positions. Heads approximately 15% larger, shorter torso/legs, wider seeded body proportions, fuller hair; one fifth of umbrella actors retain a smaller umbrella. Eight geometry pools, three materials retained.
- Reflections: existing clipped reflection geometry retained, vertex color attenuated by proximity to selected commercial-source locations. Dark crossing center receives no artificial reflection tint from these sources. These are approximate source zones, not physical ray-traced reflections.
- Local lights: existing four HIGH / two MEDIUM / zero LOW non-shadow lights moved to perimeter positions, range 45 → 24m and intensity reduced. Source locations are art-direction estimates requiring visual confirmation.
- Cameras: Overview brought closer, CAM02 lowered and aimed into city mass; CAM03 eye height 1.55m and target height 8m. All nine presets preserved.
- No new postprocessing passes. HIGH DPR1.5, 2048 shadow map, GTAO/noAO behavior, SMAA, bloom .18 preserved.

Validation: see regression logs and verification.json. Existing tests with exact legacy exposure/inspection-light and camera coordinates were updated to the explicitly requested calibration; their ownership/restoration and preset checks remain.

Visual/console: BLOCKED. The earlier browser navigation timed out and console access was explicitly rejected by browser URL policy. No retry loop or workaround was attempted this run. No new rendered comparison images, FPS, drawCalls or GPU triangle measurements are claimed. User-reported baseline DAY ~28fps / NIGHT ~22.5fps is contextual, not a new measurement.

Remaining: CAM03 DAY clipping/midtones/crowd occlusion and CAM02/CAM01 NIGHT mass/storefront hierarchy, source causality and sign hierarchy require real-device screenshots. The target image has more irregular urban overlap; matching that look is not established by tests. No visual acceptance is inferred from parameter values.

S17, S18 and GTA not implemented. Stop after saving and Visual QA publication.
