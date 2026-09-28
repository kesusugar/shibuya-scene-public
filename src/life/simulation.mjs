import {woundedPace} from './street-reactions.mjs';
import {patrolRoute} from './patrol.mjs';
import {ScrambleChoreography} from './choreography.mjs';
import {seededRandom} from '../geo/core.mjs';
import {VEHICLES} from '../traffic/config.mjs';
import {QUALITY,ARCHETYPES,POOL_SIZE,RADIUS,district} from './config.mjs';
import {route,edgePose,inCrossing} from './network.mjs';
import {kerbQueued} from './stance.mjs';

// Fixed actor objects and spatial buckets. Routes allocate only on destination changes.
// Below this the player's car is treated as an obstacle and walked around; at or above it
// there is no time to react and it can knock people down.
export const DODGE_SPEED=2;
// How long going over takes. It has to finish well inside FALL_SECONDS, or the figure
// vanishes at the very instant it lands and reads as a despawn rather than a knockdown.
export const FALL_TILT=.85;
// Being hit launches the body rather than folding it where it stood. The crowd's limbs are
// merged into one geometry, so there is no joint to simulate and a real ragdoll has nothing
// to articulate; what reads instead is the throw -- speed carried off the bonnet, an arc, a
// tumble, and a slide when it lands. LAUNCH is how much of the car's speed transfers, LIFT
// how much of that becomes height, and DRAG how quickly the ground takes it back.
// Tuned by measuring, not by taste: the first pass threw a body 3.6 m and 0.21 m off the
// ground, which at a glance is indistinguishable from falling over. These put an 11 m/s hit
// at roughly ten metres and well overhead, with air time long enough for the tumble to read,
// while a nudge at the dodge threshold stays a shove: the floor is low enough not to launch it.
export const LAUNCH=.92,LAUNCH_MIN=2.2,LIFT=.62,GRAVITY=9.81,GROUND_DRAG=.5,AIR_DRAG=.14,SPIN=3.4;
// claude/crowd-realism: real gravity (it was 16 m/s^2, which squashed every arc to under 0.3 m)
// and a mostly Coulomb slide (about mu 0.56 on tarmac) instead of a mostly viscous one, which
// braked a fast body at over 20 m/s^2. Checked against forward-projection reconstruction fits
// for pedestrian impacts (throw ~ v^2 / 2 mu g): 4 / 10 / 18 m/s now carry 1.3 / 8.0 / 17.8 m,
// against 1.4 / 5.7 / 10.9 m before; the published bands are about 6.5-8.5 m and 17-25 m.
export const GROUND_FRICTION=5.5;   // m/s^2 of sliding friction on a thrown body (RUN 11.1; see above)
// How long a body stays on the street, and so how long the marks it leaves last: long
// enough to be something you drove past and can come back to, rather than something that
// blinks out while you are still braking.
export const FALL_SECONDS=14;
// How long the slot then stays out of the crowd before that person walks back in somewhere
// else. The pool is exactly the high-tier target, so holding a slot really does thin the
// crowd for that long rather than being papered over by the next refill.
export const RESPAWN_SECONDS=30;
// Getting out of the way: how long a warned pedestrian keeps running, and how hard the
// warning bends their step. The bend is a blend rather than an override so the route, the
// walkable context and the neighbour avoidance all still have the final say -- a scattering
// pedestrian never ends up somewhere they could not have walked.
export const SCATTER_SECONDS=1.1,SCATTER_BIAS=.8,SCATTER_SPEED=3.4;
// How long someone already on a crossing may fail to move before they are recycled. Waiting
// at the curb does not count -- that path resets `stuck` -- so this only measures an actor
// that was admitted and then could not take a single step.
export const CROSSING_GIVE_UP=12;
// How long a pedestrian stays quiet after shouting once. The alert sweep fires roughly fifty
// times a second across only a couple of distinct people a second, so without a per-person
// cooldown one pass through the crossing queues thousands of voices for a few dozen throats.
// Being hit ignores it -- a scream is not a repeat of a warning.
export const VOICE_COOLDOWN=5.5;
// The cooldown alone gets this wrong, and measurably so: someone shouts the moment the car
// enters their eighteen metres, which is when it is furthest away and least alarming, and is
// then silent for the whole approach. 41 of 78 voices came out of the calmest band and the
// scream as the car bears down almost never played. So a warning may be taken back: if the
// situation gets this much worse, and it has been this long, they get to shout again.
export const VOICE_REPRISE=1.1,VOICE_ESCALATION=.3;
// The queue is drained every frame by whoever is listening. The cap is only there so that a
// mode with nobody draining it cannot grow a list forever.
export const VOICE_QUEUE_MAX=24;
// claude/crowd-realism. Getting away from a car, for real.
//
// The HQ crowd already showed AVOID/FLEE and played Run, but nothing moved the pedestrian: the
// choreographed cast (74-85% of the crowd) never ran `move()`, so `scatter` could not reach
// them, and ambient walkers only bent their route a little. Live, a car driven into a kerb
// crowd of 125 left 323 of 347 reacting people within 30 cm of where they stood two seconds
// later: running on the spot. The published recipe every crowd game uses is the one here --
// take the direction away from the threat, spread it per person so the crowd fans out rather
// than moving as a block, dodge sideways out of the path, run at 3-5 m/s for a bounded time or
// distance, then settle and go back to what you were doing.
export const FLEE=Object.freeze({
 speed:[3,5],          // m/s, a person running away, not sprinting
 seconds:[1,1.8],      // how long they run before easing off
 distance:[2.4,5.5],   // ...or how far, whichever comes first
 spread:.62,           // rad each side: how widely a crowd fans out from one threat
 dodgeSpread:.22,      // rad each side for a sideways dodge, which has to stay sideways
 accel:10,decel:7,     // m/s^2: a person gets going fast and pulls up a little slower
 personal:.44,         // m: personal space; a step may not add overlap inside it (fleeCrowded)
 back:1.25,            // m/s: walking back onto a crossing track afterwards
 cooldown:.35          // s: a live flight is not restarted by the next warning
});
const hash01=(id,salt)=>((Math.imul((id|0)+salt*7919,0x9e3779b1)>>>0)%100003)/100002;
const FLEE_TURNS=[0,.35,-.35,.7,-.7,1.05,-1.05,1.45,-1.45];

