// The police, frame by frame: what the player did, what the police know, and what they sound and
// look like (PLAN-POLICE-AND-OWN-CAR W1 and W3). The scene hands this one object the systems it
// already has; the rules live in wanted.mjs and siren.mjs, which are pure.
import {createWanted,WANTED} from './wanted.mjs';
import {createSirens,createLoudspeaker,createMegaphone,createOfficerVoice,MEGAPHONE} from './siren.mjs';
import {createPoliceClips} from './voice-clips.mjs';
import {createDispatch} from './dispatch.mjs';
import {createPoliceUnits} from './units.mjs';
import {createPoliceGuns} from './guns.mjs';
import {createHelicopter} from './helicopter.mjs';
import {createRotor} from '../audio/rotor.mjs';
import {lineOfSight} from '../player/ballistics.mjs';

/** What counts as a weapon out, or a weapon kill: the guns (the submachine gun since §9ah) and the katana. */
export const WEAPON_IDS = new Set(['pistol', 'smg', 'katana']);
// Roadmap ④: an officer who fired at the player is marked (`shotAtPlayerLeft`, s) so the pad's
// lock-on takes them first (arsenal.mjs `threatTier`).
export const SHOOTER_MEMORY = 6;

// Roadmap ②: a round that hits the player's car. Most go on into the cabin (`cabin`), more once
// the car is battered (`damage` over `batteredAt`: the glass gone, the panels holed), and wound the
// driver for `damage` of a round in the open -- so a car lasts a little longer than the motorbike
// (about 1.6x the hits new, 1.2x battered), not for ever. Every hit still batters the car.
export const CAR_ROUNDS = Object.freeze({cabin: .7, batteredCabin: .9, batteredAt: .5, damage: .9, carDamage: .02});
/** Whether the `n`th round into the car reaches the cabin. Deterministic over `n`. */
export function intoCabin(n, carDamage = 0) {
 let h = Math.imul((n | 0) + 0x51ed27, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13;
 return (h >>> 0) / 4294967296 < (carDamage >= CAR_ROUNDS.batteredAt ? CAR_ROUNDS.batteredCabin : CAR_ROUNDS.cabin);
}
import {VEHICLES} from '../traffic/config.mjs';

/**
 * PLAN-POLICE-VOICE-KAZE-DETAIL Step V2: the loudspeaker is the formant-synthesised megaphone by
 * default. `speechSynthesis` (`createLoudspeaker`) is kept only for an `?voice=tts` comparison
 * run; a plain Node environment has no `location`, so this reads false there, never throws.
 */
const useTTS = () => {
 try {return new URLSearchParams(location.search).get('voice') === 'tts';} catch {return false;}
};

/** Is this traffic slot a police vehicle (patrol car, unmarked car, riot transport)? */
export const isPolice = v => !!VEHICLES[v?.type]?.police;

export const POLICE = Object.freeze({
 respondRange: 300,        // m: patrol cars this close run their sirens while the player is wanted
 witnessRange: 25,         // m: civilians this close to a fight see it
 ramSpeed: 2,              // m/s: slower than this, touching a patrol car is not ramming it
 ramRepeat: 3,             // s between two rams counting twice
 speakRange: 35,           // m: the loudspeaker is used when a siren car is this close
 gunfireRange: 40,         // m: civilians this close hear a shot (PLAN-WEAPONS R14)
 crouchSight: .55,         // PLAN-WEAPONS W4: a crouching player is seen from this share of the range
 // W4 balance: while wanted, a crowd bump may start a fight only while fewer than this many
 // civilians are already fighting the player. Police plus a mob made a dense Scramble unwinnable.
 bumpFightCap: 2
});

/** How far the police see the player (PLAN-WEAPONS W4): shorter while crouched on foot. */
export function sightRange(player, driving = false) {
 return !driving && player?.crouching ? WANTED.sightRange * POLICE.crouchSight : WANTED.sightRange;
}

/** May a bump start one more civilian fight? Pure; `stars` is the wanted level. */
export function allowBumpFight(stars, pool, time, cap = POLICE.bumpFightCap) {
 if (!stars) return true;
 let n = 0;
 for (const p of pool ?? []) if (p.active && !p.officer && !p.combatDead && p.combatTarget === 'player' && p.combatUntil > time && ++n >= cap) return false;
 return true;
}

/**
 * Patrol cars that can see a point: in the traffic pool, not the player's, within sight range,
 * and -- given the wall test `solid` -- with no building between them (PLAN-WEAPONS R9, which
 * also closes §9s's "the police see through walls"). Without `solid` it is the old radius.
 */
export function officersSee(pool, x, z, except = null, range = WANTED.sightRange, solid = null) {
 for (const v of pool ?? []) {
  if (!v.active || !isPolice(v) || v === except) continue;
  if (Math.hypot(v.x - x, v.z - z) > range) continue;
  if (solid && !lineOfSight(solid, v, {x, z}, {skipStart: 2.6})) continue;
  return true;
 }
 return false;
}

/** Officers on foot who can see a point (with `solid`, only over a clear line). */
export function officersOnFootSee(officers, x, z, range = WANTED.sightRange, solid = null) {
 for (const p of officers ?? []) {
  if (!p.active || p.combatDead || Math.hypot(p.x - x, p.z - z) > range) continue;
  if (solid && !lineOfSight(solid, p, {x, z})) continue;
  return true;
 }
 return false;
}

export function createPoliceDirector({getAudioContext = () => null, getAudioBus = () => null, koban = /** @type {{x:number,z:number}|null} */ (null),
                                      speech = globalThis.speechSynthesis,
                                      Utterance = globalThis.SpeechSynthesisUtterance,
                                      clips = /** @type {any} */ (null)} = {}) {
 const wanted = createWanted();
 // Roadmap ①: the recorded lines (loudspeaker, shouts, the dispatcher), loaded on first use.
 const voiceClips = clips ?? createPoliceClips(getAudioContext);
 const dispatch = createDispatch(getAudioContext, getAudioBus, voiceClips);
 const units = createPoliceUnits(koban ? {koban} : {});
 let lastBlowAt = -1;
 const sirens = createSirens(getAudioContext, getAudioBus);
 const megaphone = createMegaphone(getAudioContext, getAudioBus, {clips: voiceClips});
 // PLAN-WEAPONS W3: the officers' revolvers and their own (unamplified) voices.
 const guns = createPoliceGuns();
 const voice = createOfficerVoice(getAudioContext, getAudioBus, {clips: voiceClips});
 // Roadmap stage 3: at ☆4 and up, a helicopter with a searchlight, and its rotor.
 const heli = createHelicopter(), rotor = createRotor(getAudioContext, getAudioBus);
 const speaker = createLoudspeaker(speech, Utterance);
 const ttsMode = useTTS();
 let lastPoliceHit = -Infinity, carRounds = 0;
 let deaths = 0, lastRam = -Infinity, taken = new WeakSet(), time = 0, shotsSeen = 0, lastShooting = -Infinity, gunShotsSeen = 0, worldSolid = null;
 const runovers = new Set();
 const sources = [];

 const api = {
  wanted, sirens, units, megaphone, guns, voice, heli, dispatch, clips: voiceClips,
  /** A carjack finished; an officer nearby makes it a crime. */
  carjack(slot, traffic) {
   if (!slot) return;
   wanted.crime('carjack', {x: slot.x, z: slot.z, t: time, seenByOfficer: officersSee(traffic?.pool, slot.x, slot.z, slot, undefined, worldSolid)});
  },
  /**
   * One frame. `player` is the on-foot state, `car` the player's vehicle object (or null),
   * `driving` whether the player is in it, `melee` the combat stats, `traffic` / `crowd` the sims.
   */
  frame(dt, {player, car = null, driving = false, melee = null, traffic = null, crowd = null, listener = null,
              visible = () => false, hurt = null, weapons = null, solid = null, attackingNow = null,
              night = false, ground = null, covered = null}) {
   time += dt; worldSolid = solid;
   const me = driving && car ? car.state : player;
   const pool = traffic?.pool ?? [];
   const except = car?.state?.slot ?? null;

   // --- crimes -----------------------------------------------------------------------------
   const killed = melee?.npcDeaths ?? 0;
   if (killed < deaths) deaths = killed;          // combat was reset (a respawn)
   while (deaths < killed) {
    deaths++;
    let witnesses = 0;
    for (const p of crowd?.pool ?? []) {
     if (!p.active || p.combatDead || p.fatal) continue;
     if (Math.hypot(p.x - player.x, p.z - player.z) <= POLICE.witnessRange && ++witnesses >= 3) break;
    }
    // PLAN-WEAPONS §2: a kill with a gun or the katana is a weapon kill (at least ☆2).
    const armed = WEAPON_IDS.has(melee?.lastBlow?.weapon);
    wanted.crime(armed ? 'weaponKill' : 'meleeKill', {x: player.x, z: player.z, t: time, witnesses,
     seenByOfficer: officersSee(pool, player.x, player.z, except, undefined, solid) || officersOnFootSee(units.officers, player.x, player.z, undefined, solid)});
   }
   // Gunfire (PLAN-WEAPONS §2): heard by everyone near, reported like any other crime, or known at
   // once if an officer is in sight. One report per burst.
   const shots = weapons?.shots ?? 0;
   if (shots < shotsSeen) shotsSeen = shots;
   if (shots > shotsSeen) {
    shotsSeen = shots;
    if (time - lastShooting > 3) {
     lastShooting = time;
     let witnesses = 0;
     for (const p of crowd?.pool ?? []) {
      if (!p.active || p.combatDead || p.fatal || p.officer) continue;
      if (Math.hypot(p.x - player.x, p.z - player.z) <= POLICE.gunfireRange && ++witnesses >= 3) break;
     }
     wanted.crime('shooting', {x: player.x, z: player.z, t: time, witnesses,
      seenByOfficer: officersSee(pool, player.x, player.z, except, undefined, solid) || officersOnFootSee(units.officers, player.x, player.z, undefined, solid)});
    }
   }
   // A drawn weapon in an officer's sight: ☆1, once.
   const drawn = !driving && WEAPON_IDS.has(weapons?.current);
   if (drawn && wanted.state.stars < 1 && (officersSee(pool, player.x, player.z, except, undefined, solid) || officersOnFootSee(units.officers, player.x, player.z, undefined, solid)))
    wanted.crime('weaponSeen', {x: player.x, z: player.z, t: time, seenByOfficer: true});
   for (const e of car?.impacts ?? []) {
    if (e.kind !== 'runover' || runovers.has(e.id)) continue;
    runovers.add(e.id);
    wanted.crime('runoverKill', {x: e.x, z: e.z, t: time, id: 100000 + e.id});
   }
   if (driving && car?.state?.slot && isPolice(car.state) && !taken.has(car.state.slot)) {
    taken.add(car.state.slot);
    wanted.crime('policeCarTaken', {x: car.state.x, z: car.state.z, t: time});
   }
   // Blows on an officer (W2): assault, or a kill.
   const blow = melee?.lastBlow;
   if (blow && blow.time !== lastBlowAt) {
    lastBlowAt = blow.time;
    const victim = crowd?.pool?.[blow.victim];
    if (victim?.officer) wanted.crime(blow.fatal ? 'officerKill' : 'officerAssault', {x: victim.x, z: victim.z, t: time});
   }
   const rammed = car?.state?.rammed;
   if (rammed) {
    car.state.rammed = null;
    if (isPolice(rammed) && Math.abs(car.state.speed ?? 0) >= POLICE.ramSpeed && time - lastRam >= POLICE.ramRepeat) {
     lastRam = time;
     wanted.crime('policeRam', {x: car.state.x, z: car.state.z, t: time});
    }
   }

   // --- what the police know --------------------------------------------------------------
   // W4: sneaking -- crouched on foot, the police see the player from a little over half as far.
   const sight = sightRange(player, driving);
   const ground0 = officersSee(pool, me.x, me.z, except, sight, solid) || officersOnFootSee(units.officers, me.x, me.z, sight, solid);
   // Stage 3: the helicopter's crew see from above -- in the searchlight at night, near by day.
   const h = heli.update(dt, {stars: wanted.state.stars, me, seen: ground0, lastSeen: wanted.state.lastSeen, night,
    ground: ground ?? (() => 0), covered: covered ?? (() => false)});
   const seen = ground0 || h.sees;
   rotor.update(h, listener ?? {x: me.x, z: me.z});
   let snap = wanted.update(dt, {x: me.x, z: me.z, t: time, seen});
   // Owner's plan, item 2: shot dead by the police is the arrest (the only way to be taken).
   let shotDead = false;
   if (player && player.alive === false && snap.stars) {shotDead = time - lastPoliceHit <= 1.5; wanted.clear(shotDead ? 'arrested' : 'death');}

   // --- units (W2) ----------------------------------------------------------------------------
   const attacking = !!melee && melee.phase !== undefined && melee.phase !== 'idle';
   const u = units.update(dt, {stars: wanted.state.stars, traffic, crowd, me, visible, attacking, driving,
    carSpeed: car?.state?.speed ?? 0, alive: player?.alive !== false, hurt: amount => {lastPoliceHit = time; hurt?.(amount, 'police');}});
   let arrested = shotDead;
   if (u.result === 'arrested') {arrested = true; wanted.clear('arrested');}
   if (arrested) snap = wanted.snapshot();

   // --- revolvers (PLAN-WEAPONS W3) ----------------------------------------------------------
   // ☆3 and up: officers draw; the first round is a warning shot with 「撃つぞ！」; after it they
   // fire only at a threat (a drawn weapon, an attack, a ram), never without a clear line (R9).
   const armed = WEAPON_IDS.has(weapons?.current);
   const shotNow = (weapons?.shots ?? 0) > gunShotsSeen; gunShotsSeen = weapons?.shots ?? 0;
   const threat = {armed, ramming: time - lastRam < .5,
    attacking: (attackingNow ?? attacking) || shotNow};
   const gunfire = guns.update(dt, {officers: units.officers, me: {x: me.x, z: me.z, y: me.y ?? 0, dodging: !driving && !!player?.dodging}, stars: wanted.state.stars,
    solid: solid ?? (() => false), threat, driving, alive: player?.alive !== false && !arrested});
   for (const e of gunfire) {
    const p = e.officer;
    if (e.kind === 'shout') voice.shout(e.line, p.id, p.x, p.z, time);
    if (e.kind === 'warn' || e.kind === 'shot') {p.gunShotLeft = .633; p.shotAtPlayerLeft = SHOOTER_MEMORY;}
    if (e.kind === 'shot' && e.hit) {
     // A car takes the round, and most go on into the cabin (roadmap ②); a motorbike's rider does
     // not have one round them (stage 6).
     if (driving && car?.state && !VEHICLES[car.state.type]?.twoWheel) {
      const before = car.state.damage ?? 0;
      car.state.damage = Math.min(1, before + CAR_ROUNDS.carDamage);
      e.car = true; e.cabin = intoCabin(++carRounds, before);
      if (e.cabin) {e.damage = Math.max(1, Math.round(e.damage * CAR_ROUNDS.damage)); lastPoliceHit = time; hurt?.(e.damage, 'police', {cabin: true});}
     } else {lastPoliceHit = time; hurt?.(e.damage, 'police');}
    }
   }
   for (const p of units.officers) {
    if (p.gunShotLeft > 0) p.gunShotLeft = Math.max(0, p.gunShotLeft - dt);
    if (p.shotAtPlayerLeft > 0) p.shotAtPlayerLeft = Math.max(0, p.shotAtPlayerLeft - dt);
   }
   if (!wanted.state.stars) guns.clear();

   // --- sirens and lamps --------------------------------------------------------------------
   sources.length = 0;
   const responding = wanted.state.stars > 0;
   for (const v of pool) {
    if (!v.active || !isPolice(v)) continue;
    if (v === except) {
     // The player's own patrol car runs its siren only when they switch it on (H).
     v.siren = !!car?.state?.siren && driving;
    } else v.siren = responding && Math.hypot(v.x - me.x, v.z - me.z) <= POLICE.respondRange;
    if (v.siren) {
     const speed = v === except ? car.state.speed ?? 0 : v.speed ?? 0;
     sources.push({id: v.id, x: v.x, z: v.z, vx: Math.sin(v.heading) * speed, vz: Math.cos(v.heading) * speed, mode: 'wail'});
    }
   }
   const ear = listener ?? {x: me.x, z: me.z, vx: 0, vz: 0};
   sirens.update(dt, sources, ear);

   // --- loudspeaker (Step V2) -----------------------------------------------------------------
   if (ttsMode) {
    if (responding && sources.some(s => s.id !== except?.id && Math.hypot(s.x - me.x, s.z - me.z) <= POLICE.speakRange))
     speaker.say(driving ? '前の車、止まりなさい' : 'そこの人、止まりなさい', time);
   } else {
    const near = sources.filter(s => s.id !== except?.id && Math.hypot(s.x - me.x, s.z - me.z) <= MEGAPHONE.range);
    // Roadmap ①: 「被疑者確保！」 and 「動くな！」 are an officer's own shouts (the nearest officer, or
    // the nearest car when none is on foot); the loudspeaker addresses a car, a motorbike or a
    // person on foot in the words used for each.
    const nearestOfficer = [...units.officers].filter(p => p.active && !p.combatDead)
     .reduce((a, p) => (!a || Math.hypot(p.x - me.x, p.z - me.z) < Math.hypot(a.x - me.x, a.z - me.z) ? p : a), null);
    if (arrested) {
     // Outside the gap rule, once per arrest.
     const who = nearestOfficer ?? near[0] ?? sources[0];
     if (who) voice.shout('arrest', who.id, who.x, who.z, time, {force: true});
    } else if (responding && near.length) {
     const car0 = near.reduce((a, b) =>
      Math.hypot(a.x - me.x, a.z - me.z) <= Math.hypot(b.x - me.x, b.z - me.z) ? a : b);
     const officerClose = !driving && nearestOfficer && Math.hypot(nearestOfficer.x - me.x, nearestOfficer.z - me.z) <= 3;
     if (officerClose || units.arrest.foot > 0) {
      const who = nearestOfficer ?? car0;
      voice.shout('freeze', who.id, who.x, who.z, time);
     } else if (driving) {
      const stopped = Math.abs(car?.state?.speed ?? 0) < 1.5, bike = !!VEHICLES[car?.state?.type]?.twoWheel;
      const situations = stopped && units.arrest.car > 0 ? ['getOut'] : bike ? ['stopBike'] : ['stopCar'];
      megaphone.speak(situations, car0.id, car0.x, car0.z, time, {duck: sirens.duck});
     } else {
      megaphone.speak(['chase', 'stop'], car0.id, car0.x, car0.z, time, {duck: sirens.duck});
     }
    }
   }
   // --- the dispatcher (roadmap ①) --------------------------------------------------------------
   const radio = dispatch.update({stars: wanted.state.stars, driving, heli: !!h?.active, armed,
    seen: wanted.state.seen, escape: wanted.state.escape}, time);
   return {...snap, arrested, units: {cars: u.cars, officers: u.officers, yielded: u.yielded}, gunfire, heli: h, radio};
  },
  /** H in a patrol car: siren and lamps on or off. Returns false if this car has none. */
  toggleSiren(car) {
   if (!car?.state || !isPolice(car.state)) return false;
   car.state.siren = !car.state.siren;
   return true;
  },
  clear(reason) {wanted.clear(reason); guns.clear();},
  /** W4: the crowd-bump fight cap, for the scene's bump callback. */
  allowBumpFight(crowd) {return allowBumpFight(wanted.state.stars, crowd?.pool, crowd?.time ?? 0);},
  dispose(traffic, crowd) {rotor.stop();heli.reset();sirens.dispose(); megaphone.dispose(); voice.dispose(); dispatch.dispose(); units.dispose(traffic, crowd);}
 };
 return api;
}
