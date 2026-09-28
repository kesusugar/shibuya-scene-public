// What the player carries, and how each thing is held (PLAN-WEAPONS W1).
//
// Pure: no scene, no DOM. The inventory is three slots -- fists, a pistol and a katana -- and
// every number here is either a rule from the plan (§2) or a measurement of the hand bone on the
// converted humanoid (public/data/character/citizen.glb), which is what the grip frames below are.
//
// Names: the shapes are a generic automatic pistol, a generic revolver and a generic katana.
// No maker or model name belongs in src/ (tests/name-guard.test.mjs).

/** The slots, in key order: 1, 2, 3, 4 (§9ah: the submachine gun is the fourth). */
export const SLOTS = Object.freeze(['fists', 'pistol', 'katana', 'smg']);
/** The player's guns: each keeps its own magazine. */
export const GUNS = Object.freeze(['pistol', 'smg']);

export const WEAPONS = Object.freeze({
 fists: Object.freeze({id: 'fists', label: '素手', kind: 'melee'}),
 pistol: Object.freeze({id: 'pistol', label: 'ピストル', kind: 'gun',
  magazine: 8,            // rounds; R reloads, the reserve is unlimited
  bodyDamage: 50,         // a headshot takes the target down at once (R10)
  range: 60,              // m; beyond this a pistol round is not simulated (R7)
  headHeight: 1.5,        // m above the feet: the head zone starts here (R10)
  // A shot's cooldown follows the clip: Pistol_Shoot is 0.633 s, and its recoil is over by
  // about 0.28 s, which is where a second shot can start (measured on the clip, not chosen).
  shotSeconds: .633, refire: .28, reloadSeconds: 1.667,
  // What a shot does to the street (R14): heard much further than a punch is seen, with a cap on
  // how many people one shot can send running.
  witnessRadius: 40, witnessSeverity: 1, panicCap: 60}),
 katana: Object.freeze({id: 'katana', label: '日本刀', kind: 'melee',
  damage: 50,             // two cuts put a person down
  reach: 1.7,             // m, centre to centre: the blade tip at its furthest (SWORD.tipReach 1.42) plus a body radius
  // R4 option (b) since §9ah: the cut is CMU 02_07's two-handed cut, the left hand on the handle
  // 0.15 m behind the right fist (scripts/cmu/weapon-clip.mjs).
  hands: 2}),
 // §9ah: a generic submachine gun, held in both hands and fired from the shoulder (the CMU 80_03
 // clips). Automatic: the trigger held fires every `refire` s; each shot opens the spread, which
 // closes again when the trigger is let go. Weaker per round than the pistol, and much louder in
 // the street.
 smg: Object.freeze({id: 'smg', label: 'サブマシンガン', kind: 'gun', auto: true,
  magazine: 30, bodyDamage: 25, range: 50, headHeight: 1.5,
  refire: .085,           // s between rounds: about 700 a minute
  shotSeconds: .12,       // the recoil kick's length, per round
  reloadSeconds: 2.0,
  // Spread, radians off the aim: where the first round goes, how much each round in a burst adds,
  // the most it opens to, and how fast it closes (per second) when the trigger is released.
  spread: Object.freeze({first: .004, perShot: .006, max: .06, recover: .25}),
  // Recoil, per round: the muzzle climbs this much (radians) and comes back at `settle` per second;
  // the camera shares `camera` of the climb.
  recoil: Object.freeze({climb: .035, settle: 9, camera: .35}),
  witnessRadius: 55, witnessSeverity: 1, panicCap: 80,
  // Stage 1: shouldered, the view closes in further than over a pistol (PLAYER.aimFov is 40).
  aimFov: 30}),
 // The police weapon (W3). Not in the player's inventory.
 revolver: Object.freeze({id: 'revolver', label: '回転式拳銃', kind: 'gun',
  cylinder: 5, damage: [10, 15], range: 45, shotSeconds: .633, refire: 1.1})
});

/**
 * Stage 1: changing weapons is a hand movement (hands.mjs). The hand goes to where the weapon out
 * is carried (`holster` s), puts it away, goes to where the next one is carried and brings it up
 * (`draw` s). A shot waits for it.
 */
export const DRAW = Object.freeze({holster: .22, draw: .3});

/**
 * How each weapon sits in the right hand, in hand_r's own frame.
 *
 * Measured on the converted humanoid (qa/gta-upgrade/weaponbench.html shows it from four
 * angles): the fingers run along the hand's +Y, the index knuckle is on +Z and the little finger
 * on -Z, and the palm faces -X. So a grip -- a pistol's or a katana's handle -- runs along Z and
 * sits on the palm side of the knuckles.
 *
 * `forward` and `up` are the weapon's own +Z (barrel or blade) and +Y, in hand space. For the
 * guns they are read off Pistol_Aim_Neutral: at that pose the body looks along world +Z, and
 * world +Z seen from the hand is (0.03, 0.98, -0.18) -- the barrel is along the fingers, tilted
 * slightly toward the little finger, and the top of the slide is toward the index knuckle.
 */
export const GRIP = Object.freeze({
 pistol: Object.freeze({at: [-.032, .075, -.018], forward: [.03, .98, -.18], up: [-.04, .19, .98]}),
 revolver: Object.freeze({at: [-.032, .075, -.018], forward: [.03, .98, -.18], up: [-.04, .19, .98]}),
 // The blade leaves the fist on the index side (+Z); its edge leads along the fingers (+Y), which
 // is the way Sword_Attack's sweep travels.
 katana: Object.freeze({at: [-.03, .085, .0], forward: [0, 0, 1], up: [0, 1, 0]}),
 // §9ah: the submachine gun is held by its pistol grip as the pistol is. scripts/cmu/weapon-clip.mjs
 // put the right hand on the gun with exactly this frame, so the two must stay the same.
 smg: Object.freeze({at: [-.032, .075, -.018], forward: [.03, .98, -.18], up: [-.04, .19, .98]})
});

