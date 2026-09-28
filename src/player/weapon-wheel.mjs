// The weapon wheel (roadmap stage 1). Held open -- Tab held on a keyboard, L or R held on a pad,
// the weapon button held on a phone -- time slows, the weapons sit round a ring, and a direction
// picks one: the mouse's travel, the right stick, or a drag. Letting go draws what was picked.
// A tap is still what it was (Tab: the pointer lock; L/R: the previous/next weapon).
//
// Pure: the scene feeds it movement and asks it what is highlighted; play-ui.mjs draws it.
import {SLOTS} from './weapons.mjs';

export const WHEEL = Object.freeze({
 hold: .28,          // s a button is held before the wheel opens instead of the tap
 slow: .3,           // time scale while it is open
 mouse: 140,         // px of mouse travel for a full-length pick
 deadzone: .35,      // of a full pick: a direction shorter than this picks nothing new
 // Round the ring, clockwise from the top, in key order.
 order: SLOTS
});

/**
 * The slot a direction points at: `x` right, `y` down (screen and stick alike), clockwise from
 * the top. Null inside the deadzone. Pure.
 */
export function wheelSlot(x, y, {deadzone = WHEEL.deadzone, count = WHEEL.order.length} = {}) {
 if (!(Math.hypot(x, y) > deadzone)) return null;
 const a = Math.atan2(x, -y), step = Math.PI * 2 / count;
 return ((Math.round(a / step) % count) + count) % count;
}

export function createWeaponWheel() {
 let open = false, x = 0, y = 0, pick = null, openedAt = 0;
 const api = {
  get open() {return open;},
  /** The highlighted weapon (a slot id), or null. */
  get highlighted() {return pick === null ? null : WHEEL.order[pick];},
  get vector() {return {x, y};},
  /** Opens with `current` highlighted, so letting go without moving keeps it. */
  show(current = null) {
   open = true; x = y = 0; openedAt = typeof performance !== 'undefined' ? performance.now() : 0;
   const i = WHEEL.order.indexOf(current); pick = i >= 0 ? i : null;
  },
  /** Mouse travel (px): it adds up, bounded to one full pick. */
  move(dx, dy) {
   if (!open) return;
   x += dx / WHEEL.mouse; y += dy / WHEEL.mouse;
   const l = Math.hypot(x, y); if (l > 1) {x /= l; y /= l;}
   const s = wheelSlot(x, y); if (s !== null) pick = s;
  },
  /** A stick or a drag, as a position (-1..1): released to the centre, the pick stays. */
  point(px, py) {
   if (!open) return;
   x = px; y = py;
   const s = wheelSlot(px, py); if (s !== null) pick = s;
  },
  /** Closes; returns the weapon to draw (null: nothing picked). */
  close() {if (!open) return null; open = false; const id = api.highlighted; x = y = 0; return id;},
  cancel() {open = false; x = y = 0;},
  get openedAt() {return openedAt;}
 };
 return api;
}
