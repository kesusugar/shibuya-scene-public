// The player's body against the crowd's bodies.
//
// Walls are `advance()`'s business (controller.mjs); this is the other half: the people. It is
// capsule-against-capsule with steering, the way walking contact is resolved in games that have
// a crowd this size, and not a physics engine -- a rigid body for each of ~2,000 people would not
// run on a phone, and a solver pushing the choreographed Scramble cast would stall the signals.
//
// Pure: no DOM and no three.js, so it is tested headless against the real network.
//
// What it does, per frame, in this order:
//  1. an overlap that already exists (someone walked into the player) is pushed apart, the
//     player taking at most a third of it -- the person gives way through `flee`;
//  2. the part of the player's step that would press into a body is removed, so the player
//     slides past a shoulder the way `advance()` slides along a wall;
//  3. a step blocked head-on is tried a little to either side before giving up;
//  4. if every way is blocked the player still moves at `shove` along the input, and the people
//     in front get out of the way. A full scramble must never trap the player.
//
// Bounded: every query reads the simulation's own 2 m grid, 3x3 cells round the player.
import {RADIUS} from '../life/config.mjs';
import {onRails as railed} from './combat.mjs';
import {fighter} from '../life/temperament.mjs';

export const CONTACT=Object.freeze({
 playerRadius:.35,       // PLAYER.radius (not imported: controller.mjs imports this module)
 bodyRadius:RADIUS,      // a pedestrian's body
 gap:.35+RADIUS,         // the two together: closest the centres may come
 level:1.2,              // m: people further above or below (decks, bridges) are not in the way
 shove:.45,              // m/s: the least the player still makes when fully boxed in
 depenetrate:.8,         // m/s: how fast an existing overlap is opened
 cooldown:.6,            // s: per person, so one body is bumped once and not every frame
 knockDown:false,        // a sprint bump never knocks anyone down (see the plan, section 2)
 // RUN "player crowd contact": a bump turns into a fight only with one of the few who fight
 // (temperament `fighter`, about 3% of adults), and combat refuses it while the player is armed.
 sprint:3.7,             // m/s: a bump at or above this is a hard one
 // What a bump looks like on the person (Step C): a short light flinch walking, a stagger at a
 // sprint. `stagger` is how far a sprint bump carries someone off rails, in metres.
 flinch:.25,hardFlinch:.34,stagger:.6,
 speaks:.3,              // the share of people (by id) who say something when walked into
 slow:.6                 // the player's speed is multiplied by this on the frame of a bump
});

// How far round the player `nearby` reaches: the give-way reach (2 m oncoming) and a frame of travel.
export const NEARBY=2.05;
// Tried in this order when the straight step is blocked: small turns first, then wider ones.
const TURNS=[.45,.9,1.35];
const EMPTY=[];

/**
 * The pedestrians who can be in the player's way, into `out` (reused, never reallocated).
 * Not the player's own slot, not anyone down or dead (the player steps over a body), and not
 * anyone on another level.
 */
export function bodiesNear(crowd,x,z,y,r=1.4,out=[]){
 out.length=0;
 const grid=crowd?.grid;if(!grid)return out;
 const ix=Math.floor(x/2),iz=Math.floor(z/2),r2=r*r;
 for(let i=ix-1;i<=ix+1;i++)for(let j=iz-1;j<=iz+1;j++)for(const p of grid.get(i+','+j)??EMPTY){
  // Distance first: it rejects nearly everyone in the nine cells, and the flags after it are
  // reads on large, many-shaped objects, which is where this function's time went.
  const dx=p.x-x,dz=p.z-z;
  if(dx*dx+dz*dz>r2)continue;
  if(!p.active||p.controlled||p.struck!==undefined||p.combatDead)continue;
  if(Math.abs((p.height??0)-(y??0))>CONTACT.level)continue;
  out.push(p);
 }
 return out;
}

