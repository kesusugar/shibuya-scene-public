# Plan: patterned clothes, accessories, a Japanese street fleet, and Tokyo-drift-style hero cars

Status: **Step A implemented** on `claude/looks-fleet-1` (§9m), **Step B** on `claude/looks-fleet-2` (§9n), **Step C** on `claude/looks-fleet-3` (§9o), **Step D** (the two parked cars; the third is the own car) on `claude/looks-fleet-8` (§9t), 2026-09-25. Step E (accessories) is not started; later steps follow on stacked branches. Originally: Written 2026-09-24 on `master` `3e15698`. This comes after
`docs/PLAN-PLAYER-CROWD-CONTACT.md`, which is being implemented separately. The work happens
in a local Claude CLI session so it can be checked on the real device. Read `AGENTS.md`,
`CLAUDE.md` and `docs/GTA-FIDELITY-STATUS.md` (§9j, §9k, §16a) first.

## 0. Decisions (closed; the user agreed 2026-09-24)

- **Cars are "〜風" (inspired-by), never replicas.**
  - No real maker names, model names, badges, emblems, grille logos or plate text.
  - No film titles, film decals, vinyls or body-kit brand shapes.
  - Every car gets a fictional name.
  - The proportions, stance and colour mood may evoke a class of real car, the way GTA's cars
    do. They must not copy one.
  - A test enforces the names (§4, Step D).
- **No downloaded 3D models of real cars,** whatever licence they carry. A modeller's CC
  licence does not grant a maker's design rights, and the project forbids assets whose
  licence is unclear. Everything is procedural (the loft in `src/traffic/vehicle-shape.mjs`)
  or CC0 with a lock file, the same pipeline as audio and textures.
- **Appearance stays a pure function of the pedestrian's id** (`src/life/appearance.mjs`, the
  RUN 6.8 rule). Patterns and accessories follow the same rule. Walking away and back must
  never change anyone's clothes, and neither must a hand-over between the near ring and the HQ
  crowd.
- **The HQ crowd shader already uses the 16 vertex attributes WebGL guarantees** (§16a). No
  step may add a new per-vertex or per-instance attribute to the body mesh; new data is packed
  into existing ones, and a test pins the count.
- **Tiers.** HIGH gets everything. MEDIUM gets patterns, the fleet, the hero cars and at most
  three accessory kinds. LOW gets the fleet silhouettes only.

## 1. What exists today

- **People.**
  - There are four silhouettes, two CC0 bodies × hairstyles (`ARCHETYPES` in
    `appearance.mjs`).
  - Clothes are flat colours per garment region: skin, top, bottom, hair and shoe, from a
    vertex-colour garment mask.
  - The colours reach the HQ crowd as `aPal` (four RGB values, each packed into a float as a
    24-bit integer, `PACK` in `src/life/hq-crowd.mjs`) and `aShoe.x`.
  - There are no patterns and no accessories.
- **Traffic.** Seven types, set in `VEHICLES`, `src/traffic/config.mjs`: taxi, sedan, kei,
  van, bus, keiTruck and scooter. HIGH runs 62 moving and 12 parked.
  - Traffic bodies are rounded boxes (`vehicleGeometry()` in `src/traffic/render.mjs`).
  - The shaped loft (`buildVehicleShape`, four silhouettes: sedan, hatch, onebox and cabover)
    is used only by the player's car, the anchors and the seated drivers.
  - Each type is up to five `InstancedMesh`es, one per part (body, glass, dark, front, rear).
  - Paint is one colour per type, varied only in brightness by id.
- **three.js is r185,** so `BatchedMesh` is available: many different geometries in one draw
  call, with per-instance colour.

## 2. Steps, in order

### Step A: patterns on clothes (small, do first)

