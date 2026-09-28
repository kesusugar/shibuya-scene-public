# RUN 2 — Humanoid character asset pipeline

Stopping point, as agreed. The player is a real skinned humanoid; the near-NPC pool is not yet
(STEP 4-6 below). Nothing is pushed.

Evidence: `evidence/run2-character/`. Licence trail: `docs/CHARACTER-ASSET-PROVENANCE.md`.

---

## 1. Before

`evidence/run2-character/step1-before-baked-close.png`

The offline-baked figure. Six meshes, 2,083 vertices, 3,772 triangles, **11 bones**, 12 clips,
1.737 m. Limbs are jointless capsules: the upper and lower arm are two tubes that meet without
an elbow, the head is a featureless block on no neck, and the shoulder is a sphere that overlaps
the torso rather than deforming with it. It reads as a mannequin because it is one.

## 2. After

`evidence/run2-character/step2-after-humanoid-close.png`, same camera, same spot, same crowd.

Three meshes, 9,240 vertices, 15,619 triangles, **65 bones** (25 animated), 15 clips, 1.760 m.
Real deltoids, a working elbow and knee, a face, hair, and a walk cycle with a stride instead of
a swing. `evidence/run2-character/step1-asset-clips-and-palettes.png` shows six of the clips
across six palettes from one uploaded mesh.

## 3. Character polycount

| | baked | humanoid |
| --- | ---: | ---: |
| meshes | 6 | 3 |
| vertices | 2,083 | 9,240 |
| triangles | 3,772 | 15,619 |
| bones | 11 | 65 (25 carry keyframes) |
| clips | 12 | 15 |
| height | 1.737 m | 1.760 m |

4.1× the triangles. The hairstyle (757 vertices, 1,301 triangles) is inside that figure, merged
into the body rather than drawn beside it.

## 4. Draw calls

Measured directly, not inferred: `evidence/run2-character/step3-cost-per-character.png`, from
`qa/gta-upgrade/charbench.html`, which renders N figures into an otherwise empty scene and reads
`renderer.info`.

| figures | baked calls | humanoid calls | baked triangles | humanoid triangles |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 6 | **3** | 3,772 | 15,619 |
| 4 | 24 | **12** | 15,088 | 62,476 |
| 32 | 192 | **96** | 120,704 | 499,808 |

Shadow casting doubles both columns, because the shadow map is a second pass over the same
meshes.

**The humanoid halves draw calls and quadruples triangles.** Half, because the baked figure is
six meshes — one per colour, since a flat material was the only way it could have more than one
colour — while the humanoid is three: body, eyes, eyebrows. The garment mask is what collapses
the body to one, since colour now comes from uniforms rather than from splitting the mesh.

For context, the full scene at `tier=high` with the crowd at 1,978 measures 359 draw calls and
4,170,519 triangles. Thirty-two humanoid near-NPCs would therefore add about 27% to draw calls
and 12% to triangles — before any LOD. That is the number STEP 6 has to live inside.

## 5. Character payload

| | bytes | brotli |
| --- | ---: | ---: |
| `public/data/character/citizen.glb` | 1,443,376 | **481.1 KiB** |
| `public/data/character/citizen.json` | 2,111 | — |

From 20.7 MiB of verified upstream. What came out: 28 of 43 clips dropped, all scale tracks
dropped (constant 1 across the library), finger keyframes dropped (40 of 65 bones, two thirds of
every clip, replaced by one relaxed pose baked into the rest transform), three UV sets and both
vertex-colour channels dropped, skin weights quantised to bytes, and 12 MiB of 4K superhero
textures replaced by a four-byte-per-vertex garment mask.

## 6. Initial payload impact

**Zero.** The startup path does not reference the humanoid. It is fetched on entering player
mode, not before, so somebody who only looks at the city never downloads a body.

