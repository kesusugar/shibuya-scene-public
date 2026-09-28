# RUN S9 — Traffic System

## Current development and collaboration

This repository is now developed beyond the historical RUN S9 baseline described below. Read [the current implementation status](docs/IMPLEMENTATION-STATUS.md) before editing. Shared agent rules are in [AGENTS.md](AGENTS.md), Claude Code setup is in [CLAUDE.md](CLAUDE.md), and the GitHub branch/PR workflow is documented in [docs/COLLABORATION.md](docs/COLLABORATION.md).

On Windows, install dependencies with `npm ci` and start the local preview with `npm run dev:local`. The printed local URL is authoritative.

S9 adds directed OSM traffic lanes, left-side travel, curved legal connections, seven procedural vehicle types, pooled movement and selected curb parking. Following uses nearby spatial buckets and a 25m route lookahead; intersection entry checks reserve exit space. Signals expose a read-only-by-convention S10 interface (`signalAPI.getSignalState`, `getPedestrianPhase`, `getCrossingTrafficState`). No pedestrians, trains, gameplay or night lighting are implemented.

Traffic densities start at HIGH 62 / MEDIUM 30 / LOW 14 moving vehicles, plus parked vehicles. Safety and available route capacity take priority. Cars follow a conservative route graph; unusable continuations and stuck traffic recover through the fixed pool. S8 physical signals receive shared colored lens instances. Existing renderer profiles, cameras and debug controls remain.

`?debug=1` adds lane direction arrows, graph nodes, stop-line references, moving future paths and per-vehicle/signal statistics. `?only=traffic` or `?skip=traffic` isolates the module. Quality changes reuse vehicle geometry/materials. S0–S8 runtime modules remain unchanged.

Run `npm test` for build and regression checks, then `node scripts/report-traffic.mjs` to summarize S9 evidence. See `evidence/s9/S9_REPORT.txt` for traffic graph counts, profile counts, three-minute audit, CPU timing, visual QA limits and recovery statistics. No S10+ or GTA additions.

## Historical S8 record

# RUN S8 — Streetscape

Only S8 implemented over S7 b0a9257. Deterministic sidewalk-edge fixtures, mapped signal structures and trees, pole-to-pole sagging cables, shared furniture atlas and instanced geometry. Region weights and HIGH/MEDIUM/LOW density preserve the renderer profiles. Physical signal heads are static; streetlights have emissive metadata only.

S6 fixture scope is excluded. S7 HIGH sign volumes remain protected at every streetscape tier. Placements reject roadway/crosswalk/ramp/pedestrian-flow/building/station/sign conflicts and reserve an inland 1.2m walkway. Numerical clipping inputs are normalized to micrometre precision in S8 only. `?debug=1` enables category-colored bounds, orientation vectors, rejected anchors, station exclusion and region-colored density stems. Existing debug UI remains.

Run `npm test` for build and all regression tests; `node scripts/verify-streetscape.mjs` summarizes the generated S8 evidence and unchanged S7 baseline. See `evidence/s8/S8_REPORT.txt`. WebGL2 is unavailable in this validation browser; CPU generation, atlas creation and DOM/console checks are distinct from visual approval. Long synchronous generation may pause startup/profile switches. No S9+ systems or GTA features.

## Historical S7 record

# Shibuya Scene Reconstruction — RUN S7

S7 adds original Canvas city signage, facade anchors, region density, Hero screen treatments and placement audits. Inspect `?tier=high&camera=center-gai`; use the existing `signs` switch to compare. Add `&debug=1` for colored anchors, normals, bounds and rejected candidates. S8+ is not implemented.

HIGH: 763 signs / Center-gai260 / 2 atlases / 4 materials / 4 batches / 10,744 added triangles. MEDIUM520 and LOW248 signs. Automated tests160 PASS and build PASS. Placement audit major0/minor0. Runtime console, WebGL screenshots and FPS are unverified in this run because the provided browser connection timed out; do not treat this as Visual PASS.

See `evidence/s7/S7_REPORT.txt`, `geometry.json`, `placements.json` and `signage-density-cpu.png`. Reproduce with `node --test tests/*.test.mjs`, `node scripts/verify-signage.mjs` and `python3 scripts/plot-signage.py`. The CPU map is not a rendered screenshot. Existing S0–S6 source and dependency versions remain unchanged.

## Previous S6 record

S0 conditional PASS; S1–S5 PASS. S6 adds station detail, rotary/plaza furniture and original under-viaduct storefronts only.

