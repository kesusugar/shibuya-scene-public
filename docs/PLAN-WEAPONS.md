# Plan: weapons (fists, a pistol, a katana) for the player, and revolvers for the police

Status: **W1–W4 implemented** on `claude/shibuya-weapons-implementation-28u1y1` (`docs/GTA-FIDELITY-STATUS.md` §9y–§9ab), 2026-09-25; R4 taken as option (a). Device checks (§5) are outstanding. Originally: Written 2026-09-25 on `master` `7d4637e`. The work happens in
a new local Claude CLI session, so it can be checked on the real device. Read `AGENTS.md`,
`CLAUDE.md`, `docs/GTA-FIDELITY-STATUS.md` (latest §9, §9k, §16a) and
`docs/PLAN-POLICE-AND-OWN-CAR.md` first.

## 0. What exists (measured 2026-09-25)

- **The CC0 animation pack already has the clips.** The Quaternius Universal Animation
  Library, 43 clips, fetched by `npm run fetch:character` and used today for 14 of them,
  contains:

  | Clip | Length | What it is |
  | --- | --- | --- |
  | `Pistol_Idle_Loop` | 1.67 s | holding the pistol |
  | `Pistol_Aim_Up`, `Pistol_Aim_Neutral`, `Pistol_Aim_Down` | 0.17 s each | single poses for blending the aim by pitch |
  | `Pistol_Shoot` | 0.63 s | a shot |
  | `Pistol_Reload` | 1.67 s | reloading |
  | `Sword_Idle` | 1.67 s | holding a sword |
  | `Sword_Attack` | 1.53 s | a single swing |
  | `Roll` | 1.47 s | a dodge roll |
  | `Crouch_Fwd_Loop` | 2.0 s | crouch walking |

  They are on the same skeleton, so they are added to `CLIPS` in
  `scripts/convert-character.mjs`.
- **The pistol clips are two-handed.** The hands are 0.10 m apart, the right hand about 0.48 m
  in front at 1.40 m height. `Pistol_Shoot`'s recoil is only about 3 cm.
- **The sword clips are one-handed.** The hands are 1.03–1.35 m apart. `Sword_Idle` holds the
  blade low behind the right hip, and `Sword_Attack` is a single right-handed sweep from
  back-right to front-left.

## 1. Where realism is at risk, and what this plan does about each

| # | Risk | Why | Mitigation in this plan | Verdict |
| --- | --- | --- | --- | --- |
| R1 | **Aiming while walking points the gun off target** | The punch fix (§9k) showed that blending an upper-body clip over walking moved the fist 30–40 cm off line, because the pelvis and spine come from the walk | While aiming, the upper body takes the aim pose at full weight above `spine_01`. An aim correction then rotates `spine_02`/`spine_03` so the muzzle points at the aim point; the residual error is measured in a test | OK, if the test passes |
| R2 | **Aim left and right** | The clips aim up, level and down only | Left/right comes from the body yaw (the player turns to the aim) plus the spine correction above, as GTA does | OK |
| R3 | **Weapon in the hand** | There is no weapon mesh and no grip bone | A procedural pistol, revolver and katana attached to `hand_r`, with a per-weapon grip offset tuned on `qa/gta-upgrade/weaponbench.html` from four angles | OK |
| R4 | **A two-handed katana on one-handed clips** | `Sword_Attack` swings with the right hand only; the left hand hangs about 1 m away | **Decision needed.** (a) Accept a one-handed katana swing (visible, but reads like a samurai one-hand cut). (b) Two-bone IK pulls the left hand onto the grip during the swing: more real, and a new IK solver on the arm, where `foot-ik.mjs` is the pattern. Default: (a) first, (b) as a follow-up if it looks wrong | **Your call** |
| R5 | **One sword swing** | Only `Sword_Attack` exists | Alternate the swing with small speed and spine-twist variations, and a second swing mirrored by the body turn. A true combo needs new clips, which is not planned | Compromise |
| R6 | **The blade passes through bodies and walls** | Nothing stops the clip | The hit test samples the blade's swept arc inside the clip's measured active window (as `attack-timing.mjs` does for punches). A hit on a solid (wall or car) stops the swing early with sparks (a "clank"). Blade-through-body is shown as a hit, not blocked | OK |
| R7 | **The bullet path** | The collision world is 2D (`ctx.solid(x, z)`) plus car boxes; buildings have no per-floor or height detail | Hitscan from the muzzle along the aim ray, marched over the 2D solid grid (a building stops it) and tested against car boxes (height checked) and people (a vertical capsule, height checked, so aiming at the sky misses). There is no bullet drop or travel time at pistol ranges (≤ 60 m), which is real for a pistol | OK |
| R8 | **Shooting through walls or over low objects** | Low walls, fences and planters are not in the solid grid at the right height | Accept at first: low street furniture does not stop bullets. Buildings do. List it as a limitation | Compromise |
| R9 | **Police see and shoot through buildings** | The police's line of sight is a radius (45 m) today (§9s limitation) | Before any officer shoots, a line-of-sight ray over the same 2D grid; no shot without sight. This also fixes the earlier "police see through walls" | Must do |
| R10 | **Hit location** | People are one capsule; no head or leg zones | Two zones: head (above 1.5 m) and body. A headshot takes the target down at once. No limb damage | OK |
| R11 | **Being shot looks like being hit by a car** | Falls use the vehicle knockdown (`strike`), which throws the body sideways | Near people play the existing `Fall`/`Death` clip pushed gently along the bullet direction, not the car impulse. The HQ crowd uses its existing down state. No ragdoll: out of scope, and no Rapier (project rule) | Compromise |
| R12 | **Muzzle flash at night** | No new point lights (the night light budget, §9s) | An emissive flash sprite plus a one-frame screen-space bloom kick. The street is not lit by the flash | Compromise |
| R13 | **Gunshot sound** | A synthesised gunshot usually sounds fake | Use CC0 recorded gunshots and ricochets through the existing audio pipeline (lock file, SHA-256, loudness), plus a synthesised city slapback echo. Every source's licence is read on its own page | OK, if CC0 recordings are found; otherwise synthesis marked as temporary |
| R14 | **Crowd panic at gunfire** | 1,978 people; the signal and crossing rules | Gunshots go through the existing witness path with a larger radius (about 40 m) and a cap on reacting people per shot. On-rails people never stop on a crossing (§16a) | OK |
| R15 | **Japanese police do not open fire casually** | Realism of Japan | ☆1–☆2 baton and arrest only. At ☆3, officers draw revolvers: first a warning shot upward with 「撃つぞ！」, then fire only if the player is armed, attacking or ramming. They do 10–15 a hit, accuracy falls with distance, and they cannot hit without line of sight (R9) | OK |
| R16 | **Touch aiming** | No mouse | On phone, aiming is lock-on only (nearest valid target in the view cone); fire and switch buttons on the pad | OK |
| R17 | **The camera over the shoulder** | Walls near the camera | Reuse `clipCameraArm`; the aim camera is a shorter, offset arm | OK |
| R18 | **Weapons and vehicles** | Drive-by shooting is a large feature | Entering a car holsters the weapon. No drive-by in this plan | Deferred |

