# Spatial wet roughness

Asphalt now uses the same world-space wet mask for material roughness as for color spill. At full nightglow, roughness varies from 0.82 (dry) to 0.28 (wet). Daytime and zero nightglow retain the existing material response. Sidewalks and crossing paint are excluded. No additional geometry, lights or textures.

Six targeted tests passed. Computer-use browser inspection before and after confirmed visible scene rendering, but the overhead gloss difference remains subtle; target reflection quality is not accepted. This is not a reflected-scene implementation. Stage 4 remains active; stages 2–3 also retain their documented acceptance gaps, and stages 5–7 are not complete.
