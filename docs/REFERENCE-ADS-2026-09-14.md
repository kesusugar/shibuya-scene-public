# Reference advertisement inventory

Branch: `claude/happy-tesla-dkn52d`
Stage: 3 (principal advertisements), feeding stage 4 (lighting and materials)

## What the inventory is

The user supplied a target frame of the scene and an inventory derived by comparing that
frame against the current build. The inventory lists 30 advertisements with their position
and size as a percentage of the CAM-02 frame, plus mount type, aspect and priority.

The percentages are resolution independent but **not aspect independent**. A percentage
only names the same world direction when it is unprojected through the aspect ratio it was
measured at, so `REFERENCE_VIEW` pins the measuring frame (1491x812, 50 degree vertical
field of view, CAM-02) and placement always unprojects through it, never through whatever
canvas the viewer happens to have.

## Placement

`src/signs/reference-ads.mjs` raycasts each slot against the scene's own sign hosts, except
for the centre block, which is anchored to named buildings instead — see **Host anchoring**
below for why and how.

- Wall mounts take the nearest facade that faces the camera.
- Roof mounts resolve against roof planes instead, because a ray aimed at a rooftop sign
  passes over every facade and would otherwise land on whatever is far behind. When the
  scene's building in that direction is shorter than the reference building, the sign is
  stood on the nearest tall roof along the sight line and flagged `lowered`.
- World size is derived from the slot's screen coverage at the hit depth, divided by how
  much of the facade survives projection, then trimmed to the wall it landed on.

A slot is accepted only when it lands on a camera-facing wall, within the range the
reference frame covers, and at a size its mount type is actually built at. 21 of 30 survive
placement and the audit. The rest are reported with a reason rather than relocated.

`src/signs/reference-layer.mjs` applies the result at render time, not during the static
bake, so re-aiming or redrawing an advertisement does not invalidate the geometry pack.
Generated panels whose world footprint a slot covers are cleared by footprint rather than
by host identity, because a slot measured from the frame routinely straddles panels
belonging to a neighbouring host.

### The placement audit

Geometry that satisfies the raycast can still be wrong. Slots 19 and 20 resolved onto the
QFRONT facade at the same position as that building's own large screen, so IKEA and ACN
rendered stuck through the middle of it; two more hung out over the roadway. The raycast
only ever asked "does this land on a wall", never "is that wall already occupied".

Reference advertisements now clear the same `placementIssues` audit the procedural signs
clear, accepted one at a time against everything already standing, so two reference slots
resolving onto one wall are caught against each other as well. `vertical-host-bounds` is
excluded because a rooftop mount is meant to stand above its host's roofline.

This drops the placed count from 21 to 15. Those six were never buildable.

### Walls carrying a grid

Sizing each slot from its own screen coverage is right in isolation but collides once
several slots land on one facade. The reference frame's left block carries nine
advertisements across a facade far wider than the wall this scene models, so nine
individually-correct panels overlapped into an unreadable stack.

When three or more advertisements share a wall, the group's screen rectangle is mapped
linearly onto that wall instead. This reproduces the reference arrangement — same columns,
same rows, same relative sizes — and cannot overlap, because the reference rectangles do
not overlap either. Walls carrying one or two advertisements keep their raycast sizing.

### The rooftop drink brand

`center-gai.mjs` previously pushed this sign to a fixed height of 47.6 m above QFRONT,
which is higher than that roof, so it floated. The reference layer now owns it and stands
it on a real roof. It sits lower in frame than the reference because the building beneath
it in this scene is shorter than the reference building; the placement is flagged
`lowered` rather than faked.

## Overlap resolution

The placement audit in `model.mjs` guarantees the *model* signs do not intersect, but two
layers run after it and neither was audited. `commercialLayout` replaces dense faces with a
freshly generated grid, and the reference layer adds advertisements aimed from a
photograph. Both can land a panel on a panel the audit already accepted.

Measured on the render list: **61 intersecting pairs on master**, before any of this work.
They are almost all a generated `:commercial:` cell cutting into an audited model sign on
the same wall — for example `way/60739635:0:0:1:1` against
`way/60739635:0:0:0:0:commercial:0:0`.

