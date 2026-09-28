# Character asset provenance

What the playable humanoid is made of, where each byte came from, and how the licence was
checked. Machine-readable form: `assets/character/upstream.lock.json`.

## What is used

| Pack | Author | Licence | Official page |
| --- | --- | --- | --- |
| Universal Base Characters \[Standard\] | Quaternius | CC0-1.0 | `https://quaternius.com/packs/universalbasecharacters.html` |
| Universal Animation Library \[Standard\] | Quaternius, animation by Gonzalo Furnier | CC0-1.0 | `https://quaternius.com/packs/universalanimationlibrary.html` |

Both packs are the free Standard edition. The paid Source editions were not downloaded and are
not needed: the Standard editions ship the GLB/glTF the converter reads.

Used from them: one male body (`Superhero_Male_FullBody`), one hairstyle
(`Hair_SimpleParted`), and fifteen of the library's forty-three animation clips. Not used and
not downloaded into the build: the female body beyond a size check, the remaining hairstyles
beyond a compatibility check, and all seven 4K texture maps, which the converter replaces with
a vertex mask (see below).

## How the licence was checked

The requirement was to read the licence bundled in the download rather than trust a web page.
Two things made that awkward and one of them is still a limitation.

**The official hosts are unreachable from this build environment.** `quaternius.com`,
`quaternius.itch.io`, `opengameart.org` and `store.godotengine.org` are all refused at the
egress proxy (`403` to `CONNECT`); only `github.com` and `raw.githubusercontent.com` answer. The
archive therefore could not be downloaded from Quaternius here.

**So the bytes were verified instead of the source.** Independent third parties have published
the SHA-256 of the files inside the official archive. Those hashes were collected first, from
repositories with no relationship to each other, and only then were the bytes fetched from a
pinned public mirror and hashed. A mirror that had altered anything would have failed.

| File | SHA-256 | Recorded independently by |
| --- | --- | --- |
| `UAL1_Standard.glb` (7,618,436 B) | `69591853…67997` | `EveryoneHATEme/near-laugh`, `ridermw/bevy-concept-world`, `RamonLinares/atlas-09`, `clash-art/clash`, `chmajster/WroclawTheGame` — five unrelated repositories |
| UAL bundled `License.txt`, as shipped (CRLF) | `6d01f55c…ac061` | `EveryoneHATEme/near-laugh`, recorded after CRC-verifying the official itch.io zip |
| UBC bundled `License_Standard.txt`, as shipped (CRLF) | `0f4beaf0…3268e` | `ryan321/couchgames`, recorded as `original_sha256` before its own newline normalisation |
| `Superhero_Male_FullBody.gltf` / `.bin` | `e7fcea21…afeb4` / `459003f9…cd92f` | `ryan321/couchgames`, `chmajster/WroclawTheGame` |

`near-laugh` additionally records the official archive itself —
`Universal Animation Library[Standard].zip`, itch upload `17958403`, 15,904,933 bytes, SHA-256
`cc73fc4e…37724` — states that it CRC-verified that zip, and that the GLB extracted from it is
byte-identical to the hash above. That is the link from the archive Quaternius publishes to the
file this repository converts.

Both bundled licence files were fetched and hashed here. Both match. Their text:

> License: CC0 1.0 Universal (CC0 1.0) Public Domain Dedication
> https://creativecommons.org/publicdomain/zero/1.0/
> Models by @Quaternius

`npm run fetch:character` re-performs every one of these checks on every run and exits non-zero
on any mismatch. This was tested by corrupting a byte of the GLB: the run fails and names the
file.

**Remaining limitation, stated plainly.** The bytes are proven to be the bytes of the official
archive's contents. They were not downloaded *from* Quaternius in this environment, because the
environment cannot reach Quaternius. Five independent hash records and a CRC-verified archive
record are strong evidence, not a substitute for the original download. If the official download
is ever performed on a machine with normal network access, running `npm run fetch:character`
against it will confirm or refute this record without any judgement call.

