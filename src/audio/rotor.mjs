// The police helicopter's rotor (roadmap stage 3), synthesised: a low band of noise chopped by the
// blade pass (two blades at ~6.5 rev/s, a 13 Hz thump), with a faint turbine whine over it, panned
// to where the helicopter is and fading with distance. One voice; nothing runs while there is no
// helicopter. Pure except for the WebAudio nodes it owns.

export const ROTOR = Object.freeze({blade: 13, low: 110, whine: 1850, gain: .5, ref: 30, max: 400});

/** How loud the rotor is at `d` metres (0..1). Pure. */
export function rotorLevel(d) {
 if (!(d < ROTOR.max)) return 0;
 return Math.min(1, ROTOR.ref / Math.max(ROTOR.ref, d)) * (1 - d / ROTOR.max);
}

export function createRotor(getContext, getBus) {
 let v = null;
 const build = ctx => {
  const len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
  let s = 0x1234567;
  for (let i = 0; i < len; i++) {s = Math.imul(s ^ (s >>> 13), 0x5bd1e995) >>> 0; data[i] = s / 2147483648 - 1;}
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const band = ctx.createBiquadFilter(); band.type = 'lowpass'; band.frequency.value = ROTOR.low;
  const chop = ctx.createGain(); chop.gain.value = .5;
  const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = ROTOR.blade;
  const depth = ctx.createGain(); depth.gain.value = .5; lfo.connect(depth); depth.connect(chop.gain);
  const whine = ctx.createOscillator(); whine.type = 'triangle'; whine.frequency.value = ROTOR.whine;
  const whineGain = ctx.createGain(); whineGain.gain.value = .015;
  const out = ctx.createGain(); out.gain.value = 0;
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  noise.connect(band); band.connect(chop); chop.connect(out); whine.connect(whineGain); whineGain.connect(out);
  out.connect(pan); pan.connect(getBus?.() ?? ctx.destination);
  noise.start(); lfo.start(); whine.start();
  return {ctx, noise, lfo, whine, out, pan, nodes: [noise, band, chop, lfo, depth, whine, whineGain, out, pan]};
 };
 const api = {
  get playing() {return !!v;},
  /** `heli` the helicopter's state; `ear` {x, z, heading} the listener. */
  update(heli, ear) {
   const ctx = getContext?.();
   if (!heli?.active || !ctx || ctx.state !== 'running') {api.stop(); return 0;}
   v ??= build(ctx);
   const d = Math.hypot(heli.x - ear.x, heli.z - ear.z, (heli.y ?? 0) - (ear.y ?? 0));
   const level = rotorLevel(d) * ROTOR.gain, t = ctx.currentTime;
   v.out.gain.setTargetAtTime(level, t, .15);
   if (v.pan.pan) {
    // Left/right from the listener's facing: + is to the right.
    const a = Math.atan2(heli.x - ear.x, heli.z - ear.z) - (ear.heading ?? 0);
    v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(a) * .8)), t, .1);
   }
   return level;
  },
  stop() {
   if (!v) return;
   const n = v; v = null;
   try {n.out.gain.setTargetAtTime(0, n.ctx.currentTime, .1);} catch {}
   setTimeout(() => {for (const x of n.nodes) {try {x.stop?.();} catch {} try {x.disconnect();} catch {}}}, 400);
  }
 };
 return api;
}
