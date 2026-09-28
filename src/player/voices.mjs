// The crowd you can hear.
//
// RUN 12.1: screams, gasps and low grunts of pain now play CC0 recordings when the sound bank
// (src/audio/bank.mjs) has them -- see `recordedKind`. Everything below is still true of the
// words, and of every voice until the recordings have decoded.
//
// Nothing here is a recording. The repository ships no third-party audio -- the licensing
// would have to be cleared and the bytes would land on the startup path this project guards
// hardest -- so a shout is built the way a voice is built: a buzzing glottal source shaped by
// three resonances that slide from one vowel to the next, with a noise burst in front of it
// where a consonant would be.
//
// Be honest about what that buys. This is formant synthesis, not speech. 「きゃーー！」, which
// is one long vowel behind a stop, comes out convincingly. 「あぶな！」 is a recognisable
// three-beat shape with the right vowels in the right places, but nobody will mistake it for
// a person saying the word. It reads as a human-sounding cry rather than a beep, and that is
// the whole claim.
//
// Voices are per-person and deterministic: the same pedestrian always has the same throat,
// because a crowd where every shout has a different voice sounds like a crowd, and one where
// the same body yelps in a new register each time sounds broken.

// Neutral adult formants, Hz. Scaled per persona -- a shorter vocal tract lifts all three.
export const VOWELS = {
 a: [730, 1090, 2440], i: [270, 2290, 3010], u: [300, 870, 2240],
 e: [530, 1840, 2480], o: [570, 840, 2410], n: [280, 1200, 2400]
};

// What goes in front of a vowel. A stop is a beat of silence and then a burst; an aspirate is
// just breath. `gap` and `ms` are seconds and milliseconds respectively, which is ugly, but
// they are read in those units at the two places they are used.
export const ONSETS = {
 k: {gap: .026, ms: 14, type: 'highpass', hz: 2600, level: .85},
 t: {gap: .022, ms: 10, type: 'highpass', hz: 3600, level: .75},
 b: {gap: .030, ms: 12, type: 'lowpass', hz: 800, level: .85},
 g: {gap: .026, ms: 12, type: 'lowpass', hz: 1500, level: .75},
 h: {gap: 0, ms: 60, type: 'bandpass', hz: 1400, level: .45},
 n: {gap: .014, ms: 0, type: null, hz: 0, level: 0, nasal: true},   // nasal: a hum, not a burst
 // PLAN-POLICE-VOICE-KAZE-DETAIL Step V1: three onsets for the police lines.
 // `m`: like `n`, a nasal hum rather than a burst -- see `nasal` below, which plays the hum at
 // `VOWELS.n` (already the nasal-murmur formant triple) during the gap.
 m: {gap: .05, ms: 0, type: null, hz: 0, level: 0, nasal: true},
 // The Japanese flap: a very short closure with no burst at all, between vowels.
 r: {gap: .02, ms: 0, type: null, hz: 0, level: 0},
 // A fricative lower than an /s/ would be, which is what turns しゃ into a soft rather than a
 // hissy syllable.
 sh: {gap: 0, ms: 85, type: 'bandpass', hz: 3500, level: .5},
 // PLAN-WEAPONS W3: the consonants of 「銃を捨てろ」 and 「撃つぞ」. `j` is a short voiced
 // affricate (a closure, then a low hiss), `s` the plain hiss, higher than `sh`, and `z` a voiced
 // buzz: a short closure and a quieter, lower hiss.
 j: {gap: .022, ms: 45, type: 'bandpass', hz: 2700, level: .42},
 s: {gap: 0, ms: 75, type: 'highpass', hz: 4600, level: .42},
 z: {gap: .016, ms: 55, type: 'bandpass', hz: 3900, level: .32}
};

/**
 * What the crowd says.
 *
 * `segs` are vowels with optional onsets; `glide` slides the formants towards a second vowel
 * across the segment, which is how や and きゃ get their /j/. `bend` is the pitch contour as
 * multiples of the speaker's base note -- start, peak, end -- because a shout is mostly its
 * contour: 「あぶな！」 barely moves, 「きゃーー！」 leaps a fifth and falls off the end.
 */
