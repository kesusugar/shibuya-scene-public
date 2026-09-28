# Plan: a Japanese patrol car that reads as one, a human police loudspeaker, and Kaze FR in detail

Status: **All four steps implemented**: Step P on `claude/police-voice-kaze` (§9u), Step V on
`claude/police-voice-kaze-2` (§9v), Step K1 on `claude/police-voice-kaze-3` (§9w), Step K2 on
`claude/police-voice-kaze-4` (§9x). Two things are explicitly flagged for the user's own ears/eyes
rather than claimed as done: whether the loudspeaker lines read in a live chase (§9v), and whether
Kaze FR's wheel exposure looks right despite clearing its tested number (§9w/§9x). Originally:
Written 2026-09-25 on `master` `b2a39ef`
(PRs #24–#31 merged). It comes from the user's first device run of the police and own-car work.
The work happens in a local Claude CLI session so it can be checked on the real device. Read
`AGENTS.md`, `CLAUDE.md`, `docs/GTA-FIDELITY-STATUS.md` (§9m–§9t, §16a),
`docs/PLAN-LOOKS-AND-FLEET.md` §0 and `docs/PLAN-POLICE-AND-OWN-CAR.md` first.

## 0. What the user saw, and decisions

- **The patrol car does not read as Japanese.** On the device, at night, the body looked grey
  all over rather than black below and white above. The roof "light bar" was a flat orange
  plank that looked like a taxi roof sign.
  - The code: the livery is a height band in the fleet body shader (`LIVERY.police` in
    `src/traffic/fleet.mjs`: lower `0x121417`, upper `0xf1f1ec`, `band: .58`). The light bar is
    a flat `BoxGeometry` pushed into the `tail` part in `src/traffic/vehicle-shape.mjs`
    (`d.lightbar`), so it takes the tail-lamp material.
- **The loudspeaker sounds like a machine.** It is the browser's `speechSynthesis`
  (`createLoudspeaker` in `src/police/siren.mjs`; lines in `src/police/director.mjs`). The user
  wants a real man's voice, a patrol officer calling out, half-shouting.
- **The user cannot record a voice,** and VOICEVOX did not sound right to them. So the voice is
  short shouts from the crowd's formant synthesiser; see Step V.
- **Kaze FR lacks detail against the reference photo.** The user agreed to the analysis below
  (2026-09-24/25). Everything stays "〜風" (`PLAN-LOOKS-AND-FLEET.md` §0):
  - the name guard applies;
  - no maker, model, body-kit maker or film names in `src/`;
  - the car evokes a 1990s rotary-era FR coupé and must not copy a specific body kit's panels,
    in particular the reference's aftermarket kit, its huge side intakes and its nose.

## 1. Step P: the patrol car reads as a Japanese black-and-white (small; do first)

- **Diagnose the grey first, on the device, at night and by day.**
  - Is the band evaluated in the space the shader thinks it is (local height as a fraction of
    `VEHICLES.police.height`)?
  - Does the upper colour arrive, or is the batch alpha that carries the livery being lost
    somewhere?
  - Is white simply lit grey at night?
  - Fix the cause. Write it into §16a if it was a bug.
- **Target look (generic Japanese patrol car):**
  - a crisp split, black below the beltline including the bonnet front and boot sides, and white
    doors, roof and pillars. Use the real proportion: the split sits at the beltline, not
    halfway up.
  - Black bumpers.
  - No text, emblem or agency name (§0 of the looks plan). Keep the door text off, as decided.
- **Light bar.**
  - Replace the flat plank with a roof-width bar: rounded ends, a red translucent lens split into
    segments, and a clear or white centre section.
  - It sits on a low dark mount, not flat on the roof, and is its own part or material, not the
    tail lamp.
  - Night emission rotates across the segments using `flashPhase()`, which already exists.
  - Add a pair of small red lamps in the front grille area.
- **Level of detail.** Traffic stays in the five fleet batches. Put the light bar's extra shape
  in the batch geometry, so there are no new draw calls. If a separate lens material is needed,
  it may add at most one draw call for all police cars together.
- **Tests.**
  - The police livery's upper and lower colours reach the shader, with the band at the beltline.
  - The light bar geometry is rounded (more than 8 segments), sits above the roof, and is not in
    the `tail` part.
  - The traffic draw-call count is unchanged or up by at most 1.
- **Device check.** Screenshots day and night, near (5 m) and far (40 m), beside a taxi and a
  sedan. It must read black-and-white at a glance.

## 2. Step V: a human-sounding police loudspeaker (small to medium)

**Changed 2026-09-25 (the user's call).** VOICEVOX was tried by the user and did not sound
right. Instead, the officers get **short shouts built with the crowd's own formant synthesiser**
(`src/player/voices.mjs`), played through a megaphone chain. It has no asset, no external tool
and no licence question.

- **Be honest about what this buys** (the module's own header says so):
  - formant synthesis gives a human-sounding cry with the right vowels and rhythm, not a clearly
    intelligible word;
  - a real patrol-car loudspeaker is itself distorted and hard to make out. That, plus the siren
    and the chase context, is what makes 「ト・マ・レ」 read as 「止まれ！」.
  - Keep lines short. Long sentences expose the synthesis.

### V1. Police lines in the formant synthesiser

- **Lines** (chosen by the user 2026-09-25; short commands a Japanese officer shouts):

  | Line | When | What it needs |
  | --- | --- | --- |
  | 「止まれ！」 | the pursuit, the player driving or on foot | `t`, new `m`, new `r` |
  | 「停車！停車！」 | the pursuit, the player driving. Said twice: a lone 「停車」 reads stiff. Drop it if it does not survive the device check | new `sh` (a palatal fricative), then `a` |
  | 「動くな！」 | an officer close to the player; just before an arrest | `g`, `k`, `n` (existing) |
  | 「逃げるな！」 | the player running away on foot | `n`, `g`, new `r`, `n` |
  | 「降りろ！」 | the player's car stopped or pinned by police | new `r`, then vowels |
  | 「確保！」 | the arrest itself | `k`, `k`, `h` (existing) |

- **New onsets** in `ONSETS`, in the same style as today's:
  - `m`: a nasal like `n`, with a lower second formant and a short hum before the vowel;
  - `r`: the Japanese flap, a very short (about 15–25 ms) closure dip with no burst, between
    vowels;
  - `sh`: a fricative, band-passed noise at about 2.5–4.5 kHz for 70–100 ms before the vowel.
    It is lower than an `s`, which gives 「しゃ」.
- **Police personas.** Two adult male throats (a lower base pitch, formants scaled for a longer
  vocal tract), deterministic by car id like the crowd's personas.
  - The contour is a shout: a strong onset, a raised peak and a falling end, with the last vowel
    stretched for 「ー」.
  - A new `kind: 'police'` so the crowd never uses these lines, and the police never uses the
    crowd's lines.
- **Tests.**
  - Every police line is built only from defined vowels and onsets.
  - The new onsets produce their intended shape: `m` and `n` have no noise burst, `sh` has
    high-frequency noise and `r` is shorter than 30 ms.
  - The police kind is separate from the crowd's kinds.

### V2. Play them like a patrol car loudspeaker (runtime)

- **The megaphone chain,** only for `kind: 'police'`:
  - a band-pass of about 350–3,500 Hz;
  - mild saturation (a `WaveShaperNode`);
  - a short slapback echo for the street, about 70–110 ms at low level;
  - a synthesised mic click before each line;
  - through the HRTF panner at the car, like the siren.
  - The siren ducks by about 6 dB while a line plays.
- **When.**
  - Only while pursuing with the siren on, the car within 40 m of the player, and at most one line
    every 6–8 s across all cars.
  - Driving player: 「止まれ！」 and 「停車！停車！」.
  - Player's car stopped or pinned: 「降りろ！」.
  - On foot and running: 「逃げるな！」 and 「止まれ！」.
  - An officer within 3 m, or an arrest starting: 「動くな！」.
  - The arrest completes: 「確保！」 (outside the gap rule, once per arrest).
  - Never repeat the last line.
- **Remove the machine voice.**
  - `speechSynthesis` (`createLoudspeaker` in `src/police/siren.mjs`) is no longer used in play.
  - Keep it only behind `?voice=tts` for comparison, or delete it.
- **Tests.**
  - The selection follows the driving/on-foot state, never repeats a line and keeps the gap.
  - The megaphone chain is built only for the police kind.
  - `speechSynthesis` is never called without `?voice=tts`.
- **Device check.** The user listens: can each of the five lines be recognised in a chase?
  - If not after tuning, the fallback is a paid, commercially licensed TTS (ElevenLabs or
    OpenAI) or a commissioned voice actor.
  - Either one only changes where the audio comes from. The playback in V2 stays.

## 3. Step K: Kaze FR in detail (large; two PRs)

The car is drawn by `src/player/vehicle-asset.mjs` from the loft (`buildVehicleShape`, the
`fastback` silhouette, kit in `vehicle-shape.mjs`). It is one car, so it can afford more
geometry and a better material than traffic.

### K1 (first PR): proportions, body sections, cabin, wheels

1. **Proportions.** About 4.30 m long, 1.76 m wide and 1.23 m high, with a 2.43 m wheelbase.
   Short overhangs (front about 0.85 m). Wheels about 0.66 m in diameter overall, with a wide
   track, and the wheels flush with the arches.
2. **Body sections.** Go from about 10 to 15–20 stations. Each station's upper outline carries:
   - front fender peaks higher than a low bonnet valley between them;
   - a pinched waist at the doors and swelling rear haunches (the "coke bottle");
   - tumblehome, the flanks leaning in toward the roof.
   - Add smooth normals across stations, so there is no faceting.
3. **Cabin.** A separate curved loft:
   - a raked, curved windscreen and a canopy roof;
   - wrap-around rear glass;
   - black pillars and a black roof panel, per the reference's two-tone.
4. **Wheels and arches.**
   - Cut the arches out of the body around each tyre, with flares.
   - A 5-spoke silver rim, a tyre sidewall, and a dark brake disc visible through the spokes.
   - No wheel hidden under a skirt.
5. **Bench** `qa/gta-upgrade/carbench.html`, like `punchbench.html`: Kaze FR alone, rendered
   side, front, rear and three-quarter, day and night, at 1280×720. Evidence goes into
   `evidence/kaze-detail/`.

### K2 (second PR): parts, paint, lamps

6. **Parts:**
   - a rear wing at the tail edge: two uprights, end plates and a thin blade, not on the roof;
   - body-colour door mirrors;
   - pop-up headlamps (kept) plus slim clear fixed lamps below them, lit at night;
   - round or oval tail lamps;
   - a large black lower front opening with a lip;
   - side skirts, a rear diffuser and two exhaust tips;
   - a modest generic side intake behind each front wheel, smaller than the reference kit's.
7. **Paint.**
   - A clearcoat physical material for this car only: `MeshPhysicalMaterial`, `clearcoat` 1,
     low roughness, the environment map on.
   - Orange about `#f39a1d`.
   - Black bonnet, roof and lower accents as recessed or separate panels, not only colour.
8. **Budget:** at most 60k triangles and at most 10 draw calls for the whole car, and fps within
   noise at HIGH night.
9. **If the loft still cannot carry the curves after K1/K2,** propose (not do) a hand-modelled
   original GLB made in Blender by the project. It is original work, so there is no licence
   issue, but the name guard and the no-copy rule still apply.

- **Tests (K1 and K2).**
  - The dimensions are within ±3%.
  - The station count is at least 15.
  - The fender peaks are higher than the bonnet valley at the front axle.
  - The wing's position is behind the rear axle and below the roof peak.
  - The arch cut-outs expose at least 60% of the wheel's height from the side.
  - The triangle and draw-call budgets hold.
  - The name guard passes.
- **Device check.**
  - `carbench` shots against the reference-photo checklist (items 1–9 of the analysis): the
    fender curves, the canopy, the wing position, visible wheels, the proportions, the two-tone,
    the gloss, the parts and smoothness.
  - In game: a night drive, lamps, reflections, and the drift feel unchanged.

## 4. Order and commits

1. Step P: the patrol car look. One PR.
2. Step V: V1 and V2 together. One PR. The user judges the result by ear.
3. Step K1. One PR.
4. Step K2. One PR.

- Separate implementation, evidence and doc commits. Each PR adds a §9 section (and §16a
  entries for bugs) to `docs/GTA-FIDELITY-STATUS.md`.
- Before each PR: `npm run typecheck`, `npm run test:ci`, `npm test`, and `git status --short`.
