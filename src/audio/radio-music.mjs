// Roadmap stage 6: the car radio's music -- original, written here by rule, in the styles a city
// radio dial has. Pure: `songEvents` turns a station, a song and a bar into note events, so every
// song is the same every time it plays and every rule is tested without an AudioContext.
// radio.mjs plays them.
//
// Nothing here is anyone's song. Titles and artists are made up for this game; progressions are
// the common property of each style (the J-pop "royal road" IV-V-iii-vi, a minor i-VI-III-VII, a
// boom-bap minor loop), and the drums are each style's stock grooves.
//
// Units: a bar is 4 beats of 4 sixteenths; an event's `at` and `len` are in beats from the bar's
// start. Pitches are MIDI numbers.

/** The dial. `style` picks the band and the grooves; `swing` delays the off-sixteenths. */
export const STATIONS = Object.freeze([
 Object.freeze({id: 'city', name: 'Shibuya Night FM', freq: '88.4', genre: 'シティポップ', style: 'citypop', swing: 0,
  songs: Object.freeze([
   Object.freeze({title: 'Scramble Heart', artist: 'Mariko & The Late Lights', key: 62, bpm: 112, seed: 11}),
   Object.freeze({title: 'Highway 246 Serenade', artist: 'Satsuki Aoyama', key: 65, bpm: 108, seed: 12}),
   Object.freeze({title: 'Neon Taxi Lovers', artist: 'Kaze no Machi', key: 60, bpm: 116, seed: 13})])}),
 Object.freeze({id: 'hiphop', name: 'Concrete 93.1', freq: '93.1', genre: 'ヒップホップ', style: 'boombap', swing: .16,
  songs: Object.freeze([
   Object.freeze({title: 'Dogenzaka Chronicles', artist: 'MC Kurogane', key: 57, bpm: 90, seed: 21}),
   Object.freeze({title: 'Back Alley Gospel', artist: 'Sixteen Bars Crew', key: 55, bpm: 86, seed: 22}),
   Object.freeze({title: 'Rooftop Cypher', artist: 'DJ Ginza Lo-Fi', key: 60, bpm: 93, seed: 23})])}),
 Object.freeze({id: 'house', name: 'Neon Pulse 101.7', freq: '101.7', genre: 'ハウス / EDM', style: 'house', swing: 0,
  songs: Object.freeze([
   Object.freeze({title: 'Crossing Lights', artist: 'Hikari System', key: 57, bpm: 124, seed: 31}),
   Object.freeze({title: 'After Hours Loop', artist: 'Mona Kaito', key: 55, bpm: 126, seed: 32}),
   Object.freeze({title: 'Signal Green', artist: 'Tokyo Undercurrent', key: 60, bpm: 122, seed: 33})])}),
 Object.freeze({id: 'wave', name: 'Rewind 80s', freq: '84.8', genre: 'シンセウェーブ', style: 'synthwave', swing: 0,
  songs: Object.freeze([
   Object.freeze({title: 'Chrome Horizon', artist: 'Velvet Cassette', key: 57, bpm: 100, seed: 41}),
   Object.freeze({title: 'Midnight Expressway', artist: 'Laser Katana', key: 52, bpm: 96, seed: 42}),
   Object.freeze({title: 'Arcade Sunset', artist: 'Pastel Grid', key: 55, bpm: 104, seed: 43})])}),
 Object.freeze({id: 'rock', name: 'Loud Garage 97.8', freq: '97.8', genre: 'ロック', style: 'rock', swing: 0,
  songs: Object.freeze([
   Object.freeze({title: 'Burnout Boulevard', artist: 'The Red Signals', key: 52, bpm: 148, seed: 51}),
   Object.freeze({title: 'No Parking Zone', artist: 'Static Kids', key: 57, bpm: 156, seed: 52}),
   Object.freeze({title: 'Wrong Way Home', artist: 'Iron Scramble', key: 55, bpm: 140, seed: 53})])}),
 Object.freeze({id: 'trap', name: 'Tokyo Drill 104.2', freq: '104.2', genre: 'トラップ', style: 'trap', swing: 0,
  songs: Object.freeze([
   Object.freeze({title: 'Cold Concrete', artist: 'Yami Kid', key: 49, bpm: 142, seed: 61}),
   Object.freeze({title: 'Blue Lights Behind', artist: 'Lil Shinobi', key: 51, bpm: 138, seed: 62}),
   Object.freeze({title: 'Ten Thousand Yen', artist: 'Kuro Nami', key: 48, bpm: 146, seed: 63})])})
]);