/**
 * Take out of `dx,dz` whatever would bring the player's circle inside a body's. The part of
 * the step that goes past a body is kept, which is what makes it a slide. A few passes, so a
 * correction against one person cannot push the step into the next.
 */
function constrain(x,z,dx,dz,bodies,out){
 const g=CONTACT.gap;let rx=dx,rz=dz,checks=0;
 for(let pass=0;pass<3;pass++){
  let changed=false;
  for(const b of bodies){
   const vx=b.x-x,vz=b.z-z,d=Math.hypot(vx,vz);checks++;
   if(d<1e-6)continue;
   const mx=vx/d,mz=vz/d,along=rx*mx+rz*mz;
   if(along<=0)continue;                  // moving away from them, or past them
   const room=Math.max(0,d-g);
   if(along>room){rx-=(along-room)*mx;rz-=(along-room)*mz;changed=true;}
  }
  if(!changed)break;
 }
 out.dx=rx;out.dz=rz;return checks;
}

/**
 * One frame of the player's step against the bodies near them. Returns `out`:
 * `{dx, dz, shoved, contacts}`. `contacts` is a reused list of `{p, d, into}` for everyone
 * touching the player after the step: `d` the centre distance, `into` whether the player was
 * moving into them (a bump) rather than them into the player.
 *
 * `pushing` is whether there is movement input; without it there is no shove.
 */
export function resolveStep(state,dx,dz,bodies,dt,pushing=false,out={dx:0,dz:0,shoved:false,contacts:[],checks:0}){
 const g=CONTACT.gap,contacts=out.contacts??=[],records=out.records??=[];
 out.shoved=false;out.checks=0;
 let used=0;
 const note=(p,d,into)=>{const c=records[used]??={p:null,d:0,into:false};c.p=p;c.d=d;c.into=into;contacts[used++]=c;};
 if(!bodies.length){out.dx=dx;out.dz=dz;contacts.length=0;return out;}

 // 1. An overlap that is already there. The player takes a third of it at most.
 let pushX=0,pushZ=0;
 const k=Math.min(1,CONTACT.depenetrate*dt);
 for(const b of bodies){
  const ox=state.x-b.x,oz=state.z-b.z,d=Math.hypot(ox,oz);out.checks++;
  if(d>=g)continue;
  // Exactly on top of each other (a teleport): a side by id, so it is the same every time.
  const nx=d>1e-6?ox/d:(b.id%2?1:-1),nz=d>1e-6?oz/d:0;
  const amount=Math.min(g-d,k)/3;
  pushX+=nx*amount;pushZ+=nz*amount;
 }

 // 2. The step, with what would press into a body removed.
 const want=Math.hypot(dx,dz);
 out.checks+=constrain(state.x,state.z,dx,dz,bodies,out);
 let rx=out.dx,rz=out.dz;

 // 3. Blocked more or less head-on: try the step turned a little either side, the side away
 // from whoever is most in the way first.
 if(pushing&&want>1e-6&&Math.hypot(rx,rz)<want*.35){
  let lean=0;
  for(const b of bodies){const vx=b.x-state.x,vz=b.z-state.z,d=Math.hypot(vx,vz);
   if(d<g+want+.05)lean+=(dx*vz-dz*vx)/(d||1);}   // >0: the crowd is to the step's right
  const first=lean>0?1:-1;
  let best=Math.hypot(rx,rz);
  for(const t of TURNS)for(const side of [first,-first]){
   const a=t*side,c=Math.cos(a),s=Math.sin(a),tx=dx*c+dz*s,tz=-dx*s+dz*c;
   out.checks+=constrain(state.x,state.z,tx,tz,bodies,out);
   const got=Math.hypot(out.dx,out.dz);
   if(got>best+1e-9){best=got;rx=out.dx;rz=out.dz;}
  }
 }

 // 4. Boxed in: the step never goes to nothing while there is input.
 const floor=CONTACT.shove*dt;
 if(pushing&&want>1e-6&&Math.hypot(rx,rz)<floor){
  const ux=dx/want,uz=dz/want,f=Math.min(floor,want);
  rx=ux*f;rz=uz*f;out.shoved=true;
  // The push-out does not undo the shove; it may only move the player sideways.
  const back=pushX*ux+pushZ*uz;
  if(back<0){pushX-=back*ux;pushZ-=back*uz;}
 }
 out.dx=rx+pushX;out.dz=rz+pushZ;

 // Who is touching the player after the step, and whether the player walked into them.
 const ax=state.x+out.dx,az=state.z+out.dz;
 for(const b of bodies){
  const d=Math.hypot(b.x-ax,b.z-az);
  if(d>g+.05)continue;
  const into=want>1e-6&&((b.x-state.x)*dx+(b.z-state.z)*dz)>0;
  note(b,d,into);
 }
 contacts.length=used;
 return out;
}

