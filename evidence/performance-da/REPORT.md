# Task D + Task A only

Base: 5d4243edd9bbe3b91aee136ee71116c35de042ce / Visual QA v15.

Task D: queue now waits for the current asynchronous job to finish, then schedules the next after requestAnimationFrame plus a timer (a paint opportunity, rather than continuing inside the pre-paint microtask checkpoint). Node uses a timer fallback. Buildings/signage/station/station-detail/streetscape model generators yield at selected boundaries and at 25–50-item chunks. Existing synchronous APIs drain the same generators. A disposed asynchronous build releases its result rather than resurrecting the module; queued cancellation resolves all pending promises.

Task A: read-only contains/area queries no longer copy every clipping ring via polygons(). In-memory ring tests preserve boundary/hole handling. Removed sliced segment/route/triangle prefixes from hot application loops. Source polygon arrays are not mutated. Necessary ownership copies and polygon-clipping internal state copies remain.

Scope exclusions: no Task B/C/E/F; no distance-grid changes, replacement of Math.hypot, typed-array rewrite, DPR/quality change, instancing change or visual/material/light/crowd-budget changes. No dependency or lockfile changes.

Measurement: scripts/measure-build-copies.mjs uses the supplied push/slice/concat/hypot/sqrt wrapper and stack-sampling intervals, installed before a MEDIUM CPU replay of S2–S15 construction. It restores all wrapped functions after measurement. Stack capture itself calls slice; this observer overhead is included, exactly as in the supplied snippet. Stage durations include instrumentation and timer yields.

This is Node, not browser-console measurement. There is no browser rendering, Canvas2D painting, shader compilation, FPS measurement or Long Tasks API result. The earlier browser URL-policy rejection remains a limitation; no bypass/retry loop was attempted. User's 25,854,676-slice browser observation stopped before all stages completed, so it is not a matched denominator for this full CPU replay. No improvement percentage is claimed.

Initial replay: first-counts.json (94,470,561 slices), before the additional S5 cooperative adapter. Final replay: counts.json. The sampled slice stacks are dominated by polygon-clipping Segment.afterState state copies reached from Segment.isInResult, not the removed application-level copy sites. Replacing required copies with shared mutable arrays would risk corrupting polygon output. The <100,000 target remains unachieved; Task A is not accepted as PASS.

Task D also does not establish the <200ms long-task target: synchronous polygon boolean calls and default model dependency construction can still block within a chunk. Paint opportunities are implemented, but browser responsiveness is unverified.

Validation: 69 unique tests pass (5 new, 18 geo, 7 quality, 39 ground/buildings; quality/new tests repeated after queue disposal fix). Final build succeeds. Minimum geometry, source preservation, asynchronous cancellation and quality invariants verified. Untracked prior logs preserved. Saved only; no deployment requested by this task.
