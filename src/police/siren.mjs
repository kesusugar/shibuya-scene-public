// The patrol car's siren and lamps (PLAN-POLICE-AND-OWN-CAR W3), and its loudspeaker
// (PLAN-POLICE-VOICE-KAZE-DETAIL Step V2). Synthesised, never recorded.
//
// The Japanese police electronic siren is a slow wail: about 1.6 s up and 1.6 s down between
// roughly 650 and 1,450 Hz, which is what separates it from a US wail (faster, wider) and from an
// ambulance's two-tone ピーポー (not used here). A faster yelp is used at junctions.
//
// Only the two nearest sirens sound; each is two oscillators (saw plus square) through a band-pass
// into an HRTF panner at the car, on the sound bank's own effects bus, so the bank's safety
// compressor and master level hold. The sweep rate follows a rough Doppler from the closing speed.
import {policeLine, policePersona, synthesizePoliceLine} from '../player/voices.mjs';

export const SIREN = Object.freeze({
 low: 650, high: 1450,      // Hz
 up: 1.6, down: 1.6,        // seconds, the wail
 yelpPeriod: .34,           // seconds, one full up-and-down of the yelp
 maxVoices: 2,
 range: 260,                // m; beyond this a siren is not started
 gain: .09,
 sound: 343,                // m/s
 flashHz: 2.4,              // the roof bar's two halves alternate this many times a second
 speechEvery: 8             // s between loudspeaker lines
});

/** Frequency at time `t` (s) in `mode` ('wail' | 'yelp'). A triangle sweep, eased at the ends. */
export function sirenHz(t, mode = 'wail') {
 const period = mode === 'yelp' ? SIREN.yelpPeriod : SIREN.up + SIREN.down;
 const upShare = mode === 'yelp' ? .5 : SIREN.up / period;
 const phase = ((t % period) + period) % period / period;
 const x = phase < upShare ? phase / upShare : 1 - (phase - upShare) / (1 - upShare);
 const eased = x * x * (3 - 2 * x);
 return SIREN.low + (SIREN.high - SIREN.low) * eased;
}

/** Pitch factor for a source closing on the listener at `closing` m/s (positive = approaching). */
export function doppler(closing) {
 const c = Math.max(-60, Math.min(60, closing || 0));
 return SIREN.sound / (SIREN.sound - c);
}

/** The sources that get a voice: the nearest `max` within range. */
export function nearestSirens(sources, listener, max = SIREN.maxVoices) {
 return sources
  .map(s => ({s, d: Math.hypot(s.x - listener.x, s.z - listener.z)}))
  .filter(e => e.d <= SIREN.range)
  .sort((a, b) => a.d - b.d)
  .slice(0, max)
  .map(e => e.s);
}

/** Which half of the roof bar is lit at time `t`: 0 or 1. */
export const flashPhase = t => Math.floor(t * SIREN.flashHz * 2) % 2;

// PLAN-POLICE-VOICE-KAZE-DETAIL Step V2: the loudspeaker. VOICEVOX did not sound right to the
// user, so the lines are short shouts from the crowd's own formant synthesiser (Step V1),
// played through a chain that stands for a patrol car's tannoy: band-limited, mildly
// saturated, a short slapback for the street, a mic click before each line, through the same
// HRTF panner model the siren uses.
export const MEGAPHONE = Object.freeze({
 range: 40,             // m: only used while a siren car is this close
 gapMin: 6, gapMax: 8,  // s between two lines, across every car -- honoured as gapMin here
 bandLow: 350, bandHigh: 3500,
 echoMs: 90, echoLevel: .22,
 duckDb: 6, duckHold: .6, duckRelease: .25
});

/**
 * The voices. `getContext` returns the shared AudioContext (or null); `getBus` the node to feed
 * (the bank's effects bus). Nothing is built until a siren first sounds, and a missing context is
 * silence, never an error.
 */