export const LINES = Object.freeze([
 {tag: 'あぶな！', kind: 'alert', urgency: [0, .55], level: .9,
  segs: [{v: 'a', ms: 110}, {v: 'u', ms: 70, on: 'b'}, {v: 'a', ms: 200, on: 'n'}],
  bend: [1, 1.08, .86]},
 {tag: 'やば！', kind: 'alert', urgency: [0, .55], level: .9,
  segs: [{v: 'i', ms: 38, glide: 'a'}, {v: 'a', ms: 100}, {v: 'a', ms: 170, on: 'b'}],
  bend: [1.02, 1.12, .88]},
 {tag: 'ちょっと！', kind: 'alert', urgency: [0, .45], level: .85,
  segs: [{v: 'i', ms: 36, on: 't', glide: 'o'}, {v: 'o', ms: 150}, {v: 'o', ms: 140, on: 't'}],
  bend: [1.04, 1.14, .9]},
 {tag: 'うわっ！', kind: 'alert', urgency: [.4, 1], level: 1,
  segs: [{v: 'u', ms: 70}, {v: 'a', ms: 210}],
  bend: [1.12, 1.3, .8]},
 {tag: 'きゃーー！', kind: 'alert', urgency: [.55, 1], level: 1.05,
  segs: [{v: 'i', ms: 36, on: 'k', glide: 'a'}, {v: 'a', ms: 520}],
  bend: [1.28, 1.52, 1]},
 {tag: 'ひぃっ！', kind: 'alert', urgency: [.5, 1], level: .95,
  segs: [{v: 'i', ms: 230, on: 'h'}],
  bend: [1.3, 1.44, 1.08]},
 {tag: 'ぎゃああ！', kind: 'scream', urgency: [0, 1], level: 1.15,
  segs: [{v: 'i', ms: 32, on: 'g', glide: 'a'}, {v: 'a', ms: 700}],
  bend: [1.38, 1.62, .7]},
 {tag: 'うわあああ！', kind: 'scream', urgency: [0, 1], level: 1.1,
  segs: [{v: 'u', ms: 44, glide: 'a'}, {v: 'a', ms: 640}],
  bend: [1.3, 1.5, .74]},
 // RUN 11.4: being hit, and a crowd taking a breath.
 {tag: 'うっ！', kind: 'pain', urgency: [0, .6], level: .85,
  segs: [{v: 'u', ms: 160}], bend: [1.05, 1.1, .8]},
 {tag: 'いたっ！', kind: 'pain', urgency: [.3, 1], level: .95,
  segs: [{v: 'i', ms: 90}, {v: 'a', ms: 110, on: 't'}], bend: [1.12, 1.25, .9]},
 {tag: 'ぐっ', kind: 'pain', urgency: [.5, 1], level: .9,
  segs: [{v: 'u', ms: 160, on: 'g'}], bend: [.95, 1, .78]},
 {tag: 'えっ', kind: 'gasp', urgency: [0, 1], level: .7,
  segs: [{v: 'e', ms: 150, on: 'h'}], bend: [1.08, 1.18, 1.1]}
]);

/**
 * PLAN-POLICE-VOICE-KAZE-DETAIL Step V1: the six lines a patrol officer shouts through the
 * loudspeaker. A separate `kind: 'police'` -- the crowd never draws from this list and the
 * loudspeaker never draws from `LINES` -- picked by the pursuit situation (V2), not urgency.
 * Every contour is a shout: a strong onset, a raised peak, and a falling end with the last
 * vowel stretched for 「ー」.
 */
