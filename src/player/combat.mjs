// Melee that happens when the fist arrives, not when the button is pressed.
//
// RUN 8. The previous version applied damage in the same tick as the input: `request()` set a
// flag, the next `update` chose a target and subtracted health immediately, and `attackTime`
// was only a countdown for the renderer. A punch could therefore land before the arm moved,
// and could not miss -- if anyone was in range at the press, they were hit.
//
// Now a swing is an object with a clock, and the hit test runs inside the clip's own active
// window. That makes three things true that were not before: you can miss, you can start a
// swing at nobody and connect because they walked into it, and the damage lands when the hand
// is out.
//
// AUTHORITY. The simulation decides who was hit, how much health they lost, and whether they
// go down. The high-fidelity crowd renderer only shows it. Nothing here reaches into the HQ
// crowd, and the HQ crowd never decides combat -- it reads `struck` and `combatDead` off the
// pedestrian, exactly as it already reads them for a car.
import {legWound} from '../life/street-reactions.mjs';
import {ATTACKS,attackOf,SWORD,swordBearing} from './attack-timing.mjs';
import {HIT_STOP} from './hit-stop.mjs';
import {WEAPONS} from './weapons.mjs';
import {blowOn,RESPONSE,responseOf} from '../life/temperament.mjs';

// Player crowd contact, Step E: four blows either way. The player's punch and a pedestrian's
// both take 25 of 100, so whoever takes the fourth first goes down (was 34, and 14-18).
export const COMBAT=Object.freeze({range:1.75,notice:4.5,playerDamage:25,npcDamage:25,
 officerDamage:15,   // PLAN-POLICE W2: an officer's baton, 15 a hit
 attackSeconds:.42,npcWindup:.55,npcCooldown:1.05,hostileSeconds:14,
 // How wide a swing reaches, in radians either side of where the body is facing. A punch is
 // not a radius: something directly behind you cannot be hit.
 arc:1.05,
 // Who a swing is thrown AT, picked when it starts: the nearest person within this far and
 // this wide of where the player is looking or going. The body turns onto them and follows
 // them through the wind-up, so a punch goes at a person rather than at a compass heading.
 lockRange:2.4,lockArc:1.2,
 // What a punch does to the people who see it, and how far that carries. Bounded on purpose:
 // one punch must not empty the crossing.
 witnessRadius:11,witnessSeverity:.72,
 // PLAN-WEAPONS W1: the katana. Every other cut is played 12% faster (R5: one clip, so the
 // rhythm varies by speed rather than by a second animation), and a cut that meets a wall or a
 // car stops where it met it: the clip holds there for `clankHold` s, then hands back to the gait.
 katanaFast:1.12,clankHold:.16,bodyRadius:.3,katanaWitness:.9,
 // PLAN-WEAPONS R11: how hard a fatal shot pushes the body, m/s, with no lift. A car's throw is
 // 2.4 m/s and up; a bullet does not carry a person.
 shotPush:.7,
 // §9ak: the push a killing cut gives the body (m/s, horizontal): a stumble, not a throw.
 cutPush:.9});

export const PHASE=Object.freeze({IDLE:'idle',WINDUP:'windup',ACTIVE:'active',RECOVERY:'recovery'});

const nearby=(crowd,x,z,r)=>{const out=[],ix=Math.floor(x/2),iz=Math.floor(z/2),cells=Math.ceil(r/2);
 for(let i=ix-cells;i<=ix+cells;i++)for(let j=iz-cells;j<=iz+cells;j++)
  for(const p of crowd?.grid?.get(i+','+j)??[])if(!out.includes(p))out.push(p);
 return out;};
/**
 * How far a stagger carries this frame, as a fraction of its push speed (m per m/s). The push
 * falls linearly from full at `hold` seconds left to zero, so over a frame from `left` to
 * `left - dt` the distance is the area under that line. Frame-rate independent by
 * construction: the frames of any length always sum to `hold / 2`.
 */
export function staggerStep(left,hold,dt){
 const a=Math.max(0,left),b=Math.max(0,left-Math.max(0,dt));
 return (a*a-b*b)/(2*hold);
}
const angleTo=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z);

/**
 * Someone whose movement belongs to something other than their own will: an in-progress
 * crossing, or a Scramble cast member walking their track.
 *
 * They can be HIT. They cannot be STOPPED. Taking either off their route mid-stride is what
 * holds a signal group, and a held group stops the clock for every signal on the map.
 *
 * A cast member standing at a kerb (waiting for the green, or just off the far end) is NOT on
 * rails: the choreography holds them there while they fight (choreography.mjs), and whatever
 * the fight moves them is kept as their flee offset, so they walk back to their slot through
 * the same return a flight uses. Before, `choreographed` alone counted, and since the cast is
 * always cast, a punched cast member never fought back anywhere.
 */