- **Patterns.**

  | Pattern | Used for | How it is computed |
  | --- | --- | --- |
  | solid | everything | today's flat colour |
  | border (horizontal stripes) | tops | bind-pose y |
  | pinstripe | suits | bind-pose x, fine and faint |
  | gingham/check | tops, skirts | both axes |
  | two-tone open jacket | tops | a front panel in a second shade, a bind-pose x band on the front half |
  | denim | bottoms | twill noise plus a lighter seam |
  | small print | tops | a hash dot grid |

- **Surface coordinates.** Use the bind-pose `position` (before skinning), so a stripe moves
  with the body and never slides across it. Scale it by the body height so stripes are the
  same width on every archetype.
- **Selection.** Add a `pattern` field to the recipe in `appearance.mjs`, chosen from the id
  with weights by life archetype. For example, office workers lean to solid and pinstripe,
  young people to border, check and print, older people to solid.
  - `deduplicate()` may still move a colour, never a pattern.
- **Packing, with no new attribute.** Quantise the top and bottom colours to 7 bits per channel
  (21 bits) and put a 3-bit pattern id in the top 3 bits. That is still a 24-bit integer, which
  a float holds exactly. The shader unpacks it.
  - The colour error is at most 2/255 per channel. The palettes are curated lists, so the
    quantisation must be checked against them in a test.
  - If the CLI finds a cleaner spare slot, fine, but no new attribute.
- **Near characters.** The RUN 6.8 garment-mask material gets the same pattern function (an
  `onBeforeCompile` snippet, shared as one GLSL string), so a person handed between the HQ
  crowd and the near ring keeps their pattern.
  - The player figure can take a pattern too, but keep the player's red solid so they stay
    findable.
- **GLSL rules from §16a.** Every injected snippet ends in `\n`, and the tests check each
  preprocessor line.
- **Tests.**
  - The pattern is a pure function of id.
  - The distribution per archetype is within ±3% of the weights.
  - Pack and unpack round-trip for every palette entry and every pattern id.
  - The HQ and near materials use the same GLSL function (a string equality check).
  - The crowd attribute count is still at most 16.
- **Device check.**
  - At HIGH, day and night, the stripes stay still on walking bodies (no shimmer), and fps is
    within noise.
  - On the phone there is no moiré at distance: fade the pattern to solid by distance or
    derivative (`fwidth`).

### Step B: fleet silhouettes and paint (medium)

- **Batch the traffic bodies with the loft.**
  - Move `buildTraffic` from the rounded boxes to `buildVehicleShape(type, {detail: 0})`, and
    from one `InstancedMesh` per type and part to a `BatchedMesh` per part (body, glass, dark,
    front, rear).
  - Traffic draw calls then stop growing with the number of types: about five for all traffic.
    Shadows are counted separately.
  - Keep the mesh names that `day-night.mjs` ramps by name (`traffic-*`). Check the headlight
    glows (`headlight-glows.mjs`), the vehicle shadow (`vehicle-shadow.mjs`) and the seated
    drivers (`drivers.mjs`, already on the loft).
  - If `BatchedMesh` fights any of these, fall back to per-type `InstancedMesh` with a written
    draw-call budget, and say which one failed.
- **Paint per car, not per type.** Use a Japanese colour mix, chosen from the id:

  | Colour | Share |
  | --- | --- |
  | pearl white | 30% |
  | black | 20% |
  | silver and grey | 20% |
  | dark blue | 8% |
  | red | 5% |
  | others | the rest |

  Commercial vans lean white, and kei cars get more pastels.
- **Liveries by band.** Two-tone paint by a height or length band in the body shader, driven by
  a per-instance livery id.
  - Taxis: several generic company schemes (black, deep indigo, yellow and green two-tone),
    with no company name.
  - City bus: green and cream bands, generic, with no operator mark.
  - Police: black lower body and white upper.
- **Tests.**
  - The paint mix is within ±3% of the table.
  - Draw calls for traffic stay at or below today's count at HIGH (record before and after).
  - Every type has body, glass, dark, front and rear.
  - The mesh names match what `day-night.mjs` expects.

### Step C: new mob types (medium)

