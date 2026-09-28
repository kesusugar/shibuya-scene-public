// The wanted level, ☆1–☆5 (PLAN-POLICE-AND-OWN-CAR W1). Pure: no scene, no DOM, no time source
// of its own -- the caller hands in crimes as they happen and the time with every update, which
// is what lets every rule below be tested frame by frame.
//
// Three ideas, the GTA V ones:
//  - A crime raises the level only once the police KNOW about it. An officer who sees it knows
//    at once; a crime only civilians saw is reported after a few seconds, and the report dies if
//    every witness is gone before then.
//  - While any unit can see the player, the stars are solid and `lastSeen` follows the player.
//  - Out of sight, the stars flash and a search circle sits on `lastSeen`. Staying outside it,
//    unseen, for long enough clears the level. Being seen again restarts the clock.

/** Every tunable in one place. Arrays are indexed by star (0 unused). */
export const WANTED = Object.freeze({
 meleeKillsForOne: 2,          // the user's rule: two killed in fights
 runoverRepeatSeconds: 60,     // a second run-over kill inside this makes it ☆2
 killsForTwo: 4, killsForThree: 8, killsForFour: 15, killsForFive: 25,
 officerKillsForFour: 2, officerKillsForFive: 4,
 holdAtThreeForFour: 90,       // seconds at ☆3 without escaping
 reportDelay: [4, 8],          // seconds, fixed per crime by its id
 searchRadius: [0, 60, 90, 120, 160, 200],
 escapeSeconds: [0, 12, 18, 25, 35, 45],
 sightRange: 45,               // how far an officer or a patrol car sees a crime or the player
 // PLAN-WEAPONS §2: shooting in public, or killing with a gun or the katana, is at least ☆2; an
 // officer seeing a drawn weapon is ☆1.
 weaponCrimeStars: 2, weaponSeenStars: 1
});

/** The crimes the table knows. */
export const CRIMES = Object.freeze(['meleeKill', 'runoverKill', 'officerAssault', 'policeRam',
 'policeCarTaken', 'officerKill', 'carjack', 'shooting', 'weaponKill', 'weaponSeen']);

