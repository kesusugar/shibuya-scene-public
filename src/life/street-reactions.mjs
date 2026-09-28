// How the street answers a weapon (roadmap stage 2). Pure over the crowd's people: it writes
// fields the simulation and the drawn bodies read, and returns the shots fired at the player.
//
//  HANDS UP   the person the player aims at, close enough to see the muzzle, stops, turns to face
//             the gun and raises both hands. They hold it while the aim stays on them; when it
//             leaves, or after `giveUp` seconds of it, they break and run.
//  LIMP/CRAWL a round in the legs that does not kill leaves the person limping (`limp`), slower;
//             a second one, or a leg round that leaves them badly hurt, puts them on the ground,
//             crawling away (`crawling`). combat.mjs's wound writes the wound; the simulation
//             slows them; the figure draws it.
//  ARMED      a few people carry a handgun (`isArmed`, a fixed share by id, never a child or an
//             officer). Hurt by the player, aimed at, or near a gunshot, they draw instead of
//             running and shoot back from where they stand while they can see the player -- less
//             accurately than the police (who train for it). Each fires at most every `every` s.
//
// The events returned have the shape police/guns.mjs uses ({kind: 'shot', officer, from, to,
// hit, damage}), so the scene draws and hears them with the same code.
import {lineOfSight} from '../player/ballistics.mjs';

export const REACT = Object.freeze({
 handsUpRange: 22,        // m: aimed at from further than this, they just run
 handsUpHold: .9,         // s the hands stay up after the aim leaves, before they run
 giveUp: 6,               // s of being held at gunpoint before they break and run anyway
 limpSpeed: .45,          // share of their pace, limping
 crawlSpeed: .22,         // and crawling
 crawlBelow: 45,          // health at or under which a leg wound puts them on the ground
 // Owner's rule after stage 6: nobody on the street carries a gun -- only the police shoot back.
 // The armed-civilian machinery stays (a share above 0 brings it back).
 armedShare: 0,           // of adults, carrying a handgun
 provokeRange: 16,        // m: a gunshot this close makes an armed person draw
 range: 30,               // m: they fire from no further
 drawSeconds: .8,         // s from the draw to the first round
 every: 1.35,             // s between rounds (each person, jittered)
 hit: [.5, .06], hitFalloff: 30,
 damage: [8, 14],
 stay: 14                 // s an armed person keeps fighting after the last provocation
});