/** The palm, in hand_r space: where a held grip's centre belongs (R3 measures against this). */
export const PALM = Object.freeze([-.032, .08, -.005]);

/**
 * Weapon geometry that the rules need (the meshes are built from the same numbers in
 * weapon-mesh.mjs). Metres, in the weapon's own frame: +Z forward, +Y up, origin at the grip.
 */
export const SHAPE = Object.freeze({
 pistol: Object.freeze({muzzle: [0, .062, .165]}),
 revolver: Object.freeze({muzzle: [0, .07, .19]}),
 // A generic katana: a 0.26 m handle, a guard, and a 0.70 m blade with a slight curve. The tip is
 // 0.75 m from the fist.
 katana: Object.freeze({handle: .26, blade: .70, tip: .75, sori: .018}),
 // §9ah: the numbers the SmgLow/SmgAim clips were baked against (scripts/cmu/weapon-clip.mjs):
 // the butt 0.33 m behind the grip, the left hand's fore-end 0.28 m ahead, the rear sight 0.115 m
 // above it. The mesh is built from the same numbers.
 smg: Object.freeze({muzzle: [0, .07, .45], butt: [0, .04, -.33], foreEnd: .28, sight: [0, .115, -.05]})
});

const wrap = i => ((i % SLOTS.length) + SLOTS.length) % SLOTS.length;

/**
 * The player's inventory: which slot is out, and each gun's magazine.
 *
 * Switching is refused mid-action (a swing, a shot, a reload) and while driving -- a weapon
 * change is a hand movement too. Entering a car holsters everything (R18); leaving it brings back
 * fists, not the last weapon, so a player never steps out of a car already aiming.
 */
export function createInventory({start = 'fists'} = {}) {
 const ammo = Object.fromEntries(GUNS.map(g => [g, WEAPONS[g].magazine]));
 const state = {current: SLOTS.includes(start) ? start : 'fists', ammo,
  reloading: 0, cooldown: 0, holstered: false, switches: 0, shots: 0,
  /** The drawn gun's rounds (the pistol's when no gun is drawn). */
  get rounds() {return ammo[GUNS.includes(api.current) ? api.current : 'pistol'];}};
 const gun = () => GUNS.includes(api.current) ? api.current : null;
 const api = {
  state,
  get current() {return state.holstered ? 'fists' : state.current;},
  get weapon() {return WEAPONS[api.current];},
  /** Out by slot name or number (1-4). False when refused. */
  select(which, {busy = false} = {}) {
   const id = typeof which === 'number' ? SLOTS[which - 1] : which;
   if (!SLOTS.includes(id) || busy || state.reloading > 0) return false;
   if (id === state.current && !state.holstered) return false;
   state.current = id; state.holstered = false; state.switches++; state.cooldown = 0;
   return true;
  },
  /** The mouse wheel or the pad's weapon button: +1 next, -1 previous. */
  cycle(step = 1, options = {}) {
   return api.select(SLOTS[wrap(SLOTS.indexOf(state.current) + Math.sign(step || 1))], options);
  },
  holster() {state.holstered = true; state.reloading = 0;},
  unholster() {if (state.holstered) {state.holstered = false; state.current = 'fists';}},
  /** Can the drawn gun fire this instant? */
  get canFire() {const g = gun(); return !!g && ammo[g] > 0 && state.cooldown <= 0 && state.reloading <= 0;},
  /** Spend a round. Returns false (and does nothing) when the gun cannot fire. */
  fire() {
   if (!api.canFire) return false;
   const g = gun(); ammo[g]--; state.shots++; state.cooldown = WEAPONS[g].refire;
   return true;
  },
  /** R, or an empty magazine: the reload's length, then a full magazine. */
  reload() {
   const g = gun();
   if (!g || state.reloading > 0 || ammo[g] >= WEAPONS[g].magazine) return false;
   state.reloading = WEAPONS[g].reloadSeconds; state.reloadingGun = g; return true;
  },
  update(dt) {
   dt = Math.max(0, dt || 0);
   state.cooldown = Math.max(0, state.cooldown - dt);
   if (state.reloading > 0) {
    state.reloading = Math.max(0, state.reloading - dt);
    if (state.reloading === 0) ammo[state.reloadingGun ?? 'pistol'] = WEAPONS[state.reloadingGun ?? 'pistol'].magazine;
   }
  },
  /** Respawn: fists out, full magazines. */
  reset() {
   Object.assign(state, {current: 'fists', reloading: 0, cooldown: 0, holstered: false});
   for (const g of GUNS) ammo[g] = WEAPONS[g].magazine;
  },
  snapshot() {const g = gun() ?? 'pistol'; return {current: api.current, rounds: ammo[g], magazine: WEAPONS[g].magazine,
   reloading: state.reloading > 0, holstered: state.holstered, shots: state.shots, ammo: {...ammo},
   // Stage 1: how far the reload has got, 0..1, for the HUD's bar.
   reloadProgress: state.reloading > 0 ? 1 - state.reloading / WEAPONS[state.reloadingGun ?? g].reloadSeconds : 0};}
 };
 return api;
}
