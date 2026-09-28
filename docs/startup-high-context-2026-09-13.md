# HIGH placement pre-generation and scheduling

## Changes

- Extend the existing signed static model pack with HIGH reference-match signs and HIGH streetscape placements. Other tiers retain live generation.
- Serialize spatial index items once and reconstruct buckets at load. Ground and generic-building references are rebound rather than duplicated. Crowd and traffic retain their collision data.
- Test live versus stored sign placements, fixtures, cables, anchors and rejections, and rerun the streetscape collision audit after restoration. JSON normalizes signed zero; comparisons use the JSON geometry contract.
- Replace CPU-slice setTimeout yields with MessageChannel task boundaries, closing both ports after each yield. Retain a timer fallback when MessageChannel is unavailable. This is not a microtask loop and does not disable rendering or hardware acceleration.
- Use PCFShadowMap directly: installed Three.js already converts deprecated PCFSoftShadowMap to this mode. Avoid repeatedly setting the deprecated value and emitting warnings.
- Bake the HIGH traffic graph, its collision index and exact Float64 paths. Paths use lossless base64 packing and recover as typed arrays before simulation starts.
- Bake the HIGH pedestrian graph, walkability indexes and deterministic Scramble choreography curb slots. Compact node/edge tuples reduce transfer and JSON parsing cost without rounding geometry.
- Keep live generation as the fallback for a missing/stale pack and for tiers without a signed prebuilt model.

## Diagnostic findings

Before changing the task scheduler, a hidden Chrome tab reported crowd compute 25.357 s but cooperative wait 229.526 s across 714 yields. Thus timer throttling, not just geometry complexity, materially delayed readiness. That HMR run included an app lifecycle restart at 292.214 s and is not a clean navigation benchmark.

With HIGH sign/street pre-generation active, that run measured signage 0.109 s and streetscape 0.042 s. The previous turn measured live generation stages at 13.543 s and 37.955 s respectively. These are cross-run stage observations, not controlled whole-startup speed percentages.

## Checks

- Application-wide typecheck passed after the scheduler change.
- Live/stored HIGH placement and restored collision tests passed before the scheduler change; synchronous geometry generators were unchanged by that change.
- Three network startup tests passed, including an explicit check that CPU yields do not use timers when MessageChannel is available.
- Production build body passed for the placement change. Existing CSS import-order and chunk-size warnings remain.

## Final local Chrome verification

Final artifact: 19,190,398 bytes, key `901f19340e88a033393192428db5444c1fa18a906fe92d779e12cdb6f4c4e50d`.

Real Windows Chrome, normal window, WebGL2 and hardware acceleration left enabled:

- Cold navigation: scene complete 14.959 s, interactive 15.019 s.
- Immediate consecutive reload: scene complete 12.132 s, interactive 12.212 s.
- Consecutive reload stages: traffic 0.493 s; crowd 0.319 s; signage 0.034 s; streetscape 0.025 s.
- The same Chrome tab's earlier live-generation report was 223.784 s interactive, traffic 41.271 s and crowd 52.148 s. The final consecutive run is 94.5% shorter overall; traffic and crowd stages are each about 99% shorter.

The typecheck, production build body, signed pack check, cooperative scheduling tests and prebuilt mobility restoration tests passed. The standard repository `npm test` wrapper could not launch its Bash/WSL build wrapper in this sandbox (`Bash/Service/CreateInstance/E_ACCESSDENIED`); the equivalent production build body was run directly and passed. Existing CSS import-order and chunk-size warnings remain.

The existing browser QA Capture API generated another complete seven-image pack at 15:05:03 JST. Output (ignored by Git): `qa/2026-09-13-mobility-prebuilt/final/shibuya-qa-pack/`.

The pack contains metrics.json and overview-day.png, overview-night.png, scramble-street-day.png, scramble-street-night.png, qfront-night.png, scramble-high-day.png, scramble-high-night.png. The Scramble HIGH day/night images were opened and inspected after final generation; no missing geometry or new placement artifact was observed.

Final QA retains 3,615,153 triangles, 318 draw calls, 1,978 pedestrians, 62 moving / 12 parked vehicles, 2256x1167 framebuffer, DPR 1.5, 4096 shadow map, GTAO/bloom/SMAA enabled. Density and rendering features were not reduced.

GitHub push is not part of this iteration.
