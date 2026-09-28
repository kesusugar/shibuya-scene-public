# Retail artwork / geometry alignment

Stage 5: one shared 12-bay layout now drives retail artwork and physical window spacing. Added physical door jambs, lintels and handles at the three painted entrance bays. All additions reuse the existing metal batch; no textures, lights or draw calls added. These remain surface details, not navigable interiors.

Seven targeted tests and typecheck passed. Computer-use inspected Scramble Street in night and day; the scene renders, but this distant camera does not establish precise handle alignment. Final close-up acceptance remains open.

Investigation: street-level pavement appears tiled. Raycasts against the generated ground at x=0,-10,10 and z=0 hit upward-facing asphalt at y=0 before land at y=-0.08, rejecting the missing/downward-ground hypothesis at those locations. Runtime pavement appearance remains unresolved; stage 4 is not complete.