Each new type is a silhouette in `SILHOUETTE` / `STYLE` (`vehicle-shape.mjs`), an entry in
`VEHICLES` (size, speed, weight in the spawn mix), an entry in `VEHICLE_MASS`
(`vehicle-impact.mjs`), and a place in the parked mix. The player can drive and carjack every
one of them.

| Id | Inspired by (class, not model) | Fictional name | Silhouette |
| --- | --- | --- | --- |
| `longVan` | the big Japanese commercial 1BOX (the Hiace class) | "Cargo Hauler" | long onebox, short semi-bonnet, sliding door line; windowless cargo and windowed wagon variants |
| `minivan` | the large luxury minivan (the Alphard/Voxy class) | "Grand Voyage" | tall, near-vertical nose, big plain grille area with no logo, sliding door |
| `tallKei` | the tall-box kei (the N-BOX/Tanto class) | "Tall Box K" | kei width, tall square greenhouse |
| `cityTaxi` | the newer tall Tokyo taxi (the JPN TAXI class) | "Metro Cab" | compact tall MPV, roof lamp with no company text |
| `truck2t` | the 2-tonne cab-over delivery truck | "Delivery 2t" | cabover plus a plain white box body |
| `police` | the Japanese patrol car (a large rear-drive sedan) | "Patrol" | black lower body and white upper, a red roof light bar, generic "POLICE" door text, no agency name or emblem. The siren, lamps and behaviour are in `docs/PLAN-POLICE-AND-OWN-CAR.md` |
| `coupe` | the Japanese sports coupé, rare in traffic | "Street GT" | long bonnet, short deck, low roof |

- **Mix at the Scramble** (a starting point; tune on the device):

  | Type | Share |
  | --- | --- |
  | taxis (old and new) | 25% |
  | sedan | 14% |
  | minivan | 14% |
  | kei and tallKei | 12% |
  | van and longVan | 10% |
  | truck2t and keiTruck | 8% |
  | scooter | 5% |
  | coupe | 2% |
  | police | 1–2% |

  The bus stays on major roads only.
- **Handling.** Carry `vehicle-dynamics.mjs`'s parameters per type (mass, grip, steering
  lock). A longVan should feel heavy and a coupe light.
- **Tests.**
  - Every new type has a silhouette, a mass and a spawn weight, and builds with its anchors
    (seat, door, entry, exit).
  - Carjack works on a sample of each type.
  - Seated drivers sit in every new type.

### Step D: three Tokyo-drift-style hero cars (medium)

Three one-off cars with a night-drift mood. They are built on a new low `coupe`/`fastback`
silhouette plus body-kit parameters on the loft: wider arches, a front lip, side skirts, a
rear wing, lower ride height, wider tyres and deep-dish rims, and bonnet vents.

| Id | Mood (evocative, not copied) | Fictional name |
| --- | --- | --- |
| `heroWide` | a widebody FR coupé in orange and black, very low | "Kaze Wide" |

> **Changed 2026-09-24:** the orange-and-black car becomes the player's own car ("Kaze FR",
> a `fastback` silhouette). See `docs/PLAN-POLICE-AND-OWN-CAR.md` Step H. Steps D and H share
> the body-kit parameters, and the two remaining hero cars stay parked.
| `heroSilver` | a compact FR coupé in silver/blue-grey, clean kit, big wing | "Tsuki S" |
| `heroDark` | a short, wide two-seater in dark gunmetal, black rims | "Yoru Z" |

- **Visual.**
  - Detail-1 loft (these are close-up cars), glossy paint, and optional neon underglow: an
    emissive ground decal, cheap, that suits Shibuya at night.
  - No decals, no numbers, no sponsor-style graphics.
- **Where they are.**
  - Parked at two or three fixed spots near the crossing: a side street and a car park
    entrance.
  - At night one of them sometimes drives the loop as rare traffic.
  - The player can take any of them.
- **Handling.**
  - A drift profile in `vehicle-dynamics.mjs`: lower rear grip, more steering lock and a
    stronger handbrake slide.
  - The existing lateral-momentum model and tyre squeal (RUN 12.1) do the rest.
  - The synthesised engine gets a higher-revving voice for these three.