`src/signs/overlap.mjs` is the last word before geometry is built. Panels are accepted in
priority order — hero screens, then reference advertisements, then hero signs, then audited
model signs, then generated filler — and anything that cuts into an accepted panel is
dropped. The result is **0 intersecting pairs**, at the cost of 41 generated filler cells
out of 615 faces. No hero screen, reference advertisement or audited model sign is dropped.

## Host anchoring for the centre block

Unprojecting the percentages assumes the reference image and this scene compose the same
way. For the centre block they do not, and the numbers say by how much: the reference puts
its centre stack at x 45–52% of the frame, while this scene's buildings on that bearing sit
at x 33–46% and stand 14–24 m where the reference tower is far taller. Eight sight lines
aimed through the recorded percentages therefore passed 26–38 m over every roof in their
path and reached the ground 111–212 m out, or landed on a neighbouring plot, or crossed the
roadway. No amount of raycasting accuracy fixes that — the percentages name a direction in
a composition this scene does not have.

For that block the percentages are read as an **arrangement** instead: which advertisement
sits above which, and how large each is relative to its neighbours. `AD_ANCHORS` names the
building each one belongs to, taken from a nearest-hit visibility scan of what a viewer can
actually see in the centre band:

| host | distance | roof | visible facade | carries |
| --- | --- | --- | --- | --- |
| `way/136690966:0:0` | 123 m | 34 m | fully open | 15 Hisamitsu, 16 サロンパス, 17 もん字, 18 Rakuten, 21 DMM, 22 大盛堂書店 |
| `way/136691379:0:0` | 174 m | 23 m | 3.8 × 23.0 m, 46% open | 19 IKEA, 20 ACN |

`placeAnchorGroup` unprojects each advertisement at the wall's own depth and
foreshortening, then scales them all by **one shared factor**, so every proportion
survives and only the overall scale changes. Because the reference rectangles do not
overlap, neither can the resulting panels.

### The gaps give way, not the advertisements

The empty wall between them is not preserved. The reference building is around twice the
height of the plot this scene has on that bearing, so keeping the stack's full vertical
extent meant halving every advertisement to fit, and they stopped reading as signage.
Each column is solved separately: the advertisements keep their shared scale and the gaps
between them compress, down to a 25 cm floor — what a sign contractor fitting the same set
to a shorter building does. Columns are split by overlap in the reference frame, so a blade
standing beside the stack keeps its own room instead of being forced into the same run.

`way/136690966` is also **raised from 24 m to 34 m** (`HEIGHT_OVERRIDES` in
`src/buildings/config.mjs`; footprint untouched, extrusion only). 34 m is measured, not
chosen for looks: it is where the stack stops being limited by the wall's height and starts
being limited by its width, so it is the shortest the plot can be without costing the
advertisements anything, and it stays under QFRONT's 39 m so the landmark hierarchy the
reference frame has survives. The override sits in a module the static model key already
follows, so the geometry pack invalidates and rebakes rather than the scene quietly
rebuilding 19 MB of geometry at runtime.

Together these take Hisamitsu from 7.4 m wide to 13.6 m and 大盛堂書店 from 8.5 m to 15.8 m.

Anchored placements skip `fitGroupsToWalls` — re-fitting an arrangement already chosen to
fit that wall would stretch it — but they still clear the shared `placementIssues` audit
and the overlap pass like everything else. Nothing bypasses those.

### Visible wall, not facing wall

A facade that faces the viewer is not a facade the viewer can see. In a street this dense a
nearer block routinely hides most of one, and a group laid across the whole wall then puts
half its advertisements behind a building — which is exactly what the first attempt did to
Rakuten, DMM and 大盛堂書店.

`visibleWallPatch` samples a 24 × 20 grid over a wall, tests each point against every
facade that could stand in front of it, and returns the largest unbroken rectangle that
survives. `bestCameraEdge` uses that area to choose the wall, and `placeAnchorGroup`
confines the group to that rectangle. The measurement is what picked both hosts:

| candidate | facing | wall | visible patch | verdict |
| --- | --- | --- | --- | --- |
| `way/136690966` | .78 | 28 m | 684 m², 100% | carries the stack |
| `way/136691379` | .81 | 8 m | 87 m², 46% | carries IKEA and ACN |
| `way/136691389` | .82 | 14 m | 43 m², 13% | rejected — facing alone would have picked it |

