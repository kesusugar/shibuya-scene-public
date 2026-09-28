// The city you can hear: recorded CC0 clips (RUN 12.1).
//
// Everything here plays clips that scripts/convert-audio.mjs produced from the sources pinned
// in assets/audio/upstream.lock.json. They are loudness-normalised at conversion, so the mix
// below is relative levels only, and nothing is balanced by ear that could not be re-measured.
//
// Shape, borrowed as a method rather than code from event-driven soundscapes:
//  - one-shots fire on events, never on a timer; each kind rotates through its variants (never
//    the same clip twice running) and detunes a few percent, so a flurry does not machine-gun;
//  - anything with a place in the world is an HRTF panner at that place, with the listener on
//    the camera, so a scream behind you is behind you;
//  - every voice is bounded (per kind and in total) and disconnects itself when it ends;
//  - nothing loads until the first gesture has unlocked the context, and nothing waits on it:
//    until the bank is ready, `play` returns false and the caller keeps its synthesised sound.
//
// The ambience is two loops under everything, raised by the crowd and traffic around the player
// and ducked for a moment when something violent happens, so an incident reads over the bed.

export const MIX = Object.freeze({
 // Linear gains per kind, applied on top of the conversion's normalisation.
 swing: .32, punch: .85, body: .9, runover: .55, crash: .95, screech: .5, horn: .55,
 scream: .6, 'scream-low': .6, gasp: .45, pain: .55, 'pain-low': .55, step: .22, ambience: .55, crossing: .3,
 // PLAN-WEAPONS R13: recorded CC0 gunshots, a revolver and a ricochet.
 gunshot: 1, 'gunshot-revolver': 1, ricochet: .45,
 master: .9,
 // How many of one kind may ring at once, and in total. The feedback bus already caps starts.
 perKind: 4, total: 18,
 // Kinds allowed more than perKind: a shot and its three street echoes are four voices.
 limit: Object.freeze({gunshot: 12, 'gunshot-revolver': 8}),
 detune: .03,               // +/- playback-rate spread
 // Distance model for placed sounds (metres). Inverse falloff, like a real source in the open.
 refDistance: 3, maxDistance: 90, rolloff: 1.1,
 duck: .45, duckSeconds: 1.6 // ambience drops to 45% and recovers over 1.6 s after an incident
});

const HRTF = typeof PannerNode !== 'undefined';

