import {ARCHETYPES} from './config.mjs';
import {STATE} from './hq-crowd.mjs';
import {ARCHETYPES as LOOKS,appearanceOf,paletteOf,deduplicate} from './appearance.mjs';
import {Group} from 'three';
import {createPlayerFigure,bakedAsset} from '../player/figure.mjs';
import {paceStep,PACE} from './pace.mjs';
import {victimScale} from '../player/hit-stop.mjs';

export const NEAR_LIMITS={high:32,medium:12,low:4};

/**
 * How many of those slots get the full humanoid rather than the offline-baked figure.
 *
 * RUN 6's point is not that two thousand people become high fidelity; it is that the handful
 * the camera is actually looking at stop being copies of one simple doll. So the pool is two
 * pools: the nearest few wear the 65-bone body the player wears, and the rest keep the baked
 * eleven-bone figure that has always been there.
 *
 * The numbers come from scripts/audit-near-pool.mjs. Per rig the humanoid is 4.1x the
 * triangles of the baked figure and HALF the draw calls -- three meshes against six -- so the
 * cost that scales here is skinning and bone matrices, not batches. At HIGH, eight humanoids
 * plus twenty-four baked figures is 190k triangles against the all-baked 121k, while the draw
 * calls fall from 192 to 168.
 */
export const HUMANOID_LIMITS={high:8,medium:4,low:0};

/**
 * How many near characters get foot IK, at most.
 *
 * RUN 5 measured the solver at 13 microseconds and 3.9 ground queries a frame. Eight of them
 * is 0.1 ms and 31 queries, which is affordable; thirty-two is not obviously so, and the brief
 * for this run says to bound it rather than find out. Only humanoid slots can have it at all:
 * the baked figure has eleven bones and none of the joint names the solver needs.
 */
export const NEAR_IK_LIMITS={high:8,medium:4,low:0};

/**
 * §9ai H4: how many of the humanoid slots may be holding a body killed by a blade or a bullet, so
 * that its ragdoll plays out. Only a body the pool was ALREADY holding when it died is kept -- one
 * picked up afterwards would stand up in the idle pose and then fall. The rest stay with the mass
 * crowd, which plays its knock-down as before.
 */
export const RAGDOLL_LIMIT=4;
const fallen=p=>p.struck!==undefined&&p.combatDead&&!!p.ragdoll;

/**
 * §9aj G1: whoever the player is aiming at or has just hit gets a humanoid, wherever they stand
 * within a gun's reach -- as GTA does: not every pedestrian is detailed, but the one you shoot
 * always is. `aimedUntil` is written by the arsenal (lock-on, or the person on the crosshair) and
 * by the katana's lock-on; `hitAt` by every landed blow. Such a person outranks everyone merely
 * nearer and is kept out to `PRIORITY_RANGE`; the bystander they displace goes back to the mass
 * crowd, which draws them just as well at that distance.
 */
export const PRIORITY_RANGE=55,PRIORITY_HOLD=4;
const priorityOf=(p,clock)=>(p.aimedUntil>clock)||(clock-(p.hitAt??-1e9)<PRIORITY_HOLD)
 // Roadmap stage 2: someone with their hands up, crawling, or shooting back is worth the detail.
 ||p.handsUpUntil>clock||!!p.crawling||(!p.officer&&!!p.gunDrawn)
 // Stage 5: a mission's client or thief.
 ||!!p.missionRole;

// RUN 6.8 moved what a citizen looks like into src/life/appearance.mjs. It used to be eight
// wardrobes and a skin list right here, which produced eight recolours of one body -- the
// clone problem that run exists to fix. Appearance is now a pure function of the pedestrian
// id and includes the archetype (rig + hairstyle) and the build, not just the colours.

/**
 * The clip word for a citizen's life state.
 *
 * `look` turns the head towards `threatHeading` and leaves the gait alone; `startle` and
 * `guard` are whole-body clips. Avoiding and fleeing are already visible as motion -- the
 * simulation is running them somewhere -- so they read as `look`, which keeps the head on
 * what they are running from instead of overriding the run with a flinch.
 */
function lifeReaction(p){
 // RUN 10: the same STATE enum the mass crowd uses. This used to switch on the RUN 7 WIP's
 // own string states, which is how the project ended up with two vocabularies for one idea.
 switch(p.awareState){
  case STATE.STARTLE:return 'startle';
  case STATE.AVOID:return 'guard';
  case STATE.FLEE:case STATE.LOOK:return 'look';
  case STATE.RECOVER:return 'recover';
  default:return null;
 }
}

