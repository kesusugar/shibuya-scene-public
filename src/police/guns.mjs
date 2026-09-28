// Police revolvers (PLAN-WEAPONS W3, R9 and R15). Pure: the scene hands in the officers, the
// player and a wall test each frame, and gets back what happened -- who drew, who shouted, who
// fired and where the round went. Nothing here draws, plays a sound or touches the crowd.
//
// (The owner's rules since then -- item 2 and roadmap ② -- replace the star levels below: on foot
// from ☆1, in a car or on a motorbike from ☆2, and after the warning shot anyone fleeing is fired
// on. See GUNS and docs §9aw/§9az.)
// Japanese police do not open fire casually, and this is built around that:
//  - ☆1-☆2: batons and the arrest only (units.mjs). Revolvers stay holstered.
//  - ☆3 and up: officers near the player draw. To a player holding a weapon they shout
//    「銃を捨てろ！」.
//  - The FIRST round of an incident is a warning shot into the air, with 「撃つぞ！」.
//  - After that, an officer fires at the player only while the player is a threat: holding a
//    drawn weapon, attacking (a swing or a shot just now), or ramming in a car. A player who puts
//    the weapon away and stands still is arrested, not shot.
//  - No shot without a clear line (R9): the same 2D solid grid a bullet sees. An officer behind a
//    building neither shoots nor, in the director, sees.
//  - Accuracy falls with distance, and a hit is 10-15 -- the revolver is not a sniper rifle.
// Near officers only (the near-humanoid pool draws the revolver); the pool is capped by units.mjs.
import {lineOfSight} from '../player/ballistics.mjs';
import {WEAPONS} from '../player/weapons.mjs';

export const GUNS = Object.freeze({
 // Owner's plan, item 2: the police shoot a player on foot at any wanted level (after the warning
 // shot). Roadmap ②: in a car or on a motorbike from ☆2, and fleeing is reason enough -- no ram or
 // attack needed (a car's rounds mostly reach the cabin, director.mjs CAR_ROUNDS).
 fromStars: 1,
 carFromStars: 2,
 drawRange: 35,                // m: officers this close draw
 range: WEAPONS.revolver.range,// m: and fire from no further than this
 holdAt: 11,                   // m: an officer facing an armed threat stops here instead of closing in
 drawSeconds: .6,              // draw to first possible shot
 warningGap: 1.6,              // s after the warning shot before anyone may fire at the player
 every: WEAPONS.revolver.refire,
 cylinder: WEAPONS.revolver.cylinder, reloadSeconds: 3.5,
 hit: [.72, .12],              // chance to hit at point blank, and the floor far away
 hitFalloff: 45,               // m over which the chance falls from the first to the second
 damage: WEAPONS.revolver.damage,
 threatSeconds: 2.5,           // an attack keeps the player a threat this long
 shout: {dropGun: 5, warn: 0}  // s between two of the same shout (per incident; warn is once)
});

const hash = (a, b) => {let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296;};

/** The chance an aimed revolver round hits a standing person at `d` metres. */
export function hitChance(d) {
 const [near, far] = GUNS.hit, k = Math.max(0, Math.min(1, d / GUNS.hitFalloff));
 return near + (far - near) * k;
}