/** A song's shape: sections and their length in bars. The jingle between songs is two bars. */
export const FORM = Object.freeze([['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['bridge', 4], ['chorus', 8], ['outro', 4]]);
export const JINGLE_BARS = 2;
export const SONG_BARS = FORM.reduce((n, [, b]) => n + b, 0);

const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];

/**
 * Chord progressions (scale degrees, 1-based, one per bar) for verse and chorus, per style. The
 * chorus is where the song lifts; the bridge borrows the chorus's last two bars twice.
 */
const PROGRESSIONS = Object.freeze({
 citypop: {scale: MAJOR, seventh: true, verse: [[4, 5, 3, 6], [2, 5, 1, 6], [4, 3, 2, 5]], chorus: [[4, 5, 3, 6], [1, 6, 4, 5], [4, 5, 6, 1]]},
 boombap: {scale: MINOR, seventh: true, verse: [[1, 1, 6, 6], [1, 4, 1, 4], [1, 6, 4, 5]], chorus: [[6, 6, 1, 1], [4, 5, 1, 1], [6, 4, 1, 5]]},
 house: {scale: MINOR, seventh: true, verse: [[1, 6, 3, 7], [1, 1, 6, 7], [1, 4, 6, 5]], chorus: [[6, 7, 1, 1], [1, 6, 3, 7], [4, 6, 7, 1]]},
 synthwave: {scale: MINOR, seventh: false, verse: [[1, 6, 3, 7], [1, 7, 6, 7], [1, 3, 6, 5]], chorus: [[6, 7, 1, 1], [6, 3, 7, 1], [4, 6, 7, 7]]},
 rock: {scale: MINOR, seventh: false, verse: [[1, 1, 6, 7], [1, 6, 3, 7], [1, 3, 4, 6]], chorus: [[6, 7, 1, 1], [3, 7, 6, 7], [6, 7, 3, 1]]},
 trap: {scale: MINOR, seventh: false, verse: [[1, 1, 6, 6], [1, 1, 2, 2], [1, 6, 1, 5]], chorus: [[6, 6, 1, 1], [1, 1, 6, 5], [6, 6, 5, 5]]}
});

/** A small seeded generator (mulberry32), so a song is the same every time. */
export function rng(seed) {
 let a = seed >>> 0;
 return () => {a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;};
}

/** Where bar `bar` of a song falls: {section, index (bar within the section)}. Pure. */
export function sectionAt(bar) {
 let b = ((bar % SONG_BARS) + SONG_BARS) % SONG_BARS;
 for (const [name, n] of FORM) {if (b < n) return {section: name, index: b}; b -= n;}
 return {section: 'outro', index: 0};
}

/** The chord (MIDI notes, root first, in the octave above `key - 12`) on scale degree `degree`. */
export function chord(key, degree, scale, seventh = false) {
 const at = i => {const s = degree - 1 + i; return key + scale[s % 7] + 12 * Math.floor(s / 7);};
 const notes = [at(0), at(2), at(4)];
 if (seventh) notes.push(at(6));
 return notes;
}

/** A song's choices that stay put across its bars: which progressions, the lead's motif. */
function plan(style, song) {
 const r = rng(song.seed * 7919), p = PROGRESSIONS[style];
 const verse = p.verse[Math.floor(r() * p.verse.length)], chorus = p.chorus[Math.floor(r() * p.chorus.length)];
 // A two-bar motif for the lead: rhythm (sixteenths) and chord-tone steps, reused and varied.
 const motif = [];
 let step = 0;
 while (step < 32) {
  const len = [2, 2, 4, 1, 3, 6][Math.floor(r() * 6)];
  if (r() > .22) motif.push({step, len: Math.min(len, 32 - step), tone: Math.floor(r() * 5) - 1});
  step += len;
 }
 return {scale: p.scale, seventh: p.seventh, verse, chorus, motif, hatRoll: Math.floor(r() * 4)};
}
const plans = new Map();
const planOf = (style, song) => {const k = style + song.seed; if (!plans.has(k)) plans.set(k, plan(style, song)); return plans.get(k);};

/** The degree the harmony is on in this bar. */
function degreeAt(p, section, index) {
 if (section === 'chorus') return p.chorus[index % 4];
 if (section === 'bridge') return p.chorus[2 + index % 2];
 if (section === 'outro') return index < 2 ? p.chorus[index] : 1;
 return p.verse[index % 4];
}

const push = (out, inst, at, len, note, vel, extra) => out.push(extra ? {inst, at, len, note, vel, ...extra} : {inst, at, len, note, vel});
/** Sixteenth patterns as strings: 'x' hit, 'o' accent, '.' rest. */
const hits = (out, inst, pattern, vel = .8, note = 0) => {
 for (let i = 0; i < pattern.length; i++) if (pattern[i] !== '.') push(out, inst, i / 4, .25, note, pattern[i] === 'o' ? vel : vel * .62);
};

/**
 * The events of bar `bar` of `song` on a station of `style`. Each is {inst, at, len, note, vel}
 * (plus `glide` for an 808 sliding up from a lower note). Pure and deterministic.
 */
export function songEvents(style, song, bar) {
 const p = planOf(style, song), {section, index} = sectionAt(bar);
 const out = [], key = song.key, deg = degreeAt(p, section, index);
 const tones = chord(key, deg, p.scale, p.seventh), root = tones[0];
 const quiet = section === 'intro' || section === 'outro', lift = section === 'chorus', fill = index % 4 === 3;
 const r = rng(song.seed * 131 + bar * 17);
 const lead = (inst, octave, vel, density = 1) => {
  const half = (index % 2) * 16;
  for (const m of p.motif) {
   if (m.step < half || m.step >= half + 16) continue;
   if (density < 1 && r() > density) continue;
   // Chord tones by index, walking into the next octave; the last motif of a four varies.
   const pick = ((m.tone + (index % 4 === 3 ? 1 : 0)) % tones.length + tones.length) % tones.length;
   push(out, inst, (m.step - half) / 4, m.len / 4 * .9, tones[pick] + 12 * octave, vel);
  }
 };
 switch (style) {
  case 'citypop': {
   if (!quiet || index > 1) hits(out, 'kick', 'o.....x...o.....', .9);
   if (!quiet) {hits(out, 'snare', '....o.......o...', .75); hits(out, 'hat', lift ? 'xxxxxxxxxxxxxxxx' : 'x.x.x.x.x.x.x.x.', .32);}
   if (fill && !quiet) hits(out, 'snare', '.............xox', .5);
   // The bass: root, octave and fifth, pushed on the sixteenths the way a slap line is.
   const b = root - 24, line = [[0, 0, .5], [.75, 12, .25], [1.5, 7, .25], [2, 0, .5], [2.75, 12, .25], [3.25, 10, .25], [3.5, 7, .5]];
   for (const [at, off, len] of line) if (!(quiet && at > 2)) push(out, 'bass', at, len, b + off, .75);
   // Electric piano stabs on the off-beats; strings under the chorus.
   for (const at of [.5, 1.75, 2.5, 3.75]) for (const n of tones) push(out, 'epiano', at, .5, n, .38);
   if (lift || section === 'bridge') for (const n of tones) push(out, 'pad', 0, 4, n + 12, .18);
   if (lift) lead('brass', 1, .45); else if (section === 'verse' && index >= 4) lead('epianoLead', 1, .3, .6);
   break;
  }
  case 'boombap': {
   hits(out, 'kick', quiet ? 'o.........o.....' : 'o.........o.x...', .95);
   if (!quiet || index > 1) hits(out, 'snare', '....o.......o...', .85);
   hits(out, 'hat', 'x.x.x.x.x.x.x.x.', .3);
   if (fill) hits(out, 'hat', '..............xx', .25);
   push(out, 'sub', 0, 1.5, root - 24, .8); push(out, 'sub', 2.5, 1, root - 24, .7);
   if (deg !== 1 || index % 2) push(out, 'sub', 3.5, .5, root - 24 + p.scale[4] - p.scale[0], .55);
   // A mellow chord loop, like a record sampled.
   for (const [at, len] of [[0, 1.5], [1.5, .5], [2.5, 1.5]]) for (const n of tones) push(out, 'keys', at, len, n, .3);
   if (lift) lead('flute', 1, .3, .7);
   push(out, 'vinyl', 0, 4, 0, .5);
   break;
  }
  case 'house': {
   if (!(section === 'bridge' && index < 2)) hits(out, 'kick', 'o...o...o...o...', .95);
   if (!quiet) hits(out, 'clap', '....o.......o...', .7);
   hits(out, 'openhat', '..x...x...x...x.', .38);
   if (lift) hits(out, 'hat', 'xxxxxxxxxxxxxxxx', .22);
   // Off-beat bass, the stab on the off-beats, a pad, and in the chorus a plucked lead.
   for (const at of [.5, 1.5, 2.5, 3.5]) push(out, 'bass', at, .35, root - 24, .8);
   if (!quiet) for (const at of lift ? [.5, 1.25, 2.5, 3.25] : [.5, 2.5]) for (const n of tones) push(out, 'stab', at, .3, n, .3);
   for (const n of tones) push(out, 'pad', 0, 4, n, lift ? .14 : .1);
   if (lift) lead('pluck', 1, .4);
   if (section === 'bridge' && index >= 2) push(out, 'riser', 0, 4 * (4 - index) / 2, 0, .4);
   break;
  }
  case 'synthwave': {
   if (!quiet || index > 1) hits(out, 'kick', 'o.......o.......', .9);
   if (!quiet) hits(out, 'bigsnare', '....o.......o...', .8);
   hits(out, 'hat', 'x.x.x.x.x.x.x.x.', .26);
   for (let i = 0; i < 8; i++) push(out, 'bass', i / 2, .45, root - 24 + (i % 2 ? 12 : 0), .72);
   // The arpeggio: chord tones up and down in sixteenths.
   const arp = [...tones, tones[1] + 12, tones[0] + 12, tones[2], tones[1]];
   if (!quiet || index > 1) for (let i = 0; i < 16; i++) push(out, 'arp', i / 4, .22, arp[i % arp.length] + 12, .22);
   for (const n of tones) push(out, 'pad', 0, 4, n, .16);
   if (lift) lead('lead', 1, .38);
   break;
  }
  case 'rock': {
   if (!quiet || index > 1) {hits(out, 'kick', 'o.....o.o.....o.', .95); hits(out, 'snare', '....o.......o...', .9);}
   hits(out, 'ride', 'x.x.x.x.x.x.x.x.', lift ? .4 : .28);
   if (index === 0 && section !== 'intro') push(out, 'crash', 0, 2, 0, .55);
   if (fill && !quiet) hits(out, 'tom', '............oxox', .6);
   // Power chords (root and fifth, and the octave) in driving eighths; the bass doubles the root.
   const power = [root - 12, root - 12 + 7, root];
   for (let i = 0; i < 8; i++) {
    const pm = !lift && i % 2 === 1;
    for (const n of power) push(out, 'guitar', i / 2, pm ? .2 : .45, n, pm ? .3 : .42);
    push(out, 'bass', i / 2, .45, root - 24, .8);
   }
   if (lift && index % 2 === 0) lead('guitarLead', 1, .4, .85);
   break;
  }
  case 'trap': {
   // Half time: the snare on beat three, the 808 carrying the kick, hats in eighths with rolls.
   const k = ['o.........o.....', 'o......o..o.....', 'o.........o..o..', 'o.....o...o.....'][(index + p.hatRoll) % 4];
   if (!quiet || index > 1) for (let i = 0; i < 16; i++) if (k[i] !== '.') push(out, '808', i / 4, i === 0 ? 1.4 : .9, root - 24, .9, {glide: i === 10 && lift ? root - 29 : null});
   if (!quiet) hits(out, 'clap', '........o.......', .85);
   hits(out, 'hat', 'x.x.x.x.x.x.x.x.', .3);
   if (!quiet && (index % 2 === 1)) {       // a roll: thirty-seconds, then triplets
    for (let i = 0; i < 8; i++) push(out, 'hat', 3 + i / 8, .1, 0, .22);
   }
   for (const n of tones) push(out, 'darkpad', 0, 4, n, .12);
   if (!quiet) lead('bell', 1, lift ? .38 : .26, lift ? 1 : .55);
   break;
  }
 }
 return out;
}

/** The station's jingle, bar 0 or 1 of two: a riser into a sting on the station's key. Pure. */
export function jingleEvents(station, bar) {
 const song = station.songs[0], key = song.key, out = [];
 if (bar === 0) {
  push(out, 'riser', 0, 4, 0, .45);
  for (const [at, n] of [[2, 0], [2.5, 7], [3, 12], [3.5, 16]]) push(out, 'bell', at, .45, key + 12 + n, .35);
 } else {
  push(out, 'kick', 0, .25, 0, 1); push(out, 'crash', 0, 2, 0, .45);
  for (const n of chord(key, 1, MAJOR, true)) push(out, 'pad', 0, 3, n + 12, .3);
  push(out, 'bell', 0, 1.5, key + 24, .4);
 }
 return out;
}

/**
 * What a station is playing at `t` seconds of its own clock: the station runs its songs in turn
 * with a jingle after each, on a loop, whether anyone is listening or not -- tune in and you land
 * mid-song, as on a real dial. Returns {song (index), jingle, bar, beat (within the bar), bpm,
 * barStart (s, on the station clock), barSeconds}. Pure.
 */
export function programmeAt(station, t) {
 const parts = station.songs.flatMap((song, i) => [
  {song: i, jingle: false, bars: SONG_BARS, bpm: song.bpm},
  {song: i, jingle: true, bars: JINGLE_BARS, bpm: song.bpm}]);
 const total = parts.reduce((s, p) => s + p.bars * 240 / p.bpm, 0);
 let local = ((t % total) + total) % total, start = t - local;
 for (const p of parts) {
  const len = p.bars * 240 / p.bpm;
  if (local < len) {
   const barSeconds = 240 / p.bpm, bar = Math.floor(local / barSeconds);
   return {song: p.song, jingle: p.jingle, bar, beat: (local - bar * barSeconds) / barSeconds * 4, bpm: p.bpm,
    barStart: start + bar * barSeconds, barSeconds, total};
  }
  local -= len; start += len;
 }
 return null;
}

/** A station's programme length, seconds. */
export function programmeLength(station) {
 return station.songs.reduce((s, song) => s + (SONG_BARS + JINGLE_BARS) * 240 / song.bpm, 0);
}
