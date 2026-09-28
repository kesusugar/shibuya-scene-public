// A single walking player, driven by the same ground the crowd walks on.
//
// There is no new collision geometry here. The pedestrian context the crowd already builds
// carries body-height solids, the walkable surface and the ground height, so the player is
// tested against exactly what the simulated pedestrians are tested against, and a wall that
// stops them stops the player too.
//
// The figure itself is a crowd agent. Reserving one slot in the crowd pool means the
// existing instanced renderer draws and animates the player at no extra draw call, and the
// crowd's own neighbour avoidance sees the player and parts around them.

import {clipCameraArm} from './camera.mjs';
import {createCrowdContact} from './crowd-contact.mjs';
import {createInputMap,createRumble} from './input-map.mjs';
import {sharedGyro} from './gyro.mjs';
import {WHEEL} from './weapon-wheel.mjs';
import {absorb} from '../game/shop.mjs';

// The camera arm. Solids are tested at the camera's own height rather than on the ground,
// so it is a facade that pulls the camera in and not a bollard it is sailing well above.
export const CAMERA = Object.freeze({samples: 12, pad: .5, minBack: .9});

export const PLAYER = Object.freeze({
 radius: .35,          // body radius used against solids, matching the crowd's own footprint
 walk: 1.5, run: 4.2,  // m/s; the crowd walks 0.85-2.0, so walking blends into it
 // How quickly the body reaches the speed it is asked for, in m/s^2. Separate numbers for
 // getting going and for stopping, because they are not the same movement: a person leans
 // into a start over a couple of steps and plants a foot to stop. The old code damped both
 // with one exponential, which reached 1.5 m/s in a tenth of a second from standing -- the
 // feet could not keep up with it, and the stop was worse.
 accelerate: 7.5, brake: 11, turnDrag: .55,
 eye: 1.55,            // height the camera frames the player from
 archetype: 'hoodie',  // fixed, so the player is the same person every session
 look: .0022,          // radians per pixel of mouse travel
 // A pad stick is polled per frame rather than delivered as deltas, so it turns at its own
 // rate and needs a deadzone, or a worn stick walks the player across the street on its own.
 padLook: 2.7, padDeadzone: .18,
 // A drag across glass covers far fewer pixels than a mouse sweep, so it turns further per px.
 dragLook: 2.2,
 pitchLimit: 1.15,     // keeps the follow camera out of the ground and off the zenith
 followBack: 4.6, followUp: 2.1, followLerp: 9,
 // PLAN-WEAPONS R17: aiming pulls the camera in over the right shoulder, on the same wall-clipped
 // arm. `aimSide` is metres to the right.
 aimBack: 2.1, aimUp: .45, aimSide: .62, aimFov: 40,
 // PLAN-WEAPONS W4. The roll covers the ground its clip was authored to cover (Roll: 4.99 m in
 // 1.467 s, measured from the root-motion library into citizen.json), the push falling off
 // linearly so the body slows into the get-up. Bullets miss inside `dodge` (seconds into the roll).
 roll: Object.freeze({seconds: 1.467, distance: 4.99, dodge: Object.freeze([.08, .95]), cooldown: .25}),
 // Crouched, the body creeps at Crouch_Fwd_Loop's own pace and cannot run.
 crouchSpeed: .9,
 // Where a session starts. Chosen by sampling the walkable surface: full kerb height, so
 // it is pavement rather than a gap between solids, and 27 m out with the crossing in view.
 start: [12, 24], startHeading: Math.atan2(-12, -24),
 // A traffic car hitting the player on foot (player crowd contact, Step E): a quarter of the
 // health, not a death, unless it was the last quarter. The player is thrown 1-1.5 m (more the
 // faster the car), through `advance()` so never into a wall, over `throwSeconds`, and gets
 // control back after `stun`. `carGrace` stops one car hitting again on the next frame.
 carDamage: 25, carGrace: 1.5, thrown: [1, 1.5], throwSeconds: .35, stun: 1,
 // Found on the device check: a van stopped on the player and hit again every time the grace
 // ran out. A car has to be moving to hit anyone, and the throw goes out of its path.
 carHitSpeed: 1.5
});

/**
 * C3: the pad's camera speed and invert-Y, from `?padLook=1.3&invertY=1` (kept in this browser's
 * storage once given, so they stick between sessions). Defaults: 1 and off.
 */
