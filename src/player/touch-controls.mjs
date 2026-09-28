// On-screen controls, for playing on a phone.
//
// Not a diagnostic: these are the controls, and on a touch device they are the only ones
// there are. So the left thumb gets a stick rather than a row of arrow buttons -- walking and
// steering both want to be analogue, and a D-pad makes a car weave -- and the rest of the
// screen is drag-to-look, which is what the mouse does under pointer lock. The right thumb
// gets the actions. Looking around is a drag on the scene, handled by the controller on the
// canvas: an overlay wide enough to catch every drag also swallows every button the page has.
//
// Everything is tracked per pointer id. A phone has more than one finger on the glass at
// once, and steering while looking around is the normal case, not the exception.

export const TOUCH = Object.freeze({
 radius: 56,          // px the stick travels before it reads as full deflection
 deadzone: .14        // of that travel, below which it reads as nothing
});

/** Is this a device that wants them? A mouse-only desktop should not get a thumbstick. */
export const wantsTouch = () =>
 typeof navigator !== 'undefined' &&
 ((navigator.maxTouchPoints ?? 0) > 0 ||
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));

/**
 * PLAN-WEAPONS R16: a phone has no mouse to aim with, so the weapon button steps through the
 * weapons and the attack button does what the weapon does -- with the pistol out it fires at
 * whoever the lock-on picks (the nearest person in the view cone). Its label says which.
 * @param {{onAxes?:(axes:any)=>void, onDrive?:()=>void, onAttack?:()=>void, onAttackHold?:(on:boolean)=>void, onExit?:()=>void, onWeapon?:()=>void}} [options]
 */