/**
 * The contact system the controller owns: the reused buffers, and the numbers the QA hook shows.
 * `onBump(p, bump)` is told about each bump, once per person per cooldown, after the person's
 * own reaction here has been applied.
 */
export function createCrowdContact({onBump=null}={}){
 // `nearby` is everyone within NEARBY of the player, gathered once a frame from the grid and
 // shared with yieldToPlayer (crowd-interaction.mjs), so the nine cells are read once, not
 // twice. `bodies` is the part of it that can touch the player this frame.
 const nearby=[],bodies=[],result={dx:0,dz:0,shoved:false,contacts:[],checks:0};
 const stats={checks:0,contacts:0,bumps:0,dodges:0,fights:0,minGap:null,trappedSeconds:0,lastMs:0};
 const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
 // The contact work only: resolve() and react(), not the wall test (advance) between them.
 let resolveMs=0;
 const api={
  stats,
  get bodies(){return bodies;},
  /** Everyone within `NEARBY` of the player at the start of this frame's step. */
  get nearby(){return nearby;},
  /** Step 1-4 above for this frame's step. Returns `{dx, dz, shoved, contacts}`. */
  resolve(crowd,state,dx,dz,dt,pushing){
   const t0=now();
   const reach=CONTACT.gap+Math.hypot(dx,dz)+.2;
   bodiesNear(crowd,state.x,state.z,state.y,NEARBY,nearby);
   bodies.length=0;
   for(const p of nearby)if((p.x-state.x)**2+(p.z-state.z)**2<=reach*reach)bodies.push(p);
   resolveStep(state,dx,dz,bodies,dt,pushing,result);
   stats.checks+=result.checks+bodies.length;
   if(result.shoved)stats.trappedSeconds+=dt;
   resolveMs=now()-t0;
   return result;
  },
  /**
   * The people's side, after the player has moved: whoever the player walked into gives way,
   * and whoever walked into the player is moved off them.
   */
  react(crowd,state,dt){
   const t0=now();
   let bumped=false;
   for(const c of result.contacts){
    const p=c.p;
    const d=Math.hypot(p.x-state.x,p.z-state.z);
    stats.minGap=stats.minGap===null?d:Math.min(stats.minGap,d);
    stats.contacts++;
    if(c.into){const b=bump(crowd,p,state);if(b){stats.bumps++;bumped=true;if(b.dodged)stats.dodges++;if(b.fight)stats.fights++;onBump?.(p,b);}}
    else if(d<CONTACT.gap&&giveWay(crowd,p,state,d))stats.dodges++;
    if(d<CONTACT.gap)pushOut(crowd,p,state,d,dt);
   }
   // The player loses pace on the frame they hit someone, which is most of what makes it read.
   if(bumped)state.speed*=CONTACT.slow;
   stats.lastMs=resolveMs+now()-t0;
  },
  /**
   * After the crowd's own update (CrowdSimulation.postUpdate), before it is drawn: whoever the
   * crowd walked into the player this frame is moved out of the player's circle, the whole of
   * the overlap, since the player has already moved. Reads this frame's `nearby` list (nobody
   * crosses 2 m in a frame), so it adds no grid scan.
   */
  settle(crowd,state,dt){
   if(!state.alive)return 0;let n=0;
   for(const p of nearby){
    if(!p.active||p.struck!==undefined||p.combatDead)continue;
    const d=Math.hypot(p.x-state.x,p.z-state.z);
    if(d<CONTACT.gap&&pushOut(crowd,p,state,d,dt,1))n++;
   }
   stats.settled=(stats.settled??0)+n;
   return n;
  },
  reset(){Object.assign(stats,{checks:0,contacts:0,bumps:0,dodges:0,fights:0,minGap:null,trappedSeconds:0,lastMs:0});},
  snapshot(){return {...stats};}
 };
 return api;
}

