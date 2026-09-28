// What the crowd notices, decided in one place.
//
// RUN 10. Before this there were two half-answers. `src/life/awareness.mjs` was a RUN 7 WIP
// with good RULES -- stable personality, reaction delay, hysteresis, cooldown -- and the wrong
// STORAGE: it kept per-citizen fields on JS pedestrian objects and walked all ~1,978 of them
// every update. `src/life/hq-threat.mjs` had the right storage -- typed arrays, a spatial grid,
// candidates rather than population -- and no rules at all: pure distance thresholds, the same
// for everybody, applied instantly.
//
// This file is the rules on top of the storage, and it is the ONE authority for awareness
// state. The old WIP is not wired to anything.
//
// WHAT IT NEVER DOES:
//
//   - It never moves anyone. It writes `behaviour` through `crowd.setState` and nothing else.
//     Position, heading, route, crossing membership, queue and signal group all stay exactly
//     where they were, in the pedestrian simulation.
//   - It never scans the population. Every query goes through the crowd grid and is bounded by
//     a radius, so the cost follows local density. A city twice the size costs the same.
//   - It never allocates per citizen. Three extra typed-array slots -- `noticed`, `ready`,
//     `attention` -- live beside `behaviour` and `timer` in the crowd's own state.
//   - It never decides combat, damage or knockdown. Those arrive as events from systems that
//     own them; this decides who NOTICED.
import {STATE} from './hq-crowd.mjs';

export const AWARE=Object.freeze({
 // Nothing further than this is perceived from the player at all. Deliberately smaller than
 // the vehicle system's 14 m look radius: a car is dangerous, a person walking past is not.
 radius:13,
 // Inside this, field of view stops mattering. Someone brushing past your shoulder is noticed
 // whichever way you are facing.
 close:1.9,
 // Facing test, as a dot product against the citizen's heading. Slightly negative so the
 // edge of vision counts, and so a head does not have to be aimed exactly at a threat.
 fov:-.15,
 // How much a citizen behind you still perceives. Not zero -- footsteps exist -- but enough
 // less that walking up behind someone is quieter than walking at their face.
 behindScale:.35,

 // Threat is one number in 0..1. These are the levels at which each state is asked for.
 enter:Object.freeze({look:.14,startle:.36,avoid:.58,flee:.82}),
 // Leaving a state needs the threat to fall this far BELOW the level that entered it, so a
 // citizen standing on a boundary does not flicker between two animations.
 hysteresis:.10,

 // What the player is worth, before distance falloff and personality.
 standing:.20,          // present, and not doing anything
 walking:.30,
 running:.62,
 // ...and what a collision course adds on top. This is the difference between someone
 // running NEAR you and someone running AT you, which is the whole point of step 6.
 collision:.34,
 contactSeconds:1.25,   // time-to-contact under which an approach counts as imminent
 runningSpeed:2.6,      // above this the player is running

 // After a reaction has fully drained, how long before the same citizen can be alarmed again.
 // Without it, a person standing next to a lingering player cycles forever.
 cooldown:1.15,

 // Awareness is not a 60 Hz question. The whole pass runs on this interval; reaction delay is
 // measured in seconds, so a coarser tick does not distort it.
 interval:1/12,

 // Witnessing violence. Kept from RUN 8's `witness`, which this absorbs.
 witnessRadius:11
});

/**
 * Who this person is, derived from their id rather than stored.
 *
 * PORTED FROM THE OLD WIP, deliberately unchanged in shape. The pool is preallocated and
 * recycled, so per-citizen traits cannot live in an object that outlives the citizen; deriving
 * them from the id costs one hash and means a given id is always the same person. The nervous
 * one is reliably the nervous one, in this frame and in the one an hour from now.
 */
/** Witness reactions to a violent event: who reacts now, who reacts later, who only looks. */
export const WITNESS=Object.freeze({
 near:5,            // m: inside this, the whole reaction is immediate
 lookOnly:.8,       // share of the radius beyond which a witness only looks
 delayScale:1.6,    // their personal reaction delay, stretched: seeing, then understanding
 perMetre:.035,     // s per metre of distance
 facingAway:.3,     // s extra when the event was behind them
 maxPending:256
});

