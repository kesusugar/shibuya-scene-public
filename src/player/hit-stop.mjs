// Hit-stop (GTA-FIDELITY-STATUS §9ai, H1): the instant a blade or a round lands, the swing and the
// bodies involved nearly stop for a few hundredths of a second. It is what makes a hit read as
// meeting something rather than passing through it -- the swing does not sail on at full speed
// through a body, it catches and then carries on.
//
// Only the attacker's swing and body and the victim's body are slowed; the city, the traffic and
// the crowd carry on at full speed, so it never reads as a dropped frame. No camera and no rumble
// (the user asked for neither).
export const HIT_STOP = Object.freeze({
 katana: .07,       // s: a cut catches in the body
 pistol: .045,
 smg: .025,         // per round, and not more often than `smgGap`, so a burst does not stutter
 smgGap: .12,
 slow: .06          // how fast time runs for them meanwhile
});

/** The attacker's side: `hit(kind)` on a landed blow, `scale(dt)` for the swing's and body's dt. */
export function createHitStop() {
 let left = 0, since = Infinity, stops = 0;
 return {
  get active() {return left > 0;},
  get stops() {return stops;},
  hit(kind) {
   if (kind === 'smg' && since < HIT_STOP.smgGap) return false;
   left = Math.max(left, HIT_STOP[kind] ?? HIT_STOP.pistol); since = 0; stops++;
   return true;
  },
  /** The dt the attacker's swing and body run on this frame. */
  scale(dt) {
   dt = Math.max(0, dt || 0); since += dt;
   if (left <= 0) return dt;
   const frozen = Math.min(left, dt); left -= frozen;
   return dt - frozen + frozen * HIT_STOP.slow;
  },
  reset() {left = 0; since = Infinity;}
 };
}

/** The victim's side: how much of `dt` their body runs, given when their stop ends (`until`). */
export function victimScale(dt, clock, until) {
 if (!(until > clock)) return dt;
 const frozen = Math.min(until - clock, dt);
 return dt - frozen + frozen * HIT_STOP.slow;
}
