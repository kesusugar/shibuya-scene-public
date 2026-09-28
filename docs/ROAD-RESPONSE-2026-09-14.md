# Wet response calibration

Follow-up to the visually underpowered road breakup pass: raised the dry floor and wet peak while retaining world-space variation and distance filtering. At a wet mask of 0.5, the distant multiplier is now 0.6372 instead of 0.308. This is a shader-response calculation, not measured screen luminance.

Exported immutable response parameters and added bounded-response regression checks. Six targeted tests pass. No global exposure, lighting, signage, geometry, or traffic changes. Visual acceptance is pending; this is still an art-directed emission approximation and stage 4 remains open.
