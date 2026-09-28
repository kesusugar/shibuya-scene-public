// The controller, as actions (PLAN-PERFORMANCE-AND-PAD C1-C4). Pure: `poll(pad, dt, mode)` turns
// one Gamepad snapshot into this frame's actions, so every binding is tested without a browser.
//
// ONE POSITIONAL LAYOUT, GTA-style, for every pad in the standard mapping. Chrome and Edge present
// the Nintendo Switch Pro Controller in that mapping, where the indices are positions: 0 is the
// bottom face button (B on a Switch, A on an Xbox pad), 1 the right one (Switch A), 2 the left
// (Switch Y), 3 the top (Switch X). So the layout is the same under the thumb on either pad; only
// the names printed in the HUD change (`GLYPHS`).
//
// Owner's plan, item 3 (GTA on a Switch Pro Controller): ZL raises the gun and locks onto the
// nearest person in view; ZR attacks. A gun does NOT go off on ZR alone -- without ZL the pad's
// ZR only punches or cuts (arsenal.mjs `trigger({pad})`). The keyboard and mouse keep their own
// rules (a click raises and fires).
//
//                 on foot                     in a car
//  left stick     move / press: crouch        steer / press: horn
//  right stick    camera                      camera
//  ZL (6)         raise + lock on (hold)      brake, reverse
//  ZR (7)         fire (only with ZL held)    throttle
//                 / punch / cut
//  right stick    while locked: flick ←/→ to the next target, ↑ to the head, ↓ back to the chest
//  ZL again       let go and pressed within 0.4 s: the next target (shooters first; roadmap ④)
//  bottom (0)     run (hold)                  —
//  right (1)      reload                      —
//  left (2)       roll                        —
//  top (3)        get in                      get out
//  L (4) / R (5)  previous / next weapon      — / handbrake (hold)
//                 (stage 1: on release; held, the weapon wheel -- the right stick picks)
//  d-pad up (12)  —                           siren (patrol car)
//  d-pad ←/→      —                           radio: previous / next station (stage 6)
//  − (8) / + (9)  map / menu (back to observe)
//
// The Switch Pro Controller's ZL and ZR are digital (0 or 1). A throttle that jumps from nothing
// to full lurches the car, so digital triggers RAMP (`INPUT.ramp`); an analogue trigger passes
// straight through. Sticks get a radial deadzone (a square one makes diagonals sticky) and a
// response curve for the camera.

import {WHEEL} from './weapon-wheel.mjs';

export const BUTTON = Object.freeze({bottom: 0, right: 1, left: 2, top: 3, L: 4, R: 5, ZL: 6, ZR: 7,
 minus: 8, plus: 9, LS: 10, RS: 11, up: 12, down: 13, dleft: 14, dright: 15, home: 16, capture: 17});

export const INPUT = Object.freeze({
 deadzone: .16,          // radial, of the stick's full throw
 outer: .94,             // the Switch Pro's sticks do not always reach 1 on the diagonals
 lookCurve: 1.6,         // camera response: fine near the centre, fast at the edge
 ramp: Object.freeze({up: .3, down: .15}),   // s for a digital trigger to reach full / let go
 digital: .999,          // a trigger reporting only 0 or ≥ this is treated as digital
 // A right-stick flick (item 3): out past `flick` from inside `rest`, once until it comes back.
 flick: .7, rest: .35
});

/** What the pad is, from the id Chrome reports. */
export function profileOf(pad) {
 if (!pad) return null;
 const id = String(pad.id ?? '').toLowerCase();
 const nintendo = /057e|pro controller|joy-con|nintendo/.test(id);
 if (pad.mapping !== 'standard') return nintendo ? 'switch-raw' : 'raw';
 return nintendo ? 'switch' : 'standard';
}

/** Names for the HUD, per profile. */
export const GLYPHS = Object.freeze({
 switch: Object.freeze({bottom: 'B', right: 'A', left: 'Y', top: 'X', L: 'L', R: 'R', ZL: 'ZL', ZR: 'ZR', LS: 'Lスティック押し込み', minus: '−', plus: '+', up: '十字↑'}),
 standard: Object.freeze({bottom: 'A', right: 'B', left: 'X', top: 'Y', L: 'LB', R: 'RB', ZL: 'LT', ZR: 'RT', LS: 'L3', minus: 'Back', plus: 'Start', up: '十字↑'})
});

