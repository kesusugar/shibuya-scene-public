# RUN S16.3 — Render / Material Fidelity

Base:06a8f89 / Visual QA v13. Current: commit containing this report; saved QA version reported in the handoff.

## Implemented
- HIGH keeps DPR1.5. Existing ACES Filmic and sRGB remain. New pipeline: linear beauty → half-resolution GTAO + Poisson denoise → bounded existing-style bright extraction/composite → gentle night grade → SMAA → OutputPass. The installed Three r185 SMAA requires linear-sRGB input, so it precedes the final ACES/output conversion. No double tone mapping.
- GTAO radius2.5, thickness1.5,12 samples, blend.85; denoise2 rings/12 samples. Existing normal/depth buffer alpha stores noAO flags; excluded emitter samples do not occlude neighbouring geometry, and blend bypasses them after denoise. Signs/glow/halos are excluded without a separate mask scene render. Shadow maps are not recomputed for the normal pass.
- HIGH directional shadow map2048, radius2, bias-.0006, normalBias.06, crossing-focused85m frustum. Body/head/hair and selected city masses cast; opaque surfaces receive.4096 is deferred until performance is measured.
- Sky-generated PMREM DAY/NIGHT textures cached once at128 cube resolution; environment intensity.8/.55. MEDIUM reuses the same lightweight environment approach; LOW bypasses it. Maps are disposed with the scene. No external HDR asset.
- Shared PBR classes differentiated: wall roughness.85/metalness.02/env.45; glass.24/.55/1.3; shop.20/.45/1.35; tower.22/.65/1.35; trim.38/.7/1.0; Hero white.55/.05. Generic building material count remains7.
- Rounded capsule torso/limbs, larger11×8 heads and rounded hair. Eight shared geometry pools and InstancedMesh retained; three shared body/head/hair materials (.9/.7/.8 roughness). No SkinnedMesh or mixers. Crowd behavior,85% choreography allocation,420/210/95 budgets and sign placements/counts unchanged.
- Four non-shadow local PointLights at key Scramble corners in HIGH, two in MEDIUM, zero in LOW; intensity zero in DAY without changing the tier's light count. Existing fake pools/wet/reflections retained.
- At most8 existing Hero screens get one shared additive halo batch. Existing atlas map+emissiveMap and artwork preserved. Sign stats account for this extra batch/material; no new sign identities.
- Hardware-capped anisotropy8 for ground and4 for mapped signs/other selected textures, with mip filtering. Existing sRGB texture declarations retained.
- HIGH night grade: small saturation/S-curve adjustment, restrained cool shadow lift and subtle vignette. Neutral highlights and existing Bloom.18 retained. Light DAY/NIGHT distance fog; no SSR, DOF, motion blur or heavy bloom stack.

## Verification / limits
-41 unique relevant tests PASS, including6 new fidelity tests. Existing S10 material-count assertion updated from1 to3 because this run explicitly requires body/head/hair response separation. Other crowd logic and placement assertions retained. No unrelated180-second simulations rerun.
- CPU renderer fixture geometry: HIGH271528 / MEDIUM135776 / LOW61414 crowd triangles,8 batches,3 materials. These are geometry counts from the renderer regression fixture, NOT full-scene GPU drawn triangles or actual-frame metrics. One representative actor638 triangles, head108 vertices.
- Build result recorded in verification.json. Existing large-chunk / route-classification warnings remain.
- Browser setup was re-established after the session reset. CAM03 DAY/HIGH preview navigation timed out. Console read was explicitly rejected by the Cloud browser URL policy; no workaround, alternate browser or retry followed. Visual QA, GPU shader compilation, actual AA/AO appearance, local-light balance and performance remain BLOCKED.
- No actual FPS/GPU draw-call measurement or fabricated baseline images.30fps and freeze-free HIGH acceptance are not claimed. Test/build success does not prove the new GPU pipeline visually correct. Please inspect CAM03 DAY and CAM02 NIGHT on a real device before treating this look as accepted.
- MEDIUM/LOW retain the legacy inexpensive postprocess path; HIGH allocations stay cached until scene disposal. Real-device memory/performance cost and potential shader/runtime issues remain unverified.
- Existing untracked logs preserved. No reference source/assets copied; official installed Three addons are reused. S17/S18/GTA not implemented. STOP after QA update.