const hash = (a, b = 0) => {let h = Math.imul((a | 0) ^ 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((b | 0) + 0x165667b1, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296;};

/** Whether this pedestrian carries a gun. Fixed by id: the same person always does or does not. */
/** `share` of adults (REACT.armedShare, now 0: the owner's rule; tests pass their own). */
export function isArmed(p, share = REACT.armedShare) {
 return !!p && !p.officer && p.archetype !== 'kid' && hash(p.id, 91) < share;
}

/** The chance an armed civilian's round hits a standing person at `d` metres. */
export function civilianHitChance(d) {
 const [near, far] = REACT.hit, k = Math.max(0, Math.min(1, d / REACT.hitFalloff));
 return near + (far - near) * k;
}

/** Speed share for a wounded walker (1 when unhurt). */
export function woundedPace(p) {return p?.crawling ? REACT.crawlSpeed : p?.limp ? REACT.limpSpeed : 1;}

/**
 * A leg wound, from combat.mjs's `wound`: limping, or on the ground if it is the second or they
 * are badly hurt. Returns what they are now doing.
 */
export function legWound(p) {
 p.legWounds = (p.legWounds ?? 0) + 1;
 p.limp = true;
 if (p.legWounds >= 2 || (p.combatHealth ?? 100) <= REACT.crawlBelow) p.crawling = true;
 return p.crawling ? 'crawling' : 'limping';
}

const alive = p => p?.active && !p.combatDead && p.struck === undefined && !p.controlled;

export function createStreetReactions({armedShare = REACT.armedShare} = {}) {
 const armed = p => isArmed(p, armedShare);
 const stats = {handsUp: 0, gaveUp: 0, drawn: 0, shots: 0, hits: 0, blocked: 0};
 const shooters = new Map();          // id -> {until, drawAt, next, shots}
 let heldId = null, time = 0;

 const faceTo = (p, me) => {p.heading = Math.atan2(me.x - p.x, me.z - p.z);};
 const release = (crowd, p, me, urgency = 1) => {
  p.handsUpUntil = 0; p.handsUpSince = undefined;
  if (alive(p) && !p.crossing) crowd?.flee?.(p, p.x - me.x, p.z - me.z, {urgency, from: me});
 };
 const holster = p => {p.gunDrawn = false; p.gunAim = 0; p.shooterUntil = 0; shooters.delete(p.id);};

 return {
  get stats() {return {...stats};},
  get holding() {return heldId;},
  /** Someone armed was provoked: hurt, aimed at, or a gunshot near them. */
  provoke(p, reason = 'hurt') {
   if (!armed(p) || !alive(p)) return false;
   let s = shooters.get(p.id);
   if (!s) {s = {until: 0, drawAt: time, next: time + REACT.drawSeconds, shots: 0, reason}; shooters.set(p.id, s); stats.drawn++;}
   s.until = time + REACT.stay;
   p.gunDrawn = true; p.shooterUntil = s.until; p.handsUpUntil = 0; p.combatTarget = null;
   return true;
  },
  /**
   * One frame. `crowd` the simulation (pool, time, flee); `me` the player {x, y, z, alive,
   * dodging}; `aimedId` whom the player's gun is on (or null); `shotAt` {x, z} of a player's
   * shot this frame (or null); `solid` the wall test. Returns the armed people's shots.   * @param {number} dt
   * @param {{crowd?:any, me?:any, aimedId?:number|null, shotAt?:any, solid?:(x:number,z:number)=>boolean}} [options]
   * @returns {any[]}
   */
  update(dt, {crowd = null, me = null, aimedId = null, shotAt = null, solid = () => false} = {}) {
   time = crowd?.time ?? time + dt;
   const events = [];
   if (!crowd || !me) return events;
   const pool = crowd.pool ?? [];
   // A gunshot: the armed people near it draw.
   if (shotAt) for (const p of pool) if (alive(p) && armed(p) && Math.hypot(p.x - shotAt.x, p.z - shotAt.z) <= REACT.provokeRange) this.provoke(p, 'gunshot');
   // Hands up for the one at gunpoint -- or, if they carry a gun, they draw.
   const aimed = aimedId !== null ? pool[aimedId] : null;
   if (aimed && alive(aimed) && me.alive !== false && Math.hypot(aimed.x - me.x, aimed.z - me.z) <= REACT.handsUpRange && !aimed.crawling) {
    if (armed(aimed)) this.provoke(aimed, 'aimed');
    else if (!(aimed.handsUpSince !== undefined && time - aimed.handsUpSince > REACT.giveUp)) {
     if (aimed.handsUpSince === undefined || !(aimed.handsUpUntil > time)) {aimed.handsUpSince = time; stats.handsUp++;}
     aimed.handsUpUntil = time + REACT.handsUpHold; faceTo(aimed, me); heldId = aimed.id;
    }
   }
   // Whoever was held and is no longer: when the hold runs out, or they have had enough, they run.
   if (heldId !== null) {
    const p = pool[heldId];
    if (!alive(p)) heldId = null;
    else if (time - (p.handsUpSince ?? time) > REACT.giveUp) {stats.gaveUp++; release(crowd, p, me, 1); heldId = null;}
    else if (!(p.handsUpUntil > time)) {release(crowd, p, me, .9); heldId = null;}
   }
   // The armed: stand, face the player, fire while they can see them.
   for (const [id, s] of shooters) {
    const p = pool[id];
    if (!alive(p) || time > s.until || me.alive === false) {if (p) holster(p); else shooters.delete(id); continue;}
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    faceTo(p, me);
    const sees = d <= REACT.range && lineOfSight(solid, p, me);
    p.gunDrawn = true; p.gunAim = sees ? 1 : 0; p.shooterUntil = s.until;
    p.gunTarget = {x: me.x, y: (me.y ?? 0) + 1.3, z: me.z};
    if (time < s.next) continue;
    if (!sees) {stats.blocked++; s.next = time + .4; continue;}
    s.shots++; stats.shots++;
    s.next = time + REACT.every * (.8 + .4 * hash(id, s.shots));
    const hit = !me.dodging && hash(id * 17 + 3, s.shots) < civilianHitChance(d);
    const damage = hit ? REACT.damage[0] + Math.round(hash(id, s.shots + 7) * (REACT.damage[1] - REACT.damage[0])) : 0;
    if (hit) stats.hits++;
    const from = {x: p.x + Math.sin(p.heading) * .45, y: (p.height ?? 0) + 1.42, z: p.z + Math.cos(p.heading) * .45};
    const side = hit ? 0 : (hash(id, s.shots + 31) - .5) * 2.2;
    const to = {x: me.x + Math.cos(p.heading) * side, y: p.gunTarget.y + (hit ? 0 : .5), z: me.z - Math.sin(p.heading) * side};
    p.gunShotLeft = .633;
    events.push({kind: 'shot', officer: p, from, to, hit, damage, distance: d, civilian: true});
   }
   return events;
  },
  reset(pool = []) {for (const id of shooters.keys()) if (pool[id]) holster(pool[id]); shooters.clear(); heldId = null;}
 };
}
