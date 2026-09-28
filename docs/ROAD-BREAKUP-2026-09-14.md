# Road light breakup

Replaced regular sine striping with world-space smooth noise: broad wet patches and smaller stretched detail. Screen derivatives fade fine detail at distance. Noise is evaluated once per asphalt fragment, shared across four art-directed light sources; no new draw calls, lights, or textures. This remains an emissive approximation, not true reflected scenery.

Five targeted tests and TypeScript typecheck passed. Browser inspection through computer-use showed the scene rendering and more readable advertisement colors from the previous pass. Road color spill is now subtle and still does not match the reference wet-road appearance; no final visual or performance acceptance is claimed. Stage 4 remains in progress.