export function padSettings(search = typeof location !== 'undefined' ? location.search : '', storage = safeStorage()) {
 let saved = {};
 try {saved = JSON.parse(storage?.getItem('shibuya.pad') ?? '{}') ?? {};} catch {}
 const q = new URLSearchParams(search);
 const look = Number(q.get('padLook') ?? saved.look ?? 1);
 const invertY = (q.get('invertY') ?? String(saved.invertY ?? 0)) === '1';
 const out = {look: Number.isFinite(look) && look > 0 ? Math.min(3, look) : 1, invertY};
 if (q.has('padLook') || q.has('invertY')) try {storage?.setItem('shibuya.pad', JSON.stringify({look: out.look, invertY: out.invertY ? 1 : 0}));} catch {}
 return out;
}
function safeStorage() {try {return typeof localStorage !== 'undefined' ? localStorage : null;} catch {return null;}}

/** Furthest the player may stand from the middle, matching the modelled extent. */
const LIMIT = 244;

/**
 * Rotate `from` toward `to` at a bounded rate.
 *
 * The figure does its own, slower turn for what you see; this is the simulation's copy, and it
 * exists so that the direction of travel cannot get further ahead of the body than the body
 * could plausibly have turned. Sharing the limit is what keeps the feet pointing where the
 * character is actually going.
 */
const TURN_RATE = 7.0;   // rad/s, matching LOCOMOTION.turnRate
function turnToward(from, to, dt) {
 const error = Math.atan2(Math.sin(to - from), Math.cos(to - from));
 const step = Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, error));
 return from + step;
}

/**
 * @param {object} ctx the pedestrian context the crowd walks on
 * @param {object} [options]
 * @param {null|(()=>any)} [options.bodies] the crowd simulation whose people are bodies to the
 *   player, or null. Absent, the player collides with walls only, exactly as before.
 * @param {null|((p:any,bump:any)=>void)} [options.onBump] told about each person the player bumps.
 */