export function createSirens(getContext, getBus) {
 let ctx = null, time = 0, disposed = false, duckUntil = -Infinity;
 const voices = [];
 const stats = {sounding: 0, started: 0};
 const build = () => {
  const bus = getBus?.();
  if (!ctx || !bus) return null;
  const a = ctx.createOscillator(), b = ctx.createOscillator();
  a.type = 'sawtooth'; b.type = 'square';
  const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.Q.value = 1.4; band.frequency.value = 1000;
  const mix = ctx.createGain(); mix.gain.value = .5;
  const gain = ctx.createGain(); gain.gain.value = 0;
  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
  panner.refDistance = 8; panner.maxDistance = SIREN.range; panner.rolloffFactor = 1.1;
  a.connect(band); b.connect(mix); mix.connect(band); band.connect(gain); gain.connect(panner); panner.connect(bus);
  a.start(); b.start();
  stats.started++;
  return {a, b, band, gain, panner, source: null};
 };
 const place = (p, x, y, z) => {
  if (p.positionX) {p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;}
  else p.setPosition?.(x, y, z);
 };
 return {
  stats,
  /**
   * `sources`: [{id, x, z, vx, vz, mode}] of cars with the siren on; `listener`: {x, z, vx, vz}.
   */
  update(dt, sources, listener) {
   if (disposed) return;
   time += dt;
   const chosen = nearestSirens(sources, listener);
   if (chosen.length && !ctx) ctx = getContext?.() ?? null;
   if (!ctx || ctx.state === 'closed') {stats.sounding = 0; return;}
   while (voices.length < chosen.length) {const v = build(); if (!v) break; voices.push(v);}
   const now = ctx.currentTime;
   stats.sounding = 0;
   voices.forEach((v, i) => {
    const s = chosen[i];
    if (!s) {v.gain.gain.setTargetAtTime(0, now, .08); v.source = null; return;}
    const dx = listener.x - s.x, dz = listener.z - s.z, d = Math.hypot(dx, dz) || 1;
    const closing = ((s.vx ?? 0) - (listener.vx ?? 0)) * dx / d + ((s.vz ?? 0) - (listener.vz ?? 0)) * dz / d;
    const hz = sirenHz(time + i * .41, s.mode) * doppler(closing);
    v.a.frequency.setTargetAtTime(hz, now, .02); v.b.frequency.setTargetAtTime(hz * 1.004, now, .02);
    v.band.frequency.setTargetAtTime(hz, now, .02);
    const ducked = now < duckUntil;
    v.gain.gain.setTargetAtTime(ducked ? SIREN.gain * Math.pow(10, -MEGAPHONE.duckDb / 20) : SIREN.gain,
     now, ducked ? .05 : .08);
    place(v.panner, s.x, 1.6, s.z);
    v.source = s.id; stats.sounding++;
   });
  },
  /**
   * Step V2: while a police line plays, the siren ducks by about 6 dB so the line can be heard
   * over it. `update()` re-asserts the siren's gain every frame, so this cannot be a one-shot
   * ramp -- it would be overwritten by the very next frame -- it instead holds a deadline
   * `update()` itself checks.
   */
  duck(holdSeconds = MEGAPHONE.duckHold) {
   if (!ctx) return;
   duckUntil = ctx.currentTime + holdSeconds + MEGAPHONE.duckRelease;
  },
  dispose() {
   if (disposed) return; disposed = true;
   for (const v of voices) {try {v.a.stop(); v.b.stop(); v.panner.disconnect();} catch {}}
   voices.length = 0;
  }
 };
}

/** Roadmap ①: a recorded line as a source starting at `at`; {out, duration} like the formant voice. */
export function playClip(ctx, clip, at, level = 1) {
 if (!clip?.buffer) return null;
 const src = ctx.createBufferSource(); src.buffer = clip.buffer;
 const out = ctx.createGain(); out.gain.value = level;
 src.connect(out); src.start(at);
 src.onended = () => {try {src.disconnect(); out.disconnect();} catch {}};
 return {out, duration: clip.buffer.duration, source: src};
}