/**
 * Which way a bumped person steps: off the player's line, on the side they are already on,
 * and a little onward. Straight away from the player would put them back in front of a player
 * who is still walking, to be bumped again when the cooldown runs out.
 */
function sideStep(p,state){
 const h=state.bodyHeading??state.heading??0,ux=Math.sin(h),uz=Math.cos(h);
 const ox=p.x-state.x,oz=p.z-state.z,lateral=ox*uz-oz*ux;
 const side=Math.abs(lateral)>.04?Math.sign(lateral):(p.id%2?1:-1);
 const d=Math.hypot(ox,oz)||1;
 return {x:uz*side+ox/d*.5,z:-ux*side+oz/d*.5};
}

/** A deterministic 0..1 per person, so the same people are the ones who speak up. */
const unit=(id,salt)=>((Math.imul((id|0)+salt*7919,0x9e3779b1)>>>0)%100003)/100002;

/**
 * A person the player walked into. Once per person per `CONTACT.cooldown`, and never someone
 * already running from something.
 *
 * - They flinch away from the player: the `hurt*` fields the near figure's Hit overlay and the
 *   HQ crowd read, light walking and strong at a sprint. It is NOT a blow: no health changes,
 *   and nothing here touches combat.
 * - They get out of the way. Walking, and anyone on rails (a crossing or the Scramble cast) at
 *   any pace, with the dodge flight the slow player car uses: it moves the cast through their
 *   flee offset and brings them back to their track, and it never calls `leave()`, so no
 *   signal group is held for a bump. Off rails at a sprint, a stagger the combat system carries
 *   (`staggerX/Z`, as a punch does), about `CONTACT.stagger` metres.
 * - Whether this bump starts a fight: only with one of the few who fight (temperament
 *   `fighter`, ~3% of adults), and combat refuses it while the player is armed. Whoever listens
 *   (`onBump`) starts it, through combat's own path.
 *   Someone off rails who is going to fight stands their ground rather than stepping aside.
 * - Never a knock-down while `CONTACT.knockDown` is false.
 */
