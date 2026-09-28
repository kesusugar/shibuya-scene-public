/**
 * DEPRECATED / NOT PRODUCTION. Historical RUN 7 experiment retained for its old tests;
 * RUN 10 production awareness lives exclusively in hq-awareness.mjs.
 * Do not import this module into the scene or start a second awareness authority.
 *
 * What a pedestrian notices, and how long it stays noticed.
 *
 * RUN 7. The crowd already had one reaction: an oncoming car, computed in
 * `src/player/pedestrian-threat.mjs`, which sets `trafficReaction` and calls `scatter`. That
 * is a good reaction and this module does not replace it -- it reads it as one input among
 * several, so a citizen dodging a car and a citizen watching a fight are the same state
 * machine rather than two systems fighting over the same body.
 *
 * What this adds is everything that is not a car: the player walking past, the player running
 * at them, a fight nearby, a body on the ground, and the reaction of the person beside them.
 *
 * THREE THINGS THIS DELIBERATELY IS NOT:
 *
 * 1. **It does not move anyone.** Movement ownership stays exactly where it was. The only
 *    motion primitive used is `crowd.scatter`, which the threat system already used and which
 *    knows about crossings, choreography and struck bodies. Nothing here touches `p.crossing`,
 *    `p.edge`, `p.route` or the signal groups, because a pedestrian who abandons a crossing
 *    without releasing its group freezes every signal on the map. That has happened before.
 *
 * 2. **It has no global trigger.** Alarm spreads cell by cell and decays, and a neighbour's
 *    alarm is capped well below the level that causes flight, so it can make someone look
 *    round but never, on its own, make a street run. A crowd of two thousand reacting at once
 *    to one punch is the failure mode this shape exists to prevent.
 *
 * 3. **It is not an AI framework.** Seven states, a threat number, and a clock.
 */

/** The states a citizen can be in, beyond the movement states the simulation already owns. */
export const LIFE=Object.freeze({
 CALM:'calm',LOOK:'look',STARTLE:'startle',AVOID:'avoid',FLEE:'flee',RECOVER:'recover'
});

export const AWARENESS=Object.freeze({
 // Nothing beyond `far` is perceived at all, and only inside `near` is perception run at the
 // full rate. Both are well inside the near-character radius, so the states that cost
 // anything to display are the only ones being computed often.
 near:18,far:34,
 nearInterval:1/15,farInterval:1/3,

 // What each state costs in threat to enter. Leaving one needs the threat to fall a further
 // `hysteresis` below the threshold, so a citizen on a boundary does not flicker.
 enter:{look:.12,startle:.30,avoid:.52,flee:.76},
 hysteresis:.09,

 // Minimum time in a state before anything can replace it, including a calmer one. Escalation
 // is exempt: someone who is looking at a car and then hears a fight behind them should not
 // have to finish looking first.
 hold:{look:.40,startle:.50,avoid:.75,flee:1.30,recover:.85},
 // After recovering, how long before the same citizen can be alarmed again. Without it a
 // person standing next to a lingering danger cycles startle/recover forever.
 cooldown:1.10,

 // Local propagation. A citizen who startles raises the alarm in their own grid cell; their
 // neighbours read it, scaled by how easily frightened they are, and it decays. The cap is
 // the important number: it sits below `enter.avoid`, so second-hand alarm can turn a head
 // but cannot start a stampede.
 alarmRaise:.55,alarmDecay:1.5,alarmCap:.34,

 // Perception ranges for the things that are not cars.
 playerNear:4.2,playerRun:2.6,combat:9,downed:7
});

/**
 * Who this person is, derived from their id rather than stored.
 *
 * The pool is preallocated and recycled, so per-citizen traits cannot live in an object that
 * outlives the citizen. Deriving them from the id costs one hash and means a given id is
 * always the same person: the nervous one is reliably nervous.
 */
export function traitsOf(id){
 let h=Math.imul((id|0)^0x9e3779b9,0x85ebca6b);
 h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h=(h^(h>>>16))>>>0;
 const f=k=>((h>>>(k*5))&31)/31;
 return {
  reactionDelay:.06+f(0)*.34,   // 60-400 ms before a noticed thing becomes a reaction
  lookFor:.45+f(1)*1.15,        // how long they keep watching
  fleeUrgency:.75+f(2)*.5,
  side:f(3)<.5?-1:1,            // which way they step out of the way
  nerve:.2+f(4)*.72,            // high nerve = needs more threat, catches less alarm
  dawdle:f(5)                   // idle pause variation
 };
}

const clamp01=v=>v<0?0:v>1?1:v;