## 2. Rules (defaults; change before starting if wanted)

- **Weapons from the start:** fists, pistol, katana. Switch with 1/2/3 or the mouse wheel on PC,
  and a weapon button on the pad. Holstered weapons are visible: the pistol at the hip, the
  katana on the back or hip.
- **Pistol:**
  - hold the right button to aim (the shoulder camera and a crosshair), left button to fire;
  - soft lock-on to the nearest person in the cone;
  - 8 rounds, R reloads (`Pistol_Reload`), unlimited reserve;
  - 50 damage to the body, a headshot takes the target down at once;
  - a shot's cooldown follows `Pistol_Shoot`.
- **Katana:**
  - 50 damage;
  - it reaches about 1.9 m and hits everyone in the front arc during the active window;
  - two hits down a person.
- **Police:**
  - revolvers from ☆3, as in R15;
  - new lines 「銃を捨てろ！」 and 「撃つぞ！」 in the formant synthesiser (`src/player/voices.mjs`,
    `kind: 'police'`).
- **Wanted:**
  - shooting in public, or a gun or katana kill, is at least ☆2;
  - an officer seeing a drawn weapon is ☆1.
- **Names:** no real gun maker or model names (for example S&W, Glock, New Nambu, SAKURA).
  Generic shapes only. Extend the existing name-guard test.

## 3. Steps (one PR each, stacked)

1. **W1: the weapon system, the katana, and the bench**
   - the clips added to the character pack and rebaked, including the HQ atlas only if a far
     body must show a weapon (default: near bodies only);
   - the inventory and switching, and the attach points on `hand_r`, the hip and the back;
   - `qa/gta-upgrade/weaponbench.html` for the grip, the idle and the swing from four angles;
   - the katana's swing, hit window, arc test and spark on solids;
   - R4 as option (a).
2. **W2: the player's pistol**
   - the aim camera, crosshair and lock-on;
   - the upper-body aim, the aim correction (R1) and aim pitch blending;
   - the hitscan (R7, R10), impacts, blood and the down state (R11);
   - the flash (R12), sound (R13) and panic (R14);
   - wanted rules.
3. **W3: police revolvers**
   - line of sight (R9), the draw at ☆3, the warning shot and firing rules (R15);
   - near officers only (the near-humanoid pool);
   - the new voice lines.
4. **W4 (if time): Roll and crouch**
   - `Roll` as a dodge with brief invulnerability to bullets;
   - `Crouch_Fwd_Loop` for sneaking, which makes the police's sight shorter.

## 4. Tests (each must fail on the code before it)

- **R1:** while walking and aiming at a point 10 m away, the muzzle ray passes within 0.25 m of
  it, at 0°, ±45° and ±90° body turn.
- **R3:** the weapon's grip stays within 3 cm of the hand bone through every frame of its clips.
- **R6:** the katana hits only inside the measured active window; a wall in the arc stops the
  swing.
- **R7/R10:**
  - a building between the shooter and a person blocks the shot;
  - a shot above a person's head misses;
  - a head-height hit is a headshot;
  - a car box stops a bullet.
- **R9:** no police shot without line of sight; the police cannot see through buildings.
- **R14:** reactions per shot are capped; nobody on rails stops on a crossing.
- **R15:** police never fire at ☆1–☆2; at ☆3 the first shot is a warning shot.
- **Wanted rules**, and the name guard.

## 5. Device checks (the user, local Chrome)

- **Bench:** the grip, idle, aim, shot, reload and swing from four angles. Nothing floats, and
  there is no clipping into the body.
- **In game, HIGH, day and night:**
  - walk while aiming: the gun stays on the target;
  - shoot a person, a car and a wall; a headshot;
  - the crowd panics without freezing the crossing;
  - police at ☆3 draw, warn and fire, never through a building.
- **Record:** fps and draw calls with gunfire, and console errors (0).
- **Listen:** the gunshot and its echo. Is it real, not a toy?
- **Katana:** is a one-handed swing acceptable (R4)?
