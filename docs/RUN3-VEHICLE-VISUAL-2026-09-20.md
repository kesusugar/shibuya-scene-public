# RUN 3 — Vehicle visual fidelity

Stopping point. The player's car is rebuilt; traffic is not (STEP 8 is a design, not a change).
Nothing is pushed.

Audit: `docs/VEHICLE-VISUAL-AUDIT.md`. Evidence: `evidence/run3-vehicle/`.

---

## Before / After

| | before | after |
| --- | --- | --- |
| fixed angles | `step0-before-sedan.png` | `step6-after-sedan.png` |
| night | — | `step6-after-sedan-night.png` |
| in scene, night | — | `step6-scene-night-chase.png`, `step6-scene-night-brake.png` |
| in scene, day | — | `step6-scene-day-chase.png`, `step6-scene-day-steer.png` |

The before image is a flat-decked pickup with a cabin on it, a vertical windscreen, outboard
wheels and no arches. The after image is a saloon: a bonnet that steps down off the scuttle, a
raked windscreen, a three-window greenhouse with A, B and C pillars, a boot below the beltline,
wheels sitting in arches, and lights where lights go.

Both are rendered by `qa/gta-upgrade/vehiclebench.html` from the code that actually ships, with
an environment map, because paint and glass are mostly what they reflect and judging either
without one flatters boxes and punishes curves.

## Changed files

| file | what |
| --- | --- |
| `src/traffic/vehicle-shape.mjs` | **new** — the loft. Silhouette tables, cross-section stitching, wheels, lamps, doors, anchors. |
| `src/player/vehicle-asset.mjs` | **new** — the VehicleAsset abstraction: materials, named anchors, paint, rear lamps, doors. |
| `src/traffic/vehicle-shadow.mjs` | **new** — contact shadows, one draw call for the floorpan and four tyres. |
| `src/player/vehicle-visual.mjs` | rewritten — drives an asset from the physics state. One copy of the update, not two. |
| `src/player/deferred-vehicle-visual.mjs` | `onReady`, so each built asset root can be registered — not the wrapper's, which outlives a change of vehicle type. |
| `scripts/bake-playable.mjs` | bakes from the asset; carries dimensions and rest anchors. |
| `scripts/vehicle-visual-source.mjs` | **deleted** — it was the second copy of the update. |
| `app/ShibuyaScene.tsx` | registers the vehicle root with day-night and fidelity, which never happened before. |
| `src/player/vehicle-asset.mjs` (dispose order) | leaves the graph before disposing materials, so the systems that unregister on `removed` still have materials to restore. |
| `tests/vehicle-shape.test.mjs` | **new** — 11 tests: proportions, three-box measurement, rake direction, anchors, wheels, lamps, doors, shadows, the baked/built agreement, deferred readiness. |
| `tests/vehicle-dynamics.test.mjs` | pack key follows the new sources; asserts dimensions and anchors ride along. |
| `qa/gta-upgrade/vehiclebench.html` | **new** — the six-angle harness these numbers and images come from. |

`src/traffic/render.mjs`, `src/traffic/simulation.mjs`, `src/player/vehicle.mjs` and
`src/player/vehicle-dynamics.mjs` are **untouched**. No physics, traffic or collision change.

## Proportions

Measured from the built asset's bounding box, against the brief's targets.

| | target | sedan | taxi | kei | van | bus | keiTruck |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| length | 4.5–4.8 | **4.66** | 4.56 | 3.41 | 4.66 | 9.06 | 3.46 |
| width | 1.75–1.85 | **1.80** | 1.74 | 1.47 | 1.77 | 2.37 | 1.46 |
| height | 1.4–1.55 | **1.47** | 1.52 | 1.57 | 2.02 | 3.03 | 1.77 |
| wheelbase | 2.6–2.8 | **2.76** | 2.70 | 2.11 | 2.94 | 5.76 | 2.14 |

The saloon is inside every target. The others are not saloons and are not meant to be; they use
the same loft with a different silhouette table (hatch, one-box, cab-over).

The physics collider was not touched: `VEHICLES` in `src/traffic/config.mjs` still holds the
same width, length and height it always did, and the visual is built from those numbers rather
than replacing them.

## Triangle count, draw calls, materials

| per vehicle | before | after |
| --- | ---: | ---: |
| meshes / draw calls | 26 | **16** (+1 for the shadow) |
| triangles | 5,848 | **4,924** |
| vertices | 16,904 | **4,370** |
| materials | 6 | 8 |

**Fewer draw calls and fewer triangles than the model it replaces.** The old one was six meshes
per colour because a flat material was the only way it could have more than one; the new one is
one body, one greenhouse, and the wheels. Two more materials, because glass, plate, tyre and rim
are now separate — which is what STEP 4 asked for.