const hash = id => {let h = Math.imul((id | 0) ^ 0x3c6ef372, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0;};
/** How long civilians take to report crime `id`. Fixed by the id, so a test can predict it. */
export const reportDelayOf = id => WANTED.reportDelay[0] + (hash(id) % 1000) / 1000 * (WANTED.reportDelay[1] - WANTED.reportDelay[0]);

export function createWanted() {
 const crimes = {meleeKills: 0, runoverKills: 0, officerAssaults: 0, officerKills: 0, policeRams: 0,
  policeCarsTaken: 0, carjacks: 0, shootings: 0, weaponKills: 0, weaponsSeen: 0};
 const state = {stars: 0, seen: false, lastSeen: null, escape: 0, atThree: 0, peak: 0,
  rose: 0, roseSeq: 0, cleared: null, crimes, pending: [], runovers: []};
 let nextId = 1;

 /** The level the known crimes call for. Officer assaults are handled where they happen. */
 function called(t) {
  const kills = crimes.meleeKills + crimes.runoverKills + crimes.weaponKills;
  let s = 0;
  if (crimes.weaponsSeen >= 1) s = Math.max(s, WANTED.weaponSeenStars);
  if (crimes.shootings >= 1 || crimes.weaponKills >= 1) s = Math.max(s, WANTED.weaponCrimeStars);
  if (crimes.meleeKills >= WANTED.meleeKillsForOne) s = 1;
  if (crimes.runoverKills >= 1) s = Math.max(s, 1);
  const recent = state.runovers.filter(r => t - r <= WANTED.runoverRepeatSeconds).length;
  if (recent >= 2) s = Math.max(s, 2);
  if (crimes.policeRams >= 1 || kills >= WANTED.killsForTwo) s = Math.max(s, 2);
  if (crimes.policeCarsTaken >= 1 || crimes.officerKills >= 1 || kills >= WANTED.killsForThree) s = Math.max(s, 3);
  if (kills >= WANTED.killsForFour || crimes.officerKills >= WANTED.officerKillsForFour) s = Math.max(s, 4);
  if (kills >= WANTED.killsForFive || crimes.officerKills >= WANTED.officerKillsForFive) s = Math.max(s, 5);
  return s;
 }
 function raise(to) {
  to = Math.min(5, Math.max(0, to));
  if (to > state.stars) {state.stars = to; state.rose = to; state.roseSeq++; state.escape = 0; state.cleared = null;}
  state.peak = Math.max(state.peak, state.stars);
 }
 /** The police now know about this crime. */
 function apply(c) {
  switch (c.kind) {
   case 'meleeKill': crimes.meleeKills++; break;
   case 'runoverKill': crimes.runoverKills++; state.runovers.push(c.t); break;
   case 'officerAssault': crimes.officerAssaults++; raise(state.stars ? state.stars + 1 : 1); break;
   case 'officerKill': crimes.officerKills++; break;
   case 'policeRam': crimes.policeRams++; break;
   case 'policeCarTaken': crimes.policeCarsTaken++; break;
   case 'carjack': crimes.carjacks++; raise(1); break;
   case 'shooting': crimes.shootings++; break;
   case 'weaponKill': crimes.weaponKills++; break;
   case 'weaponSeen': crimes.weaponsSeen++; break;
  }
  raise(called(c.t));
  // Where the police think the player is: here, unless they can see them anyway.
  if (!state.seen && state.stars > 0) state.lastSeen = {x: c.x, z: c.z, t: c.t};
 }

 const api = {
  state,
  /**
   * A crime happened. `seenByOfficer` makes it known now; otherwise `witnesses` (a count or a
   * list of ids) decides whether it is reported later. A run-over kill is known at once (the
   * user's rule), and so is taking a police car or assaulting an officer -- the victim is police.
   */
  crime(kind, {x = 0, z = 0, t = 0, seenByOfficer = false, witnesses = 0, id = null} = {}) {
   if (!CRIMES.includes(kind)) throw new Error(`unknown crime ${kind}`);
   const cid = id ?? nextId++;
   const c = {kind, x, z, t, id: cid};
   // A carjack only counts when an officer sees it (the optional GTA-style row).
   if ((kind === 'carjack' || kind === 'weaponSeen') && !seenByOfficer) return 'ignored';
   const immediate = seenByOfficer || kind === 'runoverKill' || kind === 'policeCarTaken' ||
    kind === 'officerAssault' || kind === 'officerKill' || kind === 'policeRam';
   if (immediate) {apply(c); return 'known';}
   const who = Array.isArray(witnesses) ? witnesses.slice() : null;
   // Nobody saw it: the crime is simply unknown, which is what makes a quiet side street quiet.
   if (who ? !who.length : !(witnesses > 0)) return 'unseen';
   state.pending.push({...c, due: t + reportDelayOf(cid), witnesses: who});
   return 'pending';
  },

  /**
   * Advance. `seen`: can any unit see the player now. `witnessStill(id)`: is this witness still
   * alive and near enough to report (only asked for crimes given a list of witness ids).
   */
  update(dt, {x = 0, z = 0, t = 0, seen = false, witnessStill = null} = {}) {
   // Reports that have come due.
   for (let i = state.pending.length - 1; i >= 0; i--) {
    const c = state.pending[i];
    if (t < c.due) continue;
    state.pending.splice(i, 1);
    if (c.witnesses && witnessStill && !c.witnesses.some(id => witnessStill(id))) continue;   // cancelled
    apply(c);
   }
   if (state.stars === 0) {state.seen = !!seen; state.escape = 0; state.atThree = 0; return api.snapshot();}
   state.seen = !!seen;
   if (seen) {state.lastSeen = {x, z, t}; state.escape = 0;}
   else if (state.lastSeen) {
    const out = Math.hypot(x - state.lastSeen.x, z - state.lastSeen.z) > WANTED.searchRadius[state.stars];
    state.escape = out ? state.escape + dt : 0;
    if (state.escape >= WANTED.escapeSeconds[state.stars]) {api.clear('escaped'); return api.snapshot();}
   }
   if (state.stars === 3) {
    state.atThree += dt;
    if (state.atThree >= WANTED.holdAtThreeForFour) raise(4);
   } else state.atThree = 0;
   return api.snapshot();
  },

  /** Arrested, died, respawned or escaped: the level and every pending report go. */
  clear(reason = 'cleared') {
   state.stars = 0; state.escape = 0; state.atThree = 0; state.seen = false; state.lastSeen = null;
   state.pending.length = 0; state.runovers.length = 0; state.cleared = reason;
   for (const k of Object.keys(crimes)) crimes[k] = 0;
  },

  snapshot() {
   const r = WANTED.searchRadius[state.stars] ?? 0;
   return {stars: state.stars, seen: state.seen, flashing: state.stars > 0 && !state.seen,
    lastSeen: state.lastSeen, searchRadius: r, escape: state.escape,
    escapeNeeded: WANTED.escapeSeconds[state.stars] ?? 0, pending: state.pending.length,
    rose: state.rose, roseSeq: state.roseSeq, cleared: state.cleared, crimes: {...crimes}};
  }
 };
 return api;
}
