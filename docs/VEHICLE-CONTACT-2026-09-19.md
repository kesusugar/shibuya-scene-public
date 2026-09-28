# Stage 5 — planar contact response

The player no longer loses all momentum whenever a proposed pose is rejected.
Polygon-edge contact normals remove inward velocity, retain 92% of tangent velocity,
and generate bounded yaw from an offset impact. Rotation is energy-limited. Each slide
and 2 mm outward separation still passes the original solid/traffic/bounds checks.
Damage uses lost normal speed, with a 1 m/s threshold and 250 ms cooldown to avoid
repeated damage from resting throttle contact. Ownership changes reset that cooldown.

Runtime changes: `src/player/vehicle-contact.mjs`, `vehicle.mjs`, and
`vehicle-dynamics.mjs`. Reverse and pure lateral motion now use the actual signed
velocity vector. Traffic candidates are scanned only after broad-phase rejection;
there is no new startup work, asset, texture, geometry bake or frame-wide crowd scan.
Existing offline vehicle/character buffers remain unchanged. No startup speedup claimed.

## Verification and review

- Focused vehicle/gameplay suite: 21 passed at initial integration.
- Final contact suite covers head-on/separating contact, glancing energy bounds,
  rotated walls, persistent throttle/reverse escape, pure lateral/reverse momentum,
  and traffic overlap/lane preservation.
- Typecheck passed. Production build and full current suite passed (176 tests). Final added
  contact checks passed separately (6 tests total).
- Review caught pure lateral motion stalling and corrected its signed integration.
- New image: `docs/previews/vehicle-contact.png`, three actual simulation snapshots,
  rendered from the baked model using SVGRenderer. This is **not a game screenshot**;
  it does not validate WebGL materials, the city, day/night appearance or device FPS.

## Limits and remaining stages

This is a lightweight contact foundation, not rigid-body simulation. Other traffic cars
remain kinematic: no mutual impulse exchange, parked-car pushing, deformation, rollover
or airborne dynamics. Concave obstacle corners use nearest-edge normals and can feel
sticky; every resulting pose remains gated. Substeps bound travel but are not a complete
continuous collision solver. Existing overlapping spawn poses are not depenetrated.

Two planned stages remain: (6) loading/asset consolidation and measured startup costs;
(7) live day/night visual and device performance tuning. Browser visual acceptance and
full dynamic traffic collisions remain explicit limitations, not completed claims.