In scene, at `tier=high` with the crowd at 1,978, getting into a car moved the whole frame from
357 draw calls / 4,167,735 triangles to 399 / 4,205,300 by day, and 365 / 4,169,911 to
407 / 4,207,497 by night. That is **+42 draw calls and +37,565 triangles** for the car, its
shadow, the shadow-map pass over both, and the vehicle effects; the player figure is hidden in
the same moment and one instanced traffic slot stops drawing.

## Payload and loading

| | before | after |
| --- | ---: | ---: |
| `src/player/generated/vehicles.mjs` | 1,708,680 B | **1,257,572 B** |
| compressed (brotli) | — | **73.9 KiB** |

**Startup impact: none, and unchanged.** The pack is still a dynamic `import()` behind
`deferred-vehicle-visual.mjs`, fired when the player gets into a car, and
`scripts/measure-playable-loading.mjs` still asserts it is not in the initial static graph. The
mechanism was not touched; the payload got 26% smaller.

Vehicle-mode transition: the pack is smaller than the one it replaces and constructs fewer
meshes (16 against 26), so the transition cannot be slower. A wall-clock number from this
environment would be meaningless — it renders through SwiftShader at a fraction of a frame per
second — so it is marked 実機確認待ち rather than reported.

## Wheel animation

`tests/vehicle-shape.test.mjs` asserts it, and the shape module makes it possible: the four
wheels are independent nodes addressed by name (`frontLeftWheel` … `rearRightWheel`), not by
index into a build order.

- **Rolling.** `spin += speed·dt / radius`, so a bus's wheels turn more slowly than a kei car's
  at the same road speed. Accumulates across frames; the test checks that it advances.
- **Suspension.** Each wheel takes `wheelCompression[i]` from the four-point suspension the
  physics already computes, mapped by the same order the suspension samples in
  (rear-left, rear-right, front-left, front-right).
- **Lean belongs to the shell.** Body pitch and roll are applied to the body node only, and each
  wheel is lifted back by however much the body above it rolled or pitched away — so the car
  leans and the tyres stay on the road. The old model applied lean to the body and, in one of
  its two copies of the update, to the wheels as well.

Evidence: `step6-scene-day-chase.png`, captured at 4.94 m/s with `wheelCompression
[-0.009, -0.009, 0.008, 0.008]` and pitch 0.006 read out of the live state in the same frame —
the rear pair compressed and the front pair extended, which is a car accelerating.

## Steering

Front wheels only, from `state.steerAngle`, which `vehicle-dynamics.mjs` already computes and
tightens with speed. Roughly Ackermann: the inner wheel turns further than the outer, which is
what stops a hard lock looking like the axle is sliding sideways.

Evidence: `step6-scene-day-steer.png`, and the test asserts front-yaw non-zero with rear-yaw
exactly zero.

## Night lighting

- **Headlights** are named `traffic-player-front`, which is the name `day-night.mjs` already
  ramps to emissive intensity 6 after dusk for every other car in the city. The player's car
  gets the same curve with no second tuning pass — and gets it at all for the first time, since
  its root was never registered.
- **Rear lamps** are named `traffic-player-rear` (intensity 1.65, `coloredLamp` mode) and their
  colour now comes from the simulation slot: `brake` red, `blinker` amber, otherwise dark.
  Amber beats red. Before this, the player's brake lights did nothing at all.
- **Glass** is transparent over a cabin interior and glossy enough to catch a street light,
  which is what separates it from near-black paint after dark.

Evidence: `step6-after-sedan-night.png` (fixed angles, lamps lit, brakes on) and
`step6-scene-night-chase.png` (in scene, tail lamps lit, headlight beam on the tarmac).

## Grounding

`src/traffic/vehicle-shadow.mjs`. Five instances per vehicle in one draw call: a soft rounded
rectangle under the floorpan at 30% and an ellipse at each tyre at 46%. The falloff exponent
rides in the instance colour, so one material serves both shapes.

Deliberately not a single dark blob: the tyre patches are what the eye reads as contact, and the
body shadow is inset to 86% so it does not become a painted rectangle the size of the car. The
body meshes also now record `castShadow`, which `look.mjs` preserves, so at high tier the car
casts into the shadow map as well.

The audit's finding that **no vehicle in the city is grounded by anything** still stands for
traffic. Only the player's car is fixed here.

## STEP 8 — traffic strategy (design only, not implemented)

Four tiers, chosen by distance to the camera, not by whether a slot is the player's.

| tier | who | representation | cost |
| --- | --- | --- | --- |
| **PLAYER** | the controlled car | the full asset: 16 meshes, real wheels, doors, shadow, brake lights | 16 draw calls + 1 |
| **NEAR** | ~6 closest moving cars inside ~35 m | the same loft at `detail: 0.45`, wheels as four instanced cylinders rather than nodes, no doors, no interior, shared materials | one instanced batch per part, wheels in one more |
| **MID** | everything else on screen | today's instanced traffic, unchanged | 5 batches per type |
| **FAR** | beyond the fog / over ~120 m | today's instanced traffic, unchanged | as now |

