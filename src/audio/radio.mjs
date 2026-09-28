// Roadmap stage 6: the car radio. Plays radio-music.mjs's songs on a small synthesised band --
// drums from shaped noise and falling sines, basses, pianos, pads, leads and a distorted guitar
// from oscillators -- through a car speaker. Nothing is downloaded (no samples, no licences).
//
// Stations are live: each runs its programme on its own clock whether it is tuned or not, so
// switching lands mid-song. Tuning costs a burst of static, and the station's name and what is on
// show on the HUD. The radio only plays with the player in a car; getting out fades it.
//
// Scheduling is the usual look-ahead: each frame, every note due in the next `lookahead` seconds is
// handed to the AudioContext with its exact start time, so frame jitter never moves a beat.

import {STATIONS, songEvents, jingleEvents, programmeAt} from './radio-music.mjs';

export const RADIO = Object.freeze({
 volume: .3,               // master, under the city and the engine
 lookahead: .3,            // s scheduled ahead
 speaker: 9500,            // Hz, the car speaker's top end
 fade: .25,                // s to fade a station out
 staticSeconds: .35,       // the burst between stations
 stationOffset: 97.3       // s each station's clock runs ahead of the one before
});

/**
 * Each station's level, so the dial does not jump in loudness: measured by radiobench.html (RMS
 * of a chorus rendered offline) and scaled to about 0.1 each. A trap 808 carries five times the
 * energy of a city-pop mix.
 */
export const LEVEL = Object.freeze({city: 2.6, hiphop: 1.5, house: 2.5, wave: 2.9, rock: 1, trap: .43});

const midiHz = m => 440 * 2 ** ((m - 69) / 12);

/**
 * The band. Pitched voices: `waves` [type, detune cents, level], a lowpass (`cutoff`, `q`, and an
 * envelope from `from` to `cutoff` over `sweep` s), the amplitude envelope `a d s r`, `gain`, and
 * optionally `vib` (Hz, cents), `drive` (distortion), `glide` (808), `ring` (an inharmonic partial).
 */
const VOICE = Object.freeze({
 bass: {waves: [['square', 0, .6], ['sawtooth', -6, .5]], cutoff: 760, q: 5, from: 1600, sweep: .12, a: .004, d: .16, s: .55, r: .05, gain: 0.2},
 sub: {waves: [['sine', 0, 1], ['triangle', 0, .35]], cutoff: 420, q: 1, a: .01, d: .3, s: .85, r: .12, gain: 0.28},
 '808': {waves: [['sine', 0, 1]], cutoff: 900, q: .7, a: .004, d: .9, s: .35, r: .2, gain: 0.32, drive: .25, punch: 12},
 epiano: {waves: [['sine', 0, 1], ['sine', 1200, .22], ['triangle', 0, .25]], cutoff: 3200, q: .6, a: .004, d: .7, s: .22, r: .25, gain: 0.16},
 epianoLead: {waves: [['sine', 0, 1], ['sine', 1200, .3]], cutoff: 3600, q: .6, a: .004, d: .5, s: .35, r: .2, gain: 0.2},
 keys: {waves: [['sine', 0, 1], ['triangle', 1200, .18]], cutoff: 1700, q: .5, a: .01, d: .9, s: .4, r: .4, gain: 0.18},
 pad: {waves: [['sawtooth', -9, .5], ['sawtooth', 9, .5]], cutoff: 1300, q: .8, a: .35, d: .5, s: .85, r: .6, gain: 0.12},
 darkpad: {waves: [['triangle', -6, .6], ['sawtooth', 7, .3]], cutoff: 650, q: 1.5, a: .5, d: .5, s: .8, r: .8, gain: 0.14},
 stab: {waves: [['sawtooth', -12, .4], ['sawtooth', 0, .4], ['sawtooth', 12, .4]], cutoff: 2400, q: 2, from: 4200, sweep: .15, a: .003, d: .2, s: 0, r: .06, gain: 0.2},
 pluck: {waves: [['square', 0, .5], ['sawtooth', 5, .5]], cutoff: 700, q: 3, from: 5200, sweep: .18, a: .002, d: .28, s: .05, r: .06, gain: 0.24},
 arp: {waves: [['square', 0, 1]], cutoff: 2300, q: 2, from: 3600, sweep: .08, a: .002, d: .12, s: .2, r: .05, gain: 0.12},
 lead: {waves: [['sawtooth', -7, .5], ['sawtooth', 7, .5]], cutoff: 3000, q: 1.5, a: .02, d: .2, s: .8, r: .18, gain: 0.16, vib: [5.5, 14]},
 brass: {waves: [['sawtooth', -5, .5], ['sawtooth', 6, .5]], cutoff: 2600, q: 1.2, from: 700, sweep: .09, a: .04, d: .2, s: .75, r: .12, gain: 0.17, vib: [5, 10]},
 flute: {waves: [['sine', 0, 1], ['triangle', 1200, .12]], cutoff: 4000, q: .5, a: .05, d: .2, s: .8, r: .15, gain: 0.2, vib: [5, 16]},
 bell: {waves: [['sine', 0, 1]], cutoff: 6000, q: .5, a: .002, d: 1.1, s: 0, r: .3, gain: 0.2, ring: 2.76},
 guitar: {waves: [['sawtooth', -10, .5], ['sawtooth', 10, .5]], cutoff: 3400, q: 1, a: .003, d: .3, s: .75, r: .05, gain: 0.08, drive: 1},
 guitarLead: {waves: [['sawtooth', 0, 1]], cutoff: 3800, q: 1.4, a: .006, d: .3, s: .8, r: .1, gain: 0.1, drive: 1, vib: [6, 22]}
});