/** The on-foot and in-car hints for a profile ('keyboard' or a pad profile). */
export function controlHints(profile, driving = false) {
 if (!profile || profile === 'keyboard' || profile === 'raw' || profile === 'switch-raw')
  return driving ? 'WASD 運転 · Space サイドブレーキ · F 降りる · H ホーン/サイレン · R ラジオ'
   : 'E/クリック 攻撃 · 1/2/3/4 武器 · 右ボタン 構える · R 装填 · Q 回避 · C しゃがむ';
 const g = GLYPHS[profile] ?? GLYPHS.standard;
 return driving ? `${g.ZR} アクセル · ${g.ZL} ブレーキ · ${g.R} サイドブレーキ · ${g.top} 降りる · ${g.LS} ホーン · ${g.up} サイレン · 十字←→ ラジオ`
  : `${g.ZL} 構える・ロックオン（押し直しで次の標的） · ${g.ZR} 攻撃 · 構え中 右スティック弾き ←→ 切替 ↑ 頭 · ${g.L}/${g.R} 武器 · ${g.right} 装填 · ${g.left} 回避 · ${g.bottom} 走る · ${g.top} 乗る · ${g.LS} しゃがむ`;
}

/** A radial deadzone, rescaled so the edge of the zone is 0 and `outer` is 1. Pure. */
export function radial(x, y, {deadzone = INPUT.deadzone, outer = INPUT.outer, curve = 1} = {}) {
 const m = Math.hypot(x, y);
 if (!(m > deadzone)) return {x: 0, y: 0, m: 0};
 const k = Math.min(1, (m - deadzone) / (outer - deadzone)) ** curve;
 return {x: x / m * k, y: y / m * k, m: k};
}

/** Actions fired on the press (edges), per mode. Held states are read separately. */
const PRESS = Object.freeze({
 foot: Object.freeze([['ZR', 'fire'], ['right', 'reload'], ['left', 'roll'], ['top', 'enter'],
  ['LS', 'crouch'], ['minus', 'map'], ['plus', 'menu']]),
 car: Object.freeze([['top', 'exit'], ['LS', 'horn'], ['up', 'siren'], ['dright', 'radioNext'], ['dleft', 'radioPrev'], ['minus', 'map'], ['plus', 'menu']])
});

/** Stage 1: L and R are a tap (previous / next weapon, on release) or, held this long, the wheel. */
const WHEEL_BUTTONS = Object.freeze([['L', 'weaponPrev'], ['R', 'weaponNext']]);

/**
 * A right-stick flick: the stick out past `INPUT.flick` along its stronger axis, having been back
 * inside `INPUT.rest` since the last one. Pure over `armed` (the stick has been at rest). Returns
 * {flick: 'left'|'right'|'up'|'down'|null, armed}. Up is the stick pushed away (axis 3 negative).
 */
export function flickOf(x, y, armed) {
 const m = Math.hypot(x, y);
 if (m < INPUT.rest) return {flick: null, armed: true};
 if (!armed || m < INPUT.flick) return {flick: null, armed};
 const flick = Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y < 0 ? 'up' : 'down');
 return {flick, armed: false};
}