export const POLICE_LINES = Object.freeze([
 {tag: '止まれ！', kind: 'police', situation: 'stop',
  segs: [{v: 'o', ms: 90, on: 't'}, {v: 'a', ms: 110, on: 'm'}, {v: 'e', ms: 280, on: 'r'}],
  bend: [1.05, 1.35, .85]},
 // Said twice: a lone 「停車」 read stiff on the device (2026-09-25 note).
 {tag: '停車！停車！', kind: 'police', situation: 'stopCar',
  segs: [{v: 'e', ms: 120, on: 't'}, {v: 'a', ms: 150, on: 'sh'},
         {v: 'e', ms: 120, on: 't'}, {v: 'a', ms: 240, on: 'sh'}],
  bend: [1.05, 1.3, .85]},
 {tag: '動くな！', kind: 'police', situation: 'freeze',
  segs: [{v: 'u', ms: 70}, {v: 'o', ms: 90, on: 'g'}, {v: 'u', ms: 70, on: 'k'}, {v: 'a', ms: 240, on: 'n'}],
  bend: [1.02, 1.28, .82]},
 {tag: '逃げるな！', kind: 'police', situation: 'chase',
  segs: [{v: 'i', ms: 80, on: 'n'}, {v: 'e', ms: 90, on: 'g'}, {v: 'u', ms: 70, on: 'r'}, {v: 'a', ms: 250, on: 'n'}],
  bend: [1.03, 1.3, .82]},
 {tag: '降りろ！', kind: 'police', situation: 'getOut',
  segs: [{v: 'o', ms: 90}, {v: 'i', ms: 80, on: 'r'}, {v: 'o', ms: 280, on: 'r'}],
  bend: [1.05, 1.32, .85]},
 {tag: '確保！', kind: 'police', situation: 'arrest',
  segs: [{v: 'a', ms: 90, on: 'k'}, {v: 'u', ms: 80, on: 'k'}, {v: 'o', ms: 300, on: 'h'}],
  bend: [1.08, 1.35, .8]},
 // PLAN-WEAPONS W3: an officer with a revolver drawn. 「銃を捨てろ！」 (juu o sutero) to an armed
 // player, and 「撃つぞ！」 (utsu zo) with the warning shot. Shouted, not through the loudspeaker.
 {tag: '銃を捨てろ！', kind: 'police', situation: 'dropGun',
  segs: [{v: 'u', ms: 150, on: 'j'}, {v: 'o', ms: 80}, {v: 'u', ms: 60, on: 's'}, {v: 'e', ms: 80, on: 't'}, {v: 'o', ms: 270, on: 'r'}],
  bend: [1.04, 1.32, .82]},
 {tag: '撃つぞ！', kind: 'police', situation: 'warn',
  segs: [{v: 'u', ms: 80}, {v: 'u', ms: 70, on: 't'}, {v: 'o', ms: 320, on: 'z'}],
  bend: [1.06, 1.4, .8]}
]);

/** The police line for a situation, or null. Deterministic: the situation names the line. */
export function policeLine(situation) {
 return POLICE_LINES.find(l => l.situation === situation) ?? null;
}

export const VOICE = Object.freeze({
 // Beyond this a shout is not scheduled at all. At 30 m a pedestrian is a few pixels; the
 // point of the cull is that a busy crossing has hundreds of people in earshot of nothing.
 range: 30,
 near: 4,              // ...and inside this it is at full level
 gain: .55,            // master, under the engine rather than over it
 // Measured: driving through the scramble fires ~115 scatters a second across ~4 distinct
 // people a second. Without a cap a single pass is a hundred overlapping voices, which is
 // white noise. Four at once is a street; the fifth is dropped, not queued, because a shout
 // that arrives late is worse than one that never came.
 maxConcurrent: 4,
 // Spacing between two starts. A frame drains its whole batch at one `currentTime`, so this
 // cannot be a test against the clock -- that would let exactly one voice per frame through
 // and silently drop the rest of every batch. It is a stagger instead: the second voice of a
 // burst is scheduled a beat after the first, which is what a street sounds like anyway.
 minGap: .06,
 maxDelay: .35,        // ...but a shout this late is the wrong shout, so past here they drop
 // A scream is not a warning and must not lose a slot to one. Measured without this: a pass
 // through the crossing queued 92 voices, 75 of them dropped for being busy, and which
 // twelve screams survived was decided by nothing but arrival order. Screams get their own
 // headroom on top of the cap and only a fraction of the spacing, which is enough that every
 // body that goes over the wing is heard.
 screamHeadroom: 2, screamGap: .4, duck: .035,
 vibratoHz: 6.2, vibratoCents: 38,
 peakAt: .22,          // where in the utterance the pitch contour tops out
 release: .13,
 jitter: .035          // per-utterance pitch wander, so repeats are not identical
});

/** Two independent deterministic values from one id. Same person, same throat, every time. */
const hash = n => {
 n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4);
 n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15);
 return (n >>> 0) / 4294967296;
};

/** Voice identity for a pedestrian: register, vocal tract length, how ragged it gets. */
export function persona(id) {
 const a = hash(id), b = hash(id + 9973), c = hash(id + 31337);
 const high = a < .55;                                  // a rough half of the crowd
 return {
  high,
  f0: high ? 292 + b * 150 : 148 + b * 84,
  formant: high ? 1.1 + c * .12 : .95 + c * .09,
  rasp: .25 + c * .5
 };
}