/** Drums and effects: noise through a filter and/or a falling sine. */
const DRUM = Object.freeze({
 kick: {tone: [150, 44, .11], toneDecay: .38, toneGain: 1, click: .25, gain: 0.55},
 snare: {noise: ['bandpass', 1900, .9], noiseDecay: .17, tone: [210, 170, .04], toneDecay: .1, toneGain: .45, gain: 0.8},
 bigsnare: {noise: ['bandpass', 1500, .7], noiseDecay: .34, tone: [200, 160, .05], toneDecay: .14, toneGain: .45, gain: 0.85, wet: .6},
 clap: {noise: ['bandpass', 1250, 1.4], noiseDecay: .14, bursts: 3, gain: 0.8},
 hat: {noise: ['highpass', 7200, .7], noiseDecay: .045, gain: 0.42},
 openhat: {noise: ['highpass', 6800, .7], noiseDecay: .22, gain: 0.32},
 ride: {noise: ['bandpass', 5200, .6], noiseDecay: .38, gain: 0.25},
 crash: {noise: ['highpass', 4200, .5], noiseDecay: 1.4, gain: 0.3, wet: .3},
 tom: {tone: [150, 92, .2], toneDecay: .3, toneGain: 1, gain: 0.5},
 riser: {noise: ['bandpass', 500, 2.5], sweepTo: 7000, noiseDecay: 0, gain: .16},
 vinyl: {noise: ['highpass', 2800, .5], noiseDecay: 0, gain: .018}
});

/** Which instrument a voice or drum name is, for the tests and the HUD. */
export const INSTRUMENTS = Object.freeze([...Object.keys(VOICE), ...Object.keys(DRUM)]);

/** The events of one bar of a station's programme, with swing applied to the off-sixteenths. Pure. */
export function barEvents(station, programme) {
 const events = programme.jingle ? jingleEvents(station, programme.bar)
  : songEvents(station.style, station.songs[programme.song], programme.bar);
 if (!station.swing) return events;
 return events.map(e => {
  const six = Math.round(e.at * 4);
  return six % 2 === 1 && Math.abs(e.at * 4 - six) < 1e-6 ? {...e, at: e.at + station.swing * .25} : e;
 });
}

