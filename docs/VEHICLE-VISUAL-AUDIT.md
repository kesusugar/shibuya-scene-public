# Vehicle visual audit

State of the vehicle pipeline before RUN 3 touches it. No code changed to write this.

Baseline image: `evidence/run3-vehicle/step0-before-sedan.png` — the player's sedan from six
angles, rendered from the generator this document describes.

## Two pipelines, not one

There are two entirely separate vehicle representations, and they share no geometry code.

| | **controlled vehicle** | **traffic / parked** |
| --- | --- | --- |
| geometry from | `scripts/vehicle-visual-source.mjs` | `vehicleGeometry()` in `src/traffic/render.mjs` |
| how it is drawn | 26 separate `Mesh`es under a `Group` | 5 `InstancedMesh`es per type |
| triangles | 5,848 (sedan) | 1,140 (sedan) |
| materials | 6 per vehicle, cloned per build | 5, shared across all traffic |
| built | offline, `npm run bake:playable` → `src/player/generated/vehicles.mjs` (1.71 MB) | at runtime, once per type |
| loaded | deferred, on entering a car | with the traffic module |
| wheels | four independent `Group` pivots | merged into the static `dark` mesh |
| follows ground | yes, `state.y` from suspension | no, fixed `y = .04` |

`vehicle-visual-source.mjs` and `src/player/vehicle-visual.mjs` are near-duplicates: the first
builds the geometry and carries an `update()`, the second loads the baked result and carries a
copy of the same `update()`. The two copies have already drifted — the baked one folds body roll
and pitch into the wheel height, the source one does not. **This is a bug waiting to happen and
RUN 3 should collapse it.**

## Per item

**Vehicle geometry generation.** `scripts/vehicle-visual-source.mjs`, ~30 lines of `RoundedBox`
calls driven by `VEHICLES[type]` in `src/traffic/config.mjs` (width, length, height, colour).
Everything is axis-aligned boxes; nothing is lathed, swept or profiled. `npm run bake:playable`
runs it in Node, merges vertices, and serialises `root.toJSON()` per type.

**Controlled vehicle visual.** `src/player/vehicle-visual.mjs`. Parses the baked JSON, finds
`vehicle-body`, collects `vehicle-wheel-*` and `player-vehicle-door-*` by name, and drives them
from the physics state each frame.

**Traffic vehicle visual.** `vehicleGeometry()` + `buildTraffic()` in `src/traffic/render.mjs`.
Five merged part meshes per type (`body`, `glass`, `dark`, `front`, `rear`), each an
`InstancedMesh` sized to the 146-slot pool. Per-instance colour on `body` (a hash of the vehicle
id, ±3.5%) and on `rear` (brake red / indicator amber / dark).

**Parked vehicle visual.** Identical to traffic; `v.parked` only changes whether the simulation
moves it and whether it gets a headlight beam.

**Wheel representation.** Controlled: `CylinderGeometry(r, r, .18, 18)` plus a `.55 r` chrome hub,
`r = .30` (`.42` for the bus). Traffic: `CylinderGeometry(r, r, .14, 12)`, merged into `dark` —
**traffic wheels are part of the body mesh and cannot move at all.**

**Wheel transform.** Controlled only. `spin += speed·dt/.3` about X, front pair yawed by
`state.steerAngle`, height from `radius + wheelCompression[i]`. The mapping is per-index with
`w.front = z > 0`, and the left/right order is whatever the build loop produced — it is not
addressable by name.

**Steering angle.** `state.steerAngle` is computed properly in `src/player/vehicle-dynamics.mjs`
(`steering · .62 / (1 + |speed| · .057)`, so it tightens at speed) and consumed by the visual.
Traffic vehicles have no steer angle at all.

**Suspension representation.** Real, and better than it looks: `suspension()` samples ground
height at four contact points, integrates a vertical spring, and produces `pitch`, `roll` and a
four-element `wheelCompression`. All of it reaches the visual. Traffic has none.

**Headlights.** Three separate things. (1) `box(d.width·.22, .12, .055, lamp, ±d.width·.32, .72,
length/2)` — a 39 × 12 cm emissive rectangle, **at y = .72, which is below the middle of the front
face**. (2) `headlightGlows()` in `src/traffic/headlight-glows.mjs` — additive camera-facing
sprites, strength driven by `materials.front.emissiveIntensity`. (3) `s9-headlight-road-beams` —
an additive ground plane with a twin-lobe shader, genuinely good. (2) and (3) apply to traffic
and to the controlled car's simulation slot; (1) exists on both meshes.

**Brake lights / rear lights.** Traffic: one `rear` material, per-instance colour switched
between `0xff3131` (brake), `0xffa329` (indicator, blinking at 2 Hz) and `0x651e24` (off).
`state.brake` and `state.blinker` are written for the player's slot too (`vehicle.mjs:287`).
**The controlled vehicle's own mesh ignores both** — its tail lamp material is a constant
`0xaa1818` with `emissiveIntensity .4`. Braking in the player's car changes nothing visually.

**Glass.** One `MeshStandardMaterial({color: 0x173543, roughness: .19, metalness: .42})`, opaque.
Not transparent at all, on either pipeline. Dark blue-grey paint standing in for glass.

