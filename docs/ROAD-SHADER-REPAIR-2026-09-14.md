# Road shader repair — 2026-09-14

Stage 4 remains open; stage 5 is in progress alongside it.

## Root cause and correction
- The road spill GLSL declared a variable named `patch`, a reserved GLSL identifier. The asphalt failed to render, exposing the tiled land beneath it.
- Renamed the variable to `wetNoise`. Earlier shader string-injection tests did not catch GPU compilation failure.
- Temporary magenta material and hidden-land diagnostics were fully removed.
- Actual browser inspection at port 5174 confirmed asphalt visibility and day-to-night color spill recovery.
- Reduced wet emission after rendering recovered, retaining dark asphalt between colored pools.

## Regression protection
- Added a reserved-local-name regression assertion. This is not a complete GLSL compiler.
- Renderer shader failures now raise the existing visible alert and log compilation diagnostics once per renderer.
- Hook tests cover deduplication, previous-handler chaining, teardown and unavailable WebGL.

## Remaining visual work
Road spill is art-directed emission, not a physically accurate reflection of scenery. Reflection shape, storefront detail, people and integrated performance acceptance remain unfinished.