- Inspect `?only=ground,buildings,heroes,station,stationDetail,data,geo&camera=hachiko`. Existing cameras remain unchanged. `stationDetail` disposes/rebuilds only S6; profile changes adjust its density. Add `&debug=1` for S6 fixture bounds, wires and signal directions.
- `src/station-detail`: configuration, station-only Canvas atlas, placement model, independent penetration audit, instanced/merged rendering and debug lines. Existing S0–S5 modules are unchanged.
- `npm test`: build + 142 tests. Reproduce CPU evidence: `node scripts/verify-station-detail.mjs`, then `python3 scripts/plot-station-detail.py` (numpy/matplotlib).
- MEDIUM: 44 platform fixtures, 27 station sign faces, 5 vending machines, 10 benches, 49 catenary supports, 504 wire segments, 8 rail signals, 14 rotary/plaza props, 2 shelters, 8 storefronts across 4 archetypes.
- S6 adds 16,540 triangles, 9 materials, 12 batches, 1 shared 1024px Canvas atlas. Known combined scene: 334,032 triangles, 40 materials, 50 batches, 3 textures excluding S1 debug lines.

Japanese report and all evidence: `evidence/s6/S6_REPORT.txt`. S5 minor11 preserved; S6 new major0 / minor3 (sidewalk planter, bench and map board). Large sidewalk shelter candidates are excluded. Locations/clearances and procedural approximations are recorded.

WebGL2 rendering, real camera screenshots and FPS remain unverified. CPU density maps and CAM-05 proxy projection are not WebGL screenshots. Canvas artwork is original static illustrative information; no live schedules. No S7+, citywide signage, traffic, moving trains, GTA or deployment.

## Historical S5 record

# Shibuya Scene Reconstruction — RUN S5

S0 conditional PASS; S1–S4 PASS. This revision implements Station Core only.

- Inspect `?only=ground,buildings,heroes,station,data,geo&camera=hachiko`. The existing station switch disposes/rebuilds owned resources. Fixed cameras are unchanged.
- `src/station/alignment.mjs`: source classification, exact endpoint joins, deduplication and clipping. `config.mjs`: IDs, POC elevations and widths. `model.mjs`: procedural core and support/penetration audit. `render.mjs`: 11 shared materials and 15 batches.
- `npm test`: build and 121 tests. Reproduce CPU evidence with `node scripts/verify-station.mjs` then `python3 scripts/plot-station.py` (matplotlib).
- 96 rail sources: JR33 / Ginza7 / other56. Generated: 4 JR tracks, 4 Ginza main/approach lines, 3 platforms, Hachiko core, 3 pedestrian decks and 1 mapped stair.
- Station 75,568 triangles; combined known scene 317,492 triangles / 38 estimated calls excluding debug lines.

Complete Japanese report: `evidence/s5/S5_REPORT.txt`. Metadata, reservation/rail/penetration/endpoint audits, tests/build/console logs and CPU plan/elevation figures are alongside it.

WebGL2, fixed-camera rendering and FPS remain unverified. No major road/crossing blockage in CPU audits; 11 minor sidewalk support overlaps remain recorded. Geometry uses inferred local elevations; support spans, station interfaces, perimeter clipping and the closed deck continuation are documented POC limitations. No later detail modules, moving trains, GTA or deployment.

## Historical S4 record

# Shibuya Scene Reconstruction — RUN S4

S0 conditional PASS; S1/S2/S3 PASS. S4 adds eight Hero landmarks across nine reserved OSM footprints. Five station reservations remain untouched.

- Inspect `?only=ground,buildings,heroes,data,geo&camera=overview`. The `heroes` switch disposes and rebuilds the module using the existing lifecycle.
- `src/heroes/config.mjs` centralizes IDs, heights and references; `model.mjs` handles source-aligned mass/axes/anchors; `builders.mjs` supplies dedicated landmark masses; `render.mjs` merges material channels and instances repeated details.
- `npm test`: build + 101 tests. CPU evidence: `node scripts/verify-heroes.mjs`, then `python3 scripts/plot-heroes.py` (matplotlib).
- Hero 33,170 triangles, 8 materials, 10 batches. Combined Ground/Generic/Hero 241,924 triangles, 23 estimated calls excluding debug lines.
- `evidence/s4/S4_REPORT.txt` contains IDs, heights/bounds, references, verification and known limitations. Metadata, console logs and CPU figures are alongside it.

WebGL2/FPS and fixed-camera visual quality remain unverified in this environment. CPU figures are not rendered scene screenshots. Two small Hero road-edge overlaps remain; no major road or crossing intrusion. Stream/Mark City West retain the existing perimeter clip. Future sign/emissive anchors are metadata and blank surfaces only. No later-stage systems or deployment.

## Historical S3 record

