// Roadmap ①: the police radio -- the dispatcher, heard while the player is wanted (the way a
// scanner plays in a chase). A recorded line (voice-clips.mjs, `use: 'radio'`) between the
// channel's opening beep and hiss and its closing hiss and beep, through a narrow, driven radio
// band with the channel's own hiss under it. Not placed in the street: it is heard, not seen.
//
// What is said, and when, is `dispatchCue` (pure): once per incident when it starts (a car or on
// foot), again for backup each time the stars rise to ☆3 or above, when the helicopter arrives,
// when the player is armed, and when the police lose sight of the player. The radio is one channel:
// a line waits (the cue stays pending) until the last has ended and `DISPATCH.gap` has passed.

export const DISPATCH = Object.freeze({
 gap: 4,              // s of quiet between two transmissions
 lostAfter: 2.5,      // s out of sight before 「見失った」
 level: .55,
 band: [300, 3000], drive: 3.2,
 beep: {open: 1850, close: 1450, seconds: [.07, .05], level: .12},
 hiss: .018
});

/**
 * The next thing to say, or null. `s` is this frame {stars, driving, heli, armed, seen, escape};
 * `said` the incident's memory {start, air, armed, lost, backupAt} (the stars each backup was for).
 */
export function dispatchCue(s, said) {
 if (!s.stars) return null;
 if (!said.start) return {situation: s.driving ? 'fleeingCar' : 'fleeingFoot', key: 'start'};
 if (s.stars >= 3 && s.stars > (said.backupAt ?? 0)) return {situation: 'backup', key: 'backup'};
 if (s.heli && !said.air) return {situation: 'air', key: 'air'};
 if (s.armed && !said.armed) return {situation: 'armed', key: 'armed'};
 if (!s.seen && (s.escape ?? 0) >= DISPATCH.lostAfter && !said.lost) return {situation: 'lost', key: 'lost'};
 return null;
}
/** Mark a cue said. Seen again, 「見失った」 may come again later. */
export function markSaid(said, cue, s) {
 if (cue.key === 'backup') said.backupAt = s.stars; else said[cue.key] = true;
}

export function createDispatch(getContext, getBus, clips) {
 let ctx = null, busyUntil = -Infinity, hissBuffer = null, disposed = false;
 const said = {};
 const stats = {said: 0, waiting: 0};
 const noiseBuffer = seconds => {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
 };
 const beep = (hz, at, seconds, out) => {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = hz; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(DISPATCH.beep.level, at + .004);
  g.gain.setValueAtTime(DISPATCH.beep.level, at + seconds - .006); g.gain.linearRampToValueAtTime(0, at + seconds);
  o.connect(g); g.connect(out); o.start(at); o.stop(at + seconds + .01);
  o.onended = () => {try {o.disconnect(); g.disconnect();} catch {}};
 };
 const burst = (at, seconds, level, out) => {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(seconds);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = .7;
  const g = ctx.createGain(); g.gain.value = level;
  src.connect(f); f.connect(g); g.connect(out); src.start(at);
  src.onended = () => {try {src.disconnect(); f.disconnect(); g.disconnect();} catch {}};
 };
 const curve = (() => {const n = 256, c = new Float32Array(n), k = Math.tanh(DISPATCH.drive); for (let i = 0; i < n; i++) {const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * DISPATCH.drive) / k;} return c;})();

 /** One transmission of `clip` now. Returns its length (s), or 0. */
 function transmit(clip) {
  const bus = getBus?.();
  if (!ctx) ctx = getContext?.() ?? null;
  if (!ctx || !bus || ctx.state === 'closed' || !clip?.buffer) return 0;
  const t0 = ctx.currentTime + .02, open = DISPATCH.beep.seconds[0] + .03 + .05, voiceAt = t0 + open;
  const out = ctx.createGain(); out.gain.value = DISPATCH.level; out.connect(bus);
  // The voice: the radio's band, driven.
  const src = ctx.createBufferSource(); src.buffer = clip.buffer;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = DISPATCH.band[0]; hp.Q.value = .8;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = DISPATCH.band[1]; lp.Q.value = .8;
  const shaper = ctx.createWaveShaper(); shaper.curve = curve;
  src.connect(hp); hp.connect(lp); lp.connect(shaper); shaper.connect(out); src.start(voiceAt);
  const end = voiceAt + clip.buffer.duration;
  // The channel open: beep, a breath of hiss; the hiss under the voice; closed: hiss, beep.
  beep(DISPATCH.beep.open, t0, DISPATCH.beep.seconds[0], out);
  burst(t0 + DISPATCH.beep.seconds[0] + .03, .05, .3, out);
  hissBuffer ??= noiseBuffer(1);
  const hiss = ctx.createBufferSource(); hiss.buffer = hissBuffer; hiss.loop = true;
  const hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 1800; hf.Q.value = .5;
  const hg = ctx.createGain(); hg.gain.value = DISPATCH.hiss;
  hiss.connect(hf); hf.connect(hg); hg.connect(out); hiss.start(voiceAt); hiss.stop(end);
  burst(end + .01, .09, .32, out);
  beep(DISPATCH.beep.close, end + .14, DISPATCH.beep.seconds[1], out);
  const length = end + .2 - t0;
  src.onended = () => {try {src.disconnect(); hp.disconnect(); lp.disconnect(); shaper.disconnect();} catch {}};
  hiss.onended = () => {try {hiss.disconnect(); hf.disconnect(); hg.disconnect();} catch {}};
  setTimeout?.(() => {try {out.disconnect();} catch {}}, (length + .5) * 1000);
  return length;
 }

 return {
  stats, said,
  get busy() {return busyUntil;},
  /**
   * One frame. `s` {stars, driving, heli, armed, seen, escape}; `time` the director's clock.
   * Returns the situation transmitted this frame, or null.
   */
  update(s, time) {
   if (disposed) return null;
   if (!s.stars) {for (const k of Object.keys(said)) delete said[k]; return null;}
   if (s.seen) said.lost = false;
   const cue = dispatchCue(s, said);
   if (!cue) return null;
   if (time < busyUntil) {stats.waiting++; return null;}
   const clip = clips?.pick(cue.situation);
   if (!clip) return null;                 // not loaded yet: the cue stays pending
   const length = transmit(clip);
   if (!length) return null;
   markSaid(said, cue, s);
   busyUntil = time + length + DISPATCH.gap; stats.said++;
   return cue.situation;
  },
  dispose() {disposed = true;}
 };
}
