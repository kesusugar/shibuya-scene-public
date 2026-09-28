# Third-party notices

This repository contains code and data written for this project together with third-party code,
data and assets. The licence of this project's own code is set separately (see the root `LICENSE`
once one is chosen); **nothing below is covered by that licence** — each item keeps its own terms.

Where a pinned lock file exists it is the record of truth: it names each upstream file, its page,
its licence and its SHA-256.

## Map data

| What | Source | Licence | Where |
| --- | --- | --- | --- |
| Buildings, roads, footways, rails, POIs of central Shibuya | © OpenStreetMap contributors | ODbL-1.0 | `data-source/` (snapshot, `LICENSE.txt`, `provenance.json`); derived `public/data/shibuya-scene-data.json` |

The attribution "OpenStreetMap contributors · ODbL" is also shown in the application's data panel (`app/S1Data.tsx`).

## Code

| What | Source | Licence | Where |
| --- | --- | --- | --- |
| Vehicle handling and suspension (adapted) | Cabsolutely, commit c881e651, © 2026 ilkerzg | MIT | `src/player/vehicle-dynamics.mjs`; licence in `LICENSES/cabsolutely.txt` and `public/licenses/cabsolutely.txt` |
| shadcn Tailwind stylesheet | shadcn/ui 4.13.0 | MIT | `vendor/shadcn-tailwind-4.13.0.css`, `vendor/shadcn-tailwind-4.13.0.LICENSE.md` |
| npm packages | npm registry (see `package-lock.json`) | each package's own; the browser bundle is mainly three.js, React and polygon-clipping (MIT) | `node_modules/` (not committed) |

The npm dependency tree includes LGPL-3.0 native image binaries (`@img/sharp-*`, via Next.js / the
Cloudflare tooling). They are build and server-side tooling and are not part of the static game
bundle.

## Characters and animation

| What | Source | Licence | Where |
| --- | --- | --- | --- |
| Base characters and animation library | Quaternius — Universal Base Characters, Universal Animation Library (Standard) | CC0-1.0 | `assets/character/upstream.lock.json`; baked into `public/data/character/citizen.glb` |
| Motion capture: trials 02_07, 80_03, 16_45 (retargeted) | CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH conversion by Bruce Hahne | No restrictions; acknowledgment requested | `LICENSES/cmu-mocap.txt`, `public/licenses/cmu-mocap.txt` |

> The data used in this project was obtained from mocap.cs.cmu.edu.
> The database was created with funding from NSF EIA-0196217.

## Textures

| What | Source | Licence | Where |
| --- | --- | --- | --- |
| Asphalt Track, Concrete Pavement | Poly Haven | CC0-1.0 | `assets/textures/upstream.lock.json`; `public/textures/ground/` |

## Sound

| What | Source | Licence | Where |
| --- | --- | --- | --- |
| 37 recordings (ambience, crossing signal, swings, punches, bodies, crashes, tyres, horns, screams, gasps, pain, gunshots, ricochet) | Freesound, each sound's own page | CC0-1.0 | `assets/audio/upstream.lock.json` (author and page per sound); `public/audio/` |
| Impact Sounds 1.0 | Kenney | CC0-1.0 | same lock file |
| Police loudspeaker and dispatch radio lines | Generated with Kokoro-82M (voice jm_kumo) | Apache-2.0 (model) | `public/audio/police/`; `public/licenses/police-voice.txt` |
| Police officers' shouts (4 lines) | Generated with Style-Bert-VITS2 JVNV model jvnv-M1-jp, trained on the JVNV corpus | CC BY-SA 4.0 (these 4 files are shared under CC BY-SA 4.0) | `public/audio/police/`; `public/licenses/police-voice.txt` |
| Car radio music | Written for this project by rule (`src/audio/radio-music.mjs`); titles and artists invented | project's own | — |

## Signs and advertisements

The storefront and advertising signs are drawn procedurally in code (`src/signs/`); no logo file,
brand font or photograph is committed. Many of them name and approximate **real brands and
buildings** in Shibuya. Those names and marks belong to their owners; their appearance here is not
an endorsement and is not licensed. See the note in `README.md`.