**Material.** Controlled: 6 (`paint`, `glass`, `rubber`, `chrome`, `lamp`, `tail`), cloned per
vehicle build. Traffic: 5 shared. No maps, no clearcoat, no normal maps anywhere.

**Contact shadow.** **None, on either pipeline.** `src/life/shadows.mjs` gives the crowd a
contact shadow; vehicles were never wired into it. And `src/fidelity/look.mjs:13` gates shadow
casting on a name whitelist —
`/^(crowd-(body[0-3]|head|hair[0-2])|buildings-wall|hero-(concrete|glass|metal|roof)|station-)/` —
which **no vehicle mesh matches**, so no car casts a shadow map shadow either. Every vehicle in
the city is lit from above and grounded by nothing.

**Vehicle LOD.** None. There are two quality levels by accident — the baked close model and the
instanced traffic model — but nothing switches between them by distance. The controlled car
always uses the detailed one; every other car always uses the cheap one. `v.playerVisual` is the
only switch and it means "this slot is the player's", not "this slot is close".

**Prebuild.** `npm run bake:playable` → `src/player/generated/vehicles.mjs`, 1.71 MB of JSON,
six types. It is **not** in `prebuild` (only `bake:static` is), so it is regenerated by hand.
`pack.sourceKey` hashes `vehicle-visual-source.mjs` + `config.mjs` but **nothing verifies it at
load time** — unlike the static model pack, which checks its key.

**Deferred loading.** `src/player/deferred-vehicle-visual.mjs`, the pattern RUN 2 copied for
characters: the 1.71 MB pack is a dynamic `import()` fired on entering a car, the instanced
traffic vehicle keeps the slot visible until it lands, failures fall back and rate-limit.

**Disposal.** Controlled: `clear()` disposes geometries and materials on every type change and on
dispose; the slot's `playerVisual` flag is released. Traffic: `buildTraffic().dispose()` releases
every instanced mesh, geometry, material and the glow/beam helpers. Both are sound.

## Why the controlled vehicle looks like a wedge

Four causes, in order of how much each one costs.

**1. The body has no bonnet and no boot.** This is the whole problem. The body is two stacked
slabs that both run the full length of the car:

```
box(width,      .52, length,      paint, y .59)   →  y 0.33 … 0.85, 100% of length
box(width×.88,  .25, length×.96,  paint, y .86)   →  y 0.74 … 0.99,  96% of length
box(width×.78,  .43, length×.48,  glass, y 1.18)  →  the cabin
box(width×.82,  .10, length×.48,  paint, y 1.40)  →  the roof
```

So from the side the car is a 4.6 m long, constant-section block 0.99 m tall, with a smaller box
sitting on it. A real sedan's bonnet is ~25 cm below its beltline and its boot lid lower still;
here they are the same height as the sills. A flat deck with a cabin on it is a pickup truck, and
that is exactly what the render reads as — most obviously in the rear 3/4 view, where the area
behind the cabin is a flat load bed.

**2. The windscreen is vertical.** The cabin is a rounded box, so the glass meets the bonnet at
90°. Rake is the single strongest cue that a shape is a car: a windscreen leaning back ~30° and a
backlight ~25° are what turn a box into a cabin. There is no rake anywhere in the geometry, and
no mechanism to add one, because every part is an axis-aligned box.

**3. The wheels are outboard castors with no arches.** They sit at `x = ±(width/2 − .02)`, which
is outside the body's rounded corner, so they hang off the side rather than sitting in the car.
There are no wheel arches, so nothing cuts into the flank and the top of each wheel simply ends
against a flat surface. `r = .30` against a body whose underside is at `y = .33` leaves a 3 cm
gap, so the wheel reads as bolted on rather than tucked under. Only 18 radial segments, and the
tread is a bare cylinder wall.

**4. The details protrude instead of inset.** The doors are plates at `x = ±width/2` — on the
surface, not in it — so they stand proud of the flank as grey rectangles. The mirrors are
19 × 13 × 27 cm boxes at `x = ±width×.53`, which is why the measured bounding box is 2.23 m wide
on a 1.78 m car. The headlights are cream rectangles low on the front face, reading as fog lamps.
There is no grille, no bumper shape, no badge, no number plate.

Two smaller things fall out of the same measurement: the body's lowest point is `y = −0.081`, so
the car is slightly **below** the road surface, and nothing casts a shadow, so there is no contact
with the ground at all.

**What is not the cause.** The camera is fine: `vehicleCamera` + `createFollowCamera` gives a
rear-3/4 chase view with a speed-dependent FOV (61° rising to 71°) and wall clipping. The physics
is fine and is already richer than the visual consumes. The proportions from `VEHICLES` are
roughly right for a Tokyo sedan (1.78 × 4.60 × 1.45 against a real 1.75–1.85 × 4.5–4.8 ×
1.4–1.55). **Nothing needs to be rebuilt except the shape itself.**

## What RUN 3 can reuse as-is

- `state` from `vehicle-dynamics.mjs` — position, heading, speed, `steerAngle`, `pitch`, `roll`,
  `wheelCompression[4]`, `acceleration`, `damage`, `brake`, `blinker`, `doorPhase`, `doorSide`.
  Every anchor the brief asks for can be driven from what already exists.
- `deferred-vehicle-visual.mjs` — the loading story is already correct.
- The headlight beam shader and glow sprites.
- The instanced traffic path, for the MID and FAR tiers of STEP 8.