This was verified rather than assumed: the measurement run blocks `fetch` for
`data/character/*`, enters player mode, and the scene runs normally on the baked figure
(`status: "failed"`, no console errors, no lost context). The bundle is unchanged — the baked
figure is still 228.4 KiB in source, 22.7 KiB compressed, and still what the first frame draws.

## 7. Loading behaviour

`src/player/deferred-character.mjs`, following the pattern `deferred-vehicle-visual.mjs` already
set.

- Requested once, on entering player mode.
- While it loads, the baked figure is on screen and being animated. There is no gap and no
  placeholder.
- When it lands, a new figure is built on the humanoid asset, updated to the player's current
  state before the old one is removed, and swapped. The transition is not visible as a pop
  because both figures are in the same pose.
- On failure the baked figure simply stays, and retries are rate-limited to one attempt per
  eight seconds. A permanently offline asset costs one failed request.
- Disposal during loading cannot resurrect anything.

Measured here: transfer 16 ms (localhost), `loadMs` 19.8 s / 23.6 s / 32.4 s across three runs.
**Those load times are not a payload figure.** This environment renders through SwiftShader at a
fraction of a frame per second, and that time is `GLTFLoader.parse` plus skinning setup on a
starved main thread, not the network. Real-hardware parse cost is unmeasured and marked
実機確認待ち.

## 8. Animation clips

Fifteen, renamed from the library to the names the player state machine already used:

| Shibuya | upstream | loop | authored speed |
| --- | --- | --- | --- |
| Idle | `Idle_Loop` | yes | — |
| Walk | `Walk_Loop` | yes | 0.975 m/s |
| Run | `Jog_Fwd_Loop` | yes | 5.357 m/s |
| Sprint | `Sprint_Loop` | yes | 8.250 m/s |
| Punch | `Punch_Jab` | no | — |
| PunchCross | `Punch_Cross` | no | — |
| Hit | `Hit_Chest` | no | — |
| Startle | `Hit_Head` | no | — |
| Guard | `Crouch_Idle_Loop` | yes | — |
| Enter | `Sitting_Enter` | no | — |
| Exit | `Sitting_Exit` | no | — |
| Drive | `Driving_Loop` | yes | — |
| Interact | `Interact` | no | — |
| Fall | `Death01` | no | — |
| Death | `Death01` | yes | — |

`Drive`, `PunchCross` and `Interact` are shipped and unused: they belong to RUN 8, RUN 10 and
the objective system. `Drive` in particular is a seated pose with both hands at a wheel, which is
what RUN 10 needs and what no amount of authoring would have produced here.

The authored speeds are measured, not guessed — read out of the root-motion variant of the same
library, because the clips we ship have root motion disabled and therefore carry no record of
the speed their stride was drawn for.

## 9. Licence

CC0-1.0, both packs, verified against hashes that five unrelated third parties independently
recorded for the contents of the official archive — including one that CRC-verified the itch.io
zip and published the hash of the licence file inside it. Both bundled licence files were fetched
and hashed here and both match. `npm run fetch:character` re-checks every byte on every run and
fails loudly on a mismatch; this was confirmed by corrupting a byte.

The one thing that could not be done: downloading from Quaternius directly. `quaternius.com` and
`quaternius.itch.io` are refused by this environment's egress proxy. Full statement, including
what that does and does not prove, in `docs/CHARACTER-ASSET-PROVENANCE.md`.

Nothing upstream is committed. `assets/character/upstream/` is git-ignored; the only committed
artefact is the Shibuya-specific conversion.

## 10. Known visual limitations

Judged from the screenshots, and honest about which ones I cannot judge here.

**Self-reviewed, visible in the evidence:**

1. **The body is a heroic build.** The free Standard edition's male body is the "Superhero"
   mesh: broad lats, thick arms, the arms held wide because the lats push them out. It is a
   plausible person but not a plausible Shibuya commuter. This is the mesh, not the pipeline —
   it is exactly the thing item 11 exists to replace.