- **Name guard.** A test fails if any vehicle id, label, UI string or comment in `src/` uses a
  real maker or model name, or a film title. For example: Toyota, Nissan, Mazda, Honda,
  Mitsubishi, Subaru, Suzuki, Daihatsu, Hiace, Alphard, Voxy, Skyline, GT-R, Silvia, RX-7,
  Lancer, 350Z, Supra, N-BOX, Tanto, VeilSide, "Fast & Furious", "Tokyo Drift".
  - The "Inspired by" column above is in this doc, not in `src/`.
- **Other tests.** The three spawn at their spots, can be carjacked, and drift (lateral slip
  above a threshold under handbrake at speed).

### Step E: accessories (largest, do last)

- **Kinds:**
  - on the head: cap, glasses, white face mask and headphones;
  - on the back: backpack, and a shoulder bag or tote;
  - in the hand: smartphone (for people standing or waiting) and umbrella (only if a rain
    state exists; otherwise leave it for later).
- **HQ crowd.**
  - One `InstancedMesh` per kind. Its vertex shader samples the same bone animation atlas as
    the body (the same clip, phase, previous clip and blend) for one bone: `Head`, `spine_03`
    or `hand_r`.
  - The head-turn (RUN 12.4) already reads the neck matrix this way, so reuse that code as a
    shared GLSL chunk.
  - The accessory mesh has no skin weights, so it has room for its own attributes. It still
    must not add any to the body.
  - Instances are only the wearers among the HQ-drawn set, kept up to date at the same points
    where the palette is written today (the slot swaps in `hq-crowd.mjs`).
  - Draw cost: +1 call per kind (+1 shadow if it casts).
- **Near characters and player.** Attach real `Object3D`s to their bones.
- **Geometry.** Procedural and low-poly in code: a cap is a half-sphere with a brim, a mask a
  curved quad, a bag a rounded box, a phone a box. Any CC0 model goes through a lock file with
  SHA-256, like `assets/audio` and `assets/textures`.
- **Shares, pure by id and weighted by life archetype:**

  | Accessory | Share |
  | --- | --- |
  | mask | 15% |
  | backpack | 20% (more for young people) |
  | bag | 25% (more for office workers) |
  | cap | 10% |
  | glasses | 20% |
  | phone | 30% of those standing or waiting |

- **Tests.**
  - Accessories are pure by id and follow the shares.
  - An accessory follows its bone: with the body at clip X and phase Y, the accessory origin
    equals the CPU-skinned bone position within 1 cm.
  - The attribute count on the body is unchanged.
  - A hand-over between HQ and near keeps accessories.
- **Device check.** Draw calls and fps at HIGH and on the phone, and no accessory floating off
  a body at 60 fps.

## 3. Verification per step (device)

- **URLs:**
  - `?qa=1&tier=high&time=day&camera=scramble`
  - `?qa=1&tier=high&time=night&camera=scramble`
  - `&tier=medium`
  - the GitHub Pages build on the phone after merge.
- **Record for each step:**
  - `__SHIBUYA_QA__.metrics` fps and draw calls, before and after;
  - console and shader errors (0);
  - screenshots into `evidence/looks-fleet/<step>/`.
- **Visual checks:**
  - no stripe shimmer at distance;
  - liveries line up on every body style;
  - no car name or logo anywhere on screen.

## 4. Order and commits

1. Step A: patterns.
2. Step B: batch and loft the traffic, and paint per car.
3. Step C: new mob types.
4. Step D: the hero cars and the name guard.
5. Step E: accessories.

- One PR per step, or two steps per PR where they are small. Separate implementation,
  evidence and doc commits.
- Each PR adds a section to `docs/GTA-FIDELITY-STATUS.md`, and a §16a entry for any bug found.
- Before each PR: `npm run typecheck`, `npm run test:ci`, `npm test`, `git status --short`.