/**
 * Which reaction a near body shows, strongest claim first.
 *
 * RUN 10 browser QA. This read `lifeReaction(p) ?? trafficReaction`, so awareness always won.
 * While the player drives, awareness sees the rider sitting in the car, and people a few
 * metres from the bonnet were held at LOOK: a quarter of the frames in which a car was about
 * to hit a near body showed a head turn instead of the guard or startle the car had asked
 * for. A car about to hit you outranks having noticed the player; everything else keeps the
 * old order.
 */
export function nearReaction(p,clock){
 const traffic=p.reactionUntil>clock?p.trafficReaction:null;
 if(traffic==='guard'||traffic==='startle'||traffic==='escape')return traffic;
 return lifeReaction(p)??traffic??(p.reactionUntil+.6>clock?'recover':null);
}

// Shared baked geometry/materials; only a bounded pool has individual skeletons/mixers.
export function createNearCharacters(tier='high',{ctx=null}={}){
 const root=new Group(),slots=[],selected=new Set(),palette=[];root.name='near-character-pool';
 let asset=null,human=null,disposed=false,trianglesPerRig=0,humanTrianglesPerRig=0;
 // RUN 10 (browser QA). Whether the high-fidelity crowd is drawing everyone this pool does
 // not take. When it is, the pool keeps ONLY its humanoid slots -- see `setHQCovered`.
 let hqCovered=false;
 const stats={humanoids:0,baked:0,ik:0,matched:0};
 let rebuilds=0;
 // Clearing also zeroes the per-frame counts: an early return that empties the pool must not
 // leave `inspect()` reporting the bodies it just stopped drawing.
 function clear(){selected.clear();for(const s of slots){s.id=null;s.figure.hide();}
  stats.humanoids=0;stats.baked=0;stats.ik=0;stats.matched=0;}
 const limitFor=table=>table[tier]??0;
 // Count what one BODY draws, not what the asset holds. Since RUN 6.8 the humanoid template
 // carries every rig and every hairstyle, so measuring it would report a citizen as four
 // times the triangles they actually are.
 function measure(node){let n=0;node.traverse(o=>{if(o.isMesh)
  n+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return n;}
 return {root,selected,
  /**
   * Hand the pool the humanoid once it has finished loading.
   *
   * Late, exactly like the player's: the scene must not wait on it, and a session that never
   * loads it keeps working with baked figures throughout. Existing slots are dropped so they
   * rebuild on the next frame with the right asset rather than being converted in place.
   */
  setHumanAsset(value){
   if(disposed||human===value)return;
   human=value;
   for(const s of slots.splice(0))s.figure.dispose();
   selected.clear();rebuilds=0;
  },
  /**
   * Tell the pool that the HQ crowd is drawing everyone it does not take.
   *
   * RUN 10, found in the browser. This pool predates the HQ crowd: in RUN 6 its baked tier
   * was an UPGRADE over the procedural legacy bodies, for the ranks just beyond the eight
   * humanoids. Since RUN 7 the HQ crowd draws those same people with the Quaternius body, so
   * the baked tier -- "the offline-baked original: eleven bones", where only the shirt varies
   * -- became a DOWNGRADE, placed in exactly the 5-20 m ring the player looks at most. That is
   * the "old-style character mixed into the crowd" the user reported: measured live, the
   * legacy renderer drew zero people, and every old-looking body was a baked near slot.
   *
   * With HQ covering the rest, the pool is humanoid-only, and holds nothing at all until the
   * humanoid asset has arrived -- until then HQ is the better body for everyone. Without HQ
   * (a tier or session that never loads it) nothing changes, because there baked is still
   * better than the procedural fallback.
   */
  setHQCovered(value){
   value=!!value;
   if(disposed||hqCovered===value)return;
   hqCovered=value;
   // Drop the baked slots now rather than letting them age out; they would otherwise keep
   // drawing their holders for as long as those people stayed near.
   if(value){
    for(let k=slots.length-1;k>=0;k--)if(!slots[k].human){
     const s=slots[k];if(s.id!==null)selected.delete(s.id);s.figure.dispose();slots.splice(k,1);}
   }
  },
  get hqCovered(){return hqCovered;},
  update(people,focus,dt,clock=0){
   if(disposed)return selected;
   if(!focus){clear();return selected;}
   const limit=hqCovered?(human?limitFor(HUMANOID_LIMITS):0):(NEAR_LIMITS[tier]??4);
   if(!limit){clear();return selected;}
   let bodies=0;
   // A body killed while held falls under its ragdoll; so does one killed this instant even if it
   // was not held (§9aj: it was standing, so the ragdoll starts from a standing pose, which is
   // what it was in). One picked up later would stand up and then fall, so it is left alone.
   const candidates=people.filter(p=>p.active&&!p.controlled&&p.archetype!=='kid'
     &&(p.struck===undefined||(fallen(p)&&(selected.has(p.id)||clock-(p.hitAt??-1e9)<.25)&&bodies++<RAGDOLL_LIMIT))
     &&Math.hypot(p.x-focus.x,p.z-focus.z)<(priorityOf(p,clock)?PRIORITY_RANGE:selected.has(p.id)?30:25))
    .map(p=>({p,score:Math.hypot(p.x-focus.x,p.z-focus.z)-(selected.has(p.id)?3:0)-(p.combatTarget?40:0)-(p.reactionUntil>clock?20:0)-(fallen(p)?60:0)-(priorityOf(p,clock)?80:0)})).sort((a,b)=>a.score-b.score||a.p.id-b.p.id).slice(0,limit);
   // The priority order is untouched by any of this: a combat target or a reacting pedestrian
   // still outranks someone merely closer, and only then does body quality follow rank.

   // Grow by one slot per frame, only while player mode needs a visible rig. No scene-startup
   // work, and never more slots than the tier allows.
   //
   // A slot's kind comes from the POOL'S OWN QUOTA, not from the rank of whichever candidate
   // happens to be asking. That distinction is the whole of this block, and getting it wrong
   // is not hypothetical: the first version of this code chose the kind from the asking
   // candidate's rank, and a citizen who had been rank 3 kept its humanoid while drifting to
   // rank 20, so the new rank 3 found no free humanoid and built another one. Under a crowd
   // dense enough to churn the near radius -- 300 people, which is what a scramble crossing
   // actually is -- that converged on 27 humanoid slots against a budget of 8. The earlier
   // tests used 40 people and never reached the density where it shows. qa/gta-upgrade/
   // poolprobe.mjs is the measurement, and tests/near-humanoid.test.mjs now pins it at 300.
   //
   // Filling the humanoid quota first is what makes the bound structural: the count can only
   // go up by one at a time and stops at the quota, so no assignment policy below can inflate
   // it.
   // What each candidate looks like. Pure function of their id, so this is the same answer
   // every frame and across pool reuse -- see src/life/appearance.mjs.
   const looks=new Map();
   for(const {p} of candidates)looks.set(p.id,appearanceOf(p.appearanceId??p.id,ARCHETYPES[p.archetype]?.height??1.76));
   // Shirt colours only, and only among the few on screen. Never the body or the hair.
   const dressed=deduplicate([...looks.values()]);

   const humanSlotCount=slots.filter(s=>s.human).length;
   if(slots.length<limit&&slots.length<candidates.length){
    const wantHuman=!!human&&humanSlotCount<limitFor(HUMANOID_LIMITS);
    if(!asset&&!(hqCovered&&wantHuman)){asset=bakedAsset();palette.push(...new Set(Object.values(ARCHETYPES).flatMap(a=>a.colors)));
     trianglesPerRig=measure(asset.template);}
    const source=wantHuman?human:asset;
    // Which archetype to build. A slot's rig and hairstyle are geometry, fixed when the body
    // is constructed, so the pool builds the one most in demand among the people on screen who
    // do not already have a body of their own kind. Height, build and colour are all settable
    // afterwards, so those are never a reason to rebuild.
    // Round-robin, so the humanoid slots hold a balanced spread of archetypes by construction:
    // eight slots over four archetypes is two of each, and MEDIUM's four is one of each.
    //
    // The first version of this chased demand instead -- rebuild whichever spare slot the
    // people currently on screen most wanted. It oscillated: at 300 people the near radius
    // churns faster than the mix can settle, and it converged on TWO archetypes visible out of
    // four, having spent fifty rebuilds getting there. A fixed spread needs no rebuilds at all
    // and puts every archetype on screen whenever the slots are full, which is the thing this
    // run is judged on.
    const variant=wantHuman?LOOKS[humanSlotCount%LOOKS.length]:null;
    // Foot IK only for humanoid slots inside the budget, and only when a ground query exists.
    // RUN 5's solver is not changed for this; it is given or not given a context.
    const wantsIK=wantHuman&&!!ctx&&slots.filter(s=>s.ik).length<limitFor(NEAR_IK_LIMITS);
    // PLAN-WEAPONS W3: a humanoid can be an officer, and an officer at ☆3 draws a revolver. The
    // mesh is built hidden and costs nothing until it is drawn.
    const figure=createPlayerFigure(source,undefined,{...(wantsIK?{ctx}:{}),variant,weapons:wantHuman?['revolver']:null});
    root.add(figure.root);
    if(wantHuman&&!humanTrianglesPerRig)humanTrianglesPerRig=measure(figure.root);
    slots.push({figure,id:null,elapsed:0,human:wantHuman,ik:wantsIK,variant});
   }

   const wanted=new Set(candidates.map(c=>c.p.id));
   for(const s of slots)if(!wanted.has(s.id)){s.id=null;s.figure.hide();}

   // One swap per frame, so the good bodies drift toward the camera instead of sticking to
   // whoever reached the radius first.
   //
   // Holding a slot for as long as its citizen stays near is what keeps the pool quiet, but on
   // its own it aims badly: measured over 900 frames of a churning crowd, only 18-35% of the
   // nearest eight were the ones wearing a humanoid, because the humanoids had been claimed by
   // people who have since walked away. So each frame the furthest-fallen humanoid holder and
   // the highest-ranked citizen stuck on a baked figure both release their slots, and the
   // assignment pass below -- humanoid slots first, candidates already in score order -- puts
   // them back the right way round.
   //
   // HOLD is hysteresis. Without it a citizen sitting on the quota boundary would be demoted
   // and promoted on alternate frames, which is a body swapping its clothes twice a frame.
   const HOLD=4,quota=limitFor(HUMANOID_LIMITS);
   if(quota>0){
    const rank=new Map();for(let i=0;i<candidates.length;i++)rank.set(candidates[i].p.id,i);
    // The swap has to be BETWEEN PEOPLE OF THE SAME ARCHETYPE, which is what changed in
    // RUN 6.8. A humanoid slot is now a particular silhouette, so handing a freed one to the
    // nearest citizen regardless of archetype would put them in someone else's body. Pairing
    // like with like keeps both promises at once: the good bodies drift toward the camera, and
    // nobody changes who they are to get one.
    //
    // Without this pairing the aim collapses -- measured at 22-44% of the nearest eight
    // wearing a humanoid, against 84-85% in RUN 6 -- because a near citizen whose archetype
    // was busy simply sat on a baked figure while a matching humanoid walked away wearing one.
    let swap=null;
    for(const x of slots){
     if(!x.human||x.id===null||!x.variant)continue;
     const far=rank.get(x.id)??Infinity;
     if(far<quota+HOLD)continue;
     for(const c of candidates){
      const near=rank.get(c.p.id);
      if(near>=quota)break;
      const look=looks.get(c.p.id);
      if(!look||look.archetype.id!==x.variant.id)continue;
      if(!slots.some(y=>y.id===c.p.id&&!y.human))continue;
      if(!swap||far>swap.far){swap={slot:x,id:c.p.id,far};}
      break;
     }
    }
    if(swap){
     swap.slot.id=null;swap.slot.figure.hide();
     const held=slots.find(y=>y.id===swap.id);
     if(held){held.id=null;held.figure.hide();}
    }
   }

   // Free humanoid slots go to the nearest candidates who do not already have a body. Held
   // slots are never taken away mid-stride: swapping a citizen between a humanoid and a baked
   // figure changes its wardrobe and its height, which is a pop, and the radius churns fast
   // enough that a humanoid frees up within a second or so anyway. `freeSlots` is humanoid
   // first and `candidates` is already score-ordered, so this hands the better bodies to the
   // nearest without a second sort of the people.
   const freeSlots=slots.filter(s=>s.id===null);
   const taken=new Set();

   selected.clear();
   stats.humanoids=0;stats.baked=0;stats.ik=0;stats.matched=0;
   for(const {p} of candidates){
    const look=dressed.get(p.id)??looks.get(p.id);
    let slot=slots.find(s=>s.id===p.id);
    if(!slot){
     // A humanoid slot already wearing this person's archetype first -- that is their own
     // body, and taking it costs nothing. Then any other humanoid: a citizen in someone
     // else's silhouette is still a better near character than a baked figure, and the
     // rebuild above will converge the mix within a frame or two. Then a baked figure.
     // Their OWN archetype, or a baked figure -- never a humanoid wearing somebody else's
     // silhouette. Handing out the wrong body would keep all eight humanoids busy and raise
     // the count, at the cost of the one promise that makes a crowd feel like people: walk
     // away from someone and walk back and they are still them. A baked figure at four metres
     // is a smaller lie than the same face on a different body.
     slot=freeSlots.find(x=>!taken.has(x)&&x.human&&x.variant?.id===look.archetype.id)
       ??freeSlots.find(x=>!taken.has(x)&&!x.human)
       ??freeSlots.find(x=>!taken.has(x));
     if(!slot)continue;
     taken.add(slot);
     slot.id=p.id;slot.figure.reset();
     if(slot.human){
      slot.figure.recolour(paletteOf(look));
      slot.figure.setBuild(look.width);
      if(slot.variant?.id===look.archetype.id)stats.matched++;
     }else slot.figure.recolour({top:look.top});
     slot.figure.setHeight(look.height);
     slot.elapsed=.1;
     // A new holder starts from where they are drawn, at the simulation's own idea of their
     // pace; the measured pace takes over within a few frames.
     slot.lastX=p.renderX??p.x;slot.lastZ=p.renderZ??p.z;
     slot.pace=Math.abs(p.speed??0);slot.moving=slot.pace>PACE.stopBelow;
     slot.paceX=Math.sin(p.heading??0)*slot.pace;slot.paceZ=Math.cos(p.heading??0)*slot.pace;
    }else if(slot.human&&slot.variant?.id===look.archetype.id)stats.matched++;
    selected.add(p.id);slot.elapsed+=Math.max(0,dt);
    if(slot.human)stats.humanoids++;else stats.baked++;
    if(slot.ik)stats.ik++;
    const distance=Math.hypot(p.x-focus.x,p.z-focus.z),interval=distance<12?0:1/30;
    // claude/crowd-realism: the legs follow the MEASURED pace of the drawn body, with the same
    // hysteresis as the mass crowd (src/life/pace.mjs). `p.speed` is intent: a blocked cast
    // member reported walking speed on a frame they did not move, which is a walk on the spot.
    const drawnX=p.renderX??p.x,drawnZ=p.renderZ??p.z;
    const paced=paceStep(slot.paceX??0,slot.paceZ??0,!!slot.moving,drawnX-(slot.lastX??drawnX),drawnZ-(slot.lastZ??drawnZ),dt);
    slot.paceX=paced.vx;slot.paceZ=paced.vz;slot.pace=paced.speed;slot.moving=paced.moving;slot.lastX=drawnX;slot.lastZ=drawnZ;
    const reaction=nearReaction(p,clock);slot.reaction=reaction;
    const state={trafficReaction:reaction,threatHeading:p.lifeThreatHeading??p.threatHeading,x:p.renderX??p.x,y:p.height??0,z:p.renderZ??p.z,heading:p.heading,speed:slot.moving?slot.pace:0,alive:true,animationPhase:Math.abs(p.id)*.137,attackTime:p.combatAction>0?Math.min(.42,p.combatAction*.42):0,
     // RUN 11.2: being hit shows as a hit, for as long as the blow holds them.
     hurtTime:p.hurtUntil>clock?p.hurtUntil-clock:0,hurtDuration:p.hurtDuration??.34,
     hurtX:p.hurtX??0,hurtZ:p.hurtZ??0,hurtStrong:!!p.hurtStrong,
     // §9ai: the last blow that landed (a new hitSeq is a flinch), and a ragdoll once killed.
     hitSeq:p.hitSeq,hitAge:clock-(p.hitAt??-1e9),hitX:p.hitX,hitZ:p.hitZ,hitZone:p.hitZone,hitStrength:p.hitStrength,
     ragdoll:fallen(p)?p.ragdoll:null,
     // Roadmap stage 2: hands up at gunpoint, a leg wound's limp or crawl.
     handsUp:p.handsUpUntil>clock,limp:!!p.limp,crawling:!!p.crawling,
     // Stage 4: an onlooker filming or calling.
     phone:p.watchUntil>clock?p.phone:null,
     // An officer's revolver (src/police/guns.mjs): drawn, aimed at the player, and its recoil.
     // Stage 2: an armed civilian's handgun is drawn the same way.
     ...(p.gunDrawn?{weapon:'revolver',aim:p.gunAim??0,aimTarget:p.gunTarget,
      aimHeading:p.gunTarget?Math.atan2(p.gunTarget.x-(p.renderX??p.x),p.gunTarget.z-(p.renderZ??p.z)):p.heading,shotLeft:p.gunShotLeft??0}:{})};
    // §9ai H1: a body that has just been hit catches for the blow's hit-stop.
    if(slot.elapsed>=interval){slot.figure.update(state,victimScale(Math.min(.1,slot.elapsed),clock,p.hitStopUntil));slot.elapsed=0;}
    else slot.figure.root.position.set(state.x,state.y,state.z);
   }
   return selected;
  },
  /** Which body a citizen currently wears, or null if the pool is not holding them. */
  /** The reaction word a held citizen's body is showing this frame, or null. For QA. */
  /** The clip a held citizen's body is playing (overlay first), or null. For QA. */
  actionOf(id){return slots.find(x=>x.id===id)?.figure.action??null;},
  /** PLAN-WEAPONS W3: where a held citizen's drawn gun's muzzle is, into two Vector3s; false if none. */
  muzzleOf(id,point,direction){const s=slots.find(x=>x.id===id&&x.human);return s?.figure.weapons?.muzzle(point,direction)??false;},
  reactionOf(id){return slots.find(x=>x.id===id)?.reaction??null;},
  /** The measured pace a held citizen's legs are driven by, for QA: {speed, moving}. */
  paceOf(id){const s=slots.find(x=>x.id===id);return s?{speed:s.pace??0,moving:!!s.moving}:null;},
  bodyOf(id){const s=slots.find(x=>x.id===id);return s?(s.human?'humanoid':'baked'):null;},
  /** Which appearance archetype a held citizen is wearing, or null. */
  lookOf(id){const s=slots.find(x=>x.id===id);return s?.human?(s.variant?.id??null):null;},
  setTier(value){
   tier=value;clear();
   // Dropping to a tier with a smaller humanoid quota has to drop humanoids, not just slots:
   // LOW allows none at all, and popping off the end would keep whichever kind happened to be
   // last. Humanoids over quota go first, then any slot over the pool limit.
   let overHuman=slots.filter(s=>s.human).length-limitFor(HUMANOID_LIMITS);
   for(let i=slots.length-1;i>=0&&overHuman>0;i--)
    if(slots[i].human){slots.splice(i,1)[0].figure.dispose();overHuman--;}
   while(slots.length>(NEAR_LIMITS[tier]??4))slots.pop().figure.dispose();
  },
  inspect(){
   const humanSlots=slots.filter(s=>s.human).length;
   return {active:selected.size,capacity:slots.length,limit:NEAR_LIMITS[tier]??4,
    humanoidLimit:limitFor(HUMANOID_LIMITS),ikLimit:limitFor(NEAR_IK_LIMITS),
    humanoidSlots:humanSlots,humanoidsActive:stats.humanoids,bakedActive:stats.baked,
    footIK:stats.ik,humanAssetReady:!!human,
    // RUN 6.8. `archetypes` is how many distinct silhouettes are actually on screen -- the
    // number this run is judged on. `matched` is how many humanoids are wearing their own
    // archetype rather than borrowing one; `rebuilds` is how often a slot has had to change
    // body, which should settle to a small total rather than climbing every frame.
    archetypes:new Set(slots.filter(x=>x.human&&x.id!==null).map(x=>x.variant?.id)).size,
    archetypeSlots:Object.fromEntries(LOOKS.map(a=>
     [a.name,slots.filter(x=>x.human&&x.variant?.id===a.id).length])),
    matched:stats.matched,rebuilds,
    sharedGeometry:true,
    // Four meshes a humanoid, six a baked figure. It was three until RUN 6.8 split the hair
    // out of the body mesh, which is what lets one body serve three hairstyles instead of
    // storing a whole body per hairstyle.
    drawCallsUpperBound:stats.humanoids*4+stats.baked*6,
    triangles:stats.humanoids*humanTrianglesPerRig+stats.baked*trianglesPerRig};
  },
  dispose(){if(disposed)return;disposed=true;for(const s of slots)s.figure.dispose();slots.length=0;selected.clear();root.removeFromParent();root.clear();}
 };
}
