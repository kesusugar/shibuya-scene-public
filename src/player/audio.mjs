// The car you can hear.
//
// RUN 12.1: recorded CC0 clips (src/audio/bank.mjs) now play the punches, impacts, crashes
// and tyres, and these synthesised versions are the fallback until they decode. The engine note
// is still only this.
//
// Every sound here is synthesised. Nothing is downloaded and no sample is shipped: the
// engine is two detuned oscillators through a lowpass, and an impact is a short burst of
// filtered noise. That keeps the repository free of third-party audio whose licensing would
// have to be cleared, and it costs a few hundred bytes instead of a few hundred kilobytes,
// which matters because startup time is the thing this project guards most closely.
//
// Browsers refuse to start an AudioContext that no gesture asked for. Entering player mode
// is a click, so `resume` is called from there; if it is refused the whole module goes quiet
// and the game is otherwise unaffected. Audio is never allowed to break driving.

export const AUDIO = Object.freeze({
 idleHz: 46,            // engine note at rest
 revHz: 132,            // ...and at full speed, roughly a third above two octaves up
 detune: 7,             // cents between the two oscillators, which is what stops it whining
 engineGain: .05,       // quiet: this plays under a city, not over it
 cutoffLow: 320, cutoffHigh: 2400,
 impactGain: .28, impactMs: 220,
 strikeGain: .16, strikeMs: 140,
 // RUN 11.4. Melee and body contact, all synthesised like the rest. `maxVoices` bounds how many
 // of these one-shots can ring at once; the feedback bus already caps how many start a frame.
 swingGain: .07, swingMs: 170,
 hitGain: .22, hitMs: 120,
 bodyGain: .26, bodyMs: 260,
 runoverGain: .16, runoverMs: 180,
 maxVoices: 6,
 rampMs: 60             // parameter smoothing, so speed changes glide instead of stepping
});

/** The engine note a car asks for, filled in from the default one. Pure, for tests. */
export function engineVoice(voice) {
 return {idleHz: voice?.idleHz ?? AUDIO.idleHz, revHz: voice?.revHz ?? AUDIO.revHz, wave: voice?.wave ?? 'sawtooth'};
}