export const onRails=p=>!!(p.crossing||p.choreographed&&(p.state==='crossing'||p.track?.finishing));
/**
 * Move a pedestrian for combat (an approach, a stagger), keeping the grid right, and for a cast
 * member keeping the displacement as a flee offset so their track takes them back.
 */
function shift(crowd,p,nx,nz){
 const old=crowd.cell(p.x,p.z);
 if(p.choreographed){p.fleeOffX=(p.fleeOffX??0)+nx-p.x;p.fleeOffZ=(p.fleeOffZ??0)+nz-p.z;}
 p.x=nx;p.z=nz;
 if(crowd.cell(nx,nz)!==old){const b=crowd.grid.get(old),i=b?.indexOf(p);if(i>=0)b.splice(i,1);crowd.insert(p);}
}
const turn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

/**
 * The katana's cut against the street, for one step of a swing (PLAN-WEAPONS R6). Pure.
 *
 * The blade tip sweeps the measured bearings (attack-timing.mjs SWORD) between clip times `c0`
 * and `c1`. A solid (wall) or a car on the blade's line, sampled at the tip and half-way along,
 * stops the cut there: `stop` is the bearing and point where it met it, and nobody past that
 * point is cut. People are cut if they are within `reach` and inside the swept wedge, widened by
 * their body radius. Returns {from, to, stop, people}.
 */
export function katanaSweep({x,z,heading},c0,c1,{solid=()=>false,car=()=>false,people=[],reach=WEAPONS.katana.reach}={}){
 const a=Math.max(c0,SWORD.windup),b=Math.min(c1,SWORD.activeEnd);
 const out={from:null,to:null,stop:null,people:[]};
 if(!(b>a)&&!(c0<=SWORD.windup&&c1>=SWORD.activeEnd))return out;
 const from=swordBearing(a),to=swordBearing(b);
 out.from=from;out.to=to;
 // March the arc in small steps so a thin wall between two samples is not stepped over.
 const steps=Math.max(1,Math.ceil(Math.abs(to-from)/.08));
 let end=to;
 for(let i=0;i<=steps&&!out.stop;i++){
  const t=from+(to-from)*i/steps,h=heading+t;
  for(const r of [SWORD.tipReach,SWORD.tipReach*.6]){
   const px=x+Math.sin(h)*r,pz=z+Math.cos(h)*r;
   if(solid(px,pz)||car(px,pz)){out.stop={bearing:t,x:px,z:pz,what:solid(px,pz)?'wall':'car'};end=t;break;}
  }
 }
 const lo=Math.min(from,end),hi=Math.max(from,end);
 for(const p of people){
  const d=Math.hypot(p.x-x,p.z-z);if(d>reach||d<1e-3)continue;
  const rel=turn(heading,angleTo({x,z},p)),w=Math.asin(Math.min(1,COMBAT.bodyRadius/d));
  if(rel+w>=lo&&rel-w<=hi)out.people.push(p);
 }
 return out;
}

/**
 * @param {object} [options]
 * @param {null|((event:{x:number,z:number,severity:number,radius:number,
 *   attacker:string,victim:number|null,time:number})=>number)} [options.onWitness]
 *   Called when a punch is thrown, with where and how bad. Returns how many people reacted.
 *   The listener owns the bounding; this module does not scan the crowd itself.
 * @param {null|((event:{victim:number,blow:object,response:string,time:number})=>any)} [options.onBlow]
 *   RUN 11.2: one blow on one victim, so the body drawing them can flinch and follow it up.
 * @param {null|((kind:string,event:{x:number,z:number,intensity:number,id?:number})=>any)} [options.onEvent]
 *   RUN 11.3: swings, hits and pain, for the feedback bus (audio, camera).
 * @param {()=>string} [options.weapon]
 *   PLAN-WEAPONS W1: what the player is holding; 'katana' turns a swing into a cut.
 */