export function traitsOf(id){
 let h=Math.imul((id|0)^0x9e3779b9,0x85ebca6b);
 h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h=(h^(h>>>16))>>>0;
 const f=k=>((h>>>(k*5))&31)/31;
 return {
  reactionDelay:.06+f(0)*.34,   // 60-400 ms between noticing and doing anything about it
  lookFor:.45+f(1)*1.15,
  fleeUrgency:.75+f(2)*.5,
  side:f(3)<.5?-1:1,
  nerve:.2+f(4)*.72,            // high nerve needs more threat to react at all
  dawdle:f(5)
 };
}

/**
 * How threatening the player is to one person, in 0..1.
 *
 * Pure, and exported, because it has TWO callers: the mass path below, which reads typed
 * arrays, and the handful of near characters that are drawn with real skeletons and are
 * therefore excluded from the mass crowd entirely. One rule, two storages -- the thing RUN 10
 * exists to prevent is two RULES.
 *
 * Four terms, in order of weight: distance, what the player is doing, whether they are on a
 * COLLISION COURSE, and which way the person is facing. Then nerve moves the bar.
 */
export function playerThreat(player,x,z,heading,id){
 if(!player||player.alive===false)return 0;
 const dx=x-player.x,dz=z-player.z;
 const distance=Math.hypot(dx,dz);
 if(distance>AWARE.radius)return 0;
 const speed=Math.abs(player.speed??0);
 const running=speed>AWARE.runningSpeed;
 let threat=(speed<.15?AWARE.standing:running?AWARE.running:AWARE.walking)
  *(1-distance/AWARE.radius);

 // COLLISION COURSE: closing speed along the line to this person, as a time-to-contact.
 // No path prediction -- one dot product and a divide.
 if(speed>.4&&distance>.001){
  const pdir=player.course??player.heading??0;
  const ux=dx/distance,uz=dz/distance;
  const closing=Math.sin(pdir)*speed*ux+Math.cos(pdir)*speed*uz;
  if(closing>.2){
   const ttc=distance/closing;
   if(ttc<AWARE.contactSeconds)
    threat+=AWARE.collision*(1-ttc/AWARE.contactSeconds)*(running?1:.55);
  }
 }

 // ORIENTATION. Someone behind you is quieter, but not silent, and at arm's length it stops
 // mattering at all.
 if(distance>AWARE.close&&distance>1e-6){
  const facing=Math.sin(heading)*(-dx/distance)+Math.cos(heading)*(-dz/distance);
  if(facing<AWARE.fov)threat*=AWARE.behindScale;
 }

 // PERSONALITY. Nerve raises the bar rather than scaling the threat, so a steady citizen
 // ignores small things entirely instead of reacting slightly to everything.
 threat-=(traitsOf(id).nerve-.5)*.20;
 return threat<0?0:threat>1?1:threat;
}

/** Which state a threat level asks for, ignoring every clock. */
export function wantedFor(threat){
 const e=AWARE.enter;
 return threat>=e.flee?STATE.FLEE:threat>=e.avoid?STATE.AVOID
  :threat>=e.startle?STATE.STARTLE:threat>=e.look?STATE.LOOK:STATE.NORMAL;
}

/** The threat level that a given state was entered at, for the hysteresis test. */
const enteredAt=s=>s===STATE.FLEE?AWARE.enter.flee:s===STATE.AVOID?AWARE.enter.avoid
 :s===STATE.STARTLE?AWARE.enter.startle:s===STATE.LOOK?AWARE.enter.look:0;

/**
 * States awareness must never touch.
 *
 * A glance can never overwrite being hit, knocked down, lying on the ground, or getting back
 * up. RUN 8 and the vehicle threat own those, and the priority is structural rather than
 * checked at each call site: this is the only door awareness has into the state.
 */
const critical=b=>b===STATE.HIT||b===STATE.KNOCKDOWN||b===STATE.DOWNED||b===STATE.RECOVER;

