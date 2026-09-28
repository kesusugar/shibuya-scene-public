// What a stationary citizen is doing, decided from the simulation's own state -- never from
// speed alone.
//
// RUN 11.0. RUN 10 gave `p.state === 'waiting'` the Idle clip, and live play still showed people
// walking on the spot at red lights. Measured at a kerb, they were not in `waiting` at all:
//   - the queue BEHIND the front row: blocked in `walking`, speed 0, `stuck` climbing;
//   - the scramble cast between crossings: `exiting` / `recycle`, standing at the far kerb.
// Both are waiting for the signal in every sense a viewer cares about. A walker who is merely
// held up for a moment by someone in front is not, and keeps walking.

/**
 * Is a blocked walker queued at a kerb for a crossing they cannot yet enter?
 * Pure: the simulation passes what it already knows at the moment it fails to move.
 */
export function kerbQueued({moved,nextIsCrossing,walk,toKerb}){
 return !moved&&nextIsCrossing&&!walk&&toKerb<KERB_QUEUE_REACH;
}
/** How far back from the kerb a blocked walker still counts as part of the queue, m. */
export const KERB_QUEUE_REACH=8;

/** Standing at a kerb for the signal, in any of the ways the simulation expresses it. */
export function isWaiting(p){
 if(!p||p.struck!==undefined||p.combatDead)return false;
 // Running from a car, or walking back from having done so, is not standing at a kerb.
 if(p.flee||p.state==='returning')return false;
 if(p.state==='waiting')return true;
 if(p.choreographed&&(p.state==='exiting'||p.state==='recycle'))return true;
 return p.kerbQueue===true;
}