// PLAN-POLICE-VOICE-KAZE-DETAIL Step V1: two adult male throats, deterministic by car id, the
// same way a pedestrian's persona is deterministic by their id. A lower base pitch and formants
// scaled down for a longer vocal tract than the crowd's high voices ever get.
const POLICE_THROATS = Object.freeze([
 Object.freeze({f0: 118, formant: .82, rasp: .4}),
 Object.freeze({f0: 104, formant: .78, rasp: .55})
]);
export function policePersona(carId) {
 return POLICE_THROATS[hash(carId + 70001) < .5 ? 0 : 1];
}

const lerp = (a, b, t) => a + (b - a) * t;

/** The pitch contour, sampled at `u` through the utterance. */
const bendAt = (bend, u) => u <= VOICE.peakAt
 ? lerp(bend[0], bend[1], VOICE.peakAt ? u / VOICE.peakAt : 1)
 : lerp(bend[1], bend[2], (u - VOICE.peakAt) / (1 - VOICE.peakAt));

/** Pick something to say. Lines are filtered by how close the car is, then chosen at random. */
export function chooseLine(kind, urgency, roll = Math.random()) {
 const fits = LINES.filter(l => l.kind === kind && urgency >= l.urgency[0] && urgency <= l.urgency[1]);
 const pool = fits.length ? fits : LINES.filter(l => l.kind === kind);
 return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
}

/**
 * Order a frame's worth of queued voices by what deserves the budget.
 *
 * Without this the cap is spent in arrival order, which is grid-cell order -- a warning from
 * someone twenty metres away can take the last slot from the person under the bumper. Sorts
 * in place and returns the list: screams first, then by how urgent and how close.
 */
export function prioritise(list, listener) {
 const score = v => (v.kind === 'scream' ? 100 : 0) + (v.urgency ?? .5) * 10 -
  Math.hypot(v.x - listener.x, v.z - listener.z) / VOICE.range;
 return list.sort((a, b) => score(b) - score(a));
}

/**
 * Voices for the crowd, sharing the AudioContext the car already unlocked.
 *
 * `getContext` is a function rather than a context because the context does not exist until
 * the click that enters player mode creates it, and this module is built before that.
 */
/**
 * RUN 12.1: which recorded kind stands in for a synthesised one, by register. A scream, a
 * gasp and a grunt of pain are sounds a recording does far better than formants; words
 * (「あぶな！」) stay synthesised, because there is no CC0 recording of them. `null` means
 * no recording suits this voice and the formant voice is used.
 */
export function recordedKind(kind, high) {
 if (kind === 'scream') return high ? 'scream' : 'scream-low';
 if (kind === 'gasp') return 'gasp';
 if (kind === 'pain') return high ? null : 'pain-low';
 return null;
}

/** One filtered noise burst: a stop release, or the breath in front of an /h/ or /sh/. */
function burst(ctx, at, spec, out, level) {
 if (!spec.type || spec.ms <= 0) return;
 const frames = Math.max(1, Math.floor(ctx.sampleRate * spec.ms / 1000));
 const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
 const data = buffer.getChannelData(0);
 for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
 const src = ctx.createBufferSource(); src.buffer = buffer;
 const filter = ctx.createBiquadFilter();
 filter.type = spec.type; filter.frequency.value = spec.hz; filter.Q.value = 1.4;
 const gain = ctx.createGain(); gain.gain.value = spec.level * level;
 src.connect(filter); filter.connect(gain); gain.connect(out);
 src.start(at);
 src.onended = () => {try {src.disconnect(); filter.disconnect(); gain.disconnect();} catch {}};
}

/**
 * PLAN-POLICE-VOICE-KAZE-DETAIL Step V1: the same glottis-plus-three-formants synthesis
 * `createCrowdVoices` uses, factored out so the loudspeaker (V2, in `src/police/siren.mjs`) can
 * build one police line into a caller-supplied node instead of straight to the destination --
 * the megaphone chain and the HRTF panner live between this and the speakers, and the crowd's
 * own scheduling (range culling, the concurrent-voice cap, scream headroom) does not apply to a
 * patrol car's loudspeaker, which has its own gap and repeat rules instead.
 *
 * Returns null if the context refuses (matches `createCrowdVoices`'s never-throws contract).
 */