/** A station's clock at wall time `wall` (s). Pure. */
export const stationClock = (index, wall) => wall + index * RADIO.stationOffset;

/**
 * `context()` returns the shared AudioContext (or null until there is one). `clock()` is wall time
 * in seconds. `update(dt, {on})` each frame; `tune(i)` (-1 is off), `step(±1)` along the dial.
 */
export function createRadio({context = () => null, clock = () => performance.now() / 1000} = {}) {
 let index = -1, ctx = null, out = null, bus = null, reverb = null, nextBar = null, noise = null, shaper = null;
 let playing = false, changed = 0;
 const stats = {notes: 0, bars: 0, tunes: 0};

 const ensure = () => {
  const c = context();
  if (!c) return null;
  if (ctx === c && out) return ctx;
  ctx = c;
  try {
   // The car: a master level, a speaker that rolls off the top and the rumble, and a compressor
   // that keeps a kick from jumping out over the street.
   const master = ctx.createGain(); master.gain.value = 0;
   const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = RADIO.speaker; low.Q.value = .5;
   const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 55;
   const squash = ctx.createDynamicsCompressor(); squash.threshold.value = -18; squash.ratio.value = 4; squash.attack.value = .005; squash.release.value = .2;
   master.connect(low); low.connect(high); high.connect(squash); squash.connect(ctx.destination);
   // One small room for the snares and pads.
   reverb = ctx.createConvolver();
   const n = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, n, ctx.sampleRate);
   let seed = 77;
   for (let ch = 0; ch < 2; ch++) {const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) {seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; d[i] = (seed / 2147483648 - 1) * (1 - i / n) ** 3;}}
   reverb.buffer = ir;
   const wet = ctx.createGain(); wet.gain.value = .22; reverb.connect(wet); wet.connect(master);
   out = master;
   // White noise, one second, shared by every drum.
   noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
   {const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) {seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; d[i] = seed / 2147483648 - 1;}}
   shaper = ctx.createWaveShaper();
   {const k = 18, curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) {const x = i / 511.5 - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x));} shaper.curve = curve;}
  } catch {out = null; ctx = null;}
  return ctx;
 };

 /** A fresh bus for a station, so switching can fade the old one out underneath the new. */
 const newBus = () => {
  const g = ctx.createGain(); g.gain.value = LEVEL[STATIONS[index]?.id] ?? 1; g.connect(out);
  const send = ctx.createGain(); send.gain.value = .35; g.connect(send); send.connect(reverb);
  const drive = ctx.createGain(); drive.gain.value = 1; const s = ctx.createWaveShaper(); s.curve = shaper.curve; s.oversample = '2x';
  const tame = ctx.createBiquadFilter(); tame.type = 'lowpass'; tame.frequency.value = 3600;
  drive.connect(s); s.connect(tame); tame.connect(g);
  return {gain: g, send, drive};
 };
 const dropBus = () => {
  if (!bus) return;
  const old = bus, t = ctx.currentTime;
  old.gain.gain.cancelScheduledValues(t); old.gain.gain.setValueAtTime(old.gain.gain.value, t);
  old.gain.gain.linearRampToValueAtTime(0, t + RADIO.fade);
  setTimeout(() => {try {old.gain.disconnect(); old.send.disconnect(); old.drive.disconnect();} catch {}}, (RADIO.fade + 1.5) * 1000);
  bus = null;
 };
 const later = (node, stop) => {node.onended = () => {try {node.disconnect();} catch {}};node.stop(stop);};

 const env = (g, t, a, d, s, r, len, peak) => {
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(peak * s, t + a, Math.max(.01, d / 3));
  const off = t + Math.max(a, len);
  g.gain.setTargetAtTime(0, off, Math.max(.01, r / 3));
  return off + r * 2 + .05;
 };

 const voice = (name, t, e, beat) => {
  const v = VOICE[name], len = e.len * beat, peak = v.gain * e.vel;
  const g = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = v.q;
  if (v.from) {f.frequency.setValueAtTime(v.from, t); f.frequency.exponentialRampToValueAtTime(v.cutoff, t + v.sweep);}
  else f.frequency.value = v.cutoff;
  f.connect(g); g.connect(v.drive ? bus.drive : bus.gain);
  const stop = env(g, t, v.a, v.d, v.s, v.r, len, peak);
  const hz = midiHz(e.note);
  for (const [type, cents, level] of v.waves) {
   const o = ctx.createOscillator(), lg = ctx.createGain(); o.type = type; o.detune.value = cents; lg.gain.value = level;
   if (v.punch) {o.frequency.setValueAtTime(hz * 2 ** (v.punch / 12), t); o.frequency.exponentialRampToValueAtTime(hz, t + .04);}
   else if (e.glide) {o.frequency.setValueAtTime(midiHz(e.glide), t); o.frequency.exponentialRampToValueAtTime(hz, t + .12);}
   else o.frequency.value = hz;
   if (v.vib) {const lfo = ctx.createOscillator(), depth = ctx.createGain(); lfo.frequency.value = v.vib[0]; depth.gain.value = v.vib[1];
    lfo.connect(depth); depth.connect(o.detune); lfo.start(t + .12); later(lfo, stop);}
   o.connect(lg); lg.connect(f); o.start(t); later(o, stop);
  }
  if (v.ring) {const o = ctx.createOscillator(), lg = ctx.createGain(); o.frequency.value = hz * v.ring; lg.gain.setValueAtTime(.35, t); lg.gain.exponentialRampToValueAtTime(.001, t + .35);
   o.connect(lg); lg.connect(f); o.start(t); later(o, stop);}
  stats.notes++;
 };

 const drum = (name, t, e, beat) => {
  const d = DRUM[name], peak = d.gain * e.vel, dest = bus.gain;
  let wet = null;
  if (d.wet) {wet = ctx.createGain(); wet.gain.value = d.wet; wet.connect(reverb);}
  if (d.noise) {
   const bursts = d.bursts ?? 1;
   for (let b = 0; b < bursts; b++) {
    const tb = t + b * .011, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; src.loop = true;
    f.type = d.noise[0]; f.frequency.value = d.noise[1]; f.Q.value = d.noise[2];
    const len = e.len * beat;
    if (d.noiseDecay) {g.gain.setValueAtTime(peak, tb); g.gain.exponentialRampToValueAtTime(.0005, tb + d.noiseDecay * (b === bursts - 1 ? 1 : .25));}
    else {g.gain.setValueAtTime(d.sweepTo ? .0005 : peak, tb); g.gain.linearRampToValueAtTime(peak, tb + len * .95); g.gain.linearRampToValueAtTime(0, tb + len);}
    if (d.sweepTo) {f.frequency.setValueAtTime(d.noise[1], tb); f.frequency.exponentialRampToValueAtTime(d.sweepTo, tb + len);}
    src.connect(f); f.connect(g); g.connect(dest); if (wet) g.connect(wet);
    src.start(tb, Math.random() * .5); later(src, tb + (d.noiseDecay ? d.noiseDecay + .05 : len + .05));
   }
  }
  if (d.tone) {
   const o = ctx.createOscillator(), g = ctx.createGain(), [f0, f1, drop] = d.tone;
   o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + drop);
   g.gain.setValueAtTime(peak * d.toneGain, t); g.gain.exponentialRampToValueAtTime(.0005, t + d.toneDecay);
   o.connect(g); g.connect(dest); if (wet) g.connect(wet); o.start(t); later(o, t + d.toneDecay + .05);
  }
  if (d.click) {const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = noise;
   g.gain.setValueAtTime(d.click * peak, t); g.gain.exponentialRampToValueAtTime(.0005, t + .012);
   src.connect(g); g.connect(dest); src.start(t); later(src, t + .03);}
  stats.notes++;
 };

 /** Static between stations. */
 const hiss = t => {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; src.loop = true; f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = .4;
  g.gain.setValueAtTime(.08, t); g.gain.linearRampToValueAtTime(0, t + RADIO.staticSeconds);
  src.connect(f); f.connect(g); g.connect(out); src.start(t); later(src, t + RADIO.staticSeconds + .05);
 };

 /** Hand the AudioContext every note of bars starting before `until` (station clock). */
 const schedule = (station, offset, from, until, bars = 8) => {
  let guard = 0;
  if (nextBar !== null && nextBar < from - 1) nextBar = null;   // back from a hidden tab: rejoin, do not catch up
  while (nextBar === null || nextBar < until) {
   if (++guard > bars) break;
   const at = nextBar ?? from;
   const p = programmeAt(station, at + 1e-4);
   const beat = p.barSeconds / 4;
   for (const e of barEvents(station, p)) {
    const when = p.barStart + e.at * beat;
    if (when < from - 1e-4) continue;          // tuned in mid-bar: what has gone has gone
    const t = when + offset;
    if (VOICE[e.inst]) voice(e.inst, t, e, beat); else if (DRUM[e.inst]) drum(e.inst, t, e, beat);
   }
   nextBar = p.barStart + p.barSeconds; stats.bars++;
  }
 };

 const api = {
  get station() {return index;},
  get stations() {return STATIONS;},
  get playing() {return playing;},
  get stats() {return {...stats};},
  /** Changed since the HUD last asked (a counter it compares). */
  get changed() {return changed;},
  /** What is on: {station, freq, genre, title, artist, jingle} or null when off. */
  nowPlaying(wall = clock()) {
   if (index < 0) return null;
   const s = STATIONS[index], p = programmeAt(s, stationClock(index, wall)), song = s.songs[p.song];
   return {station: s.name, freq: s.freq, genre: s.genre, title: p.jingle ? null : song.title, artist: p.jingle ? null : song.artist, jingle: p.jingle, song: p.song};
  },
  tune(i) {
   const next = i >= 0 && i < STATIONS.length ? i : -1;
   if (next === index) return index;
   index = next; changed++; stats.tunes++;
   if (ctx && out) {dropBus(); nextBar = null; if (playing) hiss(ctx.currentTime);}
   return index;
  },
  /** Along the dial, with OFF between the last station and the first. */
  step(dir = 1) {
   const n = STATIONS.length + 1, at = index < 0 ? n - 1 : index;
   const to = ((at + dir) % n + n) % n;
   return api.tune(to === n - 1 ? -1 : to);
  },
  // `ahead` and `offline` are for rendering a station to a buffer (QA): schedule further ahead,
  // on a context that is not running yet.
  update(dt, {on = false, ahead = RADIO.lookahead, offline = false} = {}) {
   const want = on && index >= 0;
   if (!want) {
    if (playing && ctx && out) {out.gain.setTargetAtTime(0, ctx.currentTime, RADIO.fade / 3); dropBus(); nextBar = null;}
    playing = false; return false;
   }
   if (!ensure() || (!offline && ctx.state !== 'running')) return false;
   if (!playing) {out.gain.setTargetAtTime(RADIO.volume, ctx.currentTime, offline ? .001 : .15); playing = true; nextBar = null;}
   bus ??= newBus();
   const station = STATIONS[index], now = stationClock(index, clock()), offset = ctx.currentTime - now;
   schedule(station, offset, now, now + ahead, offline ? 400 : 8);
   return true;
  },
  silence() {api.update(0, {on: false});},
  dispose() {api.silence(); try {out?.disconnect();} catch {} out = null; ctx = null;}
 };
 return api;
}

/** A car's station when the player first gets in: patrol cars have the radio off. Pure. */
export function stationFor(slot, stations = STATIONS) {
 if (slot?.radio !== undefined) return slot.radio;
 if (slot?.type === 'police' || slot?.type === 'unmarked') return -1;
 return ((slot?.id ?? 0) * 7 + 3) % stations.length;
}
