// Onlookers (roadmap stage 4). Once the shooting has stopped, a few of the people near a body stop
// what they are doing, turn to it and take out their phones: most hold them up to film, some put
// them to an ear to call it in. They watch for a while and then go on their way.
//
// Pure over the crowd's people: it writes `watchUntil` (the simulation holds them there, facing
// `watchX/Z`) and `phone` ('film' | 'call', what the drawn body does with its right hand).
// Callers are also counted: a report the police may act on (the director's witnesses already make
// a crime known after a few seconds; `calls` is for the HUD and the tests).

export const ONLOOK = Object.freeze({
 radius: [4, 20],        // m from the body: nearer is too close for a stranger, further does not see
 max: 5,                 // per body
 calm: 3,                // s after the last gunshot before anyone stops to look
 after: 1.5,             // s after the death
 watch: [12, 28],        // s they watch
 callShare: .35
});

const hash = (a, b = 0) => {let h = Math.imul((a | 0) ^ 0x2545f491, 0x85ebca6b) ^ Math.imul((b | 0) + 0x9e3779b9, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296;};

/** A body a crowd leaves lying: killed in a fight or by a weapon, still in the pool. */
export const isBody = p => !!p?.active && !!p.combatDead && p.struck !== undefined;

/** Could this person stop and watch? Not a child, not busy with anything the game cares about. */
export function canWatch(p, time) {
 return !!p?.active && !p.controlled && !p.officer && !p.combatDead && p.struck === undefined && p.archetype !== 'kid'
  && !p.crossing && !p.choreographed && !p.combatTarget && !p.gunDrawn && !(p.handsUpUntil > time) && !p.crawling
  && !(p.watchUntil > time) && !(p.flee && p.flee.until > time);
}

export function createOnlookers() {
 const handled = new Set();
 const stats = {bodies: 0, watchers: 0, filming: 0, calls: 0};
 return {
  get stats() {return {...stats};},
  /**
   * One frame. `crowd` the simulation; `lastGunshotAt` crowd time of the last shot (any side).
   * Returns the people who started watching this frame.
   */
  update(crowd, {lastGunshotAt = -Infinity} = {}) {
   const started = [];
   if (!crowd?.pool) return started;
   const time = crowd.time ?? 0;
   if (time - lastGunshotAt < ONLOOK.calm) return started;
   for (const body of crowd.pool) {
    if (!isBody(body) || handled.has(body.id) || (body.struck ?? 0) < ONLOOK.after) continue;
    handled.add(body.id); stats.bodies++;
    const near = [];
    for (const p of crowd.pool) {
     if (!canWatch(p, time)) continue;
     const d = Math.hypot(p.x - body.x, p.z - body.z);
     if (d >= ONLOOK.radius[0] && d <= ONLOOK.radius[1]) near.push([d, p]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, p] of near.slice(0, ONLOOK.max)) {
     const call = hash(p.id, body.id) < ONLOOK.callShare;
     p.watchUntil = time + ONLOOK.watch[0] + hash(p.id, 7) * (ONLOOK.watch[1] - ONLOOK.watch[0]);
     p.watchX = body.x; p.watchZ = body.z; p.phone = call ? 'call' : 'film';
     p.heading = Math.atan2(body.x - p.x, body.z - p.z);
     stats.watchers++; if (call) stats.calls++; else stats.filming++;
     started.push(p);
    }
   }
   // Forget bodies that are gone, so the set does not grow for ever.
   for (const id of handled) if (!isBody(crowd.pool[id])) handled.delete(id);
   // Put the phone away when the watching is over.
   for (const p of crowd.pool) if (p.phone && !(p.watchUntil > time)) p.phone = null;
   return started;
  },
  reset() {handled.clear();}
 };
}