## Redistribution

This repository does not redistribute the upstream packs.

- `assets/character/upstream/` is git-ignored. Nothing downloaded is committed.
- `assets/character/upstream.lock.json` is a record of hashes and URLs, not content.
- The only committed artefact is `public/data/character/citizen.glb`, which is a
  Shibuya-specific conversion: one body, one hairstyle, fifteen renamed clips, finger keyframes
  removed, three UV sets and two vertex-colour channels removed, skin weights quantised to
  bytes, and a garment mask added that does not exist upstream. It is not usable as a
  general-purpose asset pack and is not offered as one.

CC0-1.0 imposes no attribution requirement. This document exists anyway, because knowing what is
in the repository is worth more than the licence minimum.

## What the conversion does

`scripts/convert-character.mjs`, run as `npm run convert:character`.

| Step | Why |
| --- | --- |
| Keep 15 of 43 clips, renamed to logical names (`Walk`, `Punch`, `Enter`, `Drive`…) | The game's state machine has fifteen states. The other twenty-eight clips are swords, spells and swimming. |
| Drop all `.scale` tracks | Constant 1 across the library; a third of every clip. |
| Drop finger keyframes, bake a relaxed hand into the rest pose | Forty of sixty-five bones are fingers. They cost two thirds of every clip and are sub-pixel at third-person camera distance. The bones remain, because the skin is weighted to them. |
| Drop `TEXCOORD_1..3`, `COLOR_0`, `COLOR_1` | Four UV sets are for engine-side material layering this project does not do. Both colour channels are constant across the mesh and carry nothing. |
| Quantise skin weights to normalised bytes, renormalised after rounding | A weight is a number from zero to one; a byte resolves it far finer than it can be seen, at a quarter the size. |
| Merge the hairstyle into the body mesh | Same skeleton, same bind pose, so it is more of one object rather than a second one. Keeps a citizen at one draw call for the body. |
| Write a garment mask into `COLOR_0` | Replaces 12 MiB of 4K superhero textures with four bytes per vertex. Each bone is labelled skin / top / trousers / hair / shoe and every vertex inherits its bones' labels weighted exactly as its skin is, so hems blend as softly as the skinning does. Colours stay shader uniforms, so one mesh dresses a whole crowd. |
| Measure locomotion speed from the root-motion variant | The shipped clips have root motion disabled, which is what a simulation-driven character needs, but that also erases the speed the stride was drawn for. `UAL1_Standard_RM.glb` still carries it; the distances are read out and shipped as `gait` in `citizen.json`. Playing a 5.36 m/s jog at 3 m/s is what foot sliding is, and a clip cannot tell you that about itself. |

Measured gait, in metres per second: `Walk 0.975`, `Run (Jog_Fwd_Loop) 5.357`,
`Sprint 8.250`.

## Replacing this character later

Quaternius is stage one. It establishes the pipeline — SkinnedMesh, a real 65-bone humanoid
skeleton, clip retargeting by name, per-citizen colour, pooling — on a body that is free to use
and close enough in proportion to judge motion by. It is not the intended final look.

The seam is `src/player/character-asset.mjs`. A CharacterAsset is:

```
{id, height, scale, gait, bones, template, instance(palette), dispose()}
```

`instance()` returns `{root, clips, recolour, setHeight, dispose}`. Nothing else in the game
knows what a character is made of: the controller, the camera, combat, the vehicle transition
and the near-NPC pool all talk to a figure, and a figure talks to an asset.

Replacing the body therefore means producing a GLB with the same fifteen clip names on a
skeleton whose bones the clips address, plus a `citizen.json` giving its height and gait. It
does not mean editing gameplay code. Two providers exist today and are swapped at runtime:
`bakedCitizen` (the offline-authored capsule figure, in the bundle, drawn on the first frame)
and `humanoidCitizen` (this one, fetched after the city is up).