export function createPlayer(ctx, {start = PLAYER.start, heading = PLAYER.startHeading, bodies = ctx.bodies ?? null, onBump = null} = {}) {
 const state = {
  x: start[0], z: start[1], y: 0, heading, pitch: -.12,
  // `heading` is where the camera looks, `course` where the input asks the body to go, and
  // `bodyHeading` where the body has actually turned to. Keeping the three apart is what lets
  // a character walk diagonally without sliding and turn the view without spinning on a heel.
  course: heading, bodyHeading: heading, targetSpeed: 0,
  speed: 0, running: false, moving: false, alive: true,
  runOver: 0, hitBy: null, health: 100, armor: 0, attackTime: 0, hurtTime: 0, vehiclePhase: 0,
  carGrace: 0, stunTime: 0, knockX: 0, knockZ: 0, knockLeft: 0
 };
 const keys = new Set();
 let padPoll = null;
 // PLAN-PERFORMANCE-AND-PAD C1-C4: the pad through one positional layout (input-map.mjs), read
 // once a frame in updateInput(); `padFrame` is what input() merges with the keys.
 const inputMap = createInputMap(), rumble = createRumble();
 let padFrame = null, lastDevice = 'keyboard', padProfile = null;
 const settings = padSettings();
 // Stage 0: gyro aim (gyro.mjs). The settings panel connects the controller; this only reads it.
 const gyro = typeof navigator !== 'undefined' ? sharedGyro() : null;
 let aimHeld = false;
 // On-screen controls, for a phone. Held as axes rather than as synthetic key events so a
 // finger can be half-way down a throttle, and so releasing the screen cannot leave a key
 // stuck the way a lost keyup does.
 const touch = {forward: 0, strafe: 0, running: false};
 /** The first connected pad. Chrome hands back a fresh snapshot each call, never a live one. */
 const gamepad = () => {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) if (pad?.connected) return pad;
  return null;
 };
 let detach = null;
 // The people, as bodies. Resolved before `advance()`, which keeps the walls; the two are
 // separate and run in the same order every frame.
 const contact = createCrowdContact({onBump: (p, b) => onBump?.(p, b)});

 const standable = (x, z) => Math.abs(x) <= LIMIT && Math.abs(z) <= LIMIT && !ctx.solid(x, z, PLAYER.radius);

 /**
  * Move along `dx,dz`, and where that is blocked try each axis alone so the player slides
  * along a wall instead of sticking to it. Resolving the axes separately is what keeps a
  * glancing approach to a facade from stopping dead.
  */
 const advance = (dx, dz) => {
  if (standable(state.x + dx, state.z + dz)) {state.x += dx; state.z += dz; return true;}
  if (dx && standable(state.x + dx, state.z)) {state.x += dx; return true;}
  if (dz && standable(state.x, state.z + dz)) {state.z += dz; return true;}
  return false;
 };

 const api = {
  state,
  contact,
  /**
   * Keyboard and pointer, attached only while the player has the scene.
   *
   * Pointer lock takes the cursor, so the only way back to the rest of the browser is a key.
   * Escape releases the lock natively but a click on the scene takes it straight back, which
   * leaves no way out at all; `onExit` is called so Escape leaves play entirely. `onDrive`
   * is the get-in/get-out key.
   */
  // PLAN-WEAPONS: 1/2/3 and the wheel pick a weapon (`onWeapon(slot)`, `onWeaponCycle(step)`),
  // R reloads, the right mouse button held aims (`onAim(true|false)`). On a pad: Y cycles, LB
  // held aims, X is the attack (fire with the pistol out).
  // W4: Q rolls, C crouches (on a pad RB and the right stick's click).
  // C1-C4: `driving()` says which half of the pad layout applies; `onSiren`, `onHornOnly` and
  // `onMap` are the pad's d-pad up, left-stick press in a car, and −.
  // §9ah: `onAttackHold(true|false)` reports the attack button HELD (the mouse's left, E, the
  // pad's ZR), for the submachine gun's automatic fire; 4 selects it.
  // Stage 1: `onWheel(kind, x, y)` is the weapon wheel -- 'open', 'move' (mouse px), 'point' (a
  // stick, -1..1) and 'close' -- held open by Tab or the pad's L/R (a tap is what it was before).
  // Item 3: the pad's ZL, ZR and attack carry `{pad: true}` (onAim, onAttackHold, onAttack), so
  // the arsenal can hard-lock and refuse a gun's shot without ZL. `locked()` says a hard lock is
  // on: the right stick then flicks (`onLockFlick('left'|'right'|'up'|'down')`) instead of turning
  // the camera, and the gyro's turn is reported (`onLockGyro(yaw, pitch)`) as well as applied.
  attach(element, {onExit, onDrive, onAttack, onAttackHold, onHorn, onWeapon, onWeaponCycle, onReload, onAim, onRoll, onCrouch,
                   onSiren, onHornOnly, onMap, onWheel, onRadio, onLockFlick, onLockGyro, locked = () => false, driving = () => false} = {}) {
   if (detach) return;
   let tabAt = null, wheelOpen = false, padWheel = false;
   const openWheel = () => {if (!wheelOpen && !driving()) {wheelOpen = true; onWheel?.('open');}};
   const closeWheel = () => {if (wheelOpen) {wheelOpen = false; onWheel?.('close');}};
   const down = (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (e.target?.closest?.('input,select,textarea')) return;
    // Tab: a tap takes or gives back the pointer (on release); held, the weapon wheel.
    if(k==='tab'){e.preventDefault();tabAt=performance.now();return;}
    if (k === 'escape') {keys.clear(); onExit?.(); return;}
    if (k === 'f') {onDrive?.(); e.preventDefault(); return;}
    if (k === 'e') {onAttack?.(); onAttackHold?.(true); e.preventDefault(); return;}
    if (k === 'h') {onHorn?.(); e.preventDefault(); return;}   // RUN 12.1: the horn, while driving
    if (k === '1' || k === '2' || k === '3' || k === '4') {onWeapon?.(Number(k)); e.preventDefault(); return;}
    // Stage 6: in a car R is the radio (Shift+R back along the dial); on foot it reloads.
    if (k === 'r') {if (driving()) onRadio?.(e.shiftKey ? -1 : 1); else onReload?.(); e.preventDefault(); return;}
    if (k === 'q') {onRoll?.(); e.preventDefault(); return;}
    if (k === 'c') {onCrouch?.(); e.preventDefault(); return;}
    if (!'wasd'.includes(k) && k !== 'shift' && k !== ' ') return;
    keys.add(k === ' ' ? 'shift' : k); e.preventDefault();
   };
   const up = (e) => {const k = e.key.toLowerCase(); if (k === 'e') onAttackHold?.(false); keys.delete(k === ' ' ? 'shift' : k);
    if (k === 'tab' && tabAt !== null) {
     e.preventDefault(); tabAt = null;
     if (wheelOpen) closeWheel();
     else if (document.pointerLockElement === element) document.exitPointerLock?.(); else element.requestPointerLock?.()?.catch?.(() => {});
    }};
   const blur = () => {tabAt = null; closeWheel(); keys.clear(); touch.forward = 0; touch.strafe = 0; touch.running = false; aimHeld = false; onAim?.(false); onAttackHold?.(false);};
   const move = (e) => {
    if (wheelOpen) {onWheel?.('move', e.movementX, e.movementY); return;}
    if (document.pointerLockElement !== element) return;
    lastDevice = 'mouse';
    state.heading -= e.movementX * PLAYER.look;
    state.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, state.pitch - e.movementY * PLAYER.look));
   };
   const click = (e) => {if (e.pointerType === 'touch') return; if (document.pointerLockElement !== element) element.requestPointerLock?.()?.catch?.(()=>{});};
   const punch = e => {if(document.pointerLockElement!==element)return;
    if(e.button===0){onAttack?.();onAttackHold?.(true);e.preventDefault();}
    else if(e.button===2){aimHeld=true;onAim?.(true);e.preventDefault();}};
   const release = e => {if(e.button===2){aimHeld=false;onAim?.(false);}if(e.button===0)onAttackHold?.(false);};
   const menu = e => e.preventDefault();
   // The wheel steps through the weapons, one notch at a time however fast it spins.
   let wheelAt = 0;
   const wheel = e => {if(document.pointerLockElement!==element)return;e.preventDefault();
    const now=performance.now();if(now-wheelAt<120)return;wheelAt=now;onWeaponCycle?.(Math.sign(e.deltaY)||1);};
   // Touch looks by dragging the scene itself. It belongs on the canvas rather than on a
   // full-screen overlay: an overlay wide enough to catch every drag also swallows every
   // button the page already has, and the canvas is exactly the region that should turn.
   // Mouse drags are left alone -- they are handled above, under pointer lock.
   let touchId = null, touchLast = null;
   const touchStart = e => {
    if (e.pointerType !== 'touch' || touchId !== null) return;
    touchId = e.pointerId; touchLast = {x: e.clientX, y: e.clientY};
    element.setPointerCapture?.(e.pointerId);
   };
   const touchMove = e => {
    if (e.pointerId !== touchId || !touchLast) return;
    e.preventDefault();
    api.look((e.clientX - touchLast.x) * PLAYER.dragLook, (e.clientY - touchLast.y) * PLAYER.dragLook);
    touchLast = {x: e.clientX, y: e.clientY};
   };
   const touchEnd = e => {if (e.pointerId === touchId) {touchId = null; touchLast = null;}};
   // The pad, as actions: one poll a frame, edges fired once, held states kept for input().
   let padAim = false, padFire = false;
   padPoll = (dt) => {
    // Tab held long enough: the wheel (checked here, once a frame, rather than on a timer).
    if (tabAt !== null && !wheelOpen && performance.now() - tabAt >= WHEEL.hold * 1000) openWheel();
    // Gyro: turning the controller turns the camera (+yaw is to the left, as heading grows).
    if (gyro?.connected && !driving() && !wheelOpen) {
     const t = gyro.turn(aimHeld || padAim);
     if (t.yaw || t.pitch) {
      lastDevice = 'pad';
      if (locked()) onLockGyro?.(t.yaw, t.pitch);
      state.heading += t.yaw;
      state.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, state.pitch + t.pitch));
     }
    } else if (gyro?.connected) gyro.take();   // in a car: drained, not saved up for getting out
    const pad = gamepad();
    const mode = driving() ? 'car' : 'foot';
    const f = inputMap.poll(pad, dt, mode);
    padFrame = pad ? f : null; padProfile = f.profile;
    if (!pad) return;
    if (f.pressed.length || Math.hypot(f.move.x, f.move.y) > 0 || Math.hypot(f.look.x, f.look.y) > 0 || f.throttle > 0 || f.brake > 0 || f.aim || f.fire) lastDevice = 'pad';
    for (const action of f.pressed) {
     if (action === 'fire') onAttack?.({pad: true});
     else if (action === 'reload') onReload?.();
     else if (action === 'roll') onRoll?.();
     else if (action === 'enter' || action === 'exit') onDrive?.();
     else if (action === 'weaponPrev') onWeaponCycle?.(-1);
     else if (action === 'weaponNext') onWeaponCycle?.(1);
     else if (action === 'crouch') onCrouch?.();
     else if (action === 'horn') (onHornOnly ?? onHorn)?.();
     else if (action === 'siren') (onSiren ?? onHorn)?.();
     else if (action === 'map') onMap?.();
     else if (action === 'radioNext') onRadio?.(1);
     else if (action === 'radioPrev') onRadio?.(-1);
     else if (action === 'menu') {keys.clear(); onExit?.();}
    }
    // Stage 1: L/R held is the wheel; the right stick picks and does not turn the camera.
    if (f.wheel && !padWheel) {padWheel = true; openWheel();}
    else if (!f.wheel && padWheel) {padWheel = false; closeWheel();}
    if (padWheel && wheelOpen) {onWheel?.('point', f.stick.x, f.stick.y); return;}
    if (f.aim !== padAim) {padAim = f.aim; onAim?.(f.aim, {pad: true});}
    if (!!f.fire !== padFire) {padFire = !!f.fire; onAttackHold?.(padFire, {pad: true});}
    // Item 3: locked on, the right stick is for flicks, not the camera (the scene keeps the
    // target in view).
    if (padAim && locked()) {if (f.flick) onLockFlick?.(f.flick); return;}
    const k = PLAYER.padLook * settings.look * dt;
    if (f.look.x) state.heading -= f.look.x * k;
    if (f.look.y) state.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, state.pitch - f.look.y * k * (settings.invertY ? -1 : 1)));
   };
   window.addEventListener('keydown', down); window.addEventListener('keyup', up);
   window.addEventListener('blur', blur);
   element.addEventListener('mousemove', move); element.addEventListener('click', click);element.addEventListener('mousedown',punch);
   element.addEventListener('mouseup',release);element.addEventListener('contextmenu',menu);element.addEventListener('wheel',wheel,{passive:false});
   element.addEventListener('pointerdown', touchStart); element.addEventListener('pointermove', touchMove);
   for (const type of ['pointerup', 'pointercancel']) element.addEventListener(type, touchEnd);
   detach = () => {
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
    window.removeEventListener('blur', blur);
    element.removeEventListener('mousemove', move); element.removeEventListener('click', click);element.removeEventListener('mousedown',punch);
    element.removeEventListener('mouseup',release);element.removeEventListener('contextmenu',menu);element.removeEventListener('wheel',wheel);
    onAim?.(false); onAttackHold?.(false); closeWheel();
    element.removeEventListener('pointerdown', touchStart); element.removeEventListener('pointermove', touchMove);
    for (const type of ['pointerup', 'pointercancel']) element.removeEventListener(type, touchEnd);
    if (document.pointerLockElement === element) document.exitPointerLock?.();
    keys.clear(); touch.forward=0; touch.strafe=0; touch.running=false; padPoll = null; detach = null;
   };
  },
  detach() {detach?.();},

  /**
   * Drop the player onto walkable ground near `x,z`. Merely being clear of solids is not
   * enough for a starting point -- a gap between two buildings satisfies that and leaves the
   * player standing on bare land -- so the walkable surface is required first, and only if
   * nothing is found within the search does it fall back to any clear spot.
   */
  place(x = PLAYER.start[0], z = PLAYER.start[1], heading = PLAYER.startHeading) {
   const land = (px, pz) => {
    Object.assign(state, {x: px, z: pz, heading, bodyHeading: heading, course: heading, targetSpeed: 0, speed: 0, alive: true, runOver: 0, hitBy: null, health:100, attackTime:0, hurtTime:0, vehiclePhase:0, carGrace:0, stunTime:0, knockX:0, knockZ:0, knockLeft:0, rollTime:0, dodging:false, crouching:false});
    state.y = ctx.height(px, pz); return true;
   };
   for (const test of [ctx.safe, standable]) {
    for (let r = 0; r <= 24; r += 1.5) for (let i = 0; i < (r ? 12 : 1); i++) {
     const a = i * Math.PI / 6, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
     if (test(px, pz)) return land(px, pz);
    }
   }
   return false;
  },

  /**
   * The movement axes, shared by walking and driving.
   *
   * A pad is merged in rather than replacing the keys, so both are live at once and neither
   * has to be selected. Sticks are analogue and the keys are not, so the larger of the two
   * wins per axis: resting a thumb on a drifting stick cannot then cancel a held key. The
   * deadzone is what keeps a worn stick from walking the player across the street on its own.
   */
  updateInput(dt) {padPoll?.(Math.max(0, Math.min(.1, dt)));},
  input() {
   // Polled here rather than in step(): driving calls input() and never calls step(), so the
   // pad would go dead the moment the player got into a car.
   // Input snapshots are pure; updateInput(dt) advances look/buttons exactly once per frame.
   let fx = 0, fz = 0;
   if (keys.has('w')) fz += 1; if (keys.has('s')) fz -= 1;
   if (keys.has('a')) fx -= 1; if (keys.has('d')) fx += 1;
   let running = keys.has('shift') || touch.running;
   if (Math.abs(touch.forward) > Math.abs(fz)) fz = touch.forward;
   if (Math.abs(touch.strafe) > Math.abs(fx)) fx = touch.strafe;
   // The pad (C1-C3): the stick through a radial deadzone; in a car ZR/ZL ramped into throttle and
   // brake, R the handbrake; on foot B held runs.
   let handbrake = false;
   const f = padFrame;
   if (f) {
    const drive = f.throttle - f.brake;
    const wants = Math.abs(f.move.y) > Math.abs(drive) ? f.move.y : drive;
    if (Math.abs(wants) > Math.abs(fz)) fz = wants;
    if (Math.abs(f.move.x) > Math.abs(fx)) fx = f.move.x;
    running = running || f.run;
    handbrake = f.handbrake;
   }
   return {forward: fz, strafe: fx, running, handbrake: keys.has(' ') || running || handbrake};
  },
  /**
   * Set by the on-screen controls. Merged with the keys and the pad on the same rule the pad
   * uses -- larger magnitude wins per axis -- so a phone, a keyboard and a controller can all
   * be connected at once without any of them having to be selected.
   */
  setTouch(next = {}) {
   touch.forward = Math.max(-1, Math.min(1, next.forward ?? 0));
   touch.strafe = Math.max(-1, Math.min(1, next.strafe ?? 0));
   touch.running = !!next.running;
  },
  /** Turn the screen by dragging, which is what the mouse does under pointer lock. */
  look(dx, dy) {
   state.heading -= dx * PLAYER.look;
   state.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, state.pitch - dy * PLAYER.look));
  },

  /** While driving, the body rides in the car and is posed from it rather than walked. */
  rideTo(x, z, heading) {
   state.x = x; state.z = z; state.heading = heading; state.speed = 0; state.moving = false;
  },
  transitionTo(x,z,heading,phase=0){
   state.x=x;state.z=z;state.heading=heading;state.bodyHeading=heading;state.y=ctx.height(x,z);
   state.speed=0;state.moving=false;state.vehiclePhase=phase;
  },

  /**
   * PLAN-WEAPONS W4: a dodge roll the way the player is going (or facing, standing still).
   * Refused mid-swing, mid-roll, stunned or dead. Returns true when it started.
   */
  roll() {
   if (!state.alive || (state.rollTime ?? 0) > 0 || (state.attackTime ?? 0) > 0 || (state.stunTime ?? 0) > 0 || (state.rollRest ?? 0) > 0 || state.vehiclePhase > 0) return false;
   const {forward: fz, strafe: fx} = api.input(), s = Math.sin(state.heading), c = Math.cos(state.heading), len = Math.hypot(fx, fz);
   const heading = len > 0 ? Math.atan2((fz * s - fx * c) / len, (fz * c + fx * s) / len) : (state.bodyHeading ?? state.heading);
   state.rollHeading = heading; state.bodyHeading = heading; state.course = heading;
   state.rollTime = state.rollDuration = PLAYER.roll.seconds; state.crouching = false; state.dodging = false;
   return true;
  },
  /** W4: crouch on / off. Not while rolling. */
  crouch(on = !state.crouching) {if (!state.alive || (state.rollTime ?? 0) > 0) return false; state.crouching = !!on; return true;},

  step(dt) {
   if (!state.alive) {state.runOver += dt; state.speed = 0; state.moving = false; state.rollTime = 0; state.dodging = false; return;}
   state.rollRest = Math.max(0, (state.rollRest ?? 0) - dt);
   // A roll carries the body along its heading, the push falling linearly to nothing, integrated
   // exactly over the frame so the distance is the same at any frame rate. Walls stop it.
   if ((state.rollTime ?? 0) > 0) {
    const T = state.rollDuration || PLAYER.roll.seconds, a = state.rollTime, b = Math.max(0, a - dt);
    const k = PLAYER.roll.distance * (a * a - b * b) / (T * T);
    advance(Math.sin(state.rollHeading) * k, Math.cos(state.rollHeading) * k);
    state.rollTime = b;
    const into = T - b;
    state.dodging = into >= PLAYER.roll.dodge[0] && into <= PLAYER.roll.dodge[1];
    state.speed = dt > 0 ? k / dt : 0; state.moving = true; state.running = false;
    if (b === 0) {state.speed = 0; state.dodging = false; state.rollRest = PLAYER.roll.cooldown;}
    state.y = ctx.height(state.x, state.z);
    return;
   }
   state.dodging = false;
   state.carGrace = Math.max(0, (state.carGrace ?? 0) - dt);
   // Thrown by a car: carried off by the knock, then stood there until control comes back.
   if ((state.stunTime ?? 0) > 0) {
    state.stunTime = Math.max(0, state.stunTime - dt);
    if (state.knockLeft > 0) {
     // The push falls linearly to zero, and this is its exact integral over the frame, so the
     // distance is the same at any frame rate (combat.mjs staggerStep does the same).
     const hold = PLAYER.throwSeconds, a = state.knockLeft, b = Math.max(0, a - dt), k = (a * a - b * b) / (2 * hold);
     state.knockLeft = b;
     advance(state.knockX * k, state.knockZ * k);
    }
    state.speed = 0; state.targetSpeed = 0; state.moving = false;
    state.y = ctx.height(state.x, state.z);
    return;
   }
   const {forward: fz, strafe: fx, running} = api.input();
   const len = Math.hypot(fx, fz);
   // PLAN-WEAPONS: aiming is a walk; the gun is not carried at a run.
   state.running = running && !((state.aim ?? 0) > 0);
   state.moving = len > 0;
   // A swing plants the feet: the clip is a standing punch, and a body carried along under it
   // skates. The body stops (at the ordinary braking rate) and faces the swing's aim, which
   // combat owns, until the fist is back.
   const attacking=(state.attackTime??0)>0;
   if(state.crouching)state.running=false;
   const pace=state.crouching?PLAYER.crouchSpeed:state.running?PLAYER.run:PLAYER.walk;
   const wanted=len>0&&!attacking?pace*Math.min(1,len):0;
   // Where the body is being asked to go, in world terms. Forward is where the camera looks;
   // strafing is perpendicular to it, so a diagonal input walks diagonally rather than
   // sidestepping, and the figure turns to face it. The camera looking along (sin h, cos h)
   // has its right at (-cos h, sin h): at heading 0 it looks toward +z and the right of the
   // screen is world -x. Strafe +1 ("right" on the pad, D, the stick) must go there.
   const s=Math.sin(state.heading),c=Math.cos(state.heading);
   let course=state.course??state.heading;
   if(len>0)course=Math.atan2((fz*s-fx*c)/len,(fz*c+fx*s)/len);
   state.course=course;

   // Turning costs speed. Without this a hard reversal happens at full pace and the feet are
   // pointing one way while the body travels the other for as long as the turn takes.
   const swing=len>0?Math.abs(Math.atan2(Math.sin(course-(state.bodyHeading??course)),
    Math.cos(course-(state.bodyHeading??course)))):0;
   const target=wanted*(1-PLAYER.turnDrag*Math.min(1,swing/Math.PI));

   const rate=target>state.speed?PLAYER.accelerate:PLAYER.brake;
   state.speed+=Math.max(-rate*dt,Math.min(rate*dt,target-state.speed));
   state.speed=Math.max(0,state.speed);
   state.targetSpeed=target;

   let mx=0,mz=0;
   if(state.speed>1e-4){
    const step=state.speed*dt;
    // Travel along the body's own heading once it exists, so the character goes where it is
    // pointing rather than sliding sideways while it turns.
    const along=state.bodyHeading??course;
    mx=Math.sin(along)*step;mz=Math.cos(along)*step;
   }
   // People first, then walls. With no crowd this is skipped and the step is untouched.
   const crowd=typeof bodies==='function'?bodies():bodies;
   if(crowd){const r=contact.resolve(crowd,state,mx,mz,dt,len>0&&!attacking);mx=r.dx;mz=r.dz;}
   if(state.speed>1e-4||mx||mz){
    const ox=state.x,oz=state.z;
    advance(mx,mz);
    const moved=dt>0?Math.hypot(state.x-ox,state.z-oz)/dt:0;
    // Walking into a wall must not leave the legs running: the speed the legs see is the
    // speed the body actually made, not the speed it wanted. The same holds for a crowd.
    if(state.speed>1e-4)state.speed=Math.min(state.speed,moved);
   }
   if(crowd)contact.react(crowd,state,dt);
   // The figure turns the body; this is only what it is turning towards.
   if(len>0&&!attacking)state.bodyHeading=turnToward(state.bodyHeading??course,course,dt);
   state.y = ctx.height(state.x, state.z);
  },

  /** After the crowd has moved this frame: move whoever walked into the player back out. */
  settleCrowd(dt) {
   const crowd = typeof bodies === 'function' ? bodies() : bodies;
   return crowd ? contact.settle(crowd, state, dt) : 0;
  },

  /** True while the player is standing on carriageway rather than pavement. */
  get onRoad() {return ctx.onRoad(state.x, state.z);},

  /**
   * Called when a vehicle box overlaps the player. A quarter of the health; only the hit that
   * takes it to 0 is a death, recorded rather than simulated as before. Returns true when it
   * counted (false inside the grace period, or already down).
   */
  knockDown(vehicle) {
   if (!state.alive || (state.carGrace ?? 0) > 0) return false;
   if (vehicle && Number.isFinite(vehicle.speed) && Math.abs(vehicle.speed) < PLAYER.carHitSpeed) return false;
   state.carGrace = PLAYER.carGrace;
   state.health = Math.max(0, state.health - PLAYER.carDamage);
   state.hitBy = vehicle?.type ?? 'vehicle';
   if (state.health <= 0) {state.alive = false; state.runOver = 0; return true;}
   // Thrown out of the car's path: sideways, on the side the player is already on, and a little
   // the way the car was going. Straight ahead would leave the player in front of it.
   const h = vehicle?.heading ?? 0, v = Math.abs(vehicle?.speed ?? 0), fx = Math.sin(h), fz = Math.cos(h);
   const across = (state.x - (vehicle?.x ?? state.x)) * fz - (state.z - (vehicle?.z ?? state.z)) * fx;
   const side = Math.abs(across) > .05 ? Math.sign(across) : 1;
   let dx = fz * side + fx * .45 * Math.sign(vehicle?.speed ?? 1), dz = -fx * side + fz * .45 * Math.sign(vehicle?.speed ?? 1);
   const l = Math.hypot(dx, dz); dx /= l; dz /= l;
   const distance = PLAYER.thrown[0] + (PLAYER.thrown[1] - PLAYER.thrown[0]) * Math.min(1, v / 10);
   const push = 2 * distance / PLAYER.throwSeconds;
   state.knockX = dx * push; state.knockZ = dz * push; state.knockLeft = PLAYER.throwSeconds;
   state.stunTime = PLAYER.stun; state.speed = 0; state.attackTime = 0;
   // The strong Hit, recoiling away from the car.
   state.hurtTime = .6; state.hurtDuration = .6; state.hurtX = dx; state.hurtZ = dz; state.hurtStrong = true;
   return true;
  },
  // RUN 11.2: the name and length go with the swing, so the figure plays THIS clip at its own
  // speed. Before, every swing played `Punch` squeezed into the last 0.42 s of the attack --
  // double speed, after the hit had already landed, and never the cross.
  startAttack(seconds=.42,name='Punch'){if(!state.alive)return false;state.attackTime=Math.max(state.attackTime,seconds);state.attackDuration=seconds;state.attackName=name;return true;},
  hurt(amount=0,source='fight'){
   if(!state.alive||state.hurtTime>0)return false;
   // Roadmap stage 5: body armour from the shop takes most of each blow while it lasts.
   const hit=absorb(Math.max(0,amount),state.armor??0);state.armor=hit.armor;
   state.health=Math.max(0,state.health-hit.damage);state.hurtTime=.34;
   if(state.health<=0){state.alive=false;state.runOver=0;state.hitBy=source;state.armor=0;}return true;
  },
  revive() {return api.place();},
  /** C4: rumble the pad for an event ('shot', 'cut', 'hurt', 'crash'); nothing without one. */
  rumble(kind, scale = 1) {return rumble.play(gamepad(), kind, undefined, scale);},
  /** C1: 'keyboard', 'mouse' or 'pad' -- whichever moved last -- and the pad's profile. */
  get lastDevice() {return lastDevice;},
  get padProfile() {return padProfile;}
 };
 return api;
}