export class CrowdSimulation{
 constructor(network,{traffic=null,tier='medium',seed='shibuya-s10',choreography=false,heroStart=false}={}){
  this.network=network;this.traffic=traffic;this.signals=traffic?.signals??null;this.rng=seededRandom(seed);this.tier=tier;this.heroStart=heroStart;this.time=0;this.accumulator=0;this.camera={x:55,z:65};this.grid=new Map();this.splashes=[];this.voices=[];this.queue=new Map();this.exits=new Map();this.groups=[];this.temp={};this.next={};this.lodClock=0;this.refillClock=0;
  this.stats={spawned:0,despawned:0,reasons:{},recoveries:0,stuck:0,routeCompletions:0,signalViolations:0,entries:{},completed:{},neighborChecks:0,avoidanceChecks:0,updateMs:0,throttled:0,spawnDeferred:0};
  this.pool=Array.from({length:POOL_SIZE},(_,id)=>({id,active:false,x:0,z:0,heading:0,height:0,archetype:'casual',mode:'ambient',state:'walking',group:-1,leader:-1,route:[],routeIndex:0,edge:-1,progress:0,destination:-1,node:-1,speed:0,baseSpeed:1.3,age:0,stuck:0,pause:0,crossing:null,queueKey:null,lod:'near',elapsed:0,phase:0,color:0,animationTime:0,renderX:0,renderZ:0,previousX:0,previousZ:0,travelled:0,lastHeading:0,downUntil:0,scatterX:0,scatterZ:0,scatterUntil:0,voiceUntil:0,voiceSaid:-99,voiceUrgency:0,
   flyX:0,flyY:0,flyZ:0,flyHeight:0,flyGround:0,flySettled:0,spin:0,spinRate:0,region:'commercial'}));
  this.candidates=network.eligible;this.byRegion=Object.fromEntries(['hachiko','center-gai','station','commercial'].map(k=>[k,this.candidates.filter(n=>n.district===k)]));this.crossCandidates=network.crossings.filter(e=>e.kind!=='normal'&&network.nodes[e.from].component===network.nodes[e.to].component);const lanes=new Map();for(const e of this.crossCandidates){const key=e.crossingId+':'+e.direction;if(!lanes.has(key))lanes.set(key,[]);lanes.get(key).push(e);}const groups=[...lanes.values()];this.crossCandidates=[];for(let row=0;row<Math.max(0,...groups.map(g=>g.length));row++)for(const group of groups)if(group[row])this.crossCandidates.push(group[row]);this.crossCursor=0;this.choreography=choreography?new ScrambleChoreography(this):null;this.refill(true);
 }
 cell(x,z){return Math.floor(x/2)+','+Math.floor(z/2);}
 insert(p){const k=this.cell(p.x,p.z);if(!this.grid.has(k))this.grid.set(k,[]);this.grid.get(k).push(p);}
 rebuild(){for(const b of this.grid.values())b.length=0;for(const p of this.pool)if(p.active)this.insert(p);}
 blocked(x,z,p,r=RADIUS*2+.06,includeReservations=true){if(p?.choreographed)return false;if(includeReservations&&!p?.crossing)for(const [id,owners] of this.exits){const e=this.network.edges[p?.edge];if(owners.has(p?.id)||e?.crossingId&&e.to===id)continue;const n=this.network.nodes[id];const distance=Math.hypot(x-n.x,z-n.z);if(distance<.85&&(!p||distance<=Math.hypot(p.x-n.x,p.z-n.z)))return true;}const ix=Math.floor(x/2),iz=Math.floor(z/2);for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++)for(const q of this.grid.get(i+','+j)??[]){if(q===p||!q.active||q.choreographed)continue;this.stats.neighborChecks++;if((q.x-x)**2+(q.z-z)**2<r*r)return true;}return false;}
 vehicleOverlap(x,z,r=RADIUS+.1){if(!this.traffic)return false;const ix=Math.floor(x/15),iz=Math.floor(z/15);for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++)for(const v of this.traffic.grid.get(i+','+j)??[]){if(!v.active)continue;if(v.controlled&&Math.abs(v.speed)>=DODGE_SPEED)continue;const def=VEHICLES[v.type],dx=x-v.x,dz=z-v.z,c=Math.cos(v.heading),s=Math.sin(v.heading);if(Math.abs(dx*c-dz*s)<def.width/2+r&&Math.abs(dx*s+dz*c)<def.length/2+r)return true;}return false;}
 leave(p){for(const [id,owners] of this.exits){owners.delete(p.id);if(!owners.size)this.exits.delete(id);}if(p.crossing){this.signals?.leavePedestrian(p.crossing,p.id);p.crossing=null;}if(p.queueKey){this.queue.get(p.queueKey)?.delete(p.id);p.queueKey=null;}}
 /**
  * Tell a pedestrian to get out of the way, pointing where. Idle and paused actors are woken
  * by it -- standing still in front of a moving car is the one thing nobody does.
  */
 scatter(p,dx,dz,urgency=.5){if(!p.active||p.struck!==undefined)return false;
  p.scatterX=dx;p.scatterZ=dz;p.scatterUntil=this.time+SCATTER_SECONDS;
  if(p.pause>0)p.pause=0;
  this.stats.scattered=(this.stats.scattered??0)+1;
  this.say(p,'alert',urgency);return true;}
 /**
  * Queue something for this pedestrian to shout. Same contract as `splashes`: the simulation
  * decides who speaks and when, and knows nothing about how -- whoever is listening drains
  * the queue. A scream ignores the cooldown entirely: being hit is never a repeat of a
  * warning, and the shout that goes with it must never be eaten.
  */
 /**
  * Run from something. `awayX, awayZ` is the way out (need not be normalised); `urgency` 0..1
  * sets how hard; `dodge` narrows the spread for a sideways jump out of a car's path. Works for
  * everyone, the choreographed cast included, and never releases a crossing or a queue: the
  * flight is a few seconds, and holding a signal group that long is what the controller's hold
  * is for. Deterministic per person (angle, speed, how far), so the same crowd fans out the
  * same way and the same person is always the quick one.
  */
 flee(p,awayX,awayZ,{urgency=.7,dodge=false,from=null,speed=null,distance=null,voice=true}={}){
  if(!p?.active||p.struck!==undefined||p.combatDead||p.controlled||p.combatTarget)return false;
  const f=p.flee;if(f&&!dodge&&f.until-this.time>FLEE.cooldown)return false;
  let len=Math.hypot(awayX,awayZ);if(!(len>1e-6)){awayX=p.id%2?1:-1;awayZ=0;len=1;}
  const u=Math.max(0,Math.min(1,urgency)),j=(hash01(p.id,1)*2-1)*(dodge?FLEE.dodgeSpread:FLEE.spread);
  const c=Math.cos(j),s=Math.sin(j),dx=awayX/len,dz=awayZ/len;
  const lerp=(r,k)=>r[0]+(r[1]-r[0])*k;
  p.flee={x:dx*c+dz*s,z:-dx*s+dz*c,speed:speed??lerp(FLEE.speed,Math.min(1,.3*hash01(p.id,2)+.7*u)),
   until:this.time+lerp(FLEE.seconds,hash01(p.id,3))*(dodge?.8:1),left:distance??lerp(FLEE.distance,hash01(p.id,4)),
   v:f?.v??Math.max(0,p.speed??0)*.5,dodge,started:f?.started??this.time,
   // Where the danger is, so a crowd can be unpacked from the far side first (see step).
   ox:from?.x??p.x-dx*6,oz:from?.z??p.z-dz*6};
  if(p.pause>0)p.pause=0;
  p.fleeOffX??=0;p.fleeOffZ??=0;
  this.stats.fled=(this.stats.fled??0)+1;if(dodge)this.stats.dodged=(this.stats.dodged??0)+1;
  // `voice:false` for a step aside that is not a fright (the player brushing past): whoever
  // bumped them decides whether they say anything.
  if(voice)this.say(p,'alert',.5+.5*u);return true;}
 /** Somewhere a fleeing person may put a foot: walkable ground, or their own crossing. */
 fleeAllowed(p,x,z){const n=this.network,ctx=n.ctx;
  // Someone already inside a car's footprint may always step, or they could never get out.
  if(ctx.solid(x,z,RADIUS)||this.vehicleOverlap(x,z,RADIUS+.15)&&!this.vehicleOverlap(p.x,p.z,RADIUS+.15))return false;
  if(ctx.safe(x,z,.27))return true;
  const e=n.edges[p.edge]??p.track?.e;
  if(e?.crossingId&&inCrossing(x,z,e,.29))return true;
  // Already off the pavement and not on a crossing (thrown, or a driver out of a car): any
  // open ground is better than freezing in the lane.
  return !ctx.safe(p.x,p.z,.27)&&!(e?.crossingId&&inCrossing(p.x,p.z,e,.29));}
 /**
  * Would standing at x,z crowd this person into others more than they already are? The measure
  * is total overlap with everyone within the personal radius, so moving apart is always allowed
  * and a packed kerb (the cast stands on a 0.32 m slot grid, already inside each other's space)
  * unpacks from its edge inwards instead of being frozen by a strict never-closer rule.
  */
 fleeCrowded(p,x,z){const cx=Math.floor(x/2),cz=Math.floor(z/2),r=FLEE.personal;let now=0,next=0;
  for(let i=cx-1;i<=cx+1;i++)for(let j=cz-1;j<=cz+1;j++)for(const q of this.grid.get(i+','+j)??[]){
   if(q===p||!q.active||q.struck!==undefined)continue;
   next+=Math.max(0,r-Math.hypot(q.x-x,q.z-z));now+=Math.max(0,r-Math.hypot(q.x-p.x,q.z-p.z));}
  return next>now+.03;}
 /** One tick of a flight: speed up, steer round what is in the way, ease off, stop. */
 fleeStep(p,dt){const f=p.flee,oldCell=this.cell(p.x,p.z);
  const going=f.left>0&&this.time<f.until,target=going?f.speed*woundedPace(p):0;
  f.v+=Math.max(-FLEE.decel*dt,Math.min(FLEE.accel*dt,target-f.v));
  if(!going&&f.v<=.05){p.flee=null;p.speed=0;this.stats.fleeEnded=(this.stats.fleeEnded??0)+1;return;}
  const step=Math.max(0,f.v)*dt,base=Math.atan2(f.x,f.z),side=p.id%2?1:-1;let moved=false,nx=p.x,nz=p.z;
  if(step>1e-5)for(const t of FLEE_TURNS){const a=base+t*side,x=p.x+Math.sin(a)*step,z=p.z+Math.cos(a)*step;
   if(!this.fleeAllowed(p,x,z)||this.fleeCrowded(p,x,z))continue;
   nx=x;nz=z;moved=true;
   // Keep going round the obstacle rather than straight back into it next tick.
   if(t){const k=.5;f.x=f.x*(1-k)+Math.sin(a)*k;f.z=f.z*(1-k)+Math.cos(a)*k;const l=Math.hypot(f.x,f.z)||1;f.x/=l;f.z/=l;}
   break;}
  if(!moved){f.v*=.5;p.speed=0;return;}
  const d=Math.hypot(nx-p.x,nz-p.z);
  p.previousX=p.x;p.previousZ=p.z;p.x=nx;p.z=nz;p.speed=d/dt;p.travelled+=d;f.left-=d;
  if(p.choreographed){p.fleeOffX+=nx-p.previousX;p.fleeOffZ+=nz-p.previousZ;}
  const want=Math.atan2(nx-p.previousX,nz-p.previousZ),diff=Math.atan2(Math.sin(want-p.heading),Math.cos(want-p.heading));
  p.heading+=Math.max(-9*dt,Math.min(9*dt,diff));
  p.height=this.network.ctx.height(p.x,p.z);
  if(this.cell(p.x,p.z)!==oldCell){const b=this.grid.get(oldCell),i=b?.indexOf(p);if(i>=0)b.splice(i,1);this.insert(p);}}
 /**
  * A cast member walks back onto their track after a flight. Moves the offset still to close
  * one step towards zero and returns what is left. Each step is checked like a flight step
  * (walkable ground or their crossing, no solids, no cars) and slides round what is in the way,
  * because the flight may have bent round a pole that a straight line back would clip.
  * `baseX, baseZ` is where the track has them without the offset.
  */
 fleeReturn(p,dt,baseX=p.x-(p.fleeOffX??0),baseZ=p.z-(p.fleeOffZ??0)){const ox=p.fleeOffX??0,oz=p.fleeOffZ??0,l=Math.hypot(ox,oz);
  if(l<.01){p.fleeOffX=0;p.fleeOffZ=0;return 0;}
  const step=Math.min(l,FLEE.back*dt),a=Math.atan2(-ox,-oz);
  for(const t of [0,.6,-.6,1.2,-1.2]){const nx=ox+Math.sin(a+t)*step,nz=oz+Math.cos(a+t)*step;
   if(Math.hypot(nx,nz)>=l&&t)continue;                        // a detour must still close the gap
   // Held up for a second (a car parked across the way, a kerb-edge margin the flight squeezed
   // past): then any step that is not into a solid will do, so nobody is left off their track.
   // Never into a car: a spot the player's car now stands on is waited for, beside it.
   // RUN 12.4: tiered. After a second, walkable ground with only a thin margin (the kerb edge
   // the flight squeezed past) or their own crossing; only after three, any non-solid step. The
   // single fallback put returning cast on the road edge while a nearer way was open.
   const held=p.returnHeld??0,x=baseX+nx,z=baseZ+nz,clear=!this.network.ctx.solid(x,z,RADIUS*.6)&&!this.vehicleOverlap(x,z,RADIUS+.15);
   const e=this.network.edges[p.edge]??p.track?.e;
   const ok=held>3?clear:held>1?clear&&(this.network.ctx.safe(x,z,.05)||(!!e?.crossingId&&inCrossing(x,z,e,.29))):this.fleeAllowed(p,x,z);
   if(!ok)continue;
   p.returnHeld=0;p.fleeOffX=nx;p.fleeOffZ=nz;return Math.hypot(nx,nz);}
  p.returnHeld=(p.returnHeld??0)+dt;
  return l;}
 /**
  * The player's car, from the crowd's side: whoever is in its path dodges sideways, whoever
  * is close runs away from it. Bounded by the simulation's own grid cells around the car.
  */
 vehicleThreat(car,def){
  const speed=Math.abs(car?.speed??0);if(!car?.active)return 0;
  if(this.time<(this.threatClock??-1))return 0;this.threatClock=this.time+.1;
  const dir=Math.sign(car.speed)||1,h=car.course??car.heading,fx=Math.sin(h)*dir,fz=Math.cos(h)*dir,rx=fz,rz=-fx;
  const halfW=def.width/2,halfL=def.length/2,reach=Math.min(22,halfL+speed*1.6+3);
  let n=0;
  // Nobody stands inside a car. Below the knock-down speed the car nudges into a crowd (or
  // stops in one) and used to leave bodies overlapping its panels; they step out sideways now,
  // at walking pace, whatever the car is doing.
  if(speed<DODGE_SPEED){const hx=Math.sin(car.heading),hz=Math.cos(car.heading),r=halfL+1.2;
   for(let i=Math.floor((car.x-r)/2);i<=Math.floor((car.x+r)/2);i++)for(let j=Math.floor((car.z-r)/2);j<=Math.floor((car.z+r)/2);j++)for(const p of this.grid.get(i+','+j)??[]){
    if(!p.active||p.controlled||p.struck!==undefined||p.flee)continue;
    const dx=p.x-car.x,dz=p.z-car.z,along=dx*hx+dz*hz,across=dx*hz-dz*hx;
    if(Math.abs(along)>halfL+.3||Math.abs(across)>halfW+.3)continue;
    const side=Math.abs(across)>.1?Math.sign(across):(p.id%2?1:-1);
    if(this.flee(p,hz*side,-hx*side,{urgency:0,dodge:true,from:car,speed:1.5,distance:halfW+.75-Math.abs(across)}))n++;}
   return n;}const x0=Math.floor((car.x-reach)/2),x1=Math.floor((car.x+reach)/2),z0=Math.floor((car.z-reach)/2),z1=Math.floor((car.z+reach)/2);
  for(let i=x0;i<=x1;i++)for(let j=z0;j<=z1;j++)for(const p of this.grid.get(i+','+j)??[]){
   if(!p.active||p.controlled||p.struck!==undefined||p.combatDead)continue;
   const dx=p.x-car.x,dz=p.z-car.z,along=dx*fx+dz*fz,across=dx*rx+dz*rz,dist=Math.hypot(dx,dz);
   if(along<-halfL-.5||dist>reach)continue;
   const ttc=Math.max(0,along-halfL)/speed,inPath=Math.abs(across)<halfW+1.1;
   if(inPath&&ttc<1.5){
    // Out of the path, sideways, towards the side they are already on, and a little away.
    const side=Math.abs(across)>.15?Math.sign(across):(p.id%2?1:-1);
    const ax=dx/(dist||1),az=dz/(dist||1);
    if(this.flee(p,rx*side+ax*.25,rz*side+az*.25,{urgency:1-ttc/1.5,dodge:true,from:car}))n++;
   }else if(dist<3.5+speed*.5&&Math.abs(across)<halfW+5&&ttc<2.6){
    // Close to it: away from the car, but not straight ahead of it where it is going.
    let ax=dx/(dist||1),az=dz/(dist||1);const ahead=Math.max(0,ax*fx+az*fz)*.75;ax-=fx*ahead;az-=fz*ahead;
    if(this.flee(p,ax,az,{urgency:.45+.4*Math.min(1,speed/10),from:car}))n++;
   }
  }
  return n;}
 /**
  * Something violent happened at x,z (a body went over a bonnet). The people nearest scatter
  * away from it; further out fewer of them do. Deterministic per person, like everything here.
  */
 panic(x,z,{radius=9,severity=.8}={}){let n=0;const r=radius;
  for(let i=Math.floor((x-r)/2);i<=Math.floor((x+r)/2);i++)for(let j=Math.floor((z-r)/2);j<=Math.floor((z+r)/2);j++)for(const p of this.grid.get(i+','+j)??[]){
   if(!p.active||p.controlled||p.struck!==undefined)continue;const dx=p.x-x,dz=p.z-z,d=Math.hypot(dx,dz);if(d>r)continue;
   if(hash01(p.id,5)>.25+.7*severity*(1-d/r))continue;
   if(this.flee(p,dx,dz,{urgency:severity*(1-.5*d/r),from:{x,z}}))n++;}
  return n;}
 say(p,kind,urgency=.5){
  urgency=Math.max(0,Math.min(1,urgency));
  if(kind!=='scream'&&this.time<p.voiceUntil&&
     !(urgency>=p.voiceUrgency+VOICE_ESCALATION&&this.time>=p.voiceSaid+VOICE_REPRISE))return false;
  if(this.voices.length>=VOICE_QUEUE_MAX)return false;
  p.voiceSaid=this.time;p.voiceUntil=this.time+VOICE_COOLDOWN;p.voiceUrgency=urgency;
  this.voices.push({id:p.id,kind,x:p.x,z:p.z,urgency});
  this.stats.voiced=(this.stats.voiced??0)+1;return true;}
 /**
  * Knock a pedestrian down, thrown along `dx,dz` at `speed`.
  *
  * Going through `leave` rather than clearing `crossing` by hand matters: someone struck
  * mid-crossing still occupies their signal group, and a group that never reports clear
  * never gives the cars their window.
  */
 strike(p,dx=0,dz=0,speed=0,impulse=null){if(!p.active||p.struck!==undefined)return false;this.leave(p);p.flee=null;
  p.struck=0;p.speed=0;
  // RUN 11.1: a vehicle hands over the whole impulse it computed from the contact (direction,
  // side, closing speed, the victim's own motion). Anything else keeps the old throw.
  let carry;
  if(impulse&&Number.isFinite(impulse.x)&&Number.isFinite(impulse.z)){
   p.flyX=impulse.x;p.flyZ=impulse.z;p.flyY=Math.max(0,impulse.y||0);carry=Math.hypot(impulse.x,impulse.z);
  }else{
   carry=Math.max(LAUNCH_MIN,speed*LAUNCH);const len=Math.hypot(dx,dz)||1;
   p.flyX=dx/len*carry;p.flyZ=dz/len*carry;p.flyY=carry*LIFT;
  }
  p.flyGround=this.network.ctx.height(p.x,p.z);p.flyHeight=0;p.flySettled=0;
  // Tumble about the axis across the throw, faster the harder the hit, and in a direction
  // that depends on which way the body was facing when it was caught.
  p.spin=0;p.spinRate=SPIN*(carry/8)*(p.id%2?1:-1);
  // Where they were caught. Whoever draws it drains this; the simulation owns no meshes.
  this.splashes.push({x:p.x,y:p.flyGround,z:p.z,dx:p.flyX,dz:p.flyZ,scale:.8+Math.min(1,carry/10)*.7,life:FALL_SECONDS});
  this.say(p,'scream',1);
  this.stats.struck=(this.stats.struck??0)+1;return true;}

 /**
  * Carry a thrown body for one tick. It arcs, it tumbles, and it slides to a halt; solids
  * stop it dead rather than letting it skate through a shopfront, and the walkable context
  * keeps it on the ground it landed on.
  */
 fly(p,dt){
  p.flyHeight+=p.flyY*dt;p.flyY-=GRAVITY*dt;
  const airborne=p.flyHeight>.02;
  if(!airborne){p.flyHeight=0;if(p.flyY<0)p.flyY=-p.flyY*.22;if(p.flyY<1.2)p.flyY=0;}
  const drag=Math.max(0,1-(airborne?AIR_DRAG:GROUND_DRAG)*dt);
  p.flyX*=drag;p.flyZ*=drag;
  // RUN 11.1: a body sliding on tarmac also loses a fixed amount every second, so it comes to
  // a definite stop instead of creeping on for metres at walking pace. That is most of what
  // makes a person read as heavy.
  if(!airborne){const v=Math.hypot(p.flyX,p.flyZ);if(v>0){const k=Math.max(0,v-GROUND_FRICTION*dt)/v;p.flyX*=k;p.flyZ*=k;}}
  const nx=p.x+p.flyX*dt,nz=p.z+p.flyZ*dt;
  if(this.network.ctx.solid(nx,nz,RADIUS)){p.flyX=0;p.flyZ=0;}
  else{p.x=nx;p.z=nz;p.flyGround=this.network.ctx.height(nx,nz);}
  p.height=p.flyGround+p.flyHeight;
  p.spin+=p.spinRate*dt*(airborne?1:.25);
  // And where they come to rest, twelve metres on: a mark only at the point of impact reads
  // as unconnected to the body lying somewhere else entirely.
  if(!airborne&&!p.flySettled&&Math.hypot(p.flyX,p.flyZ)<.6){p.flySettled=1;
   // Whatever the body has left, so this clears with it rather than outliving it.
   this.splashes.push({x:p.x,y:p.flyGround,z:p.z,dx:p.flyX,dz:p.flyZ,scale:.9,life:Math.max(.2,FALL_SECONDS-p.struck)});}
  if(!airborne&&Math.hypot(p.flyX,p.flyZ)<.15){p.flyX=0;p.flyZ=0;p.spinRate*=.6;}
 }
 /** Roadmap stage 4: the share of the tier's crowd that is out (time of day). */
 setPopulation(k){this.population=Math.max(.1,Math.min(1,Number(k)||1));return this.population;}
 despawn(p,reason){if(!p.active)return;this.leave(p);p.active=false;this.stats.despawned++;this.stats.reasons[reason]=(this.stats.reasons[reason]??0)+1;if(reason==='stuck'){this.stats.stuck++;this.stats.recoveries++;}}
 setTier(tier){if(!QUALITY[tier])throw Error('Unknown crowd tier');if(tier===this.tier)return;this.tier=tier;this.choreography?.occupied.clear();for(const p of this.pool){if(p.controlled)continue;if(p.active&&!p.crossing)this.despawn(p,'profile');else if(p.active){p.group=-1;p.leader=-1;p.mode='ambient';}}this.groups.length=0;this.refill(true);}
 setCamera(x,z){this.camera.x=x;this.camera.z=z;}
 chooseDestination(p,node,short=false){if(p.mode==='patrol')return patrolRoute(this.network,p);if(p.leader>=0&&this.pool[p.leader]?.active){const lead=this.pool[p.leader],dest=lead.destination,path=route(this.network,node.id,dest);if(path.length){p.route=path;p.routeIndex=0;p.edge=path[0];p.progress=0;p.node=node.id;p.destination=dest;return true;}}const region=short?node.district:this.rng()<.55?(node.district==='hachiko'?'center-gai':'hachiko'):node.district,candidates=this.byRegion[region]?.filter(n=>n.component===node.component&&Math.hypot(n.x-node.x,n.z-node.z)>(short?3:12)&&(!short||Math.hypot(n.x-node.x,n.z-node.z)<16));let list=candidates.length?candidates:this.candidates.filter(n=>n.component===node.component&&Math.hypot(n.x-node.x,n.z-node.z)>4);if(!list.length)return false;
  for(let i=0;i<5;i++){const dest=list[Math.floor(this.rng()*list.length)],path=route(this.network,node.id,dest.id);if(!path.length)continue;if(short&&(path.some(id=>this.network.edges[id].crossingId)||path.reduce((sum,id)=>sum+this.network.edges[id].length,0)>30))continue;const first=this.network.nodes[this.network.edges[path[0]].to],dot=Math.sin(p.heading)*(first.x-node.x)+Math.cos(p.heading)*(first.z-node.z);if(p.travelled>2&&dot<-.2&&i<4)continue;p.route=path;p.routeIndex=0;p.edge=path[0];p.progress=0;p.node=node.id;p.destination=dest.id;return true;}return false;
 }
 spawn(mode='ambient',region=null,leader=null,crossIndex=-1){const p=this.pool.find(p=>!p.active&&!(p.downUntil>this.time));if(!p)return false;p.downUntil=0;const archetypes=Object.keys(ARCHETYPES).filter(k=>k!=='kid'||leader),type=leader&&p.id%2?'kid':archetypes[p.id%archetypes.length],def=ARCHETYPES[type];
  let nodes=region?this.byRegion[region]:this.candidates,cross=null;if(crossIndex>=0&&this.crossCandidates.length){cross=this.crossCandidates[crossIndex%this.crossCandidates.length];const endpoint=this.network.nodes[cross.from];nodes=this.candidates.filter(n=>n.component===endpoint.component&&Math.hypot(n.x-endpoint.x,n.z-endpoint.z)<10);}
  if(leader)nodes=this.candidates.filter(n=>n.component===this.network.nodes[leader.node].component&&Math.hypot(n.x-leader.x,n.z-leader.z)<4);
  for(let attempt=0;attempt<100;attempt++){const n=nodes[Math.floor(this.rng()*nodes.length)];if(!n||this.network.landingNodes.has(n.id)||this.blocked(n.x,n.z,null,.9)||this.vehicleOverlap(n.x,n.z,.6)||this.time>0&&Math.hypot(n.x-this.camera.x,n.z-this.camera.z)<12)continue;
   const jitter=this.rng()*.5-.25,jitterZ=this.rng()*.5-.25,sx=n.x+jitter,sz=n.z+jitterZ,valid=this.network.ctx.safe(sx,sz)&&!this.blocked(sx,sz,null,.65)&&!this.vehicleOverlap(sx,sz,.6),px=valid?sx:n.x,pz=valid?sz:n.z;
   Object.assign(p,{patrol:null,active:true,choreographed:false,kerbQueue:false,flee:null,fleeOffX:0,fleeOffZ:0,x:px,z:pz,renderX:px,renderZ:pz,previousX:px,previousZ:pz,heading:this.rng()*Math.PI*2,height:this.network.ctx.height(n.x,n.z),archetype:type,mode,state:mode==='idle'?'idle':'walking',group:leader?.group??-1,leader:leader?.id??-1,route:[],routeIndex:0,edge:-1,progress:0,destination:n.id,node:n.id,speed:0,baseSpeed:leader?.baseSpeed??def.speed[0]+this.rng()*(def.speed[1]-def.speed[0]),age:0,stuck:0,pause:mode==='idle'?8+this.rng()*30:0,crossing:null,queueKey:null,lod:'near',elapsed:0,phase:this.rng()*Math.PI*2,color:Math.floor(this.rng()*def.colors.length),travelled:0,voiceUntil:0,voiceSaid:-99,voiceUrgency:0,combatHealth:100,combatTarget:null,follow:null,missionRole:null,collected:false,watchUntil:0,phone:null,limp:false,crawling:false,legWounds:0,handsUpUntil:0,handsUpSince:undefined,shooterUntil:0,gunDrawn:false,gunAim:0,combatUntil:0,combatNext:0,combatAction:0,combatDead:false,fatal:false,appearanceId:undefined,cameFromVehicle:undefined,reactionOwned:false,region:n.district});
   if(mode!=='idle'){
    if(cross){const approach=route(this.network,n.id,cross.from);if(n.id!==cross.from&&!approach.length){p.active=false;continue;}p.route=[...approach,cross.id];p.edge=p.route[0];p.destination=cross.to;}
    else if(!this.chooseDestination(p,n,mode==='milling')){p.active=false;continue;}
   }
   this.insert(p);this.stats.spawned++;return p;
  }this.stats.spawnDeferred++;return false;
 }
 refill(initial=false){if(this.choreography)return this.choreography.refill(initial);const q=QUALITY[this.tier];
  // Roadmap stage 4: how many are out depends on the time of day (setPopulation); fewer are sent
  // out, and the rest thin away as their walks end.
  const total=Math.round(q.total*(this.population??1));let count=this.pool.filter(p=>p.active).length;if(initial&&count===0){for(let i=0;i<q.idle;i++)if(this.spawn('idle',i%5===0?'station':i%3?'hachiko':'center-gai'))count++;for(let i=0;i<q.milling;i++)if(this.spawn('milling','hachiko'))count++;
   for(let i=0;i<q.groups;i++){const leader=this.spawn('group',i%2?'center-gai':'hachiko');if(!leader)continue;leader.group=this.groups.length;const group={id:leader.group,leader:leader.id,members:[leader.id]};this.groups.push(group);count++;for(let j=0;j<1+i%3;j++){const p=this.spawn('group',null,leader);if(p){group.members.push(p.id);count++;}}}
   const crossingCount=Math.round(q.total*.32);for(let i=0;i<crossingCount;i++)if(this.spawn('ambient',null,null,i))count++;
  }
  // Restore family/group membership after pooled actors expire, without growing the group pool.
  for(let gi=0;gi<q.groups&&count<total-1;gi++){
   let g=this.groups[gi];if(!g){g={id:gi,leader:-1,members:[]};this.groups[gi]=g;}
   g.members=g.members.filter(id=>this.pool[id].active&&this.pool[id].group===gi);
   if(!g.members.length){const leader=this.spawn('group',gi%2?'center-gai':'hachiko');if(!leader)continue;leader.group=gi;g.leader=leader.id;g.members=[leader.id];count++;}
   if(!g.members.includes(g.leader)){g.leader=g.members[0];const leader=this.pool[g.leader];leader.leader=-1;if(leader.archetype==='kid')leader.archetype='casual';}
   const leader=this.pool[g.leader];for(const id of g.members)this.pool[id].leader=id===g.leader?-1:g.leader;
   if(g.members.length<2&&count<total){const follower=this.spawn('group',null,leader);if(follower){g.members.push(follower.id);count++;}}
  }
  const budget=initial?q.total:12;for(let i=0;i<budget&&count<total;i++){const region=i%6===0?'center-gai':i%6===1?'hachiko':i%6===2?'station':null;const idle=this.pool.filter(p=>p.active&&p.mode==='idle').length,milling=this.pool.filter(p=>p.active&&p.mode==='milling').length;const mode=idle<q.idle?'idle':milling<q.milling?'milling':'ambient';const allocated=this.pool.filter(p=>p.active&&p.route.some((id,i)=>i>=p.routeIndex&&this.network.edges[id]?.kind!=='normal'&&this.network.edges[id]?.crossingId)).length;const cross=mode==='ambient'&&allocated<Math.round(q.total*.32)?this.crossCursor++:-1;if(this.spawn(mode,mode==='ambient'?region:'hachiko',null,cross))count++;}
 }
 beginCrossing(p,e){if(!this.signals)return false;const s=this.signals.getCrossingTrafficState(e.crossingId);if(!s.known||!s.vehicleClear||s.pedestrian!=='WALK'||this.signals.phase()[2]<5)return false;if((p.id%9)*.14>20-this.signals.phase()[2])return false;
  // Exit capacity is reserved by occupancy checks; no admission into a packed curb.
  const dest=this.network.nodes[e.to];if(this.blocked(dest.x,dest.z,p,.8)||this.vehicleOverlap(dest.x,dest.z,.6))return false;
  for(let d=0;d<e.length;d+=2){edgePose(this.network,e,d,this.temp);if(this.vehicleOverlap(this.temp.x,this.temp.z,.65))return false;}
  if(!this.exits.has(e.to))this.exits.set(e.to,new Set());this.exits.get(e.to).add(p.id);this.signals.enterPedestrian(s.groupId,p.id);p.crossing=s.groupId;p.state='crossing';if(p.queueKey)this.queue.get(p.queueKey)?.delete(p.id);p.queueKey=null;
  const key=e.crossingId+':'+e.direction;this.stats.entries[key]=(this.stats.entries[key]??0)+1;
  if(s.NS!=='RED'||s.EW!=='RED')this.stats.signalViolations++;return true;
 }
 allowed(x,z,p,e){if(this.vehicleOverlap(x,z))return false;if(!e.crossingId)return this.network.ctx.safe(x,z,.27);if(!p.crossing)return false;if(this.network.ctx.solid(x,z,.29)||this.network.ctx.onRoad(x,z)&&!inCrossing(x,z,e,.29))return false;
  // Lateral steering stays close to the mapped crossing track, never into another road.
  let dist=Infinity;const f=Math.floor(p.progress/e.length*(e.points.length-1));for(let i=Math.max(0,f-10);i<Math.min(e.points.length,f+11);i++)dist=Math.min(dist,Math.hypot(x-e.points[i][0],z-e.points[i][1]));return dist<.7;
 }
 move(p,dt){if(!p.active)return;if(p.choreographed)return this.choreography.move(p,dt);const n=this.network,oldCell=this.cell(p.x,p.z);p.age+=dt;p.animationTime+=dt;
  p.combatAction=Math.max(0,(p.combatAction??0)-dt*3.5);
  // Hostile, but never stopped while admitted to a crossing: that holds the signal group, and a
  // held group stops every signal on the map (GTA-FIDELITY-STATUS 16a). They finish crossing,
  // `leave()` releases the group at the far kerb, and the fight picks up there.
  if(p.combatTarget&&p.combatUntil>this.time&&!p.crossing){p.state='fighting';p.speed=0;return;}
  // Roadmap stage 2 (street-reactions.mjs): hands up at gunpoint, or standing to shoot back.
  if((p.handsUpUntil>this.time||p.shooterUntil>this.time)&&!p.crossing){p.state=p.shooterUntil>this.time?'shooting':'surrender';p.speed=0;p.flee=null;return;}
  // Roadmap stage 5 (game/missions.mjs): a mission's client or thief goes where it is told, off
  // the route network (walls still stop them), at the pace it is told.
  if(p.follow&&!p.crossing){const f=p.follow,dx=f.x-p.x,dz=f.z-p.z,d=Math.hypot(dx,dz),step=Math.min(d,Math.max(0,f.speed??0)*dt);
   if(step>1e-4){const nx=p.x+dx/d*step,nz=p.z+dz/d*step;
    if(!n.ctx.solid?.(nx,nz,.25)){const old=this.cell(p.x,p.z);p.previousX=p.x;p.previousZ=p.z;p.x=nx;p.z=nz;p.renderX=nx;p.renderZ=nz;p.height=n.ctx.height(nx,nz);
     if(this.cell(nx,nz)!==old){const b=this.grid.get(old),i=b?.indexOf(p);if(i>=0)b.splice(i,1);this.insert(p);}}
    const h=Math.atan2(dx,dz),diff=Math.atan2(Math.sin(h-p.heading),Math.cos(h-p.heading));p.heading+=Math.max(-6*dt,Math.min(6*dt,diff));}
   p.speed=step/Math.max(dt,1e-6);p.state=p.speed>2.5?'running':'walking';return;}
  // Roadmap stage 4 (onlookers.mjs): stopped to watch a body, phone out.
  if(p.watchUntil>this.time&&!p.crossing){p.state='watching';p.speed=0;if(Number.isFinite(p.watchX))p.heading=Math.atan2(p.watchX-p.x,p.watchZ-p.z);return;}
  if(p.combatTarget){p.combatTarget=null;p.combatAction=0;}
  // Curb waiters and idle actors yield locally to occupied crossing exits.
  // They remain on walkable ground; no recycling or position snap clears a crossing.
  if(!p.crossing){for(const [id,owners] of this.exits){const end=n.nodes[id],dx=p.x-end.x,dz=p.z-end.z,d=Math.hypot(dx,dz);if(d>=3)continue;const owner=this.pool[owners.values().next().value],incoming=n.edges[owner.edge],start=n.nodes[incoming.from],angle=Math.atan2(end.z-start.z,end.x-start.x);for(const turn of [0,.6,-.6,1.2,-1.2]){const x=p.x+Math.cos(angle+turn)*.8*dt,z=p.z+Math.sin(angle+turn)*.8*dt;if(!n.ctx.safe(x,z)||this.vehicleOverlap(x,z)||this.blocked(x,z,p,.56,false))continue;p.previousX=p.x;p.previousZ=p.z;p.x=x;p.z=z;p.height=n.ctx.height(x,z);p.speed=.8;p.heading=Math.atan2(x-p.previousX,z-p.previousZ);if(this.cell(x,z)!==oldCell){const bucket=this.grid.get(oldCell),i=bucket?.indexOf(p);if(i>=0)bucket.splice(i,1);this.insert(p);}return;}}}
  const fleeing=p.scatterUntil>this.time;
  if(p.mode==='idle'&&!fleeing){p.state='idle';p.speed=0;if(p.age>240)this.despawn(p,'ttl');return;}
  if(p.pause>0&&!fleeing){p.pause-=dt;p.state='milling';p.speed=0;return;}
  if(p.edge<0){if(!this.chooseDestination(p,n.nodes[p.node],p.mode==='milling'))this.despawn(p,'invalid-route');return;}
  const e=n.edges[p.edge];if(p.crossing&&p.progress<1&&n.ctx.safe(p.x,p.z)&&this.signals.phase()[0]!=='PEDESTRIAN'){this.leave(p);this.stats.cancelledCurbAdmissions=(this.stats.cancelledCurbAdmissions??0)+1;}if(e.crossingId&&!p.crossing){if(!this.beginCrossing(p,e)){p.state='waiting';p.speed=0;p.stuck=0;p.kerbQueue=false;const key=e.crossingId+':'+e.direction;if(!this.queue.has(key))this.queue.set(key,new Set());this.queue.get(key).add(p.id);p.queueKey=key;return;}}
  p.state=p.crossing?'crossing':p.mode==='milling'?'milling':'walking';
  let speed=p.baseSpeed*woundedPace(p);
  if(p.group>=0&&!p.crossing){const g=this.groups[p.group],lead=this.pool[g?.leader];if(lead?.active){if(p.id===lead.id&&g.members.some(id=>this.pool[id].active&&Math.hypot(this.pool[id].x-p.x,this.pool[id].z-p.z)>5))speed*=.45;else if(p.id!==lead.id&&Math.hypot(lead.x-p.x,lead.z-p.z)>4)speed*=1.15;}}
  edgePose(n,e,Math.min(e.length,p.progress+.55),this.next);let dx=this.next.x-p.x,dz=this.next.z-p.z,dist=Math.hypot(dx,dz),step=Math.min(speed*dt,dist);if(dist>.0001){dx/=dist;dz/=dist;}
  // Warned by an oncoming car: lean hard towards the shoulder and run, without ever leaving
  // the route behind -- the blend decays as the warning ages so they settle back into it.
  if(p.scatterUntil>this.time){const w=SCATTER_BIAS*Math.min(1,(p.scatterUntil-this.time)/SCATTER_SECONDS);
   let bx=dx*(1-w)+p.scatterX*w,bz=dz*(1-w)+p.scatterZ*w;const bl=Math.hypot(bx,bz)||1;dx=bx/bl;dz=bz/bl;
   speed=Math.max(speed,SCATTER_SPEED);step=speed*dt;p.state='scattering';}
  let nx=p.x+dx*step,nz=p.z+dz*step,moved=false;
  if(this.allowed(nx,nz,p,e)&&!this.blocked(nx,nz,p)){moved=true;}else if(p.lod!=='far'||p.crossing||p.stuck>1){this.stats.avoidanceChecks++;
   // Deterministic right-side passing. Candidate boundary/collision checks override steering.
   for(const side of [1,-1]){const sx=dz*side,sz=-dx*side;nx=p.x+sx*step;nz=p.z+sz*step;if(this.allowed(nx,nz,p,e)&&!this.blocked(nx,nz,p)){moved=true;break;}}
  }
  if(moved){const travelled=Math.hypot(nx-p.x,nz-p.z);p.previousX=p.x;p.previousZ=p.z;p.x=nx;p.z=nz;p.speed=travelled/dt;p.travelled+=travelled;p.stuck=0;const target=Math.atan2(nx-p.previousX,nz-p.previousZ),diff=Math.atan2(Math.sin(target-p.heading),Math.cos(target-p.heading));p.heading+=Math.max(-3*dt,Math.min(3*dt,diff));
   // Project onto the local edge polyline. Steering never advances route distance for lateral motion.
   if(!e.points){const a=n.nodes[e.from],b=n.nodes[e.to];p.progress=Math.max(0,Math.min(e.length,((p.x-a.x)*(b.x-a.x)+(p.z-a.z)*(b.z-a.z))/e.length));}else{let best=Infinity,progress=p.progress;const f=Math.floor(p.progress/e.length*(e.points.length-1));for(let i=Math.max(0,f-8);i<Math.min(e.points.length-1,f+9);i++){const a=e.points[i],b=e.points[i+1],x=b[0]-a[0],z=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*x+(p.z-a[1])*z)/(x*x+z*z||1))),dist=(p.x-a[0]-t*x)**2+(p.z-a[1]-t*z)**2;if(dist<best){best=dist;progress=(i+t)/(e.points.length-1)*e.length;}}p.progress=progress;}
  }else{p.speed=0;p.stuck+=dt;
   // RUN 11.0: held up behind the people waiting at a kerb, which a viewer reads as waiting.
   const next=p.route[p.routeIndex+1],ne=next!==undefined?n.edges[next]:null,end=n.nodes[e.to];
   p.kerbQueue=kerbQueued({moved:false,nextIsCrossing:!!ne?.crossingId,
    walk:!!ne?.crossingId&&this.signals?.getCrossingTrafficState(ne.crossingId).pedestrian==='WALK',
    toKerb:Math.hypot(p.x-end.x,p.z-end.z)});}
  if(moved)p.kerbQueue=false;
  const end=n.nodes[e.to];if(p.progress>=e.length-.65&&Math.hypot(p.x-end.x,p.z-end.z)<.5&&n.ctx.safe(p.x,p.z)){p.node=e.to;p.progress=0;p.routeIndex++;
   if(e.crossingId){const key=e.crossingId+':'+e.direction;this.stats.completed[key]=(this.stats.completed[key]??0)+1;this.leave(p);}
   if(p.routeIndex<p.route.length)p.edge=p.route[p.routeIndex];else{this.stats.routeCompletions++;p.edge=-1;if(p.mode==='milling')p.pause=2+this.rng()*6;}
  }
  p.height=n.ctx.height(p.x,p.z);
  if(this.cell(p.x,p.z)!==oldCell){const b=this.grid.get(oldCell),i=b?.indexOf(p);if(i>=0)b.splice(i,1);this.insert(p);}
  // A pedestrian who cannot move is recycled -- including one part-way across, which used to
  // be exempt from both of these. Being admitted to a crossing and then wedged at its mouth
  // by the queue behind is survivable for the actor and fatal for the city: they hold their
  // signal group for as long as they live, and the controller stops the clock for the whole
  // map while any group is held. Eight of them, stuck for 150 s, is what froze every signal
  // and emptied the crossing. `leave` first, so the group is released before they go.
  if(p.stuck>(p.crossing?CROSSING_GIVE_UP:35)){if(p.crossing)this.stats.abandonedCrossings=(this.stats.abandonedCrossings??0)+1;this.despawn(p,'stuck');}
  else if(p.age>240&&!p.crossing)this.despawn(p,'ttl');
 }
 step(dt){this.time+=dt;this.lodClock+=dt;this.refillClock+=dt;this.rebuild();if(this.lodClock>=1){this.lodClock=0;for(const p of this.pool)if(p.active){const d=Math.hypot(p.x-this.camera.x,p.z-this.camera.z);p.lod=d<65?'near':d<140?'mid':'far';}}
  // claude/crowd-realism: flights first, furthest from their danger first. A packed crowd can
  // only open from its far edge; moving the near side first just presses it into the rest.
  const flights=this.flights??=[];flights.length=0;
  for(const p of this.pool)if(p.active&&p.flee&&!p.controlled&&p.struck===undefined){p.fleeRank=-Math.hypot(p.x-p.flee.ox,p.z-p.flee.oz);flights.push(p);}
  if(flights.length){flights.sort((a,b)=>a.fleeRank-b.fleeRank);for(const p of flights)this.fleeStep(p,dt);}
  // Rotate priority each fixed tick; ordering does not permanently privilege low IDs.
  const start=Math.floor(this.time*30)%this.pool.length;for(let j=0;j<this.pool.length;j++){const p=this.pool[(start+j)%this.pool.length];if(!p.active||p.controlled)continue;
   if(p.struck!==undefined){p.struck+=dt;p.speed=0;this.fly(p,dt);
    // An extracted driver is a world pedestrian, not a disposable hit marker. Finish their
    // fall as the HQ knockdown enters RECOVER, then give them a nearby walkable route. The
    // carjack already called strike() and its formal leave(), so no crossing is released here.
    if(p.cameFromVehicle!==undefined&&p.struck>=4.9){
     p.struck=undefined;p.flyX=0;p.flyZ=0;p.flyY=0;p.flyHeight=0;
     p.height=this.network.ctx.height(p.x,p.z);p.speed=0;p.pause=2;
     p.mode='milling';p.state='milling';p.route=[];p.edge=-1;p.stuck=0;
     let nearest=null,distance=Infinity;
     for(const n of this.candidates){const d=(n.x-p.x)**2+(n.z-p.z)**2;
      if(d<distance&&this.network.ctx.safe(n.x,n.z,RADIUS-.01)
       &&!this.vehicleOverlap(n.x,n.z,RADIUS-.02)
       &&!this.blocked(n.x,n.z,p,RADIUS*2-.03,false)){
       nearest=n;distance=d;}}
     if(nearest){
      // The door can be in a traffic lane. Stand the recovering pedestrian at the nearest
      // walkable node, and update the simulation grid as every out-of-route move must do.
      const old=this.cell(p.x,p.z),bucket=this.grid.get(old),at=bucket?.indexOf(p);
      if(at>=0)bucket.splice(at,1);
      p.x=nearest.x;p.z=nearest.z;p.renderX=p.x;p.renderZ=p.z;
      p.previousX=p.x;p.previousZ=p.z;p.height=this.network.ctx.height(p.x,p.z);
      p.node=nearest.id;this.insert(p);
     }
     continue;
    }
    // Roadmap stage 4: someone killed in a fight or by a weapon stays down until the ambulance
    // collects them (aftermath.mjs), not FALL_SECONDS; a car's victim goes as before.
    if(p.struck>=FALL_SECONDS&&(!p.combatDead||p.collected)){p.struck=undefined;this.despawn(p,p.collected?'collected':'struck');p.downUntil=this.time+RESPAWN_SECONDS;}continue;}
   if(p.flee){p.elapsed=0;continue;}   // moved in the flight pass above
   p.elapsed+=dt;const interval=p.crossing||p.choreographed?1/30:p.mode==='idle'?.5:p.lod==='near'?1/30:p.lod==='mid'?1/15:.2;if(p.elapsed+1e-8<interval){this.stats.throttled++;continue;}const elapsed=p.elapsed;p.elapsed=0;this.move(p,elapsed);}
  if(this.refillClock>=2){this.refillClock=0;this.refill();}
 }
 // `postUpdate(dt)`, if set, runs after the steps and before anything draws them: the player's
 // contact settles whoever the crowd walked into the player this frame (crowd-contact.mjs).
 update(dt){const start=performance.now();this.accumulator+=Math.max(0,Math.min(.25,dt));while(this.accumulator>=1/30){this.step(1/30);this.accumulator-=1/30;}this.postUpdate?.(dt);this.stats.updateMs=performance.now()-start;}
 snapshot(debug=false){const active=this.pool.filter(p=>p.active),counts=key=>Object.fromEntries([...new Set(active.map(p=>p[key]))].map(k=>[k,active.filter(p=>p[key]===k).length]));return {...this.stats,target:QUALITY[this.tier].total,choreographed:active.filter(p=>p.choreographed).length,waitingCells:this.network.stats.waitingCells??0,reasons:{...this.stats.reasons},entries:{...this.stats.entries},completed:{...this.stats.completed},total:active.length,tier:this.tier,archetypes:counts('archetype'),modes:counts('mode'),states:counts('state'),lod:counts('lod'),regions:counts('region'),hachiko:active.filter(p=>district(p.x,p.z)==='hachiko').length,centerGai:active.filter(p=>district(p.x,p.z)==='center-gai').length,groupCount:this.groups.filter(g=>g.members.filter(id=>this.pool[id].active&&this.pool[id].group===g.id).length>1).length,queueSizes:Object.fromEntries([...this.queue].map(([k,s])=>[k,s.size])),...(debug?{actors:active.map(p=>({id:p.id,archetype:p.archetype,edge:p.edge,destination:p.destination,state:p.state,queue:p.queueKey,group:p.group,lod:p.lod,stuck:p.stuck,radius:RADIUS,grid:this.cell(p.x,p.z),crossing:p.crossing})),signalPhase:this.signals?.phase()??'unbound'}:{})};}
 audit(){const findings=[],minor={groupSeparation:0,stuck:0};let maxStack=0;for(const p of this.pool){if(!p.active||p.struck!==undefined)continue;if(![p.x,p.z,p.heading,p.height].every(Number.isFinite))findings.push({id:p.id,kind:'finite'});if(p.edge>=0&&!this.network.edges[p.edge])findings.push({id:p.id,kind:'invalid-path'});if(this.network.ctx.solid(p.x,p.z,RADIUS-.01))findings.push({id:p.id,kind:'solid'});if(!p.crossing&&!this.network.ctx.safe(p.x,p.z,RADIUS-.01))findings.push({id:p.id,kind:'road-intrusion'});if(this.vehicleOverlap(p.x,p.z,RADIUS-.02))findings.push({id:p.id,kind:'vehicle-overlap'});if(this.blocked(p.x,p.z,p,RADIUS*2-.03,false))findings.push({id:p.id,kind:'pedestrian-overlap'});if(p.crossing&&this.network.ctx.onRoad(p.x,p.z)&&!inCrossing(p.x,p.z,this.network.edges[p.edge],.23))findings.push({id:p.id,kind:'crosswalk-boundary'});if(p.crossing&&!this.signals?.groups.has(p.crossing))findings.push({id:p.id,kind:'invalid-signal'});if(p.stuck>5)minor.stuck++;if(p.leader>=0&&this.pool[p.leader].active&&Math.hypot(p.x-this.pool[p.leader].x,p.z-this.pool[p.leader].z)>8)minor.groupSeparation++;}
  for(const s of this.queue.values())maxStack=Math.max(maxStack,s.size);return {major:findings.length,minor,findings,maxQueue:maxStack,signalViolations:this.stats.signalViolations};}
 dispose(){for(const p of this.pool)this.despawn(p,'dispose');this.splashes.length=0;this.voices.length=0;this.grid.clear();this.queue.clear();this.exits.clear();}
}