export function createAwareness(){
 const scratch=[];
 const stats={candidates:0,evaluated:0,noticed:0,changed:0,queryMs:0,updateMs:0,witnessMs:0,
  witnessCandidates:0,witnessReacted:0,witnessEscalated:0,passes:0};
 // Awareness keeps its OWN clock. The HQ crowd has no wall time -- `update` is handed a
 // `time` for the shader and nothing stores it -- and cooldowns need a monotonic number that
 // exists whether or not a pass ran this frame.
 let clock=0,world=0,flushClock=0;
 // Witness reactions scheduled for later (RUN 11.3). Bounded: one car through a crowd must not
 // queue the whole population.
 const pending=[];

 /**
  * Decide one citizen's reaction to one threat level, honouring delay, hysteresis, cooldown
  * and priority. Returns true if the state changed.
  *
  * `elapsed` is how long since this citizen was last evaluated, not the frame time: the pass
  * runs at AWARE.interval and the reaction delay is in real seconds.
  */
 function settle(crowd,i,threat,towards,elapsed){
  const s=crowd.state;
  const current=s.behaviour[i];
  if(critical(current))return false;

  let want=wantedFor(threat);

  // Hysteresis, on the way down only. Entering is decided by the threshold above; leaving
  // needs the threat to have fallen clear of the level that got them in.
  if(want<current){
   const held=enteredAt(current);
   if(held&&threat>held-AWARE.hysteresis)want=current;
  }

  // Reaction delay. Until it has elapsed the citizen has noticed nothing -- which is what
  // makes a crowd look like people rather than a row of switches thrown together.
  if(threat>=AWARE.enter.look){
   s.noticed[i]+=elapsed;
   if(s.noticed[i]<traitsOf(s.id[i]).reactionDelay)return false;
   stats.noticed++;
  }else s.noticed[i]=0;

  // Cooling off. `ready` is seconds remaining, counted down by the crowd and set by it when
  // a reaction drains -- this pass never sees that transition, so it cannot own the clock.
  // It stops the SAME reaction coming straight back, which is what a lingering player does.
  // A threat asking for more than the reaction that just drained is new information and
  // gets through: blocking it had a person stroll on while a runner closed six metres.
  if(want>STATE.NORMAL&&s.ready[i]>0&&want<=s.calmed[i])return false;

  if(want===current)return false;
  if(want>STATE.NORMAL)s.attention[i]=towards;
  return crowd.setState(i,want)?(s.attention[i]=towards,true):false;
 }

 const api={
  AWARE,stats,

  /**
   * The player, as something to notice.
   *
   * Bounded by `grid.near`, so the work is the people around the player and not the city.
   * Four things decide the threat, in this order of importance:
   *
   *   distance      -- linear falloff to nothing at AWARE.radius
   *   what they are doing -- standing, walking, or running
   *   COLLISION COURSE    -- running near you and running AT you are different events, and
   *                          the difference is a bounded time-to-contact, not a path search
   *   orientation   -- in front is louder than behind, except at arm's length
   *
   * then personality raises or lowers the bar, and `settle` applies the clocks.
   */
  update(crowd,grid,player,dt){
   world+=Math.max(0,dt);
   if(!crowd?.population||!grid)return stats;
   clock+=Math.max(0,dt);
   if(clock<AWARE.interval)return stats;
   const elapsed=clock;clock=0;
   const start=(typeof performance!=='undefined'?performance.now():0);
   stats.passes++;stats.candidates=0;stats.evaluated=0;stats.changed=0;stats.queryMs=0;

   if(!player||player.alive===false){
    stats.updateMs=(typeof performance!=='undefined'?performance.now():0)-start;
    return stats;
   }
   const queryStart=(typeof performance!=='undefined'?performance.now():0);
   grid.near(player.x,player.z,AWARE.radius,scratch);
   stats.queryMs=(typeof performance!=='undefined'?performance.now():0)-queryStart;
   stats.candidates=scratch.length;

   const s=crowd.state;
   for(const i of scratch){
    if(critical(s.behaviour[i]))continue;
    const dx=s.x[i]-player.x,dz=s.z[i]-player.z;
    if(Math.hypot(dx,dz)>AWARE.radius)continue;
    stats.evaluated++;
    const threat=playerThreat(player,s.x[i],s.z[i],s.heading[i],s.id[i]);
    if(settle(crowd,i,threat,Math.atan2(-dx,-dz),elapsed))stats.changed++;
   }
   stats.updateMs=(typeof performance!=='undefined'?performance.now():0)-start;
   return stats;
  },

  /**
   * Something violent happened here.
   *
   * RUN 8 raised witness events and `hq-layer` turned them into reactions with its own copy
   * of the nerve rule. That decision now lives here, so there is one place that says what a
   * crowd does about something, and witnesses get the same personality, the same priority and
   * the same recovery as everyone else.
   *
   * The spread is the point: at one distance some people look, some startle, some step away
   * and the nervous ones run. A chorus would read as a script.
   */
  witness(crowd,grid,{x,z,severity=.7,radius=AWARE.witnessRadius,kind='melee'}={},{rebuilt=false}={}){
   if(!crowd?.population||!grid)return 0;
   const start=(typeof performance!=='undefined'?performance.now():0);
   // RUN 12.0: the HQ layer passes `rebuilt` when the grid already matches this frame, so a
   // burst of witness events shares one O(population) rebuild instead of paying one each.
   if(!rebuilt)grid.rebuild(crowd);
   grid.near(x,z,radius,scratch);
   stats.witnessCandidates=scratch.length;
   const s=crowd.state;
   let reacted=0;
   for(const i of scratch){
    if((critical(s.behaviour[i])&&s.behaviour[i]!==STATE.RECOVER)||
       s.behaviour[i]===STATE.FLEE)continue;
    const dx=s.x[i]-x,dz=s.z[i]-z;
    const distance=Math.hypot(dx,dz);
    if(distance>radius)continue;
    const t=traitsOf(s.id[i]);
    // Violence carries further than a person walking past, and it is heard as well as seen,
    // so orientation counts for less here than it does for the player.
    const facing=distance>1e-6
     ?Math.sin(s.heading[i])*(-dx/distance)+Math.cos(s.heading[i])*(-dz/distance):1;
    let threat=severity*(1-distance/radius)/t.nerve;
    if(distance>AWARE.close&&facing<AWARE.fov)threat*=.72;
    let want=wantedFor(Math.min(1,threat));
    if(want===STATE.NORMAL)continue;
    // RUN 11.3: close by, a witness reacts at once -- they were right there. Further out they
    // LOOK first and the rest of the reaction arrives after their own reaction delay, later the
    // further away and later again if they were facing away; so a street does not break into a
    // run on one frame. The far edge only ever looks.
    const escalate=want>STATE.LOOK&&distance>WITNESS.near;
    if(escalate&&distance>radius*WITNESS.lookOnly)want=STATE.LOOK;
    const now=escalate&&want>STATE.LOOK?STATE.LOOK:want;
    if((now>s.behaviour[i]||s.behaviour[i]===STATE.RECOVER&&now>=STATE.AVOID)
       &&crowd.setState(i,now)){
     // A witness reacts through their cooldown: seeing violence is not the same as noticing
     // the same passer-by twice.
     s.attention[i]=Math.atan2(-dx,-dz);s.ready[i]=0;reacted++;
    }
    if(escalate&&want>STATE.LOOK&&pending.length<WITNESS.maxPending){
     const delay=t.reactionDelay*WITNESS.delayScale+distance*WITNESS.perMetre+(facing<AWARE.fov?WITNESS.facingAway:0);
     pending.push({id:s.id[i],at:flushClock+delay,want,towards:Math.atan2(-dx,-dz),kind});
    }
   }
   stats.witnessReacted=reacted;
   stats.witnessMs=(typeof performance!=='undefined'?performance.now():0)-start;
   return reacted;
  },

  /**
   * Deliver the witness reactions that were waiting on a reaction delay. Called every frame by
   * the layer with its own dt, so it runs whether or not the player is being perceived.
   */
  flush(crowd,dt=0){
   flushClock+=Math.max(0,dt);
   if(!pending.length)return 0;
   let n=0;
   for(let k=pending.length-1;k>=0;k--){
    const e=pending[k];if(e.at>flushClock)continue;
    pending.splice(k,1);
    const i=crowd.indexOf(e.id);if(i<0)continue;
    const b=crowd.state.behaviour[i];
    if(critical(b)&&b!==STATE.RECOVER)continue;
    if(e.want>b&&crowd.setState(i,e.want)){crowd.state.attention[i]=e.towards;n++;}
   }
   stats.witnessEscalated+=n;
   return n;
  },
  get pending(){return pending.length;},

  inspect(){return {...stats,pending:pending.length,
   queryMs:Number(stats.queryMs.toFixed(3)),
   updateMs:Number(stats.updateMs.toFixed(3)),witnessMs:Number(stats.witnessMs.toFixed(3))};},
  get time(){return world;},
  reset(){clock=0;}
 };
 return api;
}