# Shibuya Scene Reconstruction — RUN S3

S0 conditional PASS; S1/S2 PASS. This version implements **Generic Buildings only**, on the unchanged S2 Ground. No deployment or later-stage builders.

- `npm ci`, `npm run dev`; `npm test` builds and runs **81 tests** (59 existing + 22 S3).
- Inspect `?only=ground,buildings,data,geo&camera=overview`; also `camera=scramble` / `camera=street`. Buildings can load independently and its switch disposes/rebuilds all owned geometry and materials.
- `src/buildings/config.mjs`: budgets, floor height, archetypes, centralized hero/station reservation. It reuses S1 HERO_IDS and reserves Mark City West plus overlapping station footprint.
- `model.mjs`: polygon/holes/self-intersection/triangulation validation, bounds clip, height priority, archetype/frontage metadata, safe roof placement, reason-coded exclusion. IDs seed variation; no input mutation.
- `render.mjs`: OSM extrusion walls + triangulated roofs merged into two vertex-colored meshes. Three window styles share one PlaneGeometry. Trim/balconies and rooftop boxes share a BoxGeometry; tanks/masts share a cylinder. Seven materials and eight batches, not one mesh per building/window.
- `lifecycle.mjs`: abort/generation guards prevent stale async loads from resurrecting disabled geometry.

378 generic buildings / 14 reserved sources / 274 excluded sources (236 outside target). All seven archetypes generated. Windows 38,060; rooftop props 701; 160,925 building triangles. Ground + Buildings: 208,754 triangles / 13 estimated calls. Figures exclude S1 debug outlines.

Reproduce CPU evidence: `node scripts/verify-buildings.mjs`, then optional `python3 scripts/plot-buildings.py` (matplotlib). `evidence/s3/S3_REPORT.txt` contains the complete Japanese report, metrics and limitations; geometry.json contains the exact Ground overlap audit; building-metadata.json contains per-building heights, frontage, roof placements and source exclusions. The CPU map is not a WebGL screenshot.

WebGL2/FPS/camera rendering remain unverified in this environment. CPU bounds, transformed instance vertices and rooftop containment pass. 85 road-edge surface overlaps remain documented (none meet the >25% and >10m² gross-overlap threshold); crossing stripe overlap is zero. No footprint deformation to hide source/road-width discrepancies. Shared walls may carry hidden windows; visual quality, clipping at the perimeter and inferred heights require later visual review. No night behavior, signage or hero geometry was added. S3 generation is synchronous, roughly one second here; this is not a GPU frame measurement.

## Historical S2 / S1 record

# Shibuya Scene Reconstruction — RUN S2

S0 conditional PASS / S1 PASS. S2 adds Ground only. No later scene modules, gameplay or deployment.

Run `npm ci`, `npm run dev`; `npm test` builds and runs 59 tests (42 existing + 17 S2). Inspect `?only=ground,data,geo&camera=overview`, `camera=scramble`, `camera=street`. Ground loads independently of data-outline visibility; Ground OFF restores outlines. Fixed cameras and S0 controls are preserved.

`src/ground/config.mjs`, `model.mjs`, `render.mjs` use existing S1 metric coordinates, triangulation/merge, RNG and spatial index. S1 sources are unchanged. Polygon-clipping (MIT, package-lock pinned) provides boolean operations. Segment rectangles and rounded joins tolerate repeated/short/reversing/self-crossing paths; X/Z clipped to ±250 m. Width priority: metric width > lanes × 3 + 1 m > class default. Elevated/tunnel/nonzero-layer geometry is excluded.

Central junction envelope uses OSM scramble crossing anchors. Four main crossings and one diagonal retain OSM directions; southern parts are joined, endpoints extended to road edge. Duplicate normal crossings are excluded within configured 40 m central radius. Other marked footways/crossing/signal points yield normal crossings; unmarked/informal/no tags excluded.

Sidewalk bands 3 m, curb height 0.15 m, ramps interpolate distance to road boundary over 1.5 m. Spatial index and adaptive subdivision resolve ramps. Sidewalk excludes curb tops; paint and tactile polygons are unioned before merge. Five material batches with deterministic procedural asphalt/sidewalk DataTextures and Ground-owned inspection daylight. Night/time remains a stub.

Evidence in `evidence/s2`: geometry.json, tests.log, build.log, browser.txt, ground-plan.png and S2_REPORT.txt. Other tests-s2 logs are intermediate development records. CPU plan is not a WebGL screenshot. Reproduce with `node scripts/verify-ground.mjs`, optionally `python3 scripts/plot-ground.py` (matplotlib).