export function createPoliceGuns() {
 const holders = new Map();      // officer id -> {drawn, drawAt, next, rounds, reloadUntil, shots}
 let warned = false, warnedAt = -Infinity, lastThreat = -Infinity, lastDropGun = -Infinity, time = 0;
 const stats = {drawn: 0, warnings: 0, shots: 0, hits: 0, blocked: 0, held: 0, shouts: 0, damage: 0};

 const holder = p => {let h = holders.get(p.id); if (!h) {h = {drawn: false, drawAt: 0, next: 0, rounds: GUNS.cylinder, reloadUntil: 0, shots: 0}; holders.set(p.id, h);} return h;};
 const holster = p => {const h = holders.get(p.id); if (h?.drawn) {h.drawn = false;} p.gunDrawn = false; p.gunAim = 0;};

 const api = {
  get warned() {return warned;},
  /**
   * One frame. `officers` the units' officers (pedestrians); `me` the player {x, z, y}; `stars`
   * the wanted level; `solid(x, z)` the wall test. `threat` {armed, attacking, ramming}: what the
   * player is doing this frame. Returns the events of the frame:
   *   {kind: 'draw'|'shout'|'warn'|'shot', officer, line?, from, to, hit?, damage?}
   */
  update(dt, {officers = [], me, stars = 0, solid = () => false, threat = {}, driving = false, alive = true} = {}) {
   time += dt;
   const events = [];
   if (threat.attacking || threat.ramming) lastThreat = time;
   const armed = !!threat.armed && !driving;
   const isThreat = alive && (!driving || armed || time - lastThreat <= GUNS.threatSeconds || stars >= GUNS.carFromStars);
   if (stars < (driving ? GUNS.carFromStars : GUNS.fromStars) || !alive) {
    for (const p of officers) holster(p);
    if (stars === 0) {warned = false; warnedAt = -Infinity; lastThreat = -Infinity;}
    return events;
   }
   for (const p of officers) {
    if (!p.active || p.combatDead || p.struck !== undefined) {holster(p); continue;}
    const d = Math.hypot(p.x - me.x, p.z - me.z), h = holder(p);
    const sees = d <= GUNS.range && lineOfSight(solid, p, me);
    // Draw when near, whether or not the player can be seen: they are closing on a known threat.
    if (!h.drawn && d <= GUNS.drawRange) {
     h.drawn = true; h.drawAt = time; stats.drawn++; p.gunDrawn = true;
     events.push({kind: 'draw', officer: p});
    }
    if (!h.drawn) continue;
    p.gunDrawn = true;
    p.gunAim = sees ? 1 : 0;
    p.gunTarget = {x: me.x, y: (me.y ?? 0) + (driving ? 1.1 : 1.3), z: me.z};
    p.gunHold = isThreat && sees && d <= GUNS.holdAt;
    if (h.reloadUntil > time) continue;
    if (h.rounds <= 0) {h.reloadUntil = time + GUNS.reloadSeconds; h.rounds = GUNS.cylinder; continue;}
    if (time - h.drawAt < GUNS.drawSeconds || time < h.next) continue;
    // 銃を捨てろ！ to an armed player, now and then.
    if (armed && sees && time - lastDropGun >= GUNS.shout.dropGun) {
     lastDropGun = time; stats.shouts++;
     events.push({kind: 'shout', line: 'dropGun', officer: p});
    }
    if (!sees) {stats.blocked++; continue;}           // R9: no line, no shot
    const from = {x: p.x + Math.sin(p.heading ?? 0) * .45, y: (p.height ?? 0) + 1.42, z: p.z + Math.cos(p.heading ?? 0) * .45};
    if (!warned) {
     // R15: the first round of the incident goes into the air.
     warned = true; warnedAt = time; h.next = time + GUNS.every; h.rounds--; h.shots++;
     stats.warnings++;
     events.push({kind: 'shout', line: 'warn', officer: p});
     events.push({kind: 'warn', officer: p, from, to: {x: from.x, y: from.y + 30, z: from.z}});
     continue;
    }
    if (time - warnedAt < GUNS.warningGap) continue;
    if (!isThreat) {stats.held++; continue;}          // aim, but do not fire at someone giving up
    h.next = time + GUNS.every * (.85 + .3 * hash(p.id, h.shots)); h.rounds--; h.shots++;
    stats.shots++;
    // PLAN-WEAPONS W4: inside a roll's dodge window every round goes past.
    const hit = !me.dodging && hash(p.id * 31 + 7, h.shots) < hitChance(d);
    if (me.dodging) stats.dodged = (stats.dodged ?? 0) + 1;
    const damage = hit ? GUNS.damage[0] + Math.round(hash(p.id, h.shots + 101) * (GUNS.damage[1] - GUNS.damage[0])) : 0;
    if (hit) {stats.hits++; stats.damage += damage;}
    // A miss goes past the player, a little to the side, so its spark lands somewhere real.
    const side = hit ? 0 : (hash(p.id, h.shots + 55) - .5) * 1.8;
    const to = {x: me.x + Math.cos(p.heading ?? 0) * side, y: p.gunTarget.y + (hit ? 0 : .4), z: me.z - Math.sin(p.heading ?? 0) * side};
    events.push({kind: 'shot', officer: p, from, to, hit, damage, distance: d});
   }
   // Officers who are gone forget their gun.
   const present = new Set([...officers].map(p => p.id));
   for (const id of [...holders.keys()]) if (!present.has(id)) holders.delete(id);
   return events;
  },
  clear() {warned = false; warnedAt = -Infinity; lastThreat = -Infinity; holders.clear();},
  snapshot() {return {...stats, warned, holders: holders.size, drawn: [...holders.values()].filter(h => h.drawn).length};}
 };
 return api;
}
