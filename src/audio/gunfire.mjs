// Gunfire you can hear (PLAN-WEAPONS R13). The shot itself is a recorded CC0 clip from the sound
// bank (assets/audio/upstream.lock.json names each source, its page, its licence and its SHA-256);
// what the street does to it is synthesised here: a slapback off the facades either side, timed
// from how far away they actually are, low-passed and quieter each time, so a shot on a narrow
// Center-gai street rings and one in the open Scramble does not.
//
// Until the bank has decoded (or if it never does) the shot falls back to a SYNTHESISED crack --
// filtered noise and a low thump. That fallback is TEMPORARY (仮) and is what plays only when the
// recordings are unavailable; it is not meant to sound real.
//
// The katana's clank on a wall is synthesised: three inharmonic partials of struck steel and a
// tick of noise. No recording was needed for it. So is a blade or a round meeting a body (§9ai).

export const GUNFIRE = Object.freeze({
 speedOfSound: 343,
 echoReach: 45,           // m: facades further than this give no slapback worth hearing
 echoStep: 1,             // m between samples when looking for a facade
 echoGain: [.34, .2, .11],// the first reflection each side, then the two of them again
 echoLowpass: [2600, 1600, 1000],
 ricochetChance: .35,     // of a shot that hits a wall or a car
 fallbackGain: .5,        // the synthesised crack, relative to the bus
 // §9ah: the submachine gun reuses the recorded gunshot, a little higher and lighter (a smaller
 // round, 12 a second), with only the first reflection each side so a burst does not smear.
 smg: Object.freeze({rate: 1.14, gain: .72, echoes: 2}),
 clankGain: .28,
 // §9ai H2: a round or a blade meeting a body. Synthesised: a low, damped thump with a short
 // wet tick for a round; a thin rising hiss and the same thump, softer, for a cut.
 fleshGain: .42, sliceGain: .3
});

/**
 * How far the nearest facade is to the left and right of a shot, along the line across the
 * shooter's facing. Pure. Returns [left, right] in metres, Infinity where there is none in reach.
 */
export function facadeDistances(solid, x, z, heading, reach = GUNFIRE.echoReach, step = GUNFIRE.echoStep) {
 const out = [];
 for (const side of [1, -1]) {
  const dx = Math.cos(heading) * side, dz = -Math.sin(heading) * side;
  let hit = Infinity;
  for (let d = step; d <= reach; d += step) if (solid(x + dx * d, z + dz * d)) {hit = d; break;}
  out.push(hit);
 }
 return out;
}

/**
 * The echo taps for a shot: [{delay, gain, lowpass, x, z}], one per side with a facade, and a
 * second, weaker bounce across the street. Pure, for the test.
 */
export function echoTaps(solid, x, z, heading) {
 const [left, right] = facadeDistances(solid, x, z, heading), taps = [];
 const add = (d, side, order) => {
  if (!Number.isFinite(d)) return;
  const delay = 2 * d / GUNFIRE.speedOfSound;
  taps.push({delay, gain: GUNFIRE.echoGain[order], lowpass: GUNFIRE.echoLowpass[order],
   x: x + Math.cos(heading) * side * d, z: z - Math.sin(heading) * side * d});
 };
 add(left, 1, 0); add(right, -1, 0);
 // Across and back: a street with both walls rings once more.
 if (Number.isFinite(left) && Number.isFinite(right)) {
  const d = left + right;
  taps.push({delay: 2 * d / GUNFIRE.speedOfSound, gain: GUNFIRE.echoGain[2], lowpass: GUNFIRE.echoLowpass[2], x, z});
 }
 return taps;
}

/**
 * @param {()=>any} getContext
 * @param {()=>any} getBank
 * @param {{solid?:(x:number,z:number)=>boolean}} [options]
 */
