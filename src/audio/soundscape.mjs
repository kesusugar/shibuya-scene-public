// What the player hears around them (RUN 12.1), on top of src/audio/bank.mjs.
//
// Every sound decision that is not an engine note lives here, so the scene only wires it in:
//  - the ears follow the camera;
//  - two ambience beds, raised by the people and moving traffic near the ears;
//  - the crossing chirp, placed at the scramble and heard only while pedestrians have green;
//  - the player's own footsteps, one per stride actually covered (not per frame of input);
//  - tyres that squeal when the car really slides or brakes hard;
//  - the feedback bus's events, turned into placed one-shots, with the bed ducked under them.
//
// Every method returns whether it played, so the caller can keep its synthesised fallback.

export const SCAPE = Object.freeze({
 senseEvery: .5,          // seconds between density counts; a crowd does not change faster
 crowdRadius: 30, carRadius: 45,
 crowdFull: 80,           // people within crowdRadius at which the crowd bed is at full level
 carsFull: 10,
 bedCrowd: [.25, 1], bedCity: [.35, .75],   // [floor, ceiling] of each bed's level
 stride: {walk: .74, run: 1.15, runSpeed: 3.2},
 maxStep: 1.5,            // a jump in position larger than this is a teleport, not a stride
 screech: {slip: 2.2, speed: 5, decel: 7.5, decelSpeed: 8, cooldown: 1.4},
 horn: {cooldown: .28}
});

const clamp01 = v => Math.max(0, Math.min(1, v));

export function createSoundscape(bank, {scramble = {x: 6.5, z: 2}} = {}) {
 let beds = null, crossing = null, clock = SCAPE.senseEvery, stepDistance = 0, last = null;
 let lastScreech = -Infinity, lastHorn = -Infinity, lastSpeed = 0, time = 0;
 const stats = {steps: 0, screeches: 0, horns: 0, events: 0, people: 0, cars: 0, crossingOn: false};

 const start = () => {
  if (beds || !bank?.ready) return !!beds;
  beds = {crowd: bank.loop('ambience-scramble'), city: bank.loop('ambience-ginza')};
  crossing = bank.loop('crossing-cuckoo', {x: scramble.x, y: 3.5, z: scramble.z});
  return true;
 };

 return {
  get stats() {return {...stats, playing: !!beds};},
  /**
   * Once a frame in player mode.
   *   ear:    {x, y, z, fx, fz}  the camera and its facing on the ground plane
   *   player: {x, z, alive}      on foot
   *   car:    the player's car state while driving, else null
   *   people: the crowd pool; cars: the traffic pool; pedestrianGreen: the scramble phase
   */
  update(dt, {ear, player = null, car = null, people = null, cars = null, pedestrianGreen = false} = {}) {
   time += dt;
   if (!bank?.ready) return false;
   start();
   if (ear) bank.listen(ear.x, ear.y ?? 1.6, ear.z, ear.fx, ear.fz);

   clock += dt;
   if (clock >= SCAPE.senseEvery && ear) {
    clock = 0;
    let near = 0, moving = 0;
    const r2 = SCAPE.crowdRadius ** 2, c2 = SCAPE.carRadius ** 2;
    if (people) for (const p of people) if (p.active && (p.x - ear.x) ** 2 + (p.z - ear.z) ** 2 < r2) near++;
    if (cars) for (const v of cars) if (v.active && Math.abs(v.speed ?? 0) > 1 && (v.x - ear.x) ** 2 + (v.z - ear.z) ** 2 < c2) moving++;
    stats.people = near; stats.cars = moving;
    const [cf, cc] = SCAPE.bedCrowd, [tf, tc] = SCAPE.bedCity;
    beds?.crowd?.setGain(cf + (cc - cf) * clamp01(near / SCAPE.crowdFull), 1.2);
    beds?.city?.setGain(tf + (tc - tf) * clamp01(moving / SCAPE.carsFull), 1.2);
   }
   if (crossing && stats.crossingOn !== !!pedestrianGreen) {
    stats.crossingOn = !!pedestrianGreen;
    crossing.setGain(stats.crossingOn ? 1 : 0, .35);
   }

   // Footsteps: one per stride of ground actually covered.
   if (player && !car && player.alive !== false) {
    if (last) {
     const d = Math.hypot(player.x - last.x, player.z - last.z), speed = dt > 0 ? d / dt : 0;
     if (d < SCAPE.maxStep) {
      stepDistance += d;
      const run = speed > SCAPE.stride.runSpeed, stride = run ? SCAPE.stride.run : SCAPE.stride.walk;
      if (stepDistance >= stride) {
       stepDistance %= stride;
       if (bank.play('step', {x: player.x, y: .05, z: player.z, gain: run ? 1 : .7})) stats.steps++;
      }
     } else stepDistance = 0;
    }
    last = {x: player.x, z: player.z};
   } else {last = null; stepDistance = 0;}

   // Tyres: a real slide sideways, or a hard stop from speed.
   if (car) {
    const speed = Math.abs(car.speed ?? 0), decel = dt > 0 ? (lastSpeed - speed) / dt : 0;
    const slide = Math.abs(car.lateral ?? 0) > SCAPE.screech.slip && speed > SCAPE.screech.speed;
    const stop = decel > SCAPE.screech.decel && lastSpeed > SCAPE.screech.decelSpeed;
    if ((slide || stop) && time - lastScreech > SCAPE.screech.cooldown &&
        bank.play('screech', {x: car.x, y: .3, z: car.z, gain: clamp01(.55 + speed / 30)})) {
     lastScreech = time; stats.screeches++;
    }
    lastSpeed = speed;
   } else lastSpeed = 0;
   return true;
  },
  /** A feedback-bus event. `who` is the pedestrian it concerns, if any. */
  event(e, who = null) {
   const x = e.x ?? who?.x, z = e.z ?? who?.z, i = e.intensity ?? .7;
   let played = null;
   switch (e.kind) {
    case 'punch_swing': played = bank?.play('swing', {pan: 0, gain: .6 + .4 * i}); break;
    case 'punch_hit': played = bank?.play('punch', {x, y: 1.4, z, gain: .6 + .4 * i}); if (played) bank.duck(.7, .8); break;
    case 'vehicle_impact': played = bank?.play('body', {x, y: .8, z, gain: .5 + .5 * i}); if (played) bank.duck(); break;
    case 'vehicle_runover': played = bank?.play('runover', {x, y: .2, z, gain: .5 + .5 * i}); break;
    // A shoulder at a run is a thud, well under a car's; a walking brush is silent here (the
    // person's own voice, if any, is theirs).
    case 'player_bump': if (i < .8) return false; played = bank?.play('body', {x, y: 1.1, z, gain: .22 + .12 * i}); break;
    default: return false;
   }
   if (played) stats.events++;
   return !!played;
  },
  /** The car hitting something solid. */
  crash(x, z, intensity) {
   const played = bank?.play('crash', {x, y: .6, z, gain: clamp01(intensity)});
   if (played) bank.duck(.35, 2);
   return !!played;
  },
  horn(x, z) {
   if (time - lastHorn < SCAPE.horn.cooldown) return true;          // held, not a new press
   const played = bank?.play('horn', {x, y: 1, z});
   if (played) {lastHorn = time; stats.horns++;}
   return !!played;
  },
  /** Leaving player mode: the beds go, and come back when play resumes. */
  silence() {
   beds?.crowd?.stop(); beds?.city?.stop(); crossing?.stop();
   beds = null; crossing = null; last = null; stats.crossingOn = false;
  }
 };
}
