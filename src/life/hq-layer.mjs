/**
 * The RUN 7A crowd, driven by the real Shibuya pedestrian simulation.
 *
 * RUN 7B. The one rule this file exists to enforce:
 *
 *   THE SIMULATION IS THE SOURCE OF TRUTH. This layer READS it.
 *
 * Position, heading, speed, route, crossing membership, queue membership and signal group all
 * stay exactly where they were, in src/life/simulation.mjs. Nothing here moves a pedestrian
 * along a route, admits one to a crossing, or releases one from a signal group -- a
 * pedestrian who leaves a crossing without releasing its group freezes every signal on the
 * map, and that has happened before. What this layer changes is what a pedestrian LOOKS like.
 *
 * The one exception is deliberate and bounded: a citizen who has been HIT is, for the length
 * of the knockdown, moved by the reaction system instead of by their route, because a body
 * thrown by a car is not walking anywhere. Movement authority is handed back on recovery, and
 * `onDisown`/`onReclaim` let the caller tell the simulation about it rather than this file
 * reaching into it.
 */
import {createHQCrowd,STATE} from './hq-crowd.mjs';
import {createCrowdGrid,applyVehicleThreat} from './hq-threat.mjs';
import {AWARE,createAwareness} from './hq-awareness.mjs';
import {isWaiting} from './stance.mjs';
import {appearanceOf} from './appearance.mjs';

/**
 * Distance bands, in metres, for level of detail.
 *
 * `out` is hysteresis: a citizen promoted to L0 at 12 m is not demoted until 15 m, so a camera
 * drifting on a boundary does not swap their body back and forth every frame.
 */
export const HQ_LOD=Object.freeze({
 bands:[{lod:'L0',in:14,out:17},{lod:'L1',in:38,out:44},{lod:'L2',in:Infinity,out:Infinity}],
 movesPerFrame:24,      // bounded: an LOD change is a slot swap, but not thousands at once
 reviewInterval:.25,    // seconds between LOD reviews; the camera does not move that fast
 // §9aj G3: the far band (L2, beyond ~44 m) is placed every `farEvery` frames, staggered by id,
 // with the time it skipped carried into the next placement. Walking pace is 1.3 m/s, so that is
 // a 4 cm step at 60 fps seen from over 44 m away; the walk itself runs on the GPU every frame.
 // A body reacting, falling or rising is always placed every frame.
 farEvery:3
});

/**
 * Getting up where the simulation says you are.
 *
 * RUN 10, browser scenario L. The HQ body falls where it was hit; the simulation carries its
 * own pedestrian through the throw and, for an extracted driver, then stands them at the
 * nearest safe node. When the body is handed back, those two positions can be metres apart,
 * and placing it straight on the simulation's point was a one-frame jump of 2-6.6 m. From the
 * moment the body is handed back -- not from RECOVER, which a nearby car can replace with
 * AVOID on the very next frame -- the gap closes at a bounded rate, always within `seconds`:
 * a short visual transition, never a different destination.
 */
export const HQ_RISE=Object.freeze({gap:.5,speed:3.2,seconds:1.2});
/** rad/s a thrown body turns to fall along its flight (the baked Fall goes over backwards). */
export const HQ_THROW_TURN=12;

/**
 * Partition `list[0..count)` so its first `k` entries are the `k` smallest by `.d`
 * (Hoare-style quickselect, in place). Order inside either side is unspecified.
 */
export function selectNearest(list,count,k){
 let lo=0,hi=count-1;
 while(lo<hi){
  const pivot=list[(lo+hi)>>1].d;
  let i=lo,j=hi;
  while(i<=j){
   while(list[i].d<pivot)i++;
   while(list[j].d>pivot)j--;
   if(i<=j){const t=list[i];list[i]=list[j];list[j]=t;i++;j--;}
  }
  if(k-1<=j)hi=j;else if(k-1>=i)lo=i;else break;
 }
 return list;
}