export function synthesizePoliceLine(ctx, line, throat, {at, level = 1} = {}) {
 try {
  const glottis = ctx.createOscillator(); glottis.type = 'sawtooth';
  const envelope = ctx.createGain(); envelope.gain.value = 0;
  const out = ctx.createGain(); out.gain.value = level;
  const bands = [0, 1, 2].map(i => {
   const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [7, 10, 12][i];
   const g = ctx.createGain(); g.gain.value = [1, .5, .22][i];
   glottis.connect(f); f.connect(g); g.connect(envelope);
   return f;
  });
  envelope.connect(out);

  const total = line.segs.reduce((s, seg) => s + (seg.on ? ONSETS[seg.on].gap : 0) + seg.ms / 1000, 0);
  const base = throat.f0;
  const t0 = at;
  glottis.frequency.setValueAtTime(base * bendAt(line.bend, 0), t0);
  bands.forEach((f, i) => f.frequency.setValueAtTime(VOWELS[line.segs[0].v][i] * throat.formant, t0));
  envelope.gain.setValueAtTime(0, t0);

  let t = t0;
  line.segs.forEach((seg, index) => {
   const onset = seg.on ? ONSETS[seg.on] : null;
   if (onset) {
    if (onset.gap > 0) {
     if (onset.nasal) {
      // A nasal is heard, not silent: a short hum at the nasal formant before the vowel.
      const hum = VOWELS.n;
      bands.forEach((f, i) => f.frequency.setValueAtTime(hum[i] * throat.formant, t));
      envelope.gain.setValueAtTime(0, t);
      envelope.gain.linearRampToValueAtTime(.3, t + Math.min(.02, onset.gap * .4));
      envelope.gain.linearRampToValueAtTime(0, t + onset.gap);
     } else envelope.gain.setValueAtTime(0, t);
     t += onset.gap;
    }
    burst(ctx, t, onset, out, level);
   }
   const span = seg.ms / 1000;
   const u0 = (t - t0) / total, u1 = (t - t0 + span) / total;
   glottis.frequency.linearRampToValueAtTime(base * bendAt(line.bend, u0), t);
   glottis.frequency.linearRampToValueAtTime(base * bendAt(line.bend, Math.min(1, u1)), t + span);
   const from = VOWELS[seg.v], to = VOWELS[seg.glide ?? seg.v];
   bands.forEach((f, i) => {
    f.frequency.linearRampToValueAtTime(from[i] * throat.formant, t + Math.min(.03, span * .4));
    f.frequency.linearRampToValueAtTime(to[i] * throat.formant, t + span);
   });
   const nasalOn = seg.on === 'n' || seg.on === 'm';
   const peak = nasalOn ? .6 : 1;
   envelope.gain.linearRampToValueAtTime(peak, t + Math.min(.028, span * .45));
   const last = index === line.segs.length - 1;
   envelope.gain.linearRampToValueAtTime(last ? peak * .8 : peak * .9, t + span);
   t += span;
  });
  envelope.gain.linearRampToValueAtTime(0, t + VOICE.release);

  glottis.start(t0); glottis.stop(t + VOICE.release + .02);
  glottis.onended = () => {
   try {glottis.disconnect(); for (const f of bands) f.disconnect(); envelope.disconnect(); out.disconnect();} catch {}
  };
  return {
   out, duration: t - t0 + VOICE.release,
   stop(when) {
    try {
     envelope.gain.cancelScheduledValues(when);
     envelope.gain.setValueAtTime(envelope.gain.value, when);
     envelope.gain.linearRampToValueAtTime(0, when + VOICE.duck);
     glottis.stop(when + VOICE.duck + .01);
    } catch {}
   }
  };
 } catch {
  return null;
 }
}

