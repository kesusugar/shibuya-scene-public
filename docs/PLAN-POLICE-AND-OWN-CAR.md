# Plan: the player's own drift car, Japanese police, sirens, and a ☆1–☆5 wanted level

Status: **Step H** on `claude/looks-fleet-4` (§9p), **W1 + W3** on `claude/looks-fleet-5` (§9q), **W2** on `claude/looks-fleet-6` (§9r), **☆4–☆5 extras and the balance cap** on `claude/looks-fleet-7` (§9s), 2026-09-25; W steps follow on stacked branches. Originally: Written 2026-09-24 on `master` `e1e136e` (after PR #23).
It adds to `docs/PLAN-LOOKS-AND-FLEET.md` and depends on its Step B (traffic on the loft in
`BatchedMesh`) and Step C (new mob types, including `police`). The work happens in a local
Claude CLI session so it can be checked on the real device. Read `AGENTS.md`, `CLAUDE.md` and
`docs/GTA-FIDELITY-STATUS.md` (§9j–§9l, §16a) first.

## 0. What exists today (checked in code, 2026-09-24)

- **There is no police, siren or wanted system.** Nothing in `src/` or `app/` spawns police,
  plays a siren or tracks a wanted level. The only police in the scene is the koban sign at the
  station (`src/station-detail/model.mjs`, tile `police`, POI `koban`). That point is where
  foot officers come from in this plan.
- **The events a wanted level needs already exist:**
  - a melee kill: `kill()` in `src/player/combat.mjs`, counted in `stats.npcDeaths`;
  - a run-over: the `vehicle_runover` event on the feedback bus, raised in
    `app/ShibuyaScene.tsx`;
  - blows, hits and swings: `onBlow` and `onEvent`;
  - a carjack: `src/player/carjack.mjs`.
- **The player's car is a `sedan`** (`CAR.type` in `src/player/vehicle.mjs`), drawn by
  `src/player/vehicle-asset.mjs` from the loft (`buildVehicleShape`).
- **PR #23 left limits that matter here** (§9l):
  - walking into a dense crowd is deadly (30% of bumps fight, 25 a blow);
  - `trappedSeconds` in packed kerb crowds;
  - the phone is not checked yet.

  A wanted level on top makes that harsher. Step W4 below has a cap.

## 1. Decisions (closed)

- **Cars are "〜風" only** (`PLAN-LOOKS-AND-FLEET.md` §0).
  - No maker, model, film or body-kit names in `src/`. The name-guard test there also covers
    this plan.
  - For the player's car in particular: no "Mazda", "RX-7", "FD3S", "VeilSide", "Fortune",
    "Fast & Furious" or "Tokyo Drift", anywhere in `src/`.
- **Japanese police, generic.**
  - The look is the Japanese patrol car: a large rear-drive sedan (the Crown class), black lower
    body, white upper, a red roof light bar (赤色灯), and front and rear red lamps.
  - Door text is generic ("POLICE" / "パトロールカー"). There is **no real agency name**
    (e.g. 警視庁) and **no police emblem** (旭日章).
  - Uniforms are navy with a cap.
- **The sounds are synthesised, never recorded** (so no licence question):
  - the Japanese police electronic siren, a slow rising and falling wail;
  - the rotating-beacon "ウー" warble;
  - optionally a loudspeaker line through the browser's own `speechSynthesis` in `ja-JP`, when a
    Japanese voice exists, and silent otherwise.
  - The ambulance "ピーポー" is a different siren and is not used.
- **No firearms.** Japanese police are depicted with batons, and at ☆4–☆5 with riot-squad
  shields. Combat stays melee and vehicles, as today.
- **Bounded.** Police units are capped (§4). They come from the existing near-humanoid pool
  and from the traffic system, with no new crowd per unit.

## 2. Step H: the player's own car ("Kaze FR", an orange-and-black drift fastback)

This takes over `heroWide` from `PLAN-LOOKS-AND-FLEET.md` Step D. That car becomes the
player's own instead of a parked one.

- **Shape.** A new `fastback` silhouette on the loft:
  - a low rounded nose with pop-up headlamps, a generic feature of the era, which rise at night
    or when the lights are on;
  - a double-bubble roof, a short tail, round tail lamps, wide rear arches, and a low ride
    height;
  - an orange body with black lower panels and bonnet, on dark multi-spoke rims.
  - It evokes a 1990s Japanese rotary-era sports coupé. It must not copy a specific car's
    panels or a specific body kit; a designer's eye from three views is the test.
- **Ownership.**
  - `CAR.type` becomes `ownCar` (a new type with its own `VEHICLES` entry, mass and anchors).
    It spawns parked near the player on entering play, as the sedan does today.
  - It is the player's: a player can steal other cars, and NPCs never drive this one.
  - When lost (left far away or wrecked), it comes back at the nearest parking spot after a
    short time.
- **Handling.** The drift profile from `PLAN-LOOKS-AND-FLEET.md` Step D in
  `vehicle-dynamics.mjs`: lower rear grip, more steering lock, and a stronger handbrake slide
  (`CAR.grip`, `slipMax`, `steer`).
- **Sound.** A higher, buzzier synthesised engine note: a rotary-like character with no
  recording.
- **Night.** Optional neon underglow, as an emissive ground decal.
- **Tests.**
  - It builds with every anchor (seat, doors, entry, exit).
  - The pop-ups are up at night and down by day.
  - The drift profile slides more than the sedan under the same input.
  - It respawns when lost.
  - The name guard passes.

## 3. Step W: wanted level ☆1–☆5 (GTA-style, Japanese response)

### W1. Heat and stars: `src/police/wanted.mjs` (pure, testable)

- **State:** `{stars 0–5, heat, lastSeen:{x,z,t}, seen, cooldown, crimes:{meleeKills, runoverKills, officerAssaults, officerKills, policeCarsTaken, carjacks}}`.
- **Crimes and what they do.** The first match raises the level to at least that star. Each
  row can be tuned in one `WANTED` table.

  | Event | Result |
  | --- | --- |
  | 2nd melee kill (the user's rule: two killed in fights) | ☆1 |
  | a run-over kill (the user's rule) | ☆1 at once; a 2nd one within 60 s makes it ☆2 |
  | punching a police officer | ☆1, or +1 if already wanted |
  | ramming a police car, or 4 kills in total | ☆2 |
  | **taking a police car** (the user's rule) | ☆3 |
  | killing an officer, or 8 kills | ☆3 |
  | 15 kills, 2 officers killed, or 90 s at ☆3 without escaping | ☆4 |
  | 25 kills, or 4 officers killed | ☆5 |
  | a carjack seen by an officer | ☆1 (optional, GTA-style) |

- **Witnesses.**
  - A crime an officer sees raises stars at once.
  - A crime only civilians see is "reported" after 4–8 s, with the delay fixed by the crime id.
    It is cancelled if every witness who saw it is dead or has fled out of range. The existing
    witness pass (`onWitness`) already says who saw what.
- **Escaping (GTA V rule).**
  - While any unit has line of sight to the player within its range, `lastSeen` updates and the
    stars are solid.
  - Out of sight, the stars flash and a search circle centres on `lastSeen`. Its radius by star:
    60 / 90 / 120 / 160 / 200 m.
  - Staying outside the circle and unseen for 12 / 18 / 25 / 35 / 45 s clears the level.
  - Being seen again restarts the timer.
- **Clearing.** Escaping, being arrested, or game over. Respawn clears it.

### W2. Police units: `src/police/units.mjs`

| Stars | Response (Japanese flavour) | Cap |
| --- | --- | --- |
| ☆1 | 1–2 officers on foot from the koban, and 1 patrol car | cars 1, officers 2 |
| ☆2 | 2 patrol cars with sirens; officers get out and chase on foot | cars 2, officers 4 |
| ☆3 | 3–4 patrol cars; they box the player in and nudge-ram a car (a PIT at low speed) | cars 4, officers 6 |
| ☆4 | + an unmarked car (dark sedan, a magnetic red lamp on the roof) + a roadblock (two cars across a lane with cones) | cars 5, officers 8 |
| ☆5 | + a riot-squad transport (the blue-and-white bus class) and riot officers with shields | cars 6, officers 8 |

- **Spawn.**
  - Cars appear on the lane graph 80–200 m from the player and outside the camera frustum,
    never in view. They drive the graph toward the player's nearest node and steer straight in
    for the last 30 m.
  - Foot officers use the near-humanoid pool (`src/life/near-characters.mjs`), with priority
    over civilians. They wear a navy uniform and cap palette as an appearance variant.
- **Traffic gives way.** Cars ahead of a car with its siren on slow down and pull toward the
  kerb, bounded to the lanes within 40 m. Pedestrians near the siren look (the head-turn
  already exists).
- **Officer behaviour.**
  - Close in and swing a baton: 15 a hit, four hits' worth of reach per the fight rules.
  - Grab-arrest when within 1.2 m of a player on foot who is not attacking, for 2 s.
  - Out of a car, they run with the chase clips.
  - Beaten officers go down like civilians, which raises stars (W1).
- **Arrest (busted).**
  - On foot: held 2 s. In a car: a stopped player car pinned by police for 3 s.
  - Shows "逮捕" (arrested), then respawn at the koban with 100 HP and the stars cleared.
  - It reuses the game-over screen path (`setPlayerHit`) with a different message.
- **Despawn.** Units the player has escaped drive off or walk away out of sight, then free
  their slots. Nothing pops out in view.

### W3. Siren and lights: `src/police/siren.mjs`, in the RUN 12.1 sound bank

- **The siren sound.**
  - Two oscillators (saw plus square, band-passed) sweep a slow Japanese-style wail, about
    1.6 s up and 1.6 s down between about 650 and 1,450 Hz. Tune it by ear on the device
    against the user's memory of a Tokyo patrol car.
  - A faster "yelp" mode is used at junctions.
  - It goes through an HRTF panner at the car, with a rough Doppler: the rate follows the
    closing speed.
  - It runs under the bank's own caps, and only the 2 nearest sirens sound.
- **The lamps.**
  - The red light bar rotates as an emissive pattern on the lamp mesh.
  - One shared red point light per nearest car only (at most 2), within the night light budget
    (`docs/GTA-FIDELITY-STATUS.md` tier table).
- **Loudspeaker (optional).** "前の車、止まりなさい" and "そこの人、止まりなさい" through
  `speechSynthesis` `ja-JP`, at most once every 8 s, only near the player, and only when a
  Japanese voice exists.
- **The player in a police car.** The player can use the siren and lights with **H** (the horn
  key) while driving one. Taking it gives ☆3 (W1).

### W4. HUD and balance

- **HUD.**
  - Five stars at the top right: solid while seen, flashing while escaping.
  - Clear at phone width, next to the HP bar from PR #23.
  - A short banner the first time a level rises ("手配度 ☆2").
- **Balance cap.** With ☆ active, a crowd bump that starts a fight (the 30% of §9l) is capped
  at 2 attackers at once. Otherwise police plus a mob make a dense Scramble unwinnable. It is a
  tuning constant, and the user decides on the device.

## 4. Tests

- **`wanted.mjs`.**
  - Every row of the crime table.
  - Reported versus seen delays.
  - A report cancelled when the witnesses are gone.
  - The search circle and the escape timers per star, and flashing versus solid.
  - Clearing on arrest, death and respawn.
- **Units.**
  - Spawn never inside the camera frustum, and never closer than 80 m.
  - The caps per star.
  - Despawn out of sight only.
  - Foot officers take near-pool slots with priority and return them.
- **Arrest.** Held 2 s on foot → arrested; a punch during the grab breaks it; respawn at the
  koban.
- **Siren.**
  - The sweep period and range match the constants.
  - Only the 2 nearest sound.
  - The bank caps hold.
  - `speechSynthesis` absent or with no Japanese voice → silent, with no error.
- **Rules the user named.**
  - 2 melee kills → ☆1 and a siren approaching.
  - 1 run-over kill → ☆1 at once.
  - Taking a police car → ☆3.
- **The name guard** (from `PLAN-LOOKS-AND-FLEET.md`) also covers "警視庁" and the emblem name.

## 5. Device checks

- HIGH, night, `?qa=1`. Run down one pedestrian, then:
  - the stars show ☆1;
  - a patrol car arrives from out of view with the siren audible and panned;
  - traffic gives way;
  - escaping out of sight flashes and then clears the stars.
- Fight two people to the end, then ☆1 and officers from the koban.
- Take a patrol car, then ☆3, and **H** runs its siren.
- Record fps and draw calls at ☆0 and ☆5, and console errors (0). Check the phone after merge.
- Listen: the siren reads as a Japanese patrol car, not a US wail or an ambulance.

## 6. Order and commits (after `PLAN-LOOKS-AND-FLEET.md` Steps A–C)

1. Step H: the player's own car.
2. W1: wanted state and crime rules, with tests. No units yet; the HUD stars show.
3. W3: the siren and lamps on the `police` type from the looks plan.
4. W2: patrol cars, their pursuit, and traffic giving way.
5. W2: foot officers, the baton, and arrest.
6. W2/W4: ☆4–☆5 extras (unmarked car, roadblock, riot transport) and the balance cap.

- One PR per one or two steps. Separate implementation, evidence and doc commits.
- A §9 section and §16a entries in the status doc.
