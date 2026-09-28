# Crowd voices

Pedestrians shout when the player's car comes at them, and scream when it hits them.

This note records what was built, what it can and cannot sound like, and the numbers the
tuning came from. It replaces `AUDIO-HANDOVER-2026-09-17.md`, which briefed handing the work
to another implementer; that brief is obsolete because the work was done here instead.

## What it is, and what it is not

Nothing is recorded. There is no audio file in the repository and none is downloaded. A shout
is synthesised the way a voice is: a sawtooth glottal source, bent by a pitch contour and a
little vibrato, pushed through three parallel bandpass resonances that slide from one vowel to
the next, with a short filtered noise burst in front of it where a consonant would be.

Two reasons, in this order. Brand and third-party assets are not committed to this repository
without authorisation, and voice recordings would need that clearance. And startup time is the
thing this project guards hardest: the whole voice system is a few kilobytes of source, against
the few hundred kilobytes a usable set of clips would cost on the loading path.

Be honest about the result. **This is formant synthesis, not speech.** Utterances that are one
long vowel behind a stop — 「きゃーー！」, 「ぎゃああ！」, 「うわあああ！」 — come out well, because that is
almost exactly what the technique models. Utterances with real consonant structure —
「あぶな！」, 「ちょっと！」 — come out as a recognisable three-beat shape with the right vowels in the
right places and the right intonation, but nobody will mistake them for a person saying the
word. It reads as a human-sounding cry rather than a beep. That is the whole claim.

If the words themselves have to be intelligible, that needs recorded clips, and that needs a
licensing decision. The trigger logic, the queue, the budget and the playback path below would
all be reused unchanged; only the sound source would swap.

## Where it hooks in

The simulation owns no audio, exactly as it owns no meshes. `CrowdSimulation` pushes to a
`voices` queue and whoever is listening drains it each frame — the same contract `splashes`
already uses for blood.

- `vehicle.alertPedestrians` already swept the corridor ahead of the car and called
  `crowd.scatter` on everyone in it. It now also passes an **urgency**: how close the car is to
  arriving, with lateral distance counting half as much as closing distance.
- `CrowdSimulation.scatter` calls `say(p, 'alert', urgency)`; `CrowdSimulation.strike` calls
  `say(p, 'scream', 1)`.
- `app/ShibuyaScene.tsx` drains `crowdSim.voices` beside `crowdSim.splashes`, orders the batch
  with `prioritise`, and plays it through `src/player/voices.mjs`.
- The listener is the camera, not the car: the camera trails the car by several metres and it
  is where the ears are.

Voices are player-only, and the test suite asserts it: sixty simulated seconds with no player
car queue zero voices. Observation mode is unchanged.

## The numbers this was tuned against

Thirty seconds of driving through the scramble, high tier, car seeded on the busiest ground
available (128 people within 20 m):

| | |
|---|---|
| `scatter()` calls | 1535 (51.2/s) |
| voices queued | 92 (3.1/s) |
| distinct people | 66 |
| most shouts from one person | 3 |
| bodies struck | 12 |

**The cooldown is the whole reason this is usable.** The alert sweep fires fifty times a second
across a couple of distinct people a second; without a per-person cooldown a single pass queues
thousands of voices for a few dozen throats. `VOICE_COOLDOWN` is 5.5 s.

**The cooldown alone got it wrong, measurably.** Someone shouted the moment the car entered
their eighteen metres — when it is furthest away and least alarming — and was then silent
through the entire approach. 41 of 78 voices came out of the calmest urgency band and
「きゃーー！」 essentially never played. So a warning can be taken back: if the situation gets
`VOICE_ESCALATION` (0.3) worse and `VOICE_REPRISE` (1.1 s) has passed, they shout again. The
0.5–0.75 urgency band went from 2 voices to 14, and nobody shouts more than three times.

**Spacing cannot be a test against the clock.** A frame drains its whole batch at one
`ctx.currentTime`, so a `now - lastStart < gap` gate lets exactly one voice per frame through
and silently drops the rest of every batch. It is a stagger instead: the second voice of a
burst is *scheduled* a beat after the first. Measured stagger is 0.012 s median, 0.192 s worst,
and anything that would land more than `maxDelay` (0.35 s) late is dropped, because a shout
that arrives half a second after the car has gone past is the wrong shout.

**A scream is not a warning and must not lose a slot to one.** Before priority, ducking and a
separate scream timeline, six of twelve bodies went under the car in silence. Screams now get
their own concurrency headroom, a fraction of the spacing, their own stagger timeline, and if
every slot is full they cut a warning short and take it.

Where that leaves it: of the twelve bodies in that run, all twelve went down inside one second
— a single pile-up — and eight were heard. The four that were not were refused because every
slot already held another scream, which is the correct outcome: six simultaneous screams is
already a wall of sound. Isolated impacts (at least half a second since the last body) are
heard 1/1. **If you drive at a crowd, expect a burst where not every individual is
distinguishable. If you hit one person, you will always hear them.**

## Verified

Every line rendered through an `OfflineAudioContext` in headless Chrome and measured. All eight
produce signal — peak 0.10–0.32, RMS 0.019–0.035 — and the spectra show real vowel structure
rather than a buzz: 「ひぃっ！」 puts energy at 2541 Hz where /i/'s second formant belongs,
「きゃーー！」 and the screams sit at ~750 Hz and ~1300–1490 Hz for /a/, and 「あぶな！」's nasal
drops to the fundamental. Distance attenuates as intended (3 m → RMS 0.0119, 15 m → 0.0060,
29 m → 0.00015) and past `VOICE.range` nothing is built at all. The same pedestrian id renders
an identical persona every time; the crowd spans two registers and 167 distinct pitches per 300
people.

## Not verified here

There is no sound device in the build environment, so **nobody has actually listened to this**.
The measurements above say the signal exists and has the right shape; they do not say it sounds
good. Judging 「きゃーー！」 against what a person would accept needs the real machine and a
headphone.

## Deliberately not done

- **Shibuya BGM.** Ambient city noise and music are a separate decision, and the same licensing
  question applies more strongly to music than to a yelp.
- **Shouts while on foot.** Only the car provokes anyone. Walking through the crowd is silent.
- **Time-of-day variation.** The same voices at noon and at 3 a.m.
- **Vehicle-relative Doppler or reverb.** Distance changes level and brightness; nothing else.