A group squeezed below `MIN_ANCHOR_FIT` of its intended size is dropped with
`anchor-wall-too-hidden-to-read` rather than placed: panels smaller than the procedural
stickers beside them read as litter on the facade, not as advertisements.

The scan costs 12–36 ms for the whole resolve, so it runs at render time with the rest of
the layer. The cost is entirely in hoisting the blocker list out of the sample loop and
dropping walls behind the target — done naively it takes two seconds per wall.

### Blade widths

A blade stands perpendicular to its facade, so its width is how far it reaches out over the
street, not how wide it reads on the wall. The audit rejects a blade projecting more than
1.1 m, and a placement reaches `width / 2 + .16` m out, so a blade sized like a painted
panel is always rejected however well it was aimed — which is why もん字 kept failing
`facade-distance`. `fitMount` clamps blade widths to `MAX_BLADE_WIDTH`, giving the tall
narrow proportions a 袖看板 actually has.

## Advertisements with no building

These nine are not placed. Eight belong to buildings the reference frame carries and this
scene does not, and inventing a wall would put the advertisement somewhere the reference
never showed it; artwork for all of them is already drawn, so adding the buildings is the
only remaining work. SHIBUYA 109 is a deliberate exclusion, recorded in `EXCLUDED_ADS`
rather than deleted so the inventory stays a complete transcription of the frame.

| id | brand | priority | reason |
| --- | --- | --- | --- |
| 4 | Cafeレストラン ガスト | medium | facade-recedes-from-view |
| 8 | もんじゃ | medium | no-host-on-ray |
| 12 | SHIBUYA 109 | medium | out-of-scope-for-this-scene |
| 24 | QFRONT | low | host-beyond-reference-range |
| 26 | STARBUCKS | high | no-host-on-ray |
| 29 | CITY DRUG | low | no-host-on-ray |
| 30 | サンドラッグ | high | no-host-on-ray |
| 13 | UC | high | placement-audit:road-projection |
| 14 | 龍角散ダイレクト | medium | placement-audit:road-projection |

`no-host-on-ray` means the sight line leaves the scene without meeting a building.
`facade-recedes-from-view` means the wall it met runs away from the camera, so the recorded
screen coverage would demand an implausibly long sign. `resolved-wider-than-mount-allows`
and `host-beyond-reference-range` both mean the ray flew past the intended mid-distance
building and struck something far behind it. A `placement-audit:` reason means the slot
found a wall but failed the shared sign audit — it overlapped an existing sign, stood off
its facade, or projected over the roadway.

## Artwork

The generic city atlas spreads 32 tiles across roughly 600 signs, so each tile is 256x512
at HIGH and each tile is shared by many faces. That is the cause of the repeated-sticker
look: one subtitle string appears on four visible panels at once, every panel follows the
same pictogram/brand/subtitle composition, and no tile has the pixels to carry legible
type.

`src/signs/reference-art.mjs` gives the 30 reference advertisements their own sheet: 4096
square at HIGH in a 5-column grid, so each panel gets 819x683, more than four times a city
tile. Medium and low fall back to 2048 and 1024. Each panel is an individually composed
reconstruction, not a recoloured template.

Printed panels and self-lit displays render through separate materials so night emission
can differ by light source: `signs-reference` at 1.45 and `signs-referenceVision` at 2.3,
against `signs-print` at 1.15. The sheet costs one texture and two batches.

`tests/reference-art.test.mjs` enforces the property the generic atlas lost: no two panels
may draw identical text, no line may appear on more than two panels, and the sheet must
carry distinct backgrounds.

## Brand artwork policy

Every panel is drawn from scratch with canvas primitives. No official logo file, brand
font or third-party asset is downloaded or committed. These are recognisable
approximations for a streetscape reconstruction, not reproductions of trademark artwork,
and the positions come from a single reference frame — they are approximations, not a
surveyed advertising inventory.

## Not verified

Rendering was inspected through a headless Chromium using the SwiftShader software
renderer. That is enough to confirm composition, placement and that materials compile, and
it is **not** a frame-rate, startup-speed or visual-acceptance measurement. Any FPS figure
observed in that environment is meaningless for the real target. Settled HIGH day/night
inspection on a GPU remains required.