2. **Short sleeves show a lot of that arm.** The garment mask puts the sleeve hem at the elbow
   (upper arm is shirt, forearm is skin). Moving the forearm into the shirt region is a one-line
   change in the converter and would read as a jacket, which suits the city better. Left alone
   deliberately, so the region map stays the obvious thing rather than the tuned thing until
   RUN 6 decides what citizens wear.
3. **One body, one hairstyle, one face.** Fine for the player. Visibly wrong for a crowd, and
   RUN 6's problem. The female body and two more hairstyles are already verified and available;
   the converter takes them as a constant.
4. **The player casts no contact shadow.** The crowd has `src/life/shadows.mjs`; the player
   figure was never wired into it and still is not. More obvious now that the body is good
   enough to look at.
5. **Run and Sprint will play floaty.** The clips are authored at 5.36 and 8.25 m/s; the game
   runs at 3.1 and 4.2. With the measured gait feeding `timeScale`, that is 0.58× and 0.51×
   playback — correct footfall timing for the wrong stride length. Walk is fine (1.55 against
   0.975 = 1.59×, a brisk walk). The real fix is either a Walk↔Jog blend or raising the player's
   run speed towards the clip, and both are RUN 4.

**Not judgeable here, 実機確認待ち:**

6. Foot sliding and motion quality generally. This environment renders at a fraction of a frame
   per second; a still frame cannot show whether a foot is planted.
7. Whether the crossfade between clips reads as a transition or a snap.
8. `Guard` is mapped to `Crouch_Idle_Loop` on reasoning, not on having watched it play.

## 11. Readiness for the final character

The seam is `src/player/character-asset.mjs`. Nothing else in the game knows what a character is
made of — the controller, the camera, combat, the vehicle transition and the near-NPC pool all
talk to a figure, and a figure talks to an asset:

```
{id, height, scale, gait, bones, template, instance(palette), dispose()}
instance() -> {root, clips, recolour, setHeight, dispose}
```

Two providers exist and are swapped at runtime today, which is the proof that the seam holds:
`bakedCitizen` (11 bones, in the bundle) and `humanoidCitizen` (65 bones, fetched). They disagree
about vertex count, bone count, bone names, height, clip durations and authored gait, and the
game does not notice.

Replacing Quaternius with a photorealistic GLB therefore means producing:

- the same fifteen clip names, on a skeleton whose bones those clips address;
- a `citizen.json` giving height and measured gait;
- optionally a garment mask in `COLOR_0`, if the new body should be tintable per citizen rather
  than textured.

It does not mean touching gameplay code. Three things in `figure.mjs` were hard-coded to the
baked figure and are not any more: clip durations for scrubbed animations (`Punch`, `Hit`,
`Enter`, `Exit`) now scale by the clip's own length, a missing clip falls back to Idle instead of
throwing, and the near-NPC pool recolours through the asset's wardrobe instead of reaching for a
material by name.

---

## Not done in RUN 2

STEP 4 (one near NPC), STEP 5 (four) and STEP 6 (the full HIGH pool) are not done. STEP 3's
numbers are the reason to pause: 32 humanoids is 96 draw calls and 499,808 triangles, roughly
+27% draw calls and +12% triangles on the full scene, with no LOD and no decimated body yet. The
pool works — it is already asset-driven and already recolours through the wardrobe — but putting
the humanoid into it without an LOD first would be the "quietly reduce quality later" outcome
this project avoids.

## Bug found and fixed on the way

The rework initially dropped `Skeleton.dispose()`. `SkeletonUtils.clone` rebinds onto a fresh
skeleton, and a skeleton owns a bone texture, so every released pool slot leaked one texture per
mesh. Caught by the cost bench, whose texture count climbed monotonically across runs (12 → 678)
instead of returning to baseline. Fixed, and `tests/character-asset.test.mjs` now asserts a
released citizen's bone texture is gone and that its skeleton is not the asset's.