export function createSoundBank(getContext, {base = 'audio/', fetchImpl = globalThis.fetch?.bind(globalThis)} = {}) {
 let ctx = null, manifest = null, loading = null, ready = false, disposed = false;
 let master = null, sfx = null, bed = null;
 const byKind = new Map();           // kind -> [{clip, buffer}]
 const byName = new Map();           // name -> {clip, buffer}
 const cursor = new Map();           // kind -> next variant index
 const live = new Map();             // kind -> count
 let total = 0;
 const stats = {played: 0, dropped: 0, fallback: 0, loops: 0, decoded: 0, bytes: 0, errors: 0};

 const graph = () => {
  if (ctx) return ctx;
  ctx = getContext?.() ?? null;
  if (!ctx) return null;
  master = ctx.createGain(); master.gain.value = MIX.master;
  // A gentle safety compressor: a pile-up of hits must not clip the output.
  const guard = ctx.createDynamicsCompressor?.();
  if (guard) {guard.threshold.value = -10; guard.ratio.value = 4; guard.attack.value = .004; guard.release.value = .18;
   master.connect(guard); guard.connect(ctx.destination);} else master.connect(ctx.destination);
  sfx = ctx.createGain(); sfx.connect(master);
  bed = ctx.createGain(); bed.connect(master);
  return ctx;
 };

 /** Fetch and decode every clip. Safe to call repeatedly; resolves when all have settled. */
 const load = () => loading ??= (async () => {
  if (!graph() || !fetchImpl) return false;
  const response = await fetchImpl(base + 'manifest.json');
  if (!response.ok) throw new Error('audio manifest ' + response.status);
  manifest = await response.json();
  await Promise.all(manifest.clips.map(async clip => {
   try {
    const r = await fetchImpl(base + clip.file);
    if (!r.ok) throw new Error(clip.file + ' ' + r.status);
    const bytes = await r.arrayBuffer(); stats.bytes += bytes.byteLength;
    const buffer = await ctx.decodeAudioData(bytes);
    const entry = {clip, buffer};
    byName.set(clip.name, entry);
    if (!byKind.has(clip.kind)) byKind.set(clip.kind, []);
    byKind.get(clip.kind).push(entry);
    stats.decoded++;
   } catch {stats.errors++;}
  }));
  for (const list of byKind.values()) list.sort((a, b) => a.clip.name.localeCompare(b.clip.name));
  ready = !disposed && stats.decoded > 0;
  return ready;
 })().catch(() => {stats.errors++; loading = null; return false;});

 /** The next variant of a kind: rotates, so the same clip never plays twice in a row. */
 const next = kind => {
  const list = byKind.get(kind);
  if (!list?.length) return null;
  const i = cursor.get(kind) ?? 0;
  cursor.set(kind, (i + 1) % list.length);
  return list[i];
 };

 const place = (panner, x, y, z) => {
  if (panner.positionX) {panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z;}
  else panner.setPosition?.(x, y, z);
 };
 const spatial = (x, y, z) => {
  const p = ctx.createPanner();
  p.panningModel = HRTF ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse';
  p.refDistance = MIX.refDistance; p.maxDistance = MIX.maxDistance; p.rolloffFactor = MIX.rolloff;
  place(p, x, y, z);
  return p;
 };

 const api = {
  get ready() {return ready;},
  get stats() {return {...stats, live: total, kinds: Object.fromEntries([...byKind].map(([k, v]) => [k, v.length]))};},
  /** The effects bus, for synthesised voices that must sit under the bank's master and guard. */
  get bus() {return graph() ? sfx : null;},
  has(kind) {return ready && !!byKind.get(kind)?.length;},
  load,
  /**
   * One event, one clip. `x/z` (and optional `y`) place it in the world; `pan` (-1..1) is for
   * sounds that belong to the listener, like their own fist. Returns false if not played, so
   * the caller can fall back to its synthesised version.
   */
  play(kind, {x, y = 1.2, z, pan = null, gain = 1, rate = 1, when = 0, onEnd = null, lowpass = 0} = {}) {
   if (!ready || disposed || !ctx || ctx.state !== 'running') {stats.fallback++; return null;}
   const entry = next(kind);
   if (!entry) {stats.fallback++; return null;}
   if ((live.get(kind) ?? 0) >= (MIX.limit[kind] ?? MIX.perKind) || total >= MIX.total) {stats.dropped++; return null;}
   const src = ctx.createBufferSource(); src.buffer = entry.buffer;
   src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * MIX.detune);
   const g = ctx.createGain(); g.gain.value = (MIX[kind] ?? .5) * gain;
   // `lowpass` (Hz): an echo off a facade has lost its top end (PLAN-WEAPONS R13).
   let head = g;
   if (lowpass > 0 && ctx.createBiquadFilter) {const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; f.connect(g); head = f;}
   let tail = g;
   if (Number.isFinite(x) && Number.isFinite(z)) {const p = spatial(x, y, z); g.connect(p); tail = p;}
   else if (pan !== null && ctx.createStereoPanner) {const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); tail = p;}
   src.connect(head); tail.connect(sfx);
   live.set(kind, (live.get(kind) ?? 0) + 1); total++; stats.played++;
   const start = Math.max(ctx.currentTime, when);
   src.start(start, entry.clip.lead ?? 0);
   const voice = {kind, clip: entry.clip.name, duration: entry.clip.duration / src.playbackRate.value, gain: g,
    cut(at = ctx.currentTime, fade = .035) {
     try {g.gain.cancelScheduledValues(at); g.gain.setValueAtTime(g.gain.value, at);
      g.gain.linearRampToValueAtTime(0, at + fade); src.stop(at + fade + .01);} catch {}
    }};
   src.onended = () => {
    live.set(kind, Math.max(0, (live.get(kind) ?? 1) - 1)); total = Math.max(0, total - 1);
    try {src.disconnect(); g.disconnect(); if (head !== g) head.disconnect(); if (tail !== g) tail.disconnect();} catch {}
    onEnd?.(voice);
   };
   return voice;
  },
  /** A looping bed. Returns a handle whose level and place can be changed while it plays. */
  loop(name, {x, y = 2, z, gain = 0} = {}) {
   if (!ready || disposed || !ctx) return null;
   const entry = byName.get(name);
   if (!entry) return null;
   const src = ctx.createBufferSource(); src.buffer = entry.buffer; src.loop = true;
   src.loopStart = entry.clip.loopStart ?? 0; src.loopEnd = entry.clip.loopEnd ?? entry.buffer.duration;
   const g = ctx.createGain(); g.gain.value = gain;
   const kind = entry.clip.kind;
   let panner = null;
   if (Number.isFinite(x) && Number.isFinite(z)) {panner = spatial(x, y, z); g.connect(panner); panner.connect(kind === 'ambience' ? bed : sfx);}
   else g.connect(kind === 'ambience' ? bed : sfx);
   src.connect(g);
   // Start somewhere different in the bed each time, so a restart is not the same few seconds.
   const offset = src.loopStart + Math.random() * Math.max(0, src.loopEnd - src.loopStart - .1);
   src.start(ctx.currentTime, offset);
   stats.loops++;
   let stopped = false;
   return {
    name,
    setGain(v, seconds = .4) {if (stopped) return; const t = ctx.currentTime; g.gain.cancelScheduledValues(t);
     g.gain.setTargetAtTime(Math.max(0, v) * (MIX[kind] ?? .5), t, Math.max(.01, seconds / 3));},
    setPosition(px, py, pz) {if (panner && !stopped) place(panner, px, py, pz);},
    stop(seconds = .3) {if (stopped) return; stopped = true; const t = ctx.currentTime;
     try {g.gain.setTargetAtTime(0, t, seconds / 3); src.stop(t + seconds + .05);} catch {}
     src.onended = () => {try {src.disconnect(); g.disconnect(); panner?.disconnect();} catch {}};}
   };
  },
  /** Put the ears on the camera. `fx/fz` is the facing on the ground plane. */
  listen(x, y, z, fx, fz) {
   if (!ctx) return;
   const l = ctx.listener;
   if (l.positionX) {l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
    l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;}
   else {l.setPosition?.(x, y, z); l.setOrientation?.(fx, 0, fz, 0, 1, 0);}
  },
  /** Something violent happened: pull the bed down so it reads, then let it come back. */
  duck(depth = MIX.duck, seconds = MIX.duckSeconds) {
   if (!ctx || !bed) return;
   const t = ctx.currentTime;
   bed.gain.cancelScheduledValues(t); bed.gain.setValueAtTime(bed.gain.value, t);
   bed.gain.linearRampToValueAtTime(depth, t + .06);
   bed.gain.setTargetAtTime(1, t + .25, seconds / 3);
  },
  dispose() {
   disposed = true; ready = false;
   try {master?.disconnect(); sfx?.disconnect(); bed?.disconnect();} catch {}
   byKind.clear(); byName.clear();
  }
 };
 return api;
}