export function createMeleeCombat({onWitness=null,onBlow=null,onEvent=null,weapon=()=>'fists'}={}){
 let pending=false,target=null,disposed=false,swingIndex=0;
 let swing=null;                       // the attack in flight, or null
 let lastBlow=null;                    // the most recent landed blow, for QA
 const stats={swings:0,hits:0,misses:0,npcHits:0,npcDeaths:0,witnessEvents:0,witnesses:0,cuts:0,clanks:0,shotHits:0,headshots:0,
  byResponse:{fight:0,flee:0,backoff:0}};

 /**
  * Who may be punched.
  *
  * A pedestrian on a crossing, and a member of the choreographed Scramble cast, are BOTH
  * valid targets. Excluding either made the middle of a scramble crossing -- most of this
  * map, and 74-85% of the population -- a place where combat silently did nothing: the live
  * QA threw punches at a crowd 8 cm away and every one of them missed, because every body
  * near the player was cast.
  *
  * Being hit is safe for them because `simulation.step` tests `struck` BEFORE it hands a
  * choreographed pedestrian to `choreography.move`, so a falling body is carried by the
  * knock-down path and not by its track. This is the same route a car already takes through
  * `strike`. What protects the signals is not refusing to hit them; it is refusing to take
  * them off their route for anything short of going down. See `engage`.
  */
 const eligible=(p,crowd)=>p.active&&!p.controlled&&p.struck===undefined&&
  !p.combatDead&&p.archetype!=='kid'&&crowd.network.ctx.safe(p.x,p.z,.28);

 /** The best target for a swing landing right now, or null. Range and arc, not nearest. */
 function choose(crowd,state){
  let best=null,score=Infinity;
  for(const p of nearby(crowd,state.x,state.z,COMBAT.range)){
   if(!eligible(p,crowd))continue;
   const d=Math.hypot(p.x-state.x,p.z-state.z);
   if(d>COMBAT.range)continue;
   const facing=state.bodyHeading??state.heading;
   const a=Math.abs(turn(facing,angleTo(state,p)));
   if(a>COMBAT.arc)continue;                       // behind, or off to the side
   const s=d+a*.65;
   if(s<score){score=s;best=p;}
  }
  return best;
 }

 /**
  * Make a pedestrian hostile.
  *
  * A pedestrian who is mid-crossing, or who is part of the choreographed Scramble cast, is
  * NOT pulled off their route to fight. Stopping one where they stand would hold their signal
  * group while the controller waits for the crossing to clear, and eight of those is what
  * froze every signal on the map once before; a cast member would in any case be moved back
  * onto their track by `choreography.move` on the very next tick, so the two would fight over
  * the body every frame. They take the damage and the reaction and keep walking.
  *
  * Only going down takes them off the route, and that happens through `crowd.strike`, which
  * releases the group properly and is handled ahead of the choreography in `simulation.step`.
  *
  * The hostility window is still opened, so a cast member who is punched and then reaches the
  * far kerb turns and fights -- see the retaliation filter below.
  */
 /**
  * Owner's rule (after stage 6): a fight only against bare fists, only with one of the few who
  * fight (temperament, ~3% of adults), and one at a time -- a second would-be fighter backs off
  * while someone else is already squaring up. Officers are the police's business (units.mjs).
  */
 const armed=()=>weapon()!=='fists';
 const fighting=(crowd,except=null)=>{for(const q of crowd.pool??[])if(q!==except&&q.active&&!q.combatDead&&!q.officer&&q.combatTarget==='player'&&q.combatUntil>crowd.time)return true;return false;};
 const willFight=(crowd,p)=>!armed()&&responseOf(p.id,{archetype:p.archetype})===RESPONSE.FIGHT&&!fighting(crowd,p);
 /** Out of it: the fight dropped, and away from the player -- screaming if `scream`. */
 function scare(crowd,p,state,{scream=true,urgency=.9}={}){
  if(p.combatTarget==='player'){p.combatTarget=null;p.combatUntil=0;p.npcSwing=null;p.combatAction=0;if(p.state==='fighting')p.state='walking';if(target===p)target=null;}
  crowd.flee?.(p,p.x-state.x,p.z-state.z,{urgency,from:state,voice:!scream});
  if(scream)crowd.say?.(p,'scream',1);
 }
 function engage(crowd,p,state){
  p.combatHealth??=100;
  p.combatTarget='player';
  p.combatUntil=crowd.time+COMBAT.hostileSeconds;
  if(!onRails(p)){
   crowd.leave(p);
   p.combatNext=Math.max(p.combatNext??0,crowd.time+COMBAT.npcWindup);
   p.state='fighting';p.speed=0;p.heading=angleTo(p,state);
   target=p;
  }
  crowd.say?.(p,'alert',.75);
 }

 function kill(crowd,p,state,impulse=null){
  p.combatDead=true;p.combatTarget=null;p.combatAction=-1;stats.npcDeaths++;
  const dx=p.x-state.x,dz=p.z-state.z;
  // `strike` is the simulation's own knock-down: it calls `leave` first, so a crossing is
  // released rather than abandoned, and the HQ crowd picks the body up from `struck`.
  // A shot (PLAN-WEAPONS R11) hands in its own small push along the bullet, with no lift: the
  // body goes down where it stood instead of being thrown like a car's victim.
  crowd.strike(p,dx,dz,2.4,impulse);p.fatal=true;
  // Stage 1: told once per death, for the blood pool under the body and the kill marker.
  {const l=Math.hypot(dx,dz)||1;onEvent?.('npc_killed',{x:p.x,z:p.z,intensity:1,id:p.id,dirX:dx/l,dirZ:dz/l});}
 }

 /**
  * §9ai: record a blow on the person for the body that draws them -- which way it went, where it
  * struck and how hard (figure.mjs flinches on a new `hitSeq`), and, if it killed them, how the
  * ragdoll starts: the crowd's own knock-down push, plus the blow at the point it struck.
  */
 function mark(crowd,p,{dirX,dirZ,zone,strength=1,fatal=false,kind='pistol'}){
  const l=Math.hypot(dirX,dirZ)||1;
  p.hitSeq=(p.hitSeq??0)+1;p.hitAt=crowd.time??0;p.hitX=dirX/l;p.hitZ=dirZ/l;p.hitZone=zone;p.hitStrength=strength;
  // H1: the victim's body catches for the blow's hit-stop, as the attacker's swing does.
  p.hitStopUntil=Math.max(p.hitStopUntil??0,(crowd.time??0)+(HIT_STOP[kind]??HIT_STOP.pistol));
  if(fatal)p.ragdoll={seq:p.hitSeq,dir:{x:dirX/l,z:dirZ/l},zone,strength,
   push:{x:p.flyX??0,y:(p.flyY??0)*.5,z:p.flyZ??0},ground:p.flyGround??p.height??0};
 }

 /** Tell whoever is listening that a punch was thrown here. Bounded by the listener. */
 function witness(crowd,state,victim,severity){
  if(!onWitness)return;
  const n=onWitness({x:state.x,z:state.z,severity,radius:COMBAT.witnessRadius,
   attacker:'player',victim:victim?.id??null,time:crowd.time??0})|0;
  stats.witnessEvents++;stats.witnesses+=n;
 }

 /**
  * Where the player means to punch: forward is where they are going when they move, and
  * where the camera looks when they stand (the figure faces the camera standing, too).
  */
 const forwardOf=state=>(state.speed??0)>.16?(state.bodyHeading??state.heading??0):(state.heading??state.bodyHeading??0);

 /** The person a swing is thrown at, or null. Nearest and most in front, as `choose`. */
 function lockOn(crowd,state){
  const forward=forwardOf(state);let best=null,score=Infinity;
  for(const p of nearby(crowd,state.x,state.z,COMBAT.lockRange)){
   if(!eligible(p,crowd))continue;
   const d=Math.hypot(p.x-state.x,p.z-state.z);
   if(d>COMBAT.lockRange)continue;
   const a=Math.abs(turn(forward,angleTo(state,p)));
   if(a>COMBAT.lockArc)continue;
   const s=d+a*.65;
   if(s<score){score=s;best=p;}
  }
  return best;
 }

 /** Face the swing: the aim is what the figure turns onto and what the hit arc measures from. */
 function aimAt(state,heading){state.attackHeading=heading;state.bodyHeading=heading;}

 /**
  * One step of a katana cut (PLAN-WEAPONS W1). Everyone the blade crosses is cut, once per
  * swing; a wall or a car on the line stops the blade there with a clank, and the clip holds at
  * that frame before handing back to the gait.
  */
 function cut(crowd,player,before,elapsed){
  const state=player.state,ctx=crowd.network?.ctx;
  const people=nearby(crowd,state.x,state.z,WEAPONS.katana.reach).filter(p=>eligible(p,crowd)&&!swing.cut.has(p.id));
  const r=katanaSweep({x:state.x,z:state.z,heading:state.attackHeading??state.bodyHeading??state.heading},
   before*swing.rate,elapsed*swing.rate,{people,
    solid:(x,z)=>!!ctx?.solid?.(x,z,.02),car:(x,z)=>!!crowd.vehicleOverlap?.(x,z,.05)});
  for(const p of r.people){
   swing.cut.add(p.id);swing.hitConsumed=true;stats.cuts++;
   p.combatHealth=(p.combatHealth??100)-WEAPONS.katana.damage;
   const fatal=p.combatHealth<=0;
   const blow=blowOn(state,p,{attack:'PunchCross',fatal});
   p.hurtUntil=crowd.time+blow.hold;p.hurtDuration=blow.hold;
   {const l=Math.hypot(blow.impulse.x,blow.impulse.z)||1;p.hurtX=blow.impulse.x/l;p.hurtZ=blow.impulse.z/l;p.hurtStrong=true;}
   // The player is armed: whoever the blade meets runs, screaming (owner's rule).
   stats.hits++;stats.byResponse[RESPONSE.FLEE]++;
   // Where the blade met them, from how far through its sweep it was at their bearing (the tip
   // comes down from over the head to the knee), and the way it was going: across the body from
   // its left to its right, and away from the swordsman.
   const h=state.attackHeading??state.bodyHeading??state.heading??0,rel=turn(h,angleTo(state,p));
   const u=Math.max(0,Math.min(1,(SWORD.sweepFrom-rel)/(SWORD.sweepFrom-SWORD.sweepTo||1)));
   const tip=SWORD.tipHeight[1]+(SWORD.tipHeight[0]-SWORD.tipHeight[1])*u;
   const away=angleTo(state,p),rx=-Math.cos(h),rz=Math.sin(h);
   let bx=Math.sin(away)*.6+rx*.8,bz=Math.cos(away)*.6+rz*.8;{const l=Math.hypot(bx,bz)||1;bx/=l;bz/=l;}
   // §9ak: a cut does not throw a body like a car does. It gives way where it stands, carried a
   // little along the blade (COMBAT.cutPush m/s, no lift), and the ragdoll does the rest.
   if(fatal)kill(crowd,p,state,{x:bx*COMBAT.cutPush,z:bz*COMBAT.cutPush,y:0});
   else{scare(crowd,p,state,{scream:true,urgency:1});if(!onRails(p)){p.staggerX=blow.impulse.x;p.staggerZ=blow.impulse.z;p.staggerLeft=blow.hold;}}
   mark(crowd,p,{dirX:bx,dirZ:bz,zone:tip>1.45?'head':tip<.8?'legs':'body',strength:1.2,fatal,kind:'katana'});
   onBlow?.({victim:p.id,blow,response:RESPONSE.FLEE,time:crowd.time});
   lastBlow={victim:p.id,response:RESPONSE.FLEE,strength:'strong',quarter:blow.quarter,fatal,time:crowd.time,weapon:'katana'};
   onEvent?.('blade_hit',{x:p.x,z:p.z,intensity:1,id:p.id});
   onEvent?.(fatal?'pedestrian_scream':'pain_voice',{x:p.x,z:p.z,intensity:fatal?1:.8,id:p.id});
   witness(crowd,state,p,COMBAT.katanaWitness);
  }
  if(r.stop){
   swing.stopped=r.stop;stats.clanks++;
   onEvent?.('blade_clank',{x:r.stop.x,z:r.stop.z,intensity:1,what:r.stop.what});
   // Hold the clip at the frame the blade met the wall, briefly, then the gait has the body back.
   state.attackHold=Math.min(SWORD.activeEnd,elapsed*swing.rate)/SWORD.duration;
   state.attackTime=Math.min(state.attackTime??0,COMBAT.clankHold);
   swing.elapsed=Math.max(swing.elapsed,swing.timing.duration-COMBAT.clankHold);
  }
 }

 /** One swing's worth of state. The clip decides its own timing; see attack-timing.mjs. */
 function start(player,crowd){
  const katana=weapon()==='katana';
  const name=katana?SWORD.name:ATTACKS[swingIndex%ATTACKS.length].name;
  swingIndex++;
  // A cut plays at 1x or katanaFast; its window and length scale with it. The clip time is
  // elapsed * rate, which is what the sweep table is indexed by.
  const rate=katana&&swingIndex%2===0?COMBAT.katanaFast:1;
  const base=katana?SWORD:attackOf(name);
  const timing=rate===1?base:{...base,duration:base.duration/rate,windup:base.windup/rate,activeEnd:base.activeEnd/rate,peak:base.peak/rate};
  const state=player.state,aim=crowd?lockOn(crowd,state):null;
  swing={id:swingIndex,name,timing,elapsed:0,phase:PHASE.WINDUP,hitConsumed:false,aim,katana,rate,cut:new Set(),stopped:null};
  // §9aj G1: the one the swing is thrown at gets a detailed body before it lands.
  if(aim)aim.aimedUntil=(crowd?.time??0)+timing.duration+.3;
  stats.swings++;
  aimAt(state,aim?angleTo(state,aim):forwardOf(state));
  // The renderer plays the clip for as long as the clip lasts, not for a fixed 0.42 s.
  state.attackHold=null;
  player.startAttack?.(timing.duration,name);
  return swing;
 }

 return {
  request(){if(!disposed)pending=true;},
  get phase(){return swing?swing.phase:PHASE.IDLE;},
  get swing(){return swing&&{id:swing.id,name:swing.name,phase:swing.phase,
   elapsed:Number(swing.elapsed.toFixed(3)),hitConsumed:swing.hitConsumed,aim:swing.aim?.id??null};},

  update(dt,crowd,player){
   if(disposed||!crowd||!player?.state)return stats;
   const state=player.state;
   state.attackTime=Math.max(0,(state.attackTime??0)-dt);
   state.hurtTime=Math.max(0,(state.hurtTime??0)-dt);

   // A new swing only starts when the last one has finished. Holding the button does not
   // stack punches, and a press during recovery is dropped rather than queued.
   if(pending){
    pending=false;
    if(state.alive&&!swing){start(player,crowd);onEvent?.('punch_swing',{x:state.x,z:state.z,intensity:.6});}
   }
   // Staggers: a blown-back step, a fraction of a second long, only where the walkable context
   // allows it and never for anyone on a crossing or on the choreographed track.
   for(const p of nearby(crowd,state.x,state.z,COMBAT.notice+2)){
    // Counted down in seconds, so it always ends. The push decays linearly to zero over the
    // blow's hold, and the step is the EXACT integral of that over this frame: taking the
    // start-of-frame speed for the whole frame carried a cross 45% further at 7 fps than at
    // 60 (claude/crowd-realism), and the last partial frame overshot the hold entirely.
    if(!(p.staggerLeft>0)||p.struck!==undefined||onRails(p))continue;
    const k=staggerStep(p.staggerLeft,Math.max(.05,p.hurtDuration??.34),dt);p.staggerLeft=Math.max(0,p.staggerLeft-dt);
    const nx=p.x+p.staggerX*k,nz=p.z+p.staggerZ*k;
    if(crowd.network.ctx.safe(nx,nz,.28)&&!crowd.vehicleOverlap?.(nx,nz,.35)&&!crowd.blocked?.(nx,nz,p,.4,false))shift(crowd,p,nx,nz);
   }

   if(swing){
    // Through the wind-up the aim follows its person, so someone stepping aside is still who
    // the fist goes at. Once the fist is travelling, the line is fixed.
    if(swing.aim&&swing.elapsed<swing.timing.windup){
     const p=swing.aim;
     if(eligible(p,crowd)&&Math.hypot(p.x-state.x,p.z-state.z)<=COMBAT.lockRange+.5)aimAt(state,angleTo(state,p));
     else swing.aim=null;
    }
    const before=swing.elapsed;
    swing.elapsed+=Math.max(0,dt);
    const {windup,activeEnd,duration}=swing.timing;
    const was=swing.phase;
    swing.phase=swing.elapsed<windup?PHASE.WINDUP
     :swing.elapsed<activeEnd?PHASE.ACTIVE
     :swing.elapsed<duration?PHASE.RECOVERY:PHASE.IDLE;

    // THE HIT TEST RUNS HERE, inside the active window, and at most once per swing. Choosing
    // the target at input time is what made a miss impossible.
    //
    // The test is whether this STEP crossed the window, not whether it landed inside it. A
    // frame long enough to step over a 180 ms window would otherwise skip the punch
    // entirely -- at 60 Hz that never happens, but a stall, a background tab or a test using
    // coarse steps all produce it, and a punch that silently does nothing when the frame
    // rate dips is worse than one that lands a frame late.
    const crossed=swing.elapsed>=windup&&before<activeEnd;
    if(swing.katana){
     if(crossed&&!swing.stopped&&state.alive)cut(crowd,player,before,swing.elapsed);
    }else if(crossed&&!swing.hitConsumed&&state.alive){
     const p=choose(crowd,state);
     if(p){
      swing.hitConsumed=true;
      // RUN 11.2. How this blow lands (a jab flinches, a cross staggers, both away from the
      // fist) and how this person answers it (fight, flee or back off -- by who they are, not
      // at random). Setting `combatAction` on the victim here made a near body play its own
      // PUNCH on being hit; the victim's swing sets that when they actually throw one.
      p.combatHealth=(p.combatHealth??100)-COMBAT.playerDamage;
      const fatal=p.combatHealth<=0;
      const blow=blowOn(state,p,{attack:swing.name,fatal});
      // Owner's rule: only the few who fight hit back (and one at a time); the rest run, or step
      // back and then run, crying out.
      const response=willFight(crowd,p)?RESPONSE.FIGHT:responseOf(p.id,{archetype:p.archetype})===RESPONSE.FLEE?RESPONSE.FLEE:RESPONSE.BACK_OFF;
      p.hurtUntil=crowd.time+blow.hold;p.hurtDuration=blow.hold;
      // Which way the blow drove them, for the near body's recoil (figure.mjs hitRecoil). Set
      // for everyone, including people on a crossing whom the simulation does not stagger.
      {const l=Math.hypot(blow.impulse.x,blow.impulse.z)||1;p.hurtX=blow.impulse.x/l;p.hurtZ=blow.impulse.z/l;p.hurtStrong=blow.strength==='strong';}
      stats.hits++;stats.byResponse[response]++;
      if(fatal)kill(crowd,p,state);
      else{
       if(response===RESPONSE.FIGHT)engage(crowd,p,state);
       else scare(crowd,p,state,{scream:response===RESPONSE.FLEE,urgency:response===RESPONSE.FLEE?1:.7});
       // A stagger the simulation owns, so every renderer shows the same step back.
       if(!onRails(p)){p.staggerX=blow.impulse.x;p.staggerZ=blow.impulse.z;p.staggerLeft=blow.hold;}
      }
      onBlow?.({victim:p.id,blow,response,time:crowd.time});
      lastBlow={victim:p.id,response,strength:blow.strength,quarter:blow.quarter,fatal,time:crowd.time};
      onEvent?.('punch_hit',{x:p.x,z:p.z,intensity:blow.strength==='strong'?1:.7,id:p.id});
      onEvent?.(fatal?'pedestrian_scream':'pain_voice',{x:p.x,z:p.z,intensity:fatal?1:.6,id:p.id});
      witness(crowd,state,p,COMBAT.witnessSeverity);
     }
    }
    if(was!==PHASE.IDLE&&swing.phase===PHASE.IDLE){
     if(!swing.hitConsumed){stats.misses++;witness(crowd,state,null,COMBAT.witnessSeverity*(swing.katana?.8:.55));}
     swing=null;
    }
   }

   // Owner's rule: a weapon out breaks every fist fight -- they scream and run.
   if(armed())for(const p of crowd.pool??[])
    if(p.combatTarget==='player'&&p.combatUntil>crowd.time&&!p.officer&&!p.combatDead)scare(crowd,p,state,{scream:true,urgency:1});
   // Only pedestrians whose movement is their own may be walked toward the player and
   // stopped to fight. Someone on a track or a crossing keeps going, and picks the fight up
   // when they are off it, while the hostility window lasts.
   const hostiles=nearby(crowd,state.x,state.z,COMBAT.notice)
    .filter(p=>eligible(p,crowd)&&p.combatTarget==='player'&&p.combatUntil>crowd.time&&!onRails(p)
     // Officers (PLAN-POLICE W2) close in, grab and use the baton in src/police/units.mjs.
     &&!p.officer);
   for(const p of hostiles){
    const d=Math.hypot(state.x-p.x,state.z-p.z);
    p.heading=angleTo(p,state);p.state='fighting';p.speed=0;
    p.combatAction=Math.max(0,(p.combatAction??0)-dt*4);
    if(d>COMBAT.range*.82){
     const step=Math.min(.95*dt,d-COMBAT.range*.72),dx=(state.x-p.x)/d,dz=(state.z-p.z)/d,
      nx=p.x+dx*step,nz=p.z+dz*step;
     if(crowd.network.ctx.safe(nx,nz,.28)&&!crowd.vehicleOverlap(nx,nz,.35)&&!crowd.blocked?.(nx,nz,p,.52,false)){
      shift(crowd,p,nx,nz);p.renderX=nx;p.renderZ=nz;
     }
     p.npcSwing=null;
    }else if(state.alive){
     // The NPC swings on the same model the player does: a wind-up, then damage when the arm
     // is out. A player who has to respect a hit window while the crowd lands instantly is
     // not fighting, they are being audited.
     if(!p.npcSwing&&crowd.time>=(p.combatNext??0)){
      p.npcSwing={elapsed:0,timing:attackOf(ATTACKS[p.id%ATTACKS.length].name),hitConsumed:false};
      p.combatAction=1;
     }
     if(p.npcSwing){
      const before=p.npcSwing.elapsed;
      p.npcSwing.elapsed+=dt;
      const {windup,activeEnd,duration}=p.npcSwing.timing;
      // Crossing the window, not landing inside it -- the same rule the player's swing uses.
      // Having one and not the other meant a long frame silently disarmed the crowd while
      // the player kept punching, which is a difficulty setting nobody asked for.
      if(p.npcSwing.elapsed>=windup&&before<activeEnd&&!p.npcSwing.hitConsumed){
       p.npcSwing.hitConsumed=true;
       if(Math.hypot(state.x-p.x,state.z-p.z)<=COMBAT.range&&
          player.hurt?.(p.officer?COMBAT.officerDamage:COMBAT.npcDamage,p.officer?'police':'fight'))stats.npcHits++;
      }
      if(p.npcSwing.elapsed>=duration){
       p.npcSwing=null;p.combatNext=crowd.time+COMBAT.npcCooldown+(p.id%4)*.12;
      }
     }
    }
   }
   if(target&&(!target.active||target.combatDead||target.combatUntil<=crowd.time))target=null;
   return stats;
  },
  /**
   * Start a fight without a blow: the player walked into someone and they took it badly
   * (src/player/crowd-contact.mjs, 30% of bumps). The same `engage` a punch uses, so someone
   * on a crossing or the Scramble cast keeps walking and turns at the kerb, and the fight that
   * follows is the ordinary one. Nothing is counted as a swing, a hit or a witness event.
   */
  /**
   * A gunshot on a pedestrian (PLAN-WEAPONS W2, R10/R11). `head` is a hit above the head line,
   * which takes them down at once; otherwise `damage` comes off their 100. A fatal shot puts
   * them down with a gentle push along `dir`; a survivor flinches away from the bullet and runs,
   * unless they are on rails (a crossing, the cast's track), who keep walking -- being stopped
   * there would hold the signals (§16a). Returns 'killed', 'wounded' or null (not a valid target).
   */
  wound(crowd,player,p,{damage=50,head=false,dir={x:0,z:1},weapon='pistol',part=null}={}){
   if(disposed||!crowd||!p||!eligible(p,crowd))return null;
   const state=player?.state??{x:p.x-dir.x,z:p.z-dir.z};
   p.combatHealth=(p.combatHealth??100)-(head?Infinity:damage);
   const fatal=p.combatHealth<=0,l=Math.hypot(dir.x,dir.z)||1,ux=dir.x/l,uz=dir.z/l;
   stats.shotHits++;if(head)stats.headshots++;
   p.hurtUntil=crowd.time+.45;p.hurtDuration=.45;p.hurtX=ux;p.hurtZ=uz;p.hurtStrong=true;
   if(fatal)kill(crowd,p,state,{x:ux*COMBAT.shotPush,z:uz*COMBAT.shotPush,y:0});
   else if(!onRails(p)){p.combatTarget=null;crowd.flee?.(p,ux,uz,{urgency:1,from:state});}
   // Roadmap stage 2: a round in the legs that does not kill leaves them limping, or crawling.
   if(!fatal&&part==='legs')legWound(p);
   // §9ai: the round's kick on the body; an automatic's rounds are lighter each, and add up.
   mark(crowd,p,{dirX:ux,dirZ:uz,zone:part??(head?'head':'body'),strength:weapon==='smg'?.6:1,fatal,kind:weapon==='smg'?'smg':'pistol'});
   lastBlow={victim:p.id,response:'shot',strength:'strong',quarter:'front',fatal,time:crowd.time,weapon};
   onBlow?.({victim:p.id,blow:{hold:.45,fatal,impulse:{x:ux,z:uz},strength:'strong'},response:'backoff',time:crowd.time});
   onEvent?.('bullet_hit',{x:p.x,z:p.z,intensity:1,id:p.id,head});
   onEvent?.(fatal?'pedestrian_scream':'pain_voice',{x:p.x,z:p.z,intensity:1,id:p.id});
   return fatal?'killed':'wounded';
  },
  provoke(crowd,p,player){
   if(disposed||!crowd||!p||!player?.state?.alive||!eligible(p,crowd))return false;
   if(p.combatTarget==='player'&&p.combatUntil>crowd.time)return false;
   if(!willFight(crowd,p))return false;
   engage(crowd,p,player.state);return true;
  },
  snapshot(){return {...stats,byResponse:{...stats.byResponse},lastBlow,target:target?.id??null,
   phase:swing?swing.phase:PHASE.IDLE,clip:swing?swing.name:null,stopped:swing?.stopped?.what??null};},
  reset(){pending=false;target=null;swing=null;},
  dispose(){disposed=true;pending=false;target=null;swing=null;}
 };
}