/**
 * Where the third-person camera sits for the player's current pose, into an
 * {x,y,z,tx,ty,tz} scratch.
 *
 * With a context, the arm is shortened to the last clear point between the player and where
 * the camera would like to be, so backing into a facade slides the camera forward rather
 * than through the wall. The look-at point does not move with it: the arm changes length,
 * never direction, so the view does not swing when a wall is brushed.
 */
export function playerCamera(state, out = {}, ctx = null, aim = 0) {
 const s = Math.sin(state.heading), c = Math.cos(state.heading), cp = Math.cos(state.pitch);
 const eye = state.y + PLAYER.eye;
 // `aim` 0..1 blends the follow arm into the shoulder arm (R17).
 const k = Math.max(0, Math.min(1, aim)), arm = PLAYER.followBack + (PLAYER.aimBack - PLAYER.followBack) * k;
 const up = PLAYER.followUp + (PLAYER.aimUp - PLAYER.followUp) * k, side = PLAYER.aimSide * k;
 const back = arm * cp;
 // The camera's right is (-cos h, sin h) (see step()).
 const wantX = state.x - s * back - c * side, wantZ = state.z - c * back + s * side;
 const wantY = eye + up + arm * Math.sin(state.pitch);
 out.x = wantX; out.y = wantY; out.z = wantZ;
 clipCameraArm({x:state.x - c * side,y:eye,z:state.z + s * side},out,ctx,out);
 const ahead = 1.8 + 6 * k;
 out.tx = state.x - c * side + s * cp * ahead;
 out.ty = eye + Math.sin(state.pitch) * ahead;
 out.tz = state.z + s * side + c * cp * ahead;
 return out;
}
