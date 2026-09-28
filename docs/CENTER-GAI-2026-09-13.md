# Center-gai advertising and crossing queues

## Implemented

- 16 business-specific artwork treatments based on the supplied references: English school, mobile, clinic, beer, optician, books, glasses, ramen, employment, sauna, pharmacy, payment and live music. Colours, symbols, typography and panel proportions vary; no repeated design on one supplemented building.
- 20 wall advertisements, three floor directories, three rooftop billboards and an entrance arch across the mapped Center-gai pedestrian corridor. Five exterior stair flights and four overhead cable bundles.
- Night emission and an entrance camera that includes the arch. Camera changes live in the rendering entrypoint so the expensive static-model cache remains valid.
- Five dedicated mapped traffic streams, initially 28 queued cars outside the crossing. Cars follow one another during the permitted phase; pedestrian WALK still requires complete physical clearance of the crossing.
- Retained rotary buses; added sub-frame swept-body correction at the narrow bend.
- QA pack now includes Center-gai day and night, for nine views in total.

## Verification

- `node --test tests/ui-commercial-mobility.test.mjs tests/qa-capture.test.mjs`: 16 passed.
- `npm run typecheck`: passed.
- Three-minute traffic test: no body overlaps, road violations or stopped platoon cars inside the crossing at one-second audit intervals; rotary departures and returns continue.
- Two-minute crossing test: at least 20 platoon departures, at least seven simultaneously traversing cars (observed maximum nine), and a complete pedestrian interval with zero cars inside the crossing.
- Real Windows Chrome: nine-view QA download and visual inspection. The first pass identified a cropped arch, weak night emission, compressed arch lettering and facade overlap; those were corrected and the affected views rechecked.
- Static-model source key still matches the existing baked artifact. No full geometry rebake required.

## Scope

The new streetscape overlay and dedicated queues are HIGH-tier additions. Advertising is reconstructed procedurally from the reference, not an extracted copy of the reference site's textures. This pass does not claim exact reference geometry, lighting or crowd proportions. A controlled frame-rate/startup benchmark was not part of the final visual capture.
# Additional facade lighting

Added four distinct advertisements (20 artwork variants total), a corner-facing panel, cyan rooftop light strips, and warm ground-floor shop glazing along the front and corner. Night-only emission is separately controlled for advertisements, shop windows, and rooftop strips; daytime restores the original low emission. The overlay uses six merged batches including cables. QFRONT was inspected in the running browser after this change. The focused Center-gai uniqueness/geometry test and TypeScript check pass. Slim projecting sign density remains below the supplied reference.