Known constraints: WebGL2 unavailable; rendered camera views, Z-fighting, lighting, GPU calls and FPS unverified. CPU generation is synchronous (~8 seconds here), not a frame-time measurement. Generic sidewalk widths, road fallback widths, central envelope and signal-derived crossings are POC approximations, not surveyed curb geometry. No subagents used. No later build hooks added.

## Historical S1 record

# Shibuya Scene Reconstruction — S1

S0: conditionally PASS per user. Its WebGL limit remains an environment constraint. S0 foundation.mjs, camera definitions, styling and tests are preserved; app/page.tsx only integrates S1 and updates RUN labels. No gameplay or later-RUN systems. Not deployed.

Node >=22.13; npm ci; npm run dev. npm test builds and runs the tests. WebGL2 is needed to view raw diagnostic lines, not to validate OSM data or Geo utilities.

S1 implements OSM XML import and normalized JSON loading; coordinate conversion; polyline length/sample/tangent/heading/resample/extend/clip/offset; polygon bounds/membership/holes/triangulation/extrusion; geometry merge/transform/color/ribbon; seeded RNG; InstancedBuilder; spatial grid. Scene objects are only four batched LineSegments. Geometry helpers are not instantiated as Ground/Buildings/Station.

Coordinates [x,z]: metres, X east, Z south; Y up in Three.js. Origin 35.6595,139.7005 unchanged. Local equirectangular approximation is for this sub-kilometre scene only. Scramble node/291758776 is 6.84m from origin.

Counts: 666 buildings, 306 road parts, 648 footway parts, 96 rail parts, 118 crossings, 49 signals, 24 trees, 30 areas, 1176 POIs. Polygon/line IDs are typed OSM IDs; part distinguishes separate clipped parts or outer rings. sourceNodeIds records original way nodes, not clipped-point indices. Tags preserve width, lanes, bridge, tunnel, layer, oneway, height/levels. Unknown heights remain null.

Line clipping bounds X[-300,365], Z[-340,300] buffer the main ±250m area. Intersecting building/area polygons remain whole: total bounds X[-342.6,415.5], Z[-445.0,491.2]. This prevents severing boundary footprints. Offset is capped-miter, not self-intersection removal. Polygon helpers expect simple valid rings; bundled building polygons receive exhaustive area checks. Multipolygon relation outer/inner member ways are joined; incomplete geometry is reported. Type=building assemblies use constituent footprints, not an invented union. Polygon union/difference and junction surfaces belong to S2.

HERO_IDS is centralized in src/data/normalize.mjs. 11 anchors include QFRONT, 109, MAGNET, Scramble Square, Seibu A/B, Mark City East, Stream, station, Hachiko exit and scramble. Station way/904652357 and entrance node/6223298623 are validated by tags; the similarly named bus stop is not used. Mapping tags are not an independent survey of station layout.

?only=data,geo,debug enables diagnostics; ?skip=data disables dataset loading and report. Data owns world diagnostic lines; S0 debug retains overlay ownership. Request generation checks prevent stale async completions; teardown disposes buffers/materials. Full JSON is not retained after building outlines and the report.

Reproduce the exact snapshot: decompress data-source/shibuya.osm.gz; run python scripts/data/import-osm.py SOURCE.osm RAW.json; then node scripts/data/normalize.mjs RAW.json. That script metadata describes this fixed snapshot, not the time of a future refresh. Source provenance and ODbL attribution are included.

Workspace maintenance removed the first uncommitted S1 checkout. This source was reconstructed from the visible implementation record and surviving OSM bytes. See evidence/s1 for validation of this restored copy. STOP after S1; no deployment.

RUN S10 adds pooled procedural pedestrians, OSM sidewalk routing, signal-coordinated crossings, local avoidance and quality/LOD profiles. Run `node --test tests/s10-crowd.test.mjs` for the integrated 180-second crowd/traffic audit. Detailed counts and validation limits are recorded in evidence/s10/S10_REPORT.txt. S11 and later stages remain out of scope.

## Licences, credits and third-party material

- Third-party code, map data, characters, motion capture, textures and sounds, each with its licence and source: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Licence texts: `LICENSES/`, `public/licenses/`, `data-source/LICENSE.txt`; pinned upstream records: `assets/*/upstream.lock.json`.
- Map data © OpenStreetMap contributors, ODbL-1.0.
- Motion capture: "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217."
- Real brand and building names shown on in-game signs are the trademarks of their owners. The signs are drawn procedurally for a streetscape reconstruction; no official logo artwork is included, and no affiliation or endorsement is implied.
- This repository's own code has no licence chosen yet; until one is added, all rights are reserved by the author.
- Security issues: see [`SECURITY.md`](SECURITY.md).