/** A soft-clip curve for the megaphone's `WaveShaperNode` -- mild saturation, not distortion. */
function saturationCurve(amount = 6) {
 const n = 256, curve = new Float32Array(n), ceiling = Math.tanh(amount);
 for (let i = 0; i < n; i++) {const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * amount) / ceiling;}
 return curve;
}

/** The synthesised mic click before a line: a very short, high-passed noise tap. */
function click(ctx, at, out) {
 const frames = Math.max(1, Math.floor(ctx.sampleRate * .008));
 const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
 const data = buffer.getChannelData(0);
 for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
 const src = ctx.createBufferSource(); src.buffer = buffer;
 const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 1200;
 const gain = ctx.createGain(); gain.gain.value = .5;
 src.connect(filter); filter.connect(gain); gain.connect(out);
 src.start(at);
 src.onended = () => {try {src.disconnect(); filter.disconnect(); gain.disconnect();} catch {}};
}

/**
 * PLAN-POLICE-VOICE-KAZE-DETAIL Step V2: the patrol car's loudspeaker. Builds a line from
 * `synthesizePoliceLine` (the crowd's own formant synthesiser, Step V1) and routes it through the
 * megaphone chain -- built only for this, never for the crowd's own voices -- instead of straight
 * to the destination.
 *
 * Its scheduling is its own, not the crowd voices' cap-and-cull: a global gap across every car
 * (`MEGAPHONE.gapMin`) and never the same line twice running, both waived for `force` (the
 * arrest line, which the plan puts outside the gap rule).
 */
export function createMegaphone(getContext, getBus, {clips = null} = {}) {
 // Roadmap ①: with `clips` (voice-clips.mjs) the line is a recording, and with none decoded yet
 // nothing is said; without, the formant voice as before (the tests' stand-in).
 let ctx = null, lastAt = -Infinity, lastTag = null, disposed = false;
 const stats = {played: 0, skipped: 0};
 return {
  stats,
  /**
   * `situations`: candidate situations in preference order (`policeLine` names in voices.mjs);
   * the first whose line is not the one just said is used, so a two-option state (the pursuit,
   * on foot or driving) alternates instead of repeating. `carId,x,z` place the loudspeaker at
   * the car. `duck`, if given, is the sirens' `duck()` method.
   */
  speak(situations, carId, x, z, time, {force = false, duck = null} = {}) {
   if (disposed || !situations?.length) return null;
   if (!force && time - lastAt < MEGAPHONE.gapMin) return null;
   const bus = getBus?.();
   if (!ctx) ctx = getContext?.();
   if (!ctx || !bus || ctx.state === 'closed') return null;
   const now = ctx.currentTime;
   let line, built;
   if (clips) {
    // The first situation with a line other than the one just said (a lone line may repeat).
    let clip = null;
    for (const s of situations) {const c = clips.pick(s, lastTag); if (c && (c.id !== lastTag || situations.length === 1)) {clip = c; break;}}
    if (!clip) {stats.skipped++; return null;}
    line = {tag: clip.id, text: clip.text, situation: clip.situation};
    built = playClip(ctx, clip, now + .06);
   } else {
    line = situations.map(s => policeLine(s)).find(l => l && l.tag !== lastTag);
    if (!line) {stats.skipped++; return null;}
    built = synthesizePoliceLine(ctx, line, policePersona(carId), {at: now + .02, level: 1});
   }
   if (!built) return null;

   const band = ctx.createBiquadFilter();
   band.type = 'bandpass'; band.frequency.value = Math.sqrt(MEGAPHONE.bandLow * MEGAPHONE.bandHigh);
   band.Q.value = .9;
   const shaper = ctx.createWaveShaper(); shaper.curve = saturationCurve();
   const dry = ctx.createGain(); dry.gain.value = 1;
   const echo = ctx.createDelay(.2); echo.delayTime.value = MEGAPHONE.echoMs / 1000;
   const echoGain = ctx.createGain(); echoGain.gain.value = MEGAPHONE.echoLevel;
   const mix = ctx.createGain();
   const panner = ctx.createPanner();
   panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
   panner.refDistance = 8; panner.maxDistance = MEGAPHONE.range * 2; panner.rolloffFactor = 1.1;
   if (panner.positionX) {panner.positionX.value = x; panner.positionY.value = 1.7; panner.positionZ.value = z;}
   else panner.setPosition?.(x, 1.7, z);

   built.out.connect(band); band.connect(shaper);
   shaper.connect(dry); dry.connect(mix);
   shaper.connect(echo); echo.connect(echoGain); echoGain.connect(mix);
   mix.connect(panner); panner.connect(bus);
   click(ctx, now, panner);

   duck?.(built.duration);
   lastAt = time; lastTag = line.tag; stats.played++;
   return line;
  },
  dispose() {disposed = true;}
 };
}