// Alarm's own spatial grid. It deliberately does not borrow the simulation's `cell`: this
// module should work against any object that can list its people, and a crowd stub in a test
// that has no grid is not a reason for perception to throw.
const CELL=2;
const cellKey=(x,z)=>Math.floor(x/CELL)+','+Math.floor(z/CELL);

/** Which state a threat level asks for, ignoring every clock. */
function wanted(threat){
 const e=AWARENESS.enter;
 return threat>=e.flee?LIFE.FLEE:threat>=e.avoid?LIFE.AVOID
  :threat>=e.startle?LIFE.STARTLE:threat>=e.look?LIFE.LOOK:LIFE.CALM;
}
const RANK={calm:0,recover:0,look:1,startle:2,avoid:3,flee:4};

export function createAwareness(){
 // Alarm lives per grid cell, not per person: it is a property of a place, and a place is
 // what a bystander shares with the person who startled.
 const alarm=new Map();
 const stats={perceived:0,reacting:0,byState:{},alarmCells:0,updateMs:0};
 let decayClock=0;

 /** Everything frightening at one moment, gathered once instead of per citizen. */
 function gather(crowd,focus,player){
  const events=[];
  if(player&&player.alive!==false){
   const speed=Math.abs(player.speed??0);
   events.push({x:player.x,z:player.z,
    // A person walking past is barely noticed; one sprinting at you is the whole street.
    radius:speed>2.6?AWARENESS.playerRun+speed*.9:AWARENESS.playerNear,
    weight:speed>2.6?.62:.22,kind:'player',heading:player.heading});
   if(player.attackTime>0)events.push({x:player.x,z:player.z,radius:AWARENESS.combat,weight:.78,kind:'combat'});
  }
  // A fight or a body is a property of the crowd, so it is read from the crowd rather than
  // pushed in from outside -- anything that downs a citizen is seen, whatever caused it.
  for(const p of crowd.pool){
   if(!p.active)continue;
   if(p.struck!==undefined||p.combatDead)
    events.push({x:p.x,z:p.z,radius:AWARENESS.downed,weight:.58,kind:'downed'});
   else if(p.combatTarget&&(p.combatAction??0)>.05)
    events.push({x:p.x,z:p.z,radius:AWARENESS.combat,weight:.5,kind:'combat'});
  }
  return events;
 }

 return {
  get alarmCells(){return alarm.size;},
  stats,
  /**
   * @param crowd  the CrowdSimulation
   * @param focus  where the camera cares about -- the player, or null when not in player mode
   * @param player the player's state, used as a perception source (may be the same object)
   */
  update(crowd,focus,player,dt){
   if(!crowd||!focus)return stats;
   const start=(typeof performance!=='undefined'?performance.now():0);
   const now=crowd.time??0;

   decayClock+=dt;
   if(decayClock>=.1){
    const fade=Math.exp(-AWARENESS.alarmDecay*decayClock);decayClock=0;
    for(const [cell,value] of alarm){
     const next=value*fade;
     if(next<.02)alarm.delete(cell);else alarm.set(cell,next);
    }
   }

   const events=gather(crowd,focus,player);
   let perceived=0,reacting=0;
   const byState={};

   for(const p of crowd.pool){
    if(!p.active||p.controlled||p.struck!==undefined||p.combatDead)continue;
    const distance=Math.hypot(p.x-focus.x,p.z-focus.z);
    if(distance>AWARENESS.far){
     // Out of range: forget, so nobody re-enters the radius still mid-reaction from minutes
     // ago. This is the only place a state is dropped without its hold elapsing.
     if(p.lifeState&&p.lifeState!==LIFE.CALM){p.lifeState=LIFE.CALM;p.lifeUntil=0;}
     continue;
    }
    // Distance-based rate. Staggering by id stops the whole far band landing on one frame.
    const interval=distance<=AWARENESS.near?AWARENESS.nearInterval:AWARENESS.farInterval;
    p.lifeClock=(p.lifeClock??((p.id%17)/17)*interval)+dt;
    if(p.lifeClock<interval)continue;
    const elapsed=p.lifeClock;p.lifeClock=0;
    perceived++;

    const traits=traitsOf(p.id);
    let threat=0,towards=p.lifeThreatHeading??p.heading;

    for(const e of events){
     const d=Math.hypot(p.x-e.x,p.z-e.z);
     if(d>e.radius)continue;
     // Linear falloff. A curve would be prettier and would not change any decision here.
     const level=e.weight*(1-d/e.radius);
     if(level>threat){threat=level;towards=Math.atan2(e.x-p.x,e.z-p.z);}
    }

    // The car threat is an input, not a competitor. Its own reaction words map onto the
    // same scale so that one machine decides what the body does.
    if(p.reactionUntil>now&&p.trafficReaction){
     const level=p.trafficReaction==='look'?.2:p.trafficReaction==='escape'?.72
      :p.trafficReaction==='guard'?.82:.55;
     if(level>threat){threat=level;towards=p.threatHeading??towards;}
    }

    // Second-hand alarm, capped so it can never reach `enter.avoid` on its own.
    //
    // Read across the citizen's own cell and the eight around it. The cell alone is two
    // metres, which is close enough to be the same person rather than the person beside
    // them; the ring is about six metres, which is roughly how far you notice someone flinch.
    // It is still a fixed nine lookups per citizen, so widening it cost nothing.
    let heard=0;
    for(let ox=-1;ox<=1;ox++)for(let oz=-1;oz<=1;oz++){
     const value=alarm.get(cellKey(p.x+ox*CELL,p.z+oz*CELL));
     if(value!==undefined&&value>heard)heard=value;
    }
    if(heard>0)threat=Math.max(threat,Math.min(AWARENESS.alarmCap,heard*(1.25-traits.nerve)));

    // Nerve raises the bar rather than scaling the threat, so a brave citizen ignores small
    // things entirely instead of reacting slightly to everything.
    threat=clamp01(threat-(traits.nerve-.5)*.18);

    const current=p.lifeState??LIFE.CALM;
    let target=wanted(threat);
    // Hysteresis on the way down only: entering is decided above, leaving needs the threat to
    // have fallen clear of the threshold it came in on.
    if(RANK[target]<RANK[current]&&current!==LIFE.RECOVER){
     const held=AWARENESS.enter[current];
     if(held!==undefined&&threat>held-AWARENESS.hysteresis)target=current;
    }

    if(threat>=AWARENESS.enter.look){
     // A reaction delay is what makes a crowd look like people rather than a switch. Until it
     // elapses the citizen has noticed nothing.
     p.lifeNoticed=(p.lifeNoticed??0)+elapsed;
     if(p.lifeNoticed<traits.reactionDelay)target=current;
    }else p.lifeNoticed=0;

    if(target!==current){
     const escalating=RANK[target]>RANK[current];
     const holding=now<(p.lifeUntil??0);
     const cooling=RANK[target]>0&&now<(p.lifeReady??0);
     if((holding&&!escalating)||cooling)target=current;
    }

    if(target!==current){
     if(RANK[target]===0&&RANK[current]>0&&current!==LIFE.RECOVER){
      // Nobody snaps from running to walking. Recover is the state that makes the transition
      // readable, and it is what sets the cooldown when it ends.
      target=LIFE.RECOVER;
     }
     p.lifeState=target;
     p.lifeUntil=now+(AWARENESS.hold[target]??0);
     p.lifeThreatHeading=towards;
     if(target===LIFE.RECOVER)p.lifeReady=p.lifeUntil+AWARENESS.cooldown;
     if(RANK[target]>=2){
      // Raise the alarm where it happened. Neighbours read the cell, not the person.
      const cell=cellKey(p.x,p.z);
      alarm.set(cell,Math.min(1,(alarm.get(cell)??0)+AWARENESS.alarmRaise));
     }
     if(target===LIFE.AVOID||target===LIFE.FLEE){
      // Step aside, or run. Direction is away from what frightened them, biased to the side
      // this particular person prefers, and handed to the simulation's own primitive.
      const away=towards+Math.PI+(target===LIFE.AVOID?traits.side*.75:traits.side*.22);
      crowd.scatter?.(p,Math.sin(away),Math.cos(away),
       clamp01(threat*(target===LIFE.FLEE?traits.fleeUrgency:.6)));
     }
    }else if(current===LIFE.RECOVER&&now>=(p.lifeUntil??0)){
     p.lifeState=LIFE.CALM;p.lifeNoticed=0;
    }else if(RANK[current]>0)p.lifeThreatHeading=towards;

    const state=p.lifeState??LIFE.CALM;
    byState[state]=(byState[state]??0)+1;
    if(state!==LIFE.CALM)reacting++;
   }

   stats.perceived=perceived;stats.reacting=reacting;stats.byState=byState;
   stats.alarmCells=alarm.size;
   stats.updateMs=(typeof performance!=='undefined'?performance.now():0)-start;
   return stats;
  },
  /** Drop every reaction. Used when player mode ends and nothing is being looked at. */
  clear(crowd){
   alarm.clear();
   if(crowd)for(const p of crowd.pool){
    if(p.lifeState&&p.lifeState!==LIFE.CALM){p.lifeState=LIFE.CALM;p.lifeUntil=0;p.lifeNoticed=0;}
   }
   stats.perceived=0;stats.reacting=0;stats.byState={};stats.alarmCells=0;
  },
  inspect(){return {...stats,byState:{...stats.byState}};}
 };
}