export function createGunfire(getContext, getBank, {solid = () => false} = {}) {
 const stats = {shots: 0, recorded: 0, synthesised: 0, echoes: 0, ricochets: 0, clanks: 0};
 let noise = null;
 const bus = () => getBank?.()?.bus ?? null;
 const noiseBuffer = ctx => {
  if (noise) return noise;
  const n = Math.floor(ctx.sampleRate * .35);
  noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noise.getChannelData(0); let s = 987654321;
  for (let i = 0; i < n; i++) {s = (Math.imul(s, 1103515245) + 12345) >>> 0; d[i] = (s / 2147483648 - 1) * Math.exp(-i / (ctx.sampleRate * .045));}
  return noise;
 };
 const placed = (ctx, x, y, z) => {
  const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
  p.refDistance = 4; p.maxDistance = 200; p.rolloffFactor = .9;
  if (p.positionX) {p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;} else p.setPosition?.(x, y, z);
  return p;
 };
 /** The TEMPORARY synthesised shot (仮): used only while no recording is available. */
 const synthShot = (ctx, x, y, z, when, gain) => {
  const out = bus(); if (!out) return false;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
  const g = ctx.createGain(); g.gain.value = GUNFIRE.fallbackGain * gain;
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(140, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + .12);
  const og = ctx.createGain(); og.gain.setValueAtTime(GUNFIRE.fallbackGain * gain, when); og.gain.exponentialRampToValueAtTime(.0005, when + .16);
  const pan = placed(ctx, x, y, z);
  src.connect(hp); hp.connect(g); g.connect(pan); osc.connect(og); og.connect(pan); pan.connect(out);
  src.start(when); osc.start(when); osc.stop(when + .2);
  src.onended = () => {try {src.disconnect(); hp.disconnect(); g.disconnect(); osc.disconnect(); og.disconnect(); pan.disconnect();} catch {}};
  return true;
 };

 /** The sound of a body taking a blow: a thump (and, for a blade, a hiss before it). */
 const body = (x, y, z, gain, blade) => {
  const ctx = getContext?.(), out = bus();
  if (!ctx || !out || ctx.state !== 'running') return false;
  const t = ctx.currentTime, pan = placed(ctx, x, y, z), g = ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0004, t + .22);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(blade ? 140 : 110, t); o.frequency.exponentialRampToValueAtTime(55, t + .12);
  const og = ctx.createGain(); og.gain.value = blade ? .6 : 1; o.connect(og); og.connect(g);
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter(); f.type = blade ? 'highpass' : 'bandpass';
  f.frequency.setValueAtTime(blade ? 2500 : 900, t); if (blade) f.frequency.exponentialRampToValueAtTime(6500, t + .09);
  const ng = ctx.createGain(); ng.gain.setValueAtTime(blade ? .55 : .35, t); ng.gain.exponentialRampToValueAtTime(.001, t + (blade ? .11 : .05));
  n.connect(f); f.connect(ng); ng.connect(g);
  g.connect(pan); pan.connect(out);
  o.start(t); o.stop(t + .24); n.start(t); n.stop(t + .12);
  stats.bodies = (stats.bodies ?? 0) + 1;
  o.onended = () => {try {o.disconnect(); og.disconnect(); n.disconnect(); f.disconnect(); ng.disconnect(); g.disconnect(); pan.disconnect();} catch {}};
  return true;
 };

 return {
  get stats() {return {...stats};},
  /**
   * A shot at `x,y,z` from someone facing `heading`. `kind` is 'pistol', 'revolver' or 'smg'; `hit` is
   * what the bullet struck ('wall', 'car', ...) and where, for a ricochet.
   */
  shot(x, y, z, heading, {kind = 'pistol', gain = 1, hit = null, roll = Math.random()} = {}) {
   const ctx = getContext?.(); const bank = getBank?.();
   if (!ctx || ctx.state !== 'running') return false;
   stats.shots++;
   const clip = kind === 'revolver' && bank?.has?.('gunshot-revolver') ? 'gunshot-revolver' : 'gunshot';
   const auto = kind === 'smg', rate = auto ? GUNFIRE.smg.rate : 1;
   if (auto) gain *= GUNFIRE.smg.gain;
   const recorded = !!bank?.play?.(clip, {x, y, z, gain, rate});
   if (recorded) stats.recorded++; else if (synthShot(ctx, x, y, z, ctx.currentTime, gain)) stats.synthesised++;
   const taps = echoTaps(solid, x, z, heading);
   for (const tap of auto ? taps.slice(0, GUNFIRE.smg.echoes) : taps) {
    const when = ctx.currentTime + tap.delay;
    const ok = recorded ? bank.play(clip, {x: tap.x, y: y + 2, z: tap.z, gain: gain * tap.gain, when, lowpass: tap.lowpass, rate: .97 * rate})
     : synthShot(ctx, tap.x, y + 2, tap.z, when, gain * tap.gain);
    if (ok) stats.echoes++;
   }
   if (hit && (hit.kind === 'wall' || hit.kind === 'car') && roll < GUNFIRE.ricochetChance) {
    if (bank?.play?.('ricochet', {x: hit.point.x, y: hit.point.y, z: hit.point.z, gain: .8, when: ctx.currentTime + .03})) stats.ricochets++;
   }
   return true;
  },
  /** §9ai H2: a round into a body (`strength` 1 for a pistol round, less for an automatic's). */
  flesh(x, y, z, strength = 1) {return body(x, y, z, GUNFIRE.fleshGain * strength, false);},
  /** §9ai H2: a blade through a body: a quick hiss and a softer thump. */
  slice(x, y, z, strength = 1) {return body(x, y, z, GUNFIRE.sliceGain * strength, true);},
  /**
   * Stage 1: a spent case on the pavement (a high, short brass ring) or a magazine (a dull clack).
   * Synthesised, quiet, and at most a few at once (the casings arrive in a scatter).
   */
  tink(x, y, z, kind = 'casing') {
   const ctx = getContext?.(), out = bus();
   if (!ctx || !out || ctx.state !== 'running') return false;
   const now = ctx.currentTime; if (now - (stats.lastTink ?? -1) < .025) return false; stats.lastTink = now;
   const mag = kind === 'magazine', t = now, pan = placed(ctx, x, y, z), g = ctx.createGain();
   g.gain.setValueAtTime(mag ? .22 : .09, t); g.gain.exponentialRampToValueAtTime(.0004, t + (mag ? .12 : .18));
   const base = mag ? 520 : 3900 + Math.random() * 900;
   const oscs = (mag ? [1, 1.7] : [1, 2.4]).map((k, i) => {const o = ctx.createOscillator(); o.type = mag ? 'triangle' : 'sine'; o.frequency.value = base * k;
    const og = ctx.createGain(); og.gain.value = i ? .35 : 1; o.connect(og); og.connect(g); o.start(t); o.stop(t + .2); return [o, og];});
   g.connect(pan); pan.connect(out); stats.tinks = (stats.tinks ?? 0) + 1;
   oscs[0][0].onended = () => {try {for (const [o, og] of oscs) {o.disconnect(); og.disconnect();} g.disconnect(); pan.disconnect();} catch {}};
   return true;
  },
  /** Steel on a wall or a car: the katana's clank. Synthesised. */
  clank(x, y, z) {
   const ctx = getContext?.(), out = bus();
   if (!ctx || !out || ctx.state !== 'running') return false;
   const t = ctx.currentTime, pan = placed(ctx, x, y, z), g = ctx.createGain();
   g.gain.setValueAtTime(GUNFIRE.clankGain, t); g.gain.exponentialRampToValueAtTime(.0004, t + .35);
   const oscs = [1, 2.76, 5.4].map((k, i) => {const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1750 * k;
    const og = ctx.createGain(); og.gain.value = [.6, .3, .15][i]; o.connect(og); og.connect(g); o.start(t); o.stop(t + .36); return [o, og];});
   const tick = ctx.createBufferSource(); tick.buffer = noiseBuffer(ctx);
   const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
   const tg = ctx.createGain(); tg.gain.value = .35; tick.connect(hp); hp.connect(tg); tg.connect(g); tick.start(t); tick.stop(t + .03);
   g.connect(pan); pan.connect(out); stats.clanks++;
   oscs[0][0].onended = () => {try {for (const [o, og] of oscs) {o.disconnect(); og.disconnect();} tick.disconnect(); hp.disconnect(); tg.disconnect(); g.disconnect(); pan.disconnect();} catch {}};
   return true;
  }
 };
}
