# Stage 4: reference night road spill

Target: user-supplied night image (codex-clipboard-61e88e0c-4fa8-4d36-a721-8f8e1707e8d2.png).

Add four soft directional blue/red/amber light streaks to the existing asphalt material. Fixed world-space sources are art-directed approximations; this is not a true reflected image, SSR or ray tracing. Procedural grain prevents perfectly smooth strips. Markings and sidewalks retain their existing shaders. Day/night uses the existing shared uniform, including the solar transition; no new textures, geometry, lights or draw calls.

Validation: seven focused tests and typecheck pass. New test verifies asphalt-only injection, day/night uniforms and unregister cleanup. Browser QA could not finish: Chrome connection timed out, then reported Debugger unattached after reconnect. GLSL runtime compilation and visual intensity must be checked before visual acceptance. No claim of matching the reference or performance improvement.

Next: verify intensity from fixed night/day camera, tune glare and spill, then work on storefront/sidewalk warmth. Stage 4 remains in progress; later stages are not complete.
