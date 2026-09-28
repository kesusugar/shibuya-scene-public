# Plan: a lighter scene at 60 fps, and the Switch Pro Controller

Status: **P0 and C1–C4 implemented** (`docs/GTA-FIDELITY-STATUS.md` §9ac, §9ad); P1–P4 wait for the user's `?perf=sweep` JSON. Approved by the user 2026-09-25. Order: P0 first, then the user measures on the
device; C1–C4 do not depend on the measurement and go ahead meanwhile; P1–P4 wait for it.
Read `AGENTS.md`, `CLAUDE.md` and `docs/GTA-FIDELITY-STATUS.md` (§9j 12.0, §16a) first.

## 0. Where things stand (measured 2026-09-25 on `master` `01a3be3`)

- **Frame rate.** The user's Windows PC, Chrome, HIGH: about **6–7 fps** (GTA-FIDELITY-STATUS §9h,
  §9l). Earlier notes put the cost per frame on the CPU rather than on fill rate. HIGH runs the
  full crowd (1,978), 8 near humanoids, 74 cars, shadows at 4096, GTAO, bloom, SMAA and the night
  road mirror; player mode was ~760 draw calls and ~4.5 M triangles (RUN 6–8 metrics).
- **The weapons (PR #36) are not the cause.** The aim layer runs only while aiming; the weapon
  meshes are hidden until drawn.
- **Data.** `public/data/shibuya-static-models.json` 18.9 MB (4.9 MB gzipped), of which the HIGH
  crowd (`life.high`) is 7.1 MB and traffic 2.9 MB; `character/citizen.glb` 2.6 MB;
  `crowd/hq-crowd.bin` 2.7 MB; audio 1.8 MB. Size mostly costs startup and parse stalls.
- **Controller.** The Gamepad API is read with fixed button indices in `controller.mjs`. Chrome
  and Edge present the Switch Pro Controller in the positional *standard* layout, so its buttons
  are named the other way round from an Xbox pad (A right, B bottom), and ZL/ZR report 0 or 1
  only — a digital throttle today.

## 1. Targets and decisions (closed)

- The device is the user's Windows PC, Chrome, HIGH. No phone target.
- **60 fps** is the aim on the default quality; with gunfire and ☆3 not below 45. HIGH stays as
  "maximum".
- Button layout: GTA-style, below (§3 C2), approved.
- No frame rate is ever reported from the cloud's software renderer; only the device counts.

## 2. Performance (Steps P)

1. **P0 — measure on the device.** `?perf=1` shows an overlay: fps, frame ms split into update
   (per system: crowd, HQ crowd, traffic, police, player, …) and render, GPU frame time where
   the browser exposes timer queries, draw calls, triangles, heap. `?off=gtao,shadow,…` switches
   single features off. `?perf=sweep` runs an automatic A/B at a fixed camera — each feature off
   in turn for a few seconds — and downloads one JSON. The user runs it once; P1–P3 are ordered by
   what it shows.
2. **P1 — settings that pay at once.** Dynamic resolution holding the target frame time; a new
   default quality (shadows 2048, GTAO at half rate or off, FXAA for SMAA, the road mirror off by
   default). HIGH is kept.
3. **P2 — less CPU.** Update far pedestrians and cars less often (the far HQ crowd at 10 Hz), size
   the crowd budget to what is visible, near humanoids 8 → 4, witness and panic passes sharing one
   grid per frame.
4. **P3 — less drawing.** Merge and instance buildings, signs and street furniture (draw calls
   760 → ≤ 300), LOD for distant buildings (4.5 M → ~1.5 M triangles).
5. **P4 — lighter data.** The static models as binary typed arrays, compressed and split by
   quality (18.9 MB → ≤ 5 MB; LOW and MEDIUM never load the HIGH crowd); `citizen.glb` quantised /
   compressed (2.6 → ~1 MB).

Every step: tests, the bench, screenshots, and the device number before and after.

## 3. The Switch Pro Controller (Steps C)

It is played through the browser on the PC (USB or Bluetooth), not on a Switch. Steam Input can
capture the controller; close Steam or turn Steam Input off for the browser.

1. **C1 — an input map.** `src/player/input-map.mjs`: actions bound per profile (keyboard,
   standard pad, Switch Pro), edge and hold detection in one place instead of fixed indices.
   Detect the Switch Pro Controller by its id (`057e`, "Pro Controller"); the HUD hints switch to
   A/B/X/Y and ZL/ZR.
2. **C2 — the layout.**

   | | On foot | In a car |
   | --- | --- | --- |
   | Left stick / press | move / crouch | steer / horn |
   | Right stick | camera | camera |
   | ZL | aim (hold) | brake, reverse |
   | ZR | fire / punch / cut | throttle |
   | B (bottom) | run (hold) | — |
   | A (right) | reload | — |
   | Y (left) | roll | — |
   | X (top) | get in | get out |
   | L / R | previous / next weapon | — / handbrake |
   | D-pad up | — | siren (patrol car) |
   | + / − | menu (back to observe) / map | same |

3. **C3 — feel.** ZL/ZR are digital, so throttle and brake ramp over ~0.3 s; sticks get a radial
   deadzone and a response curve; camera sensitivity and invert-Y settings; a slightly wider
   lock-on while aiming with a pad.
4. **C4 — rumble.** Shots, hits and crashes through `vibrationActuator`; silently nothing where the
   browser has no rumble for the controller.
5. **C5 (optional) — gyro aim** through WebHID (Chrome only, a permission prompt).

Checks: the `?pad=1` diagnostics tab lists each button with its Switch name for the device check;
tests feed fake gamepad snapshots for both profiles.