/**
 * An officer on foot shouting (PLAN-WEAPONS W3): 「銃を捨てろ！」 and 「撃つぞ！」, the same formant
 * voice as the loudspeaker but dry -- no band-pass, no saturation, no slapback -- from where the
 * officer stands. A line is not repeated within `gap` seconds, and only one shout rings at once.
 */
export function createOfficerVoice(getContext, getBus, {gap = 3, clips = null} = {}) {
 let ctx = null, busyUntil = -Infinity, disposed = false;
 const last = new Map();
 const stats = {played: 0, skipped: 0};
 return {
  stats,
  /** `force` (the arrest) ignores the gap and whoever is already shouting. */
  shout(situation, officerId, x, z, time, {force = false} = {}) {
   if (disposed) return null;
   if (!clips && !policeLine(situation)) {stats.skipped++; return null;}
   if (!force && (time < busyUntil || time - (last.get(situation) ?? -Infinity) < gap)) {stats.skipped++; return null;}
   const bus = getBus?.();
   if (!ctx) ctx = getContext?.();
   if (!ctx || !bus || ctx.state === 'closed') return null;
   let line, built;
   if (clips) {
    const clip = clips.pick(situation);
    if (!clip) {stats.skipped++; return null;}
    line = {tag: clip.id, text: clip.text, situation}; built = playClip(ctx, clip, ctx.currentTime + .02);
   } else {
    line = policeLine(situation);
    built = synthesizePoliceLine(ctx, line, policePersona(officerId + 5000), {at: ctx.currentTime + .02, level: .9});
   }
   if (!built) return null;
   const panner = ctx.createPanner();
   panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
   panner.refDistance = 4; panner.maxDistance = 80; panner.rolloffFactor = 1.1;
   if (panner.positionX) {panner.positionX.value = x; panner.positionY.value = 1.65; panner.positionZ.value = z;}
   else panner.setPosition?.(x, 1.65, z);
   built.out.connect(panner); panner.connect(bus);
   busyUntil = time + (built.duration ?? .6); last.set(situation, time); stats.played++;
   return line;
  },
  dispose() {disposed = true;}
 };
}

/**
 * The loudspeaker, through the browser's own speech in Japanese. At most one line every
 * `SIREN.speechEvery` seconds, and silent -- not an error -- when there is no speech engine or no
 * Japanese voice.
 */
export function createLoudspeaker(speech = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance) {
 let last = -Infinity;
 const voice = () => {
  try {return speech?.getVoices?.().find(v => /^ja(-|_|$)/i.test(v.lang)) ?? null;} catch {return null;}
 };
 return {
  /** Say `text` at time `t` if allowed; returns whether it spoke. */
  say(text, t) {
   if (t - last < SIREN.speechEvery) return false;
   const v = voice();
   if (!speech || !Utterance || !v) return false;
   try {
    const u = new Utterance(text); u.lang = 'ja-JP'; u.voice = v; u.rate = 1.05; u.volume = .8;
    speech.speak(u); last = t; return true;
   } catch {return false;}
  }
 };
}
