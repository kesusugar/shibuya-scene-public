# Asphalt surface relief

Added subtle bump relief using the existing asphalt texture, with no additional texture allocation or geometry. Ground disposal now deduplicates shared map/bump resources. This affects the physically shaded material, not the art-directed emissive spill. Six targeted tests passed. Browser visual acceptance remains pending; stage 4 is still active.
