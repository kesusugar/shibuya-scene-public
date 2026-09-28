# RUN S16 — Visual Match Polish v2

Base: 55ea9aa (Visual QA v10). Current source: the git commit containing this report; published version is reported in the handoff.

## Changes
- Expanded existing crossing approaches into safe waiting strips with width/depth: 49 unique real-data entry cells. Four main crossing groups and diagonal, both directions, distributed exits retained. Seeded spawn offsets, existing speed/departure variation and local spatial occupancy checks retained; no O(N²) solver.
- Station, Hachiko and Center-gai ambient allocation adjusted. HIGH/MEDIUM/LOW targets remain 420/210/95; HIGH final integrated audit population 420. Population was not reduced to hide crowding.
- Selected nearby commercial floors 1–4 use 972 shop glazing instances, 89 shallow awnings and 267 entrance dividers. Existing seven material channels and eight building batches retained. Generic building CPU geometry: 165,065 triangles (not measured GPU scene triangles).
- Seeded local storefront emission and a small lower-floor window floor reduce black lower facades. Hero surface values lightly adjusted. DAY restores original material behavior. No new real lights; exposure, bloom, wet effects and quality caps unchanged. Signs remain 763; no extra advertisements or reference assets copied.
- CAM03 remains 1.7m eye height; target lowered to 5.5m. Other fixed cameras retained. Scramble geometry left intact because no observed visual evidence justified changing safe routes.

## Verification and limits
- Six new S16 tests pass, including waiting strip width/depth, exits, synthetic red-phase separation, storefront bounds, shader behavior and S14 caps.
- Existing S10/S12 regression: 17 pass. Relevant 180-second crowd/traffic simulation rerun: major body/vehicle interference 0, signal violations 0; main/diagonal completion and traffic resumption pass. Minor audit reports 99 stuck and 9 separated group members; crowd visual naturalness still requires observation.
- Remaining regression and build results recorded in regression.log / build.log; aggregate recorded in verification.json.
- Browser reached CAM03 DAY / MEDIUM. WebGL2 unavailable; browser-blocked.jpg records the explicit environment alert, not a rendered scene. Captured console sample contained one browser-extension metadata error and no app-origin error; this does not validate GPU shaders or full-scene console behavior.
- Actual scene FPS / GPU triangles / draw calls: unavailable. The earlier user-provided 38.8 FPS is not a new S16 measurement.
- Visual match and S17 image baseline are BLOCKED, not PASS. CAM03 DAY/NIGHT and the other camera states are listed in baseline-manifest.json with no fabricated images. No repeated WebGL attempts. S17 must not treat this manifest as an established image baseline.
- S17/S18/GTA not implemented. Existing untracked verification logs preserved. No further polish after this run.