Three things make this cheap rather than a second pipeline:

1. `buildVehicleShape(type, {detail})` already takes a detail factor, so NEAR geometry is the
   same silhouette at fewer stations rather than a separately authored model. Nothing has to be
   kept in sync by hand.
2. NEAR would be instanced like MID, not one graph per car. Wheels become a fifth instanced mesh
   with their own matrices, which gets traffic rolling wheels — something it has never had,
   since today they are merged into the body and cannot turn at all.
3. The contact shadow module is already capacity-based and already one draw call, so grounding
   the whole visible fleet costs one more batch, not one per car.

The order matters: NEAR first, because a rolling wheel on the car in front of you is worth more
than a better silhouette two blocks away. MID and FAR should not change until NEAR is measured.

## Known limitations

**Seen in the evidence, not fixed:**

1. **Traffic and parked cars are untouched.** Every car except the player's is still the old
   box model with wheels merged into its body, drawn at a fixed height with no shadow. Next to
   the rebuilt player car this is now more obvious, not less. That is STEP 8's job and it is
   deliberately not started.
2. **The doors are panels inside the flank, not cut into it.** There is no hole in a lofted body
   to drop a door into, so the panel hides a centimetre inside the surface and swings out. Shut,
   there is no visible shut line; open, the aperture it leaves is body-coloured rather than a
   view of the interior.
3. **The cabin interior is a low box and two seat backs.** Enough that a windscreen has
   something behind it; nowhere near a dashboard.
4. **No number plate text, no badges, no wipers, no exhaust, no door handles.** The plate is a
   blank white rectangle.
5. **The wheel rim is five box spokes.** It reads at driving distance and does not at a walk-up.
6. **Only one paint colour per type**, from `VEHICLES[type].color`, as before. The asset has
   `setPaint`, so per-car variety is a line of code away, but it is traffic's question.

**Fixed during the RUN, recorded because it was nearly shipped:**

A capture run threw `Cannot read properties of undefined (reading 'isReady')` out of three's
shader warm-up. Registering the vehicle for lighting means something now unregisters when the
vehicle leaves the graph, and unregistering restores emissive intensity and shader hooks on the
materials — which has to happen while they still exist. The asset was disposing its materials
first and leaving the graph second, which can pull a program out from under a `compileAsync`
that is still polling for it. Fixed by reversing the order, and by registering each built
asset's own root rather than the deferred wrapper's, so a vehicle that changes type is
re-registered instead of silently losing its headlights. A re-run of the same capture reports
zero exceptions across city build, player mode, entering the car, driving, steering and braking.

**Not judgeable here, 実機確認待ち:**

7. Whether the wheels visibly slip at speed — a still frame cannot show it.
8. Whether the contact shadow tracks correctly over a crowned road under real suspension travel.
9. Vehicle-mode transition time on real hardware.

## Verdict: polish the procedural vehicle, or buy a GLB?

**Keep the procedural pipeline. Do not buy a vehicle GLB yet.**

The evidence for that, rather than the assertion:

- The gap this RUN had to close was **silhouette**, and a loft closed it. `step0-before` against
  `step6-after` is not a material or a texture difference; it is a different shape, and it came
  from a table of numbers rather than from a mesh someone else made.
- It got **cheaper**, not more expensive: 26 meshes to 16, 5,848 triangles to 4,924, and a pack
  26% smaller. A downloaded GLB would go the other way, and every one of them would arrive with
  its own texture set.
- The remaining limitations are **detail, not shape** — door apertures, an interior, a rim, a
  plate. Every one of those is reachable from the same generator, and several of them are worth
  less than what STEP 8 would buy with the same effort.
- **Seven body styles from four tables.** A GLB gives one car. Shibuya needs a taxi, a kei car,
  a van, a bus and a kei truck that all look like they were made by the same hand, and a
  procedural silhouette table is exactly how you get that.
- The licensing and provenance work RUN 2 needed for characters would have to be repeated, and
  a car is a much harder licensing problem than a human: real vehicle shapes are trademarked,
  and CC0 car packs are mostly stylised.

Where a GLB **would** be right, later: a single hero vehicle the player drives most of the time,
if the camera ever gets close enough that a rim with five box spokes and a blank plate stop
being acceptable. That is a RUN 12/13 question about the look, not a RUN 3 question about the
architecture — and by then `VehicleAsset` is the seam it goes through, exactly as
`CharacterAsset` is for the humanoid.

The order this project has been following holds: runtime architecture, then visual behaviour,
then asset replacement. RUN 3 did the first two. The third is not yet worth paying for.