export function createCrowdVoices(getContext, {samples = null} = {}) {
 // What is sounding right now. Held as a list rather than a count because a scream that
 // finds every slot taken does not queue behind the chatter -- it cuts one short and takes
 // the slot. Six of twelve bodies went under the car in silence before this, which is the
 // one sound in the game that is never allowed to be missing.
 const live = [];
 // Two timelines, not one. A burst of forty warnings builds a stagger backlog seconds long,
 // and a scream that queued behind it was being dropped for arriving too late to be true --
 // four of twelve, in the same run that ducking was meant to have fixed.
 let lastAlert = -1, lastScream = -1, disposed = false;
 const stats = {played: 0, dropped: 0, culled: 0, ducked: 0};

 return {
  get stats() {return {...stats, active: live.length};},

  /**
   * Say something, at a place. `listener` is the camera as `{x, z, fx, fz}`; distance sets
   * the level and the brightness, and which side of the car it came from sets the pan.
   *
   * Returns the line that was spoken, or null if it was culled, capped, or too soon after
   * the last one. Never throws: a browser that refuses audio must not stop the game.
   */
  say(kind, id, x, z, listener, urgency = .5) {
   const ctx = disposed ? null : getContext?.();
   if (!ctx || ctx.state === 'closed') return null;
   // The contract above says this never throws, because a voice is decoration and the frame
   // loop is not. It did: a caller with the arguments in the wrong order made `listener`
   // undefined and took the rest of the frame down with it. A promise in a comment is worth
   // what it costs to keep.
   if (!listener || !Number.isFinite(x) || !Number.isFinite(z)) return null;
   const dx = x - listener.x, dz = z - listener.z, distance = Math.hypot(dx, dz);
   if (distance > VOICE.range) {stats.culled++; return null;}
   const now = ctx.currentTime;
   const scream = kind === 'scream';
   const cap = VOICE.maxConcurrent + (scream ? VOICE.screamHeadroom : 0);
   const gap = VOICE.minGap * (scream ? VOICE.screamGap : 1);
   const at = Math.max(now + .012, (scream ? lastScream : lastAlert) + gap);
   if (at - now > VOICE.maxDelay) {stats.dropped++; return null;}
   if (live.length >= cap) {
    const victim = scream ? live.find(v => v.kind !== 'scream') : null;
    if (!victim) {stats.dropped++; return null;}
    victim.cut(now); stats.ducked++;
   }

   const line = chooseLine(kind, urgency);
   const me = persona(id);
   const near = Math.max(0, Math.min(1, (VOICE.range - distance) / (VOICE.range - VOICE.near)));
   const level = VOICE.gain * line.level * near ** 1.4;
   if (level < .004) {stats.culled++; return null;}

   // A recording, if the bank has one for this voice. The scheduling above (range, cap, gap,
   // a scream taking a chatter slot) is the same either way; only the source differs. Placed
   // in the world, so the panner does the distance and side the formant path does by hand.
   const recorded = recordedKind(kind, me.high);
   if (recorded && samples?.has?.(recorded)) {
    const slot = {kind, cut(when) {voice?.cut(when, VOICE.duck);}};
    // Each person keeps one pitch: a few percent either side, from their own throat.
    const rate = Math.max(.9, Math.min(1.1, me.high ? me.f0 / 360 : me.f0 / 190));
    const voice = samples.play(recorded, {x, z, y: 1.55, gain: line.level, rate, when: at, onEnd: () => {
     const i = live.indexOf(slot); if (i >= 0) live.splice(i, 1);
    }});
    if (voice) {
     live.push(slot);
     if (scream) lastScream = at; else lastAlert = at;
     stats.played++; stats.recorded = (stats.recorded ?? 0) + 1;
     return line;
    }
   }

   try {
    // Source: one sawtooth for the glottis, one slow oscillator bending its detune, which is
    // what stops a held vowel sounding like a synthesiser pad.
    const glottis = ctx.createOscillator(); glottis.type = 'sawtooth';
    const vibrato = ctx.createOscillator(); vibrato.type = 'sine';
    vibrato.frequency.value = VOICE.vibratoHz * (.85 + Math.random() * .3);
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = VOICE.vibratoCents * (.5 + me.rasp);
    vibrato.connect(vibratoDepth); vibratoDepth.connect(glottis.detune);

    const envelope = ctx.createGain(); envelope.gain.value = 0;
    // Three parallel resonances. The first carries the vowel, the upper two carry who is
    // speaking, so they are quieter but not optional -- without them every vowel is /a/.
    const bands = [0, 1, 2].map(i => {
     const f = ctx.createBiquadFilter(); f.type = 'bandpass';
     f.Q.value = [7, 10, 12][i];
     const g = ctx.createGain(); g.gain.value = [1, .5, .22][i];
     glottis.connect(f); f.connect(g); g.connect(envelope);
     return f;
    });
    // Distance dulls a voice long before it silences it.
    const air = ctx.createBiquadFilter(); air.type = 'lowpass';
    air.frequency.value = 900 + 5200 * near;
    const out = ctx.createGain(); out.gain.value = level;
    const pan = ctx.createStereoPanner?.();
    envelope.connect(air);
    if (pan) {
     // Positive is the listener's right: the component of the offset across their facing.
     const side = distance > .001 ? (dx * listener.fz - dz * listener.fx) / distance : 0;
     pan.pan.value = Math.max(-.9, Math.min(.9, side * .9));
     air.connect(pan); pan.connect(out);
    } else air.connect(out);
    out.connect(ctx.destination);

    const total = line.segs.reduce((s, seg) =>
     s + (seg.on ? ONSETS[seg.on].gap : 0) + seg.ms / 1000, 0);
    const wobble = 1 + (Math.random() * 2 - 1) * VOICE.jitter;
    const base = me.f0 * wobble * (kind === 'scream' ? 1.06 : 1);
    const t0 = at;

    glottis.frequency.setValueAtTime(base * bendAt(line.bend, 0), t0);
    bands.forEach((f, i) => f.frequency.setValueAtTime(VOWELS[line.segs[0].v][i] * me.formant, t0));
    envelope.gain.setValueAtTime(0, t0);

    let t = t0;
    line.segs.forEach((seg, index) => {
     const onset = seg.on ? ONSETS[seg.on] : null;
     if (onset) {
      if (onset.gap > 0) {envelope.gain.setValueAtTime(0, t); t += onset.gap;}
      burst(ctx, t, onset, out, level);
     }
     const span = seg.ms / 1000;
     const u0 = (t - t0) / total, u1 = (t - t0 + span) / total;
     glottis.frequency.linearRampToValueAtTime(base * bendAt(line.bend, u0), t);
     glottis.frequency.linearRampToValueAtTime(base * bendAt(line.bend, Math.min(1, u1)), t + span);
     // Formants jump onto the vowel, then slide towards the glide target if there is one.
     const from = VOWELS[seg.v], to = VOWELS[seg.glide ?? seg.v];
     bands.forEach((f, i) => {
      f.frequency.linearRampToValueAtTime(from[i] * me.formant, t + Math.min(.03, span * .4));
      f.frequency.linearRampToValueAtTime(to[i] * me.formant, t + span);
     });
     // A nasal is quieter than the vowels around it; everything else is full.
     const peak = seg.on === 'n' ? .6 : 1;
     envelope.gain.linearRampToValueAtTime(peak, t + Math.min(.028, span * .45));
     const last = index === line.segs.length - 1;
     envelope.gain.linearRampToValueAtTime(last ? peak * .8 : peak * .9, t + span);
     t += span;
    });
    envelope.gain.linearRampToValueAtTime(0, t + VOICE.release);

    // Registered before it starts, so the next voice in this same batch sees the slot taken.
    const slot = {kind, cut(when) {
     try {
      envelope.gain.cancelScheduledValues(when);
      envelope.gain.setValueAtTime(envelope.gain.value, when);
      envelope.gain.linearRampToValueAtTime(0, when + VOICE.duck);
      glottis.stop(when + VOICE.duck + .01); vibrato.stop(when + VOICE.duck + .01);
     } catch {}
    }};
    live.push(slot);
    if (scream) lastScream = at; else lastAlert = at;
    stats.played++;
    glottis.start(t0); vibrato.start(t0);
    glottis.stop(t + VOICE.release + .02); vibrato.stop(t + VOICE.release + .02);
    glottis.onended = () => {
     const i = live.indexOf(slot); if (i >= 0) live.splice(i, 1);
     try {
      glottis.disconnect(); vibrato.disconnect(); vibratoDepth.disconnect();
      for (const f of bands) f.disconnect();
      envelope.disconnect(); air.disconnect(); pan?.disconnect(); out.disconnect();
     } catch {}
    };
    return line;
   } catch {
    // A slot registered by a start that then threw would be held for good; drop it.
    if (live.length) live.length = Math.max(0, live.length - 1);
    return null;
   }
  },

  dispose() {disposed = true; live.length = 0;}
 };
}
