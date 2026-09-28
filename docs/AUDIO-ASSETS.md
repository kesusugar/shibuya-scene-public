# Audio assets (RUN 12.1)

Every sound the scene plays from a file is a CC0-1.0 recording listed here. Nothing else is
shipped: the engine note and the spoken words (「あぶな！」…) stay synthesised in
`src/player/audio.mjs` and `src/player/voices.mjs`, and every recorded sound falls back to its
synthesised version until the clips have decoded.

## Pipeline

1. `assets/audio/upstream.lock.json` records each source: its page, author and licence, and the
   URL and SHA-256 of the exact bytes downloaded.
2. `npm run fetch:audio` downloads them into `assets/audio/upstream/` (git-ignored). It refuses
   to continue if any hash differs or any licence is not CC0-1.0.
3. `npm run convert:audio` produces `public/audio/*.mp3` and `public/audio/manifest.json`,
   which are committed. It needs a local Chrome (`CHROME_PATH`) for decoding, and does this:
   - cuts each clip to its window and trims the silence;
   - normalises one-shots to −12 dBFS on their loudest 50 ms, and loops to −20 dBFS (the
     crossing chirp to −16 dBFS), with peaks at or below −1 dBFS;
   - crossfades loop tails into their heads;
   - encodes to MP3 with `@breezystack/lamejs` (a dev dependency, LGPL-3.0, not shipped);
   - records the encoder's lead-in, so a one-shot starts on the frame it lands.

Levels were set by this measurement, **not by listening**. The per-kind mix is `MIX` in
`src/audio/bank.mjs`; a listening pass on real hardware may move it.

## Sources

| Source | Title | Author | Used as |
| --- | --- | --- | --- |
| [fs-31791](https://freesound.org/s/31791/) | cross_road_shibuya.mp3 | Heigh-hoo | ambience-scramble |
| [fs-18443](https://freesound.org/s/18443/) | ginza_ambience.aif | Heigh-hoo | ambience-ginza |
| [fs-98154](https://freesound.org/s/98154/) | CuckooSignal.wav | hrhk | crossing-cuckoo |
| [fs-60013](https://freesound.org/s/60013/) | Whoosh | qubodup | swing-0 |
| [fs-389590](https://freesound.org/s/389590/) | Swing Woosh | Jofae | swing-1 |
| [fs-59988](https://freesound.org/s/59988/) | SWOSH-01 44.1kHz | qubodup | swing-2 |
| [fs-118513](https://freesound.org/s/118513/) | Punch_02.wav | thefsoundman | punch-0 |
| [fs-390462](https://freesound.org/s/390462/) | Punch in the face | Huminaatio | punch-1 |
| [fs-244513](https://freesound.org/s/244513/) | Realistic Punch | JewTwinz | punch-2 |
| [fs-104183](https://freesound.org/s/104183/) | punch.wav | Ekokubza123 | punch-3 |
| [fs-257928](https://freesound.org/s/257928/) | Body Thud.wav | Kane53126 | body-0 |
| [fs-346695](https://freesound.org/s/346695/) | Body fall_01.wav | deleted_user_2104797 | body-1 |
| [fs-504626](https://freesound.org/s/504626/) | BODY FALL - V HVY - DIRT | leonelmail | body-2 |
| [fs-447922](https://freesound.org/s/447922/) | Thud / Falling on wooden floor / Snapping, breaking neck | Breviceps | runover-0 |
| [fs-151624](https://freesound.org/s/151624/) | Clank Car Crash Collision | qubodup | crash-0 |
| [fs-592388](https://freesound.org/s/592388/) | Car Crash (with Glass) | magnuswaker | crash-1 |
| [fs-420356](https://freesound.org/s/420356/) | Crash.wav | CogFireStudios | crash-2 |
| [fs-104026](https://freesound.org/s/104026/) | Tires Squeaking.aif | RutgerMuller | screech-0 |
| [fs-233558](https://freesound.org/s/233558/) | [SFX] car screech 2 | waveplaySFX | screech-1 |
| [fs-536769](https://freesound.org/s/536769/) | Tire.ogg | egomassive | screech-2 |
| [fs-434878](https://freesound.org/s/434878/) | Car Honking | MicktheMicGuy | horn-0 |
| [fs-423990](https://freesound.org/s/423990/) | Car horn beep beep two beeps honk honk | AmishRob | horn-1 |
| [fs-32417](https://freesound.org/s/32417/) | car_horn.wav | KRAFTWERK2K1 | horn-2 |
| [fs-170243](https://freesound.org/s/170243/) | Car Horn.wav | BeatsbyCasper | horn-3 |
| [fs-235592](https://freesound.org/s/235592/) | Girl_Scream.wav | tcrocker68 | scream-0 |
| [fs-241573](https://freesound.org/s/241573/) | short scream.wav | Reitanna | scream-1 |
| [fs-845164](https://freesound.org/s/845164/) | Woman Screaming | DanJFilms | scream-2 |
| [fs-169628](https://freesound.org/s/169628/) | Male voice screaming loudly | Dinsfire | scream-3 |
| [fs-341908](https://freesound.org/s/341908/) | Gasp. | bacruz666 | gasp-0 |
| [fs-207779](https://freesound.org/s/207779/) | Gasp.wav | Dvideoguy | gasp-1 |
| [fs-416838](https://freesound.org/s/416838/) | Grunt2 - Death Pain.wav | tonsil5 | pain-0 |
| [fs-416839](https://freesound.org/s/416839/) | Grunt1 - Death Pain.wav | tonsil5 | pain-1 |
| [kenney-impact](https://kenney.nl/assets/impact-sounds) | Impact Sounds (1.0) | Kenney | punch-4, punch-5, runover-1, step-0, step-1, step-2, step-3, step-4 |

All sources: licence CC0-1.0, https://creativecommons.org/publicdomain/zero/1.0/.
The Freesound transports are each sound's own high-quality MP3 preview. Freesound's API needs a
key for original files; the licence of a preview is the sound's own.