export function bump(crowd,p,state){
 if((p.bumpUntil??-Infinity)>crowd.time||p.flee)return null;
 p.bumpUntil=crowd.time+CONTACT.cooldown;
 const speed=Math.max(0,state.speed??0),d=Math.hypot(p.x-state.x,p.z-state.z);
 const strong=speed>=CONTACT.sprint,onRails=railed(p);
 const fight=fighter(p.id,{archetype:p.archetype});
 let dx=p.x-state.x,dz=p.z-state.z;{const l=Math.hypot(dx,dz);if(l>1e-6){dx/=l;dz/=l;}else{const h=state.bodyHeading??state.heading??0;dx=Math.sin(h);dz=Math.cos(h);}}
 const hold=strong?CONTACT.hardFlinch:CONTACT.flinch;
 p.hurtUntil=crowd.time+hold;p.hurtDuration=hold;p.hurtX=dx;p.hurtZ=dz;p.hurtStrong=strong;
 const stands=fight&&!onRails&&p.archetype!=='kid';
 let dodged=false,staggered=false;
 if(strong&&!onRails&&!stands){
  // The stagger's distance is push * hold / 2 (combat.mjs staggerStep), so the push is set
  // from the distance wanted.
  const push=2*CONTACT.stagger/hold;
  p.staggerX=dx*push;p.staggerZ=dz*push;p.staggerLeft=hold;staggered=true;
 }else if(!stands){
  const away=sideStep(p,state);
  dodged=!!crowd.flee?.(p,away.x,away.z,{urgency:0,dodge:true,from:state,speed:1.2+.3*speed,
   distance:CONTACT.gap-d+.35+(strong?.25:0),voice:false});
 }
 if(strong)crowd.say?.(p,'pain',.45);
 else if(unit(p.id,23)<CONTACT.speaks)crowd.say?.(p,'alert',.4);
 crowd.stats.bumped=(crowd.stats.bumped??0)+1;
 return {dodged,staggered,speed,fight,strong,hold,dirX:dx,dirZ:dz,onRails};
}

/**
 * Whoever is still inside the player's circle after this frame is moved out of it by their
 * share: two thirds of the overlap, the player having taken (at most) the other third in
 * resolveStep. Found on the device check: a dodge is a request, and the people who do not act
 * on it -- the cast walking a track that goes through the player (their flee offset closes back
 * onto that line), someone squaring up to fight, someone already running or in cooldown -- were
 * walked through at their own pace. This is the part that is not a request.
 *
 * Only onto ground they may stand on (`fleeAllowed`: walkable, or their own crossing), and for
 * the cast through the flee offset, so their track carries it and brings them back. Never
 * `leave()`. Fast enough for a walker coming straight at the player (`PUSH_RATE`), and at
 * least `depenetrate` for an overlap that was already there.
 */
const PUSH_RATE=2.5;
function pushOut(crowd,p,state,d,dt,share=2/3){
 let nx=p.x-state.x,nz=p.z-state.z;
 if(d>1e-6){nx/=d;nz/=d;}else{nx=p.id%2?1:-1;nz=0;}
 const move=Math.min((CONTACT.gap-d)*share,Math.max(CONTACT.depenetrate,PUSH_RATE)*dt);
 if(!(move>1e-5))return false;
 // Straight out, or a little to either side if that is where the ground allows.
 for(const t of [0,.5,-.5,1,-1]){
  const c=Math.cos(t),s=Math.sin(t),dx=(nx*c+nz*s)*move,dz=(-nx*s+nz*c)*move,x=p.x+dx,z=p.z+dz;
  if(crowd.fleeAllowed&&!crowd.fleeAllowed(p,x,z))continue;
  const old=crowd.cell?.(p.x,p.z);
  if(p.choreographed){p.fleeOffX=(p.fleeOffX??0)+dx;p.fleeOffZ=(p.fleeOffZ??0)+dz;}
  p.previousX=p.x;p.previousZ=p.z;p.x=x;p.z=z;
  if(crowd.network?.ctx?.height)p.height=crowd.network.ctx.height(x,z);
  if(old!==undefined&&crowd.cell(x,z)!==old){const b=crowd.grid.get(old),i=b?.indexOf(p);if(i>=0)b.splice(i,1);crowd.insert(p);}
  return true;
 }
 return false;
}

/** Someone who walked into the player: out of the way, no bump. Rate limited the same way. */
function giveWay(crowd,p,state,d){
 if((p.bumpUntil??-Infinity)>crowd.time||p.flee)return false;
 p.bumpUntil=crowd.time+CONTACT.cooldown;
 const ox=p.x-state.x,oz=p.z-state.z;
 return !!crowd.flee?.(p,ox,oz,{urgency:0,dodge:true,from:state,speed:1.2,distance:CONTACT.gap-d+.3,voice:false});
}
