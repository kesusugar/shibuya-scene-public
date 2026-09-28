# Ground textures (RUN 12.3)

The road and pavement use two CC0-1.0 PBR sets from Poly Haven, whose whole library is CC0
(https://polyhaven.com/license). Nothing else is shipped. Curbs, crossing paint, tactile paving
and the ground under unmapped parcels keep their flat or procedural materials.

| Use | Set | Author | Real size | Maps |
| --- | --- | --- | --- | --- |
| road | [Asphalt Track](https://polyhaven.com/a/asphalt_track) | Dimitrios Savva | 2 m | diff 200 KB, normal 268 KB, rough 50 KB |
| sidewalk | [Concrete Pavement](https://polyhaven.com/a/concrete_pavement) | Charlotte Baglioni | 1.8 m | diff 230 KB, normal 480 KB, rough 64 KB |

## Pipeline

1. `assets/textures/upstream.lock.json` records each source file's URL and SHA-256, plus Poly
   Haven's own MD5.
2. `npm run fetch:textures` downloads them into `assets/textures/upstream/` (git-ignored) and
   refuses any mismatch.
3. `npm run convert:textures` re-encodes them at 1024 px in Chrome's canvas: colour and roughness
   at q .82, the normal map at q .92. It writes `public/textures/ground/` and a manifest with each
   set's real size and mean colour.

## At runtime (`src/ground/pbr.mjs`)

- Loaded after the city stands, never awaited.
- Swapped onto the existing `ground-asphalt` / `ground-sidewalk` materials, so draw calls stay
  the same and the night patches (wet roughness, the road mirror) keep working.
- LOW, and `?pbr=0`, keep the procedural ground.
- Each material is tinted per channel, in linear light, so the photograph averages what the
  procedural texture did. The daylight calibration was tuned against that average; the
  photograph adds detail and does not change the grade.