export const ATTACK_LABEL = Object.freeze({fists: '殴る', pistol: '撃つ', katana: '斬る', smg: '撃つ'});
export function createTouchControls({onAxes, onDrive, onAttack, onAttackHold, onExit, onWeapon, onWheel, onRadio} = {}) {
 if (typeof document === 'undefined') return {show() {}, hide() {}, setDriving() {}, setWeapon() {}, dispose() {}};

 const root = document.createElement('div');
 root.className = 'tc';
 root.hidden = true;
 root.innerHTML =
  `<div class="tc-stick"><div class="tc-base"><div class="tc-knob"></div></div></div>
   <button type="button" class="tc-rotate">横向きにすると遊びやすくなります（タップで閉じる）</button>
   <div class="tc-acts">
     <button type="button" class="tc-run">走る</button>
     <button type="button" class="tc-attack">殴る</button>
     <button type="button" class="tc-weapon">武器</button>
     <button type="button" class="tc-radio" hidden>ラジオ</button>
     <button type="button" class="tc-drive">乗る</button>
     <button type="button" class="tc-exit">観察</button>
   </div>`;
 document.body.appendChild(root);

 const stickZone = root.querySelector('.tc-stick');
 const base = root.querySelector('.tc-base');
 const knob = root.querySelector('.tc-knob');
 const runBtn = root.querySelector('.tc-run');
 const rotate = root.querySelector('.tc-rotate');
 rotate.addEventListener('click', () => rotate.remove());
 const driveBtn = root.querySelector('.tc-drive');

 let stickId = null, origin = null, running = false, driving = false;
 const axes = {forward: 0, strafe: 0, running: false};

 const push = () => onAxes?.({...axes, running: axes.running || running});
 const rest = () => {
  axes.forward = 0; axes.strafe = 0;
  base.classList.remove('on');
  knob.style.transform = 'translate(-50%,-50%)';
  push();
 };

 // --- the stick ------------------------------------------------------------------------
 stickZone.addEventListener('pointerdown', e => {
  if (stickId !== null) return;
  e.preventDefault();
  stickId = e.pointerId; stickZone.setPointerCapture?.(e.pointerId);
  // The stick appears where the thumb lands rather than at a fixed spot, so it never has to
  // be found by looking down at the screen.
  const box = stickZone.getBoundingClientRect();
  origin = {x: e.clientX, y: e.clientY};
  base.style.left = (e.clientX - box.left) + 'px';
  base.style.top = (e.clientY - box.top) + 'px';
  base.classList.add('on');
 });
 stickZone.addEventListener('pointermove', e => {
  if (e.pointerId !== stickId || !origin) return;
  e.preventDefault();
  let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
  const len = Math.hypot(dx, dy);
  if (len > TOUCH.radius) {dx *= TOUCH.radius / len; dy *= TOUCH.radius / len;}
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  const nx = dx / TOUCH.radius, ny = -dy / TOUCH.radius;
  const dead = v => Math.abs(v) < TOUCH.deadzone ? 0 : v;
  axes.strafe = dead(nx); axes.forward = dead(ny);
  push();
 });
 for (const type of ['pointerup', 'pointercancel']) stickZone.addEventListener(type, e => {
  if (e.pointerId !== stickId) return;
  stickId = null; origin = null; rest();
 });

 // --- actions --------------------------------------------------------------------------
 const holdRun = on => {running = on; runBtn.classList.toggle('on', on); push();};
 runBtn.addEventListener('pointerdown', e => {e.preventDefault(); runBtn.setPointerCapture?.(e.pointerId); holdRun(true);});
 for (const type of ['pointerup', 'pointercancel', 'pointerleave']) runBtn.addEventListener(type, () => holdRun(false));
 driveBtn.addEventListener('click', e => {e.preventDefault(); onDrive?.();});
 root.querySelector('.tc-attack').addEventListener('click',e=>{e.preventDefault();onAttack?.();});
 // §9ah: the attack button held keeps an automatic firing.
 {const b=root.querySelector('.tc-attack');
  b.addEventListener('pointerdown',()=>onAttackHold?.(true));
  for(const t of ['pointerup','pointercancel','pointerleave'])b.addEventListener(t,()=>onAttackHold?.(false));}
 root.querySelector('.tc-exit').addEventListener('click', e => {e.preventDefault(); onExit?.();});
 // Stage 6: in a car, the next station (off after the last).
 const radioBtn = root.querySelector('.tc-radio');
 radioBtn.addEventListener('click', e => {e.preventDefault(); onRadio?.(1);});
 const weaponBtn = root.querySelector('.tc-weapon');
 // Stage 1: a tap steps to the next weapon; held, the weapon wheel -- drag toward one and let go.
 let wheelTimer = null, wheelOpen = false, wheelFrom = null;
 weaponBtn.addEventListener('click', e => e.preventDefault());
 weaponBtn.addEventListener('pointerdown', e => {
  e.preventDefault(); weaponBtn.setPointerCapture?.(e.pointerId); wheelFrom = {x: e.clientX, y: e.clientY};
  wheelTimer = setTimeout(() => {wheelTimer = null; wheelOpen = true; onWheel?.('open');}, 280);
 });
 weaponBtn.addEventListener('pointermove', e => {if (wheelOpen && wheelFrom) onWheel?.('point', (e.clientX - wheelFrom.x) / 70, (e.clientY - wheelFrom.y) / 70);});
 const wheelUp = e => {
  if (wheelTimer) {clearTimeout(wheelTimer); wheelTimer = null; if (e.type === 'pointerup') onWeapon?.();}
  else if (wheelOpen) {wheelOpen = false; onWheel?.('close');}
  wheelFrom = null;
 };
 weaponBtn.addEventListener('pointerup', wheelUp); weaponBtn.addEventListener('pointercancel', wheelUp);

 return {
  show() {root.hidden = false; document.body.classList.add('tc-on');},
  hide() {root.hidden = true; document.body.classList.remove('tc-on'); stickId = null; origin = null; holdRun(false); rest();},
  /** Driving has no run button, and the get-in button becomes a get-out button. */
  setDriving(on) {
   driving = on;
   driveBtn.textContent = on ? '降りる' : '乗る';
   driveBtn.classList.remove('far');
   runBtn.hidden = on;
   root.querySelector('.tc-attack').hidden=on;
   weaponBtn.hidden = on;
   radioBtn.hidden = !on;
   if (on) holdRun(false);
  },
  /** The weapon out: the attack button's label follows it. */
  setWeapon(id) {root.querySelector('.tc-attack').textContent = ATTACK_LABEL[id] ?? ATTACK_LABEL.fists;},

  /**
   * How far the nearest car is, from `nearestEntry`. A button that does nothing when pressed
   * is indistinguishable from a broken one, so out of range it says the distance instead of
   * saying 乗る -- the answer is on screen before it is pressed.
   */
  setReach(entry) {
   if (driving) return;
   if (!entry) {driveBtn.textContent = '車がない'; driveBtn.classList.add('far'); return;}
   driveBtn.textContent = entry.inRange ? '乗る' : `車まで ${Math.round(entry.distance)}m`;
   driveBtn.classList.toggle('far', !entry.inRange);
  },
  get driving() {return driving;},
  dispose() {onAxes?.({forward: 0, strafe: 0, running: false}); document.body.classList.remove('tc-on'); root.remove();}
 };
}