export function createHQLayer(manifest,bin,{budget=1978,lods=['L0','L1','L2'],
                                            interpolate=true,onDisown=null,onReclaim=null}={}){
 // Capacity is per lane, and a lane is one archetype at one LOD. The worst case is everyone
 // in one archetype at one LOD, which cannot happen, so this is sized for a generous share.
 const perLane=Math.ceil(budget*.55)+24;
 const crowd=createHQCrowd(manifest,bin,{capacity:perLane,lods,interpolate});
 const grid=createCrowdGrid();
 const awareness=createAwareness();
 const scratch=[];
 const rendered=new Set();          // pedestrian ids this layer is drawing
 const candidates=[];               // pooled {p,d} records, reused every frame
 const farSkipped=new Map();        // id -> seconds of placement a far citizen has skipped (G3)
 const laneCache=new Map();         // `${archetypeId}|${lod}` -> lane index
 const disowned=new Set();          // ids whose movement the reaction system has taken
 const rising=new Map();            // id -> m/s, for a body closing on its simulation position
 let reviewClock=0,awarenessClock=0;
 // RUN 12.0. The crowd grid is O(population) to build, and a frame used to build it up to three
 // times: the vehicle threat, every witness event (a crash raises several) and the perception
 // tick. Positions only change in `crowd.update`, at the end of `sync`, so one build per synced
 // frame serves every query in it.
 let syncFrame=0,gridFrame=-1;
 const ensureGrid=()=>{if(gridFrame!==syncFrame){grid.rebuild(crowd);gridFrame=syncFrame;stats.gridBuilds++;}};
 const stats={hq:0,legacy:0,budget,moves:0,syncMs:0,threatMs:0,candidates:0,
  reacting:0,down:0,byLod:{},witnessMs:0,gridBuilds:0,witnessCandidates:0,witnessReacted:0,
  awarenessGridMs:0};

 for(const a of manifest.archetypes)for(const l of lods)
  laneCache.set(`${a.id}|${l}`,crowd.laneFor(a.id,l));

 /** A body is owned by the reaction system exactly while it is off its feet. */
 const thrownNow=i=>{
  const b=crowd.state.behaviour[i];
  // A LIGHT hit is a flinch on the feet (RUN 11.1/11.2): the simulation keeps the body, and its
  // stagger or shove is what moves it, so the two never disagree about where it is.
  if(b===STATE.HIT&&crowd.state.light[i])return false;
  return b===STATE.HIT||b===STATE.KNOCKDOWN||b===STATE.DOWNED;
 };
 function reconcileOwnership(){
  // The reacting/down counts are recomputed HERE, not in `vehicle`, because `vehicle` only
  // runs while someone is driving. Reporting them there meant `inspect()` kept returning the
  // last figures from the last time a car went past -- a metric that lies the moment the
  // player parks, and one a test duly believed.
  let reacting=0,down=0;
  for(let i=0;i<crowd.population;i++){
   const id=crowd.state.id[i],thrown=thrownNow(i);
   const b=crowd.state.behaviour[i];
   if(b===STATE.LOOK||b===STATE.STARTLE||b===STATE.AVOID||b===STATE.FLEE)reacting++;
   else if(thrown)down++;
   if(thrown&&!disowned.has(id)){
    disowned.add(id);
    onDisown?.(id,{x:crowd.state.x[i],z:crowd.state.z[i],
     impulseX:crowd.state.impulseX[i],impulseZ:crowd.state.impulseZ[i]});
   }else if(!thrown&&disowned.has(id)){
    disowned.delete(id);
    rising.set(id,0);
    onReclaim?.(id,{x:crowd.state.x[i],z:crowd.state.z[i]});
   }
  }
  // A body released from the crowd while still disowned would leave its id owned forever.
  for(const id of [...disowned])if(crowd.indexOf(id)<0){disowned.delete(id);onReclaim?.(id,null);}
  stats.reacting=reacting;stats.down=down;
 }

 const lodFor=(distance,current)=>{
  for(const band of HQ_LOD.bands){
   if(distance<=band.in)return band.lod;
   // Already in this band and not yet past its release distance: stay.
   if(current===band.lod&&distance<=band.out)return band.lod;
  }
  return HQ_LOD.bands[HQ_LOD.bands.length-1].lod;
 };

 /** Which clip a pedestrian's own simulated state calls for. */
 const behaviourFor=p=>{
  if(p.struck!==undefined||p.combatDead)return STATE.KNOCKDOWN;
  // The simulation is really moving them away from something (sim.flee): the body runs.
  if(p.flee)return STATE.FLEE;
  const speed=Math.abs(p.speed??0);
  if(p.state==='waiting'||p.state==='idle'||speed<.12)return STATE.NORMAL;
  return speed>2.6?STATE.FLEE:STATE.NORMAL;
 };

 return {
  root:crowd.root,crowd,grid,stats,
  get rendered(){return rendered;},

  /**
   * Take the simulation's pedestrians and draw the nearest `budget` of them as HQ citizens.
   * Returns the set of ids drawn, which the legacy renderer uses as a mask -- a pedestrian
   * drawn here must NOT also be drawn there, or the crossing holds two of everybody.
   */
  sync(pool,camera,dt,{time=0,exclude=null}={}){
   const start=(typeof performance!=='undefined'?performance.now():0);
   rendered.clear();
   if(!camera){stats.hq=0;return rendered;}

   // The budget is spent on the nearest citizens. RUN 12.0: that needs the nearest `budget`,
   // never a full ordering -- the loop below treats every taken citizen alike -- so the
   // records are pooled (no 1,978 allocations a frame), nothing is ordered when everyone fits
   // (HIGH), and a smaller budget is an O(n) selection instead of an O(n log n) sort.
   let count=0;
   for(const p of pool){
    if(!p.active||p.controlled)continue;
    if(exclude&&exclude.has(p.id))continue;     // the near-character pool already has them
    const d=Math.hypot((p.renderX??p.x)-camera.x,(p.renderZ??p.z)-camera.z);
    const slot=candidates[count]??(candidates[count]={p:null,d:0});
    slot.p=p;slot.d=d;count++;
   }
   const take=Math.min(stats.budget,count);
   if(take<count)selectNearest(candidates,count,take);

   reviewClock+=dt;
   const review=reviewClock>=HQ_LOD.reviewInterval;
   if(review)reviewClock=0;
   let moves=0;

   for(let k=0;k<take;k++){
    const {p,d}=candidates[k];
    let i=crowd.indexOf(p.id),born=false;
    if(i<0){born=true;
     // RUN 9: `appearanceId` lets a pedestrian wear a face that is not their pool id's. It
     // exists for one case -- someone dragged out of a car was already drawn sitting in it,
     // and arriving on the pavement as a different person would undo the whole point of the
     // driver having an identity. Everyone else has no such field and is themselves.
     const look=appearanceOf(p.appearanceId??p.id,p.height!==undefined?undefined:undefined);
     const lane=laneCache.get(`${look.archetype.id}|${lodFor(d,null)}`);
     i=crowd.spawn(p.id,look,lane??0,
      {x:p.renderX??p.x,y:p.height??0,z:p.renderZ??p.z,heading:p.heading??0,speed:p.speed??0});
     if(i<0)continue;                            // a lane is full; they stay legacy this frame
     rising.delete(p.id);                        // a new body starts where it is drawn
    }
    rendered.add(p.id);

    // A body the reaction system owns is NOT repositioned from the route: it is mid-flight.
    // G3: a far citizen doing nothing in particular is placed every farEvery frames.
    let placeDt=dt;
    if(!born&&crowd.lanes[crowd.state.lane[i]]?.lod==='L2'&&crowd.state.behaviour[i]===STATE.NORMAL
     &&!rising.has(p.id)&&p.struck===undefined){
     const skipped=(farSkipped.get(p.id)??0)+dt;
     if((syncFrame+p.id)%HQ_LOD.farEvery!==0){farSkipped.set(p.id,skipped);stats.farSkipped=(stats.farSkipped??0)+1;}
     else{farSkipped.delete(p.id);placeDt=skipped;}
    }else farSkipped.delete(p.id);
    if(!disowned.has(p.id)&&!farSkipped.has(p.id)){
     let x=p.renderX??p.x,z=p.renderZ??p.z;
     if(crowd.state.behaviour[i]===STATE.RECOVER||rising.has(p.id)){
      const cx=crowd.state.x[i],cz=crowd.state.z[i],gap=Math.hypot(x-cx,z-cz);
      let rate=rising.get(p.id);            // 0: handed back, not yet measured
      if(!rate){
       if(gap>HQ_RISE.gap)rising.set(p.id,rate=Math.max(HQ_RISE.speed,gap/HQ_RISE.seconds));
       else rising.delete(p.id);
      }
      if(rate){
       const step=rate*Math.max(0,dt);
       if(gap<=step)rising.delete(p.id);
       else{x=cx+(x-cx)*step/gap;z=cz+(z-cz)*step/gap;}
      }
     }
     // How far the drawn body actually moved this frame decides Idle/Walk/Run and the cadence
     // (src/life/pace.mjs). `p.speed` is the simulation's intent, not the body's motion.
     // A body spawned this frame has no previous position to measure from.
     if(!born)crowd.pace(i,x-crowd.state.x[i],z-crowd.state.z[i],placeDt);
     crowd.place(i,x,p.height??0,z,p.heading??0,p.speed??0);
    }else if(p.struck!==undefined){
     // RUN 11.1: a body the SIMULATION threw is where its flight says, arc included. The crowd
     // used to run a second, unrelated impulse, so the body the player saw dropped nearly in
     // place while the pedestrian it stood for slid metres down the road.
     crowd.follow(i,p.x,p.height??0,p.z);
     rising.delete(p.id);
     // claude/crowd-realism: the baked Fall goes over BACKWARDS (head 1.24 m behind the feet
     // by its last frame). A body thrown the way it was facing therefore fell back towards the
     // car while sliding away from it. Turn it, fast, to face against its own flight, so the
     // clip and the travel agree.
     // §9aj G2: a body felled by a blade or a round falls along the BLOW (hitX/hitZ), which is
     // what the eye follows -- a gunshot's push is too slight (0.7 m/s) to have turned it at all
     // -- and turns onto it at once, since the fall starts the moment it is struck.
     const blow=p.combatDead&&Number.isFinite(p.hitX)&&Number.isFinite(p.hitZ)&&(p.hitX||p.hitZ);
     const fx=blow?p.hitX:p.flyX??0,fz=blow?p.hitZ:p.flyZ??0;
     if((blow||Math.hypot(fx,fz)>.6)&&dt>0){const want=Math.atan2(-fx,-fz),h=crowd.state.heading[i];
      const d=Math.atan2(Math.sin(want-h),Math.cos(want-h)),k=HQ_THROW_TURN*dt*(blow?4:1);
      crowd.state.heading[i]=h+(Math.abs(d)<=k?d:Math.sign(d)*k);}
    }
    // The simulation decides how long a thrown body stays down (`struck`): 4.9 s for a driver
    // dragged out of a car, longer for anyone else. The HQ chain reached RECOVER at 3.9 s,
    // was handed back while `struck` was still set, and was knocked down a second time. Hold
    // the lying pose until the simulation lets go.
    if(p.struck!==undefined&&crowd.state.behaviour[i]===STATE.DOWNED)crowd.hold(i,.25);
    // Standing at the kerb for the signal plays Idle rather than walking on the spot. The
    // simulation's own state decides it, never speed; see clipFor in hq-crowd.mjs and, for
    // what counts as waiting (the queue behind the front row too), stance.mjs.
    crowd.setWaiting(i,isWaiting(p));

    // The clip follows the pedestrian's own simulated state, not anything invented here.
    const want=behaviourFor(p);
    const now=crowd.state.behaviour[i];
    // The simulation owns actual damage. A fresh strike must interrupt even an HQ recovery
    // pose; otherwise the victim visually ignores a second punch until the guard clip ends.
    // onDisown below performs the formal simulation.leave() through the scene callback.
    if(want===STATE.KNOCKDOWN&&!disowned.has(p.id)&&now!==STATE.KNOCKDOWN)
     crowd.setState(i,STATE.KNOCKDOWN,{force:true});
    const reacting=now===STATE.HIT||now===STATE.KNOCKDOWN||now===STATE.DOWNED
     ||now===STATE.LOOK||now===STATE.STARTLE||now===STATE.AVOID||now===STATE.FLEE||now===STATE.RECOVER;
    if(!reacting&&now!==want)crowd.setState(i,want);
    // A person the simulation is carrying away from a car is running, whatever a glance said.
    else if(want===STATE.FLEE&&(now===STATE.LOOK||now===STATE.STARTLE||now===STATE.RECOVER))crowd.setState(i,STATE.FLEE,{force:true});

    if(review&&moves<HQ_LOD.movesPerFrame){
     const lane=crowd.state.lane[i];
     const current=crowd.lanes[lane]?.lod;
     const wanted=lodFor(d,current);
     if(wanted!==current){
      const target=laneCache.get(`${appearanceOf(p.appearanceId??p.id).archetype.id}|${wanted}`);
      if(target!==undefined&&target>=0&&crowd.moveLane(i,target)){moves++;stats.moves++;}
     }
    }
   }

   // Anyone the crowd still holds who is no longer being drawn goes, or the population only
   // ever grows and the street fills with frozen bodies beside their legacy twins. Bodies the
   // reaction system owns are exempt: a citizen mid-knockdown is finishing their fall.
   if(crowd.population>rendered.size){
    const stale=[];
    for(let i=0;i<crowd.population;i++){
     const id=crowd.state.id[i];
     if(!rendered.has(id)&&!disowned.has(id))stale.push(id);
    }
    for(const id of stale){crowd.release(id);rising.delete(id);}
   }

   crowd.update(dt,{time});
   syncFrame++;                                 // positions moved: the grid is stale
   // RUN 11.3: witnesses who were still taking in what they saw.
   awareness.flush(crowd,dt);
   // Ownership is reconciled here as well as after a vehicle pass, because a body gets back
   // up on its own timer and the player may have stopped driving by then. Reconciling only
   // in `vehicle` left citizens disowned from their own routes for as long as nobody drove.
   reconcileOwnership();
   const got=crowd.inspect();
   stats.hq=rendered.size;stats.legacy=count-rendered.size;
   for(let k=0;k<count;k++)candidates[k].p=null;   // do not pin recycled pedestrians
   stats.byLod=got.byLod;
   stats.syncMs=(typeof performance!=='undefined'?performance.now():0)-start;
   return rendered;
  },

  /**
   * Drive the real player vehicle through the crowd.
   *
   * `car` is the vehicle's own state. Only pedestrians this layer is drawing can react, which
   * is correct: a citizen four hundred metres away behind a building is not in the accident.
   */
  vehicle(car,dt){
   if(!car||!crowd.population)return null;
   const start=(typeof performance!=='undefined'?performance.now():0);
   ensureGrid();
   const result=applyVehicleThreat(crowd,grid,car,dt,scratch);
   reconcileOwnership();
   stats.candidates=result.candidates;
   stats.threatMs=(typeof performance!=='undefined'?performance.now():0)-start;
   return result;
  },

  /**
   * Something violent happened here; let the people who can see it react.
   *
   * RUN 8. A punch in a crowd that keeps walking is worse than no punch at all, but a punch
   * that empties the crossing is worse still. So this is bounded twice over: by the query
   * radius, which walks only the grid cells the event touches, and by distance bands inside
   * it, so the people beside it startle and the people across the road look up.
   *
   * REACTIONS ARE NOT UNIFORM. Each citizen's threshold moves with a hash of their own id --
   * the same seed their appearance comes from -- so the same event produces a spread of
   * responses rather than a chorus, and the same person is reliably the nervous one. That
   * rule is borrowed from src/life/awareness.mjs; the storage deliberately is not, because
   * two thousand JS state objects is the thing this whole architecture avoids.
   *
   * Nothing here decides damage. The simulation already did that.
   */
  /**
   * A blow landed on one citizen (RUN 11.2): flinch or stagger now, then the answer their
   * temperament chose -- run, step back, or (for a fighter) nothing here, because fighting is
   * the simulation's job. A fatal blow is left to `struck`, which already knocks them down.
   */
  blow({victim,blow,response,from=null}={}){
   const i=crowd.indexOf(victim);if(i<0||!blow||blow.fatal)return false;
   // 'look': the player brushed past them (src/player/crowd-contact.mjs). A flinch, then they
   // look round at who it was -- LOOK is what turns the head (RUN 12.4), toward `from`.
   const then=response==='flee'?STATE.FLEE:response==='backoff'?STATE.AVOID:response==='look'?STATE.LOOK:STATE.NORMAL;
   if(from&&Number.isFinite(from.x)&&Number.isFinite(from.z))crowd.state.attention[i]=Math.atan2(from.x-crowd.state.x[i],from.z-crowd.state.z[i]);
   return crowd.setState(i,STATE.HIT,{light:true,hold:blow.hold,then,force:true});
  },

  witness(event={}){
   // RUN 10: the decision moved to src/life/hq-awareness.mjs, which is now the one place
   // that says what a crowd does about something. This used to carry its own copy of the
   // nerve rule and its own distance bands, which meant a witness to a punch and a citizen
   // noticing the player were answered by two different pieces of code with two different
   // ideas about personality. The bounding is unchanged and still belongs to the caller.
   ensureGrid();
   const n=awareness.witness(crowd,grid,event,{rebuilt:true});
   reconcileOwnership();
   stats.witnessMs=awareness.stats.witnessMs;
   stats.witnessCandidates=awareness.stats.witnessCandidates;
   stats.witnessReacted=n;
   return n;
  },

  /**
   * Let the people around the player notice them.
   *
   * Separate from `sync` on purpose: sync is about which bodies are DRAWN, this is about what
   * they are doing, and the second must not be hostage to the budget of the first. Bounded by
   * the same grid the vehicle threat uses, so the cost follows the density around the player
   * rather than the size of the crowd.
   */
  awareness(player,dt){
   if(!crowd.population)return awareness.stats;
   // Build the grid on perception ticks, not on every render frame. The visual sync already
   // updates all transforms; awareness itself only evaluates candidates in nearby cells.
   awarenessClock+=Math.max(0,dt);
   if(awarenessClock>=AWARE.interval){
    const start=(typeof performance!=='undefined'?performance.now():0);
    ensureGrid();
    stats.awarenessGridMs=(typeof performance!=='undefined'?performance.now():0)-start;
    awarenessClock=0;
   }
   const seen=awareness.update(crowd,grid,player,dt);
   reconcileOwnership();
   return seen;
  },

  /** What the awareness layer did last pass, for QA. */
  get perception(){return awareness.inspect();},

  /** Ids whose movement the reaction system currently owns. */
  get disowned(){return disowned;},

  setBudget(n){stats.budget=Math.max(0,n|0);},

  inspect(){
   const got=crowd.inspect();
   return {...got,hq:stats.hq,budget:stats.budget,moves:stats.moves,
    syncMs:Number(stats.syncMs.toFixed(3)),threatMs:Number(stats.threatMs.toFixed(3)),
    candidates:stats.candidates,reacting:stats.reacting,down:stats.down,
    witnessMs:Number(stats.witnessMs.toFixed(3)),witnessCandidates:stats.witnessCandidates,
    witnessReacted:stats.witnessReacted,
    awarenessGridMs:Number(stats.awarenessGridMs.toFixed(3)),
    disowned:disowned.size};
  },

  dispose(){
   // Turned off (a tier with no HQ budget) with bodies still mid-fall: hand them back, or the
   // simulation keeps them `reactionOwned` with nobody left to release them.
   for(const id of disowned)onReclaim?.(id,null);
   crowd.dispose();rendered.clear();disowned.clear();rising.clear();}
 };
}