export function createPlayerAudio() {
 let ctx = null, engine = null, failed = false;

 /** Build the graph on first use, inside a gesture. Any refusal disables audio for good. */
 const ensure = () => {
  if (ctx || failed) return ctx;
  try {
   const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
   if (!Ctor) {failed = true; return null;}
   ctx = new Ctor();
   const gain = ctx.createGain(); gain.gain.value = 0;
   const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
   filter.frequency.value = AUDIO.cutoffLow;
   const a = ctx.createOscillator(), b = ctx.createOscillator();
   a.type = 'sawtooth'; b.type = 'sawtooth'; b.detune.value = AUDIO.detune;
   a.frequency.value = AUDIO.idleHz; b.frequency.value = AUDIO.idleHz;
   a.connect(filter); b.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
   a.start(); b.start();
   engine = {gain, filter, a, b};
  } catch {failed = true; ctx = null;}
  return ctx;
 };

 // RUN 11.4: noise is generated once per length and shared. It was a fresh buffer of fresh
 // random samples for every hit, which is an allocation per body on a crowd pass.
 const noise = new Map();
 const noiseOf = ms => {
  let buffer = noise.get(ms);
  if (buffer) return buffer;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * ms / 1000));
  buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // White noise under a decaying envelope: a thud is an attack and a tail, nothing more.
  let seed = 1234567;
  for (let i = 0; i < frames; i++) {seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
   data[i] = (seed / 2147483648 - 1) * (1 - i / frames) ** 2;}
  noise.set(ms, buffer); return buffer;
 };
 let ringing = 0;
 /** One burst of filtered noise: a collision, a body, a fist, a swing. */
 const burst = (level, ms, cutoff, {type = 'lowpass', sweepTo = null, q = .7} = {}) => {
  // A suspended context never ends a source, which would pin `ringing` at the cap for good.
  if (!ctx || !engine || ctx.state !== 'running' || ringing >= AUDIO.maxVoices) return false;
  const src = ctx.createBufferSource(); src.buffer = noiseOf(ms);
  const filter = ctx.createBiquadFilter(); filter.type = type; filter.frequency.value = cutoff; filter.Q.value = q;
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + ms / 1000);
  const gain = ctx.createGain(); gain.gain.value = level;
  src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  ringing++; src.start();
  src.onended = () => {ringing--; try {src.disconnect(); filter.disconnect(); gain.disconnect();} catch {}};
  return true;
 };
 /** A short, falling sine for the body of a thump, under the noise. */
 const thump = (level, hz, ms) => {
  // A suspended context never ends a source, which would pin `ringing` at the cap for good.
  if (!ctx || !engine || ctx.state !== 'running' || ringing >= AUDIO.maxVoices) return false;
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = hz;
  const t = ctx.currentTime, gain = ctx.createGain();
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, hz * .45), t + ms / 1000);
  gain.gain.setValueAtTime(level, t); gain.gain.exponentialRampToValueAtTime(.0005, t + ms / 1000);
  osc.connect(gain); gain.connect(ctx.destination);
  ringing++; osc.start(); osc.stop(t + ms / 1000 + .02);
  osc.onended = () => {ringing--; try {osc.disconnect(); gain.disconnect();} catch {}};
  return true;
 };

 return {
  get available() {return !!ctx && !failed;},
  /** The shared context, so the crowd's voices play through the graph this one unlocked. */
  get context() {return ctx;},
  /** Called from the click that enters player mode, which is the gesture browsers want. */
  resume() {ensure(); ctx?.resume?.().catch(() => {}); return !!ctx;},
  /**
   * Track the car. `load` is throttle, so a car labouring up to speed sounds different from
   * one coasting at the same speed, which is most of what makes an engine readable.
   */
  engine(speed, topSpeed, load = 0, damage = 0, voice = null) {
   if (!ctx || !engine) return;
   const t = Math.min(1, Math.abs(speed) / Math.max(1, topSpeed));
   const wear=Math.max(0,Math.min(1,damage));
   // Step H: a car may bring its own voice (VEHICLES.ownCar.engine): a higher, buzzier,
   // rotary-like note. Synthesised, like every engine here.
   const v = engineVoice(voice), wave = v.wave;
   if (engine.a.type !== wave) {engine.a.type = wave; engine.b.type = wave;}
   const hz = (v.idleHz + (v.revHz - v.idleHz) * t)*(1-wear*.08);
   const when = ctx.currentTime, ramp = AUDIO.rampMs / 1000;
   engine.a.frequency.setTargetAtTime(hz, when, ramp);
   engine.b.frequency.setTargetAtTime(hz*(1+wear*.025*Math.sin(ctx.currentTime*23)), when, ramp);
   engine.filter.frequency.setTargetAtTime(
    AUDIO.cutoffLow + (AUDIO.cutoffHigh - AUDIO.cutoffLow) * Math.min(1, t + load * .35), when, ramp);
   engine.gain.gain.setTargetAtTime(AUDIO.engineGain * (.45 + .55 * t), when, ramp);
  },
  /** Cut the engine without tearing down the graph, so getting back in is instant. */
  silence() {if (ctx && engine) engine.gain.gain.setTargetAtTime(0, ctx.currentTime, .05);},
  /** A collision. Loudness follows the speed that was lost. */
  /**
   * Stage 6: glass. A crack is a short bright tick; a pane going is a crash of high noise and a
   * scatter of little rings as the pieces land. `level` 0..1.
   */
  glass(level = 1) {
   if (!ctx || !engine || ctx.state !== 'running') return false;
   burst(AUDIO.impactGain * .7 * level, level > .6 ? 380 : 90, level > .6 ? 3200 : 5200, {type: 'highpass', q: .9});
   const t0 = ctx.currentTime, rings = level > .6 ? 7 : 1;
   for (let i = 0; i < rings && ringing < AUDIO.maxVoices + 4; i++) {
    const osc = ctx.createOscillator(), gain = ctx.createGain(), t = t0 + .03 + i * (.035 + (i * 37 % 11) / 400);
    osc.type = 'sine'; osc.frequency.value = 2600 + (i * 1733 % 2400);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.035 * level, t + .004);
    gain.gain.exponentialRampToValueAtTime(.0003, t + .12);
    osc.connect(gain); gain.connect(ctx.destination); ringing++;
    osc.start(t); osc.stop(t + .14);
    osc.onended = () => {ringing--; try {osc.disconnect(); gain.disconnect();} catch {}};
   }
   return true;
  },
  impact(speed, topSpeed) {
   const t = Math.min(1, Math.abs(speed) / Math.max(1, topSpeed));
   if (t > .05) burst(AUDIO.impactGain * t, AUDIO.impactMs, 900);
  },
  /** Somebody going over the wing. Softer and shorter than hitting a wall. */
  strike() {burst(AUDIO.strikeGain, AUDIO.strikeMs, 1500);},
  /** RUN 11.4: the air a fist moves -- a band of noise sweeping up. */
  swing(intensity = .6) {burst(AUDIO.swingGain * (.6 + .4 * intensity), AUDIO.swingMs, 700, {type: 'bandpass', sweepTo: 2600, q: 1.4});},
  /** A fist landing: a dull body thump with a short slap on top. */
  punchHit(intensity = .7) {
   thump(AUDIO.hitGain * (.5 + .5 * intensity), 150, AUDIO.hitMs);
   burst(AUDIO.hitGain * .55 * intensity, 50, 2400, {type: 'highpass'});
  },
  /** A car meeting a person: heavier and lower than a punch, not as sharp as a wall. */
  bodyImpact(intensity = .8) {
   thump(AUDIO.bodyGain * (.4 + .6 * intensity), 95, AUDIO.bodyMs);
   burst(AUDIO.bodyGain * .6 * intensity, AUDIO.bodyMs, 800);
  },
  /** Going over something lying in the road. */
  runover(intensity = .6) {thump(AUDIO.runoverGain * intensity, 70, AUDIO.runoverMs);},
  get ringing() {return ringing;},
  dispose() {
   try {engine?.a.stop(); engine?.b.stop(); ctx?.close?.();} catch {}
   ctx = null; engine = null;
  }
 };
}