export function createInputMap({wheelHold = WHEEL.hold} = {}) {
 let prev = new Array(18).fill(false), stickRest = true;
 const held = {L: 0, R: 0};
 let throttle = 0, brake = 0;
 const value = (pad, i) => pad?.buttons?.[i]?.value ?? (pad?.buttons?.[i]?.pressed ? 1 : 0);
 const down = (pad, i) => !!(pad?.buttons?.[i]?.pressed || value(pad, i) > .5);
 const trigger = (level, target, dt) => {
  // Analogue: as it is. Digital (0 or 1 only): ramp toward it, faster down than up.
  if (target > 0 && target < INPUT.digital) return target;
  const rate = target > level ? dt / INPUT.ramp.up : dt / INPUT.ramp.down;
  return level + Math.max(-rate, Math.min(rate, target - level));
 };
 const api = {
  /**
   * One frame. `mode` is 'foot' or 'car'. Returns {profile, move, look, aim, fire, run, throttle,
   * brake, handbrake, pressed: string[]}; `move.y` is forward (+), `look` already curved. `fire`
   * is ZR held on foot (§9ah: an automatic keeps firing while it is).
   */
  poll(pad, dt = 0, mode = 'foot') {
   const profile = profileOf(pad);
   const none = {profile, move: {x: 0, y: 0}, look: {x: 0, y: 0}, aim: false, fire: false, run: false, throttle: 0, brake: 0, handbrake: false, wheel: false, stick: {x: 0, y: 0}, flick: null, pressed: []};
   if (!pad) {prev = prev.fill(false); throttle = brake = 0; held.L = held.R = 0; stickRest = true; return none;}
   // Outside the standard mapping the button indices mean nothing in particular, so no button
   // is read; the first two sticks are the same on every pad we know of, so they still work.
   if (profile === 'raw' || profile === 'switch-raw') {
    const m = radial(pad.axes?.[0] ?? 0, -(pad.axes?.[1] ?? 0)), l = radial(pad.axes?.[2] ?? 0, pad.axes?.[3] ?? 0, {curve: INPUT.lookCurve});
    prev = prev.fill(false); throttle = brake = 0;
    return {...none, move: {x: m.x, y: m.y}, look: {x: l.x, y: l.y}};
   }
   dt = Math.max(0, Math.min(.1, dt || 0));
   const now = pad.buttons.map((b, i) => down(pad, i));
   const edge = name => now[BUTTON[name]] && !prev[BUTTON[name]];
   const pressed = [];
   for (const [button, action] of PRESS[mode] ?? PRESS.foot) if (edge(button)) pressed.push(action);
   let wheel = false;
   for (const [button, action] of WHEEL_BUTTONS) {
    const i = BUTTON[button];
    if (mode !== 'foot') {held[button] = 0; continue;}
    if (now[i]) {held[button] += dt; if (held[button] >= wheelHold) wheel = true;}
    else {if (prev[i] && held[button] < wheelHold) pressed.push(action); held[button] = 0;}
   }
   const move = radial(pad.axes[0] ?? 0, -(pad.axes[1] ?? 0));
   const look = radial(pad.axes[2] ?? 0, pad.axes[3] ?? 0, {curve: INPUT.lookCurve});
   const fl = flickOf(pad.axes[2] ?? 0, pad.axes[3] ?? 0, stickRest); stickRest = fl.armed;
   throttle = trigger(throttle, value(pad, BUTTON.ZR), dt);
   brake = trigger(brake, value(pad, BUTTON.ZL), dt);
   prev = now;
   return {profile, move: {x: move.x, y: move.y}, look: {x: look.x, y: look.y},
    aim: mode === 'foot' && now[BUTTON.ZL], fire: mode === 'foot' && now[BUTTON.ZR], run: mode === 'foot' && now[BUTTON.bottom],
    throttle: mode === 'car' ? throttle : 0, brake: mode === 'car' ? brake : 0,
    handbrake: mode === 'car' && now[BUTTON.R], wheel,
    // The right stick as it is (no curve), for the wheel's pick.
    stick: {x: pad.axes[2] ?? 0, y: pad.axes[3] ?? 0},
    // Item 3: a right-stick flick this frame, on foot (the controller uses it only while locked on).
    flick: mode === 'foot' ? fl.flick : null, pressed};
  },
  reset() {prev = new Array(18).fill(false); throttle = brake = 0; held.L = held.R = 0; stickRest = true;}
 };
 return api;
}

/**
 * Rumble for the pad (C4). Strong and weak motor levels and a length per event; silently nothing
 * where the browser exposes no vibration for the controller. At most one effect per `gap` s.
 */
export const RUMBLE = Object.freeze({
 shot: Object.freeze({strong: .35, weak: .75, ms: 90}),
 cut: Object.freeze({strong: .45, weak: .6, ms: 90}),
 hurt: Object.freeze({strong: .85, weak: .4, ms: 180}),
 crash: Object.freeze({strong: 1, weak: .6, ms: 260}),
 gap: .06
});
export function createRumble() {
 let last = -Infinity;
 return {
  play(pad, kind, time = (typeof performance !== 'undefined' ? performance.now() / 1000 : 0), scale = 1) {
   const r = RUMBLE[kind], act = pad?.vibrationActuator;
   if (!r || !act?.playEffect || time - last < RUMBLE.gap) return false;
   last = time;
   try {
    const p = act.playEffect(act.type || 'dual-rumble', {startDelay: 0, duration: r.ms,
     strongMagnitude: Math.min(1, r.strong * scale), weakMagnitude: Math.min(1, r.weak * scale)});
    p?.catch?.(() => {});
    return true;
   } catch {return false;}
  }
 };
}
