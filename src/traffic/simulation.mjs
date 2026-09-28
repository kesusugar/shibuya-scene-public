import {initializeCentralStreams,updateCentralStreams} from './central-streams.mjs';
import {initializeRotary,updateRotary} from './rotary-service.mjs';
import {buildEgress} from './egress.mjs';
import {seededRandom} from '../geo/core.mjs';
import {VEHICLES,PROFILES,MAJOR} from './config.mjs';
import {pose,boxOverlap,angleDiff} from './path.mjs';
import {stationExcluded}from '../streetscape/model.mjs';
import {safePose} from './graph.mjs';
import {buildSignals} from './signals.mjs';
import {createOccupancy} from './occupancy.mjs';
// Looks C: what stands at the kerb. It used to alternate kei and van; the new bodies park too.
// Looks D: the two one-off night cars park at fixed spots on side streets near the crossing
// (lanes found by qa: unclassified, 6.5–7 m wide, 72 m and 98 m from the Scramble). HIGH and MEDIUM.
export const HERO_SPOTS=Object.freeze([{type:'heroSilver',x:55.9,z:-46.2},{type:'heroDark',x:-71.5,z:67.5}]);
export const PARKED_MIX=Object.freeze(['kei','van','tallKei','minivan','longVan','sedan','kei','truck2t']);
// Fixed pool and reusable spatial buckets; update work is limited to nearby cells.
export class TrafficSimulation{
 constructor(graph,{tier='medium',seed='shibuya-s9',street=null,heroStart=false}={}){this.graph=graph;this.rng=seededRandom(seed);this.signals=buildSignals(graph,street);this.tier=tier;this.heroStart=heroStart;this.target=PROFILES[tier].moving;this.time=0;this.accumulator=0;this.spawnClock=0;this.grid=new Map();this.scratch={};this.future={};this.stats={spawned:0,admissions:{},crossingEntries:{},junctionEntries:0,distanceTravelled:0,despawned:0,recoveries:0,routeFailures:0,permitYields:0,stuck:0,redViolations:0,redEvents:[],overlaps:0,blockedEntries:0,neighborChecks:0,updateMs:0,reasons:{}};this.pool=Array.from({length:146},(_,id)=>({id,active:false,parked:false,x:0,z:0,heading:0,speed:0,type:'sedan',lane:0,transition:-1,progress:0,age:0,stuck:0,junction:null,releaseLane:-1,brake:false,blinker:0,headlight:false,next:-1,futureEdge:-1,leaderDistance:Infinity,locks:new Set(),yellowStops:new Set(),passed:new Set(),windows:Array.from({length:64},()=>({group:null,start:0,end:0,axis:null})),windowCount:0}));this.occupancy=createOccupancy(this.pool.length);this.reconcileOccupancy();this.laneOccupancy=new Map();this.reservations=new Map();this.spawnCandidates=graph.lanes.filter(l=>l.next.length&&l.path.length>18);this.egress=buildEgress(graph,this.signals.area);this.heroLanes=this.findHeroLanes();this.refill(true);if(heroStart){this.stageHeroTraffic();initializeRotary(this);if(tier==='high')initializeCentralStreams(this);}}
 findHeroLanes(){const ids=new Set(this.graph.lanes.filter(l=>l.controls.some(c=>c.group==='scramble')||l.next.some(id=>this.graph.transitions[id].controls.some(c=>c.group==='scramble'))).map(l=>l.id));
 for(let depth=0;depth<3;depth++)for(const l of this.graph.lanes){const p=pose(l.path,l.path.length/2);if(Math.hypot(p.x,p.z)<115&&l.next.some(id=>ids.has(this.graph.transitions[id].to)))ids.add(l.id);}
 return this.graph.lanes.filter(l=>ids.has(l.id)&&l.next.length&&l.path.length>9);
 }
 currentPath(v){if(v.platoon!==undefined)return this.centralStreams.routes[v.platoon].path;if(v.service)return this.rotary.path;return v.transition<0?this.graph.lanes[v.lane].path:this.graph.transitions[v.transition].path;}
 nextFor(lane,type){if(this.streamLanes){const choices=lane.next.filter(id=>this.graph.transitions[id].allowed.includes(type)&&!this.streamLanes.has(this.graph.transitions[id].to));if(choices.length!==lane.next.length)return choices.length?choices[0]:-1;}const egress=this.egress?.get(type)?.get(lane.id);if(egress!==undefined)return egress;const options=lane.next.filter(id=>{const t=this.graph.transitions[id],next=this.graph.lanes[t.to];const mid=pose(next.path,next.path.length/2);return t.allowed.includes(type)&&(this.stopAt(next,type)>VEHICLES[type].length/2+2||this.signals.area.contains(mid.x,mid.z)&&next.next.length>0);});return options.length?options[Math.floor(this.rng()*options.length)]:-1;}
 chooseType(){let r=this.rng()*100;for(const [t,d]of Object.entries(VEHICLES)){r-=d.weight;if(r<=0)return t;}return 'sedan';}
 cell(x,z){return Math.floor(x/15)+','+Math.floor(z/15);}
 releasePermits(v){for(const id of v.locks)this.signals.groups.get(id)?.locks.delete(v.id);v.locks.clear();for(const [id,owner]of this.reservations)if(owner===v.id)this.reservations.delete(id);v.junction=null;}
 rebuildGrid(){this.signals.areaVehicles.clear();for(const v of this.pool)if(v.active&&!v.controlled&&this.signals.area.contains(v.x,v.z,Math.hypot(VEHICLES[v.type].width,VEHICLES[v.type].length)/2))this.signals.areaVehicles.add(v.id);for(const b of this.grid.values())b.length=0;for(const v of this.pool)if(v.active){const k=this.cell(v.x,v.z);if(!this.grid.has(k))this.grid.set(k,[]);this.grid.get(k).push(v);}}
 blocked(p,type,exclude,padding=.3){const ix=Math.floor(p.x/15),iz=Math.floor(p.z/15);for(let x=ix-1;x<=ix+1;x++)for(let z=iz-1;z<=iz+1;z++){const b=this.grid.get(x+','+z);if(!b)continue;for(const other of b){if(other===exclude||!other.active)continue;this.stats.neighborChecks++;if(Math.abs(other.x-p.x)>13||Math.abs(other.z-p.z)>13)continue;if(boxOverlap(p,VEHICLES[type],other,VEHICLES[other.type],padding))return true;}}return false;}
 despawn(v,reason){if(!v.active)return;this.releasePermits(v);this.occupancy?.vacate(v.id);v.driverless=false;v.active=false;this.stats.despawned++;this.stats.reasons[reason]=(this.stats.reasons[reason]??0)+1;if(reason==='stuck'){this.stats.stuck++;this.stats.recoveries++;}if(reason==='route-end')this.stats.routeFailures++;}
 setTier(tier){if(!PROFILES[tier])throw Error('Unknown traffic tier');if(tier!=='high'&&this.centralStreams){for(const v of this.pool)if(v.platoon!==undefined){this.despawn(v,'profile');v.platoon=undefined;}this.centralStreams=null;this.streamLanes=null;}this.tier=tier;this.target=PROFILES[tier].moving;let count=0,parked=0;for(const v of this.pool)if(v.active){if(v.controlled||v.owned||v.kept||v.hero&&tier!=='low')continue;if(tier==='high'&&v.platoon!==undefined)continue;if(v.parked){if(++parked>PROFILES[tier].parked)this.despawn(v,'profile');}else if(++count>this.target)this.despawn(v,'profile');}this.refill(true);if(tier==='high'&&this.heroStart&&!this.pool.some(v=>v.active&&v.service))initializeRotary(this);if(tier==='high'&&this.heroStart&&!this.centralStreams)initializeCentralStreams(this);}
 /** Park a one-off car of `type` at the legal kerb spot nearest (x,z). Deterministic. */
 placeHero(type,x,z){if(this.pool.some(v=>v.active&&v.type===type))return true;const v=this.pool.find(v=>!v.active);if(!v)return false;const size=VEHICLES[type];
  const options=[];for(const lane of this.spawnCandidates){if(!lane.allowed.includes(type)||MAJOR.has(lane.edge.roadClass)||lane.edge.width<6.5)continue;
   for(let progress=2+size.length/2;progress<=lane.path.length-size.length/2-2;progress+=2){pose(lane.path,progress,this.scratch);const d=Math.hypot(this.scratch.x-x,this.scratch.z-z);if(d<25)options.push({lane,progress,d});}}
  options.sort((a,b)=>a.d-b.d);
  for(const {lane,progress} of options){if(lane.controls.some(c=>progress>c.start-size.length/2-1.5&&progress<c.end+size.length/2+2))continue;const next=this.nextFor(lane,type);if(next<0)continue;
   pose(lane.path,progress,this.scratch);const shift=Math.max(0,lane.edge.width/2-Math.abs(lane.offset)-size.width/2-.3);this.scratch.x+=Math.cos(this.scratch.heading)*shift;this.scratch.z-=Math.sin(this.scratch.heading)*shift;
   if(stationExcluded([this.scratch.x,this.scratch.z])||this.signals.area.contains(this.scratch.x,this.scratch.z,Math.hypot(size.width,size.length)/2)||!safePose(this.graph.ctx,this.scratch,type)||this.blocked(this.scratch,type,null,1))continue;
   Object.assign(v,{active:true,wear:null,kept:false,platoon:undefined,service:false,parked:true,hero:true,type,lane:lane.id,transition:-1,progress,age:0,stuck:0,junction:null,releaseLane:-1,speed:0,next,futureEdge:this.graph.transitions[next].to,brake:false,blinker:0,...this.scratch});
   v.locks.clear();v.yellowStops.clear();v.passed.clear();this.stats.spawned++;this.rebuildGrid();return true;}
  return false;}
 spawn(type,parked=false){const v=this.pool.find(v=>!v.active);if(!v)return false;for(let attempt=0;attempt<100;attempt++){const candidates=this.heroStart&&!parked&&attempt%5!==4&&this.heroLanes.length?this.heroLanes:this.spawnCandidates;const lane=candidates[Math.floor(this.rng()*candidates.length)];if(!lane||this.streamLanes?.has(lane.id)||!lane.allowed.includes(type)||parked&&(MAJOR.has(lane.edge.roadClass)||lane.edge.width<6.5))continue;const next=this.nextFor(lane,type);if(next<0)continue;const size=VEHICLES[type],progress=2+size.length/2+this.rng()*Math.max(0,lane.path.length-size.length-4);if(progress>lane.path.length-size.length/2-2||lane.controls.some(c=>progress>c.start-size.length/2-1.5&&progress<c.end+size.length/2+2))continue;pose(lane.path,progress,this.scratch);if(parked){const shift=Math.max(0,lane.edge.width/2-Math.abs(lane.offset)-size.width/2-.3);this.scratch.x+=Math.cos(this.scratch.heading)*shift;this.scratch.z-=Math.sin(this.scratch.heading)*shift;if(Math.hypot(this.scratch.x,this.scratch.z)<70||stationExcluded([this.scratch.x,this.scratch.z]))continue;}if(this.reservations.has(Math.floor(this.scratch.x/10)+','+Math.floor(this.scratch.z/10)))continue;if(this.signals.area.contains(this.scratch.x,this.scratch.z,Math.hypot(size.width,size.length)/2)||!safePose(this.graph.ctx,this.scratch,type)||this.blocked(this.scratch,type,null,2))continue;Object.assign(v,{active:true,wear:null,kept:false,platoon:undefined,service:false,parked,type,lane:lane.id,transition:-1,progress,age:0,stuck:0,junction:null,releaseLane:-1,speed:0,next,futureEdge:this.graph.transitions[next].to,brake:false,blinker:0,...this.scratch});v.locks.clear();v.yellowStops.clear();v.passed.clear();this.stats.spawned++;this.rebuildGrid();return true;}return false;}
 refill(initial=false){this.rebuildGrid();let moving=this.pool.filter(v=>v.active&&!v.parked).length,parked=this.pool.filter(v=>v.active&&v.parked).length;const types=Object.keys(VEHICLES).filter(t=>VEHICLES[t].weight>0);for(let i=0;i<(initial?this.target:3)&&moving<this.target;i++){if(this.spawn(initial&&i<types.length?types[i]:this.chooseType()))moving++;}if(initial&&this.tier!=='low'){for(const h of HERO_SPOTS)this.placeHero(h.type,h.x,h.z);parked=this.pool.filter(v=>v.active&&v.parked).length;}for(let i=parked;i<PROFILES[this.tier].parked;i++)if(!this.spawn(PARKED_MIX[i%PARKED_MIX.length],true))break;}
 stageHeroTraffic(){const rows=new Map();let staged=0;this.rebuildGrid();
 // Looks C: the approach queues are only so long, and the plan's mix has longer bodies (large
 // minivans, long vans, 2t trucks). Shortest bodies stage first, which fits the most, and a second
 // pass retries cars that were blocked by one that has since moved into a queue.
 const done=new Set(),order=[...this.pool].sort((a,b)=>VEHICLES[a.type].length-VEHICLES[b.type].length||a.id-b.id);
 for(let pass=0;pass<2;pass++)for(const v of order){if(!v.active||v.parked||staged>=30||done.has(v))continue;
  for(let attempt=0;attempt<this.heroLanes.length;attempt++){
   const lane=this.heroLanes[(staged+attempt)%this.heroLanes.length];if(!lane.allowed.includes(v.type))continue;
   const next=this.nextFor(lane,v.type);if(next<0)continue;
   const half=VEHICLES[v.type].length/2,tail=rows.get(lane.id);
   const progress=tail===undefined?Math.min(this.stopAt(lane,v.type)-.5,lane.path.length-half-2):tail-half-1.4;
   if(progress<half+2||lane.controls.some(c=>progress+half>c.start-1&&progress-half<c.end+1))continue;
   pose(lane.path,progress,this.scratch);
   if(this.signals.area.contains(this.scratch.x,this.scratch.z,Math.hypot(VEHICLES[v.type].width,VEHICLES[v.type].length)/2)||Math.hypot(this.scratch.x,this.scratch.z)>115||!safePose(this.graph.ctx,this.scratch,v.type)||this.blocked(this.scratch,v.type,v,.7))continue;
   Object.assign(v,{lane:lane.id,transition:-1,progress,next,futureEdge:this.graph.transitions[next].to,speed:0,brake:true,junction:null,releaseLane:-1,...this.scratch});
   rows.set(lane.id,progress-half);staged++;done.add(v);this.rebuildGrid();break;
  }
 }this.stats.heroStaged=staged;
 }

 futurePose(v,d,out){let path=this.currentPath(v),at=v.progress+d,next=v.transition<0?v.next:null,laneId=v.lane,transition=v.transition;
 for(let hop=0;hop<24;hop++){
  if(at<=path.length)return pose(path,at,out);at-=path.length;
  if(transition>=0){laneId=this.graph.transitions[transition].to;path=this.graph.lanes[laneId].path;transition=-1;next=this.egress.get(v.type)?.get(laneId)??-1;}
  else if(next>=0){transition=next;path=this.graph.transitions[next].path;}
  else return pose(path,path.length,out);
 }return pose(path,path.length,out);
 }

 clearAhead(v,distance=23){for(let d=3;d<=distance;d+=2){this.futurePose(v,d,this.future);if(this.blocked(this.future,v.type,v,.7))return false;}return true;}
 stopAt(lane,type){const half=VEHICLES[type].length/2;let at=lane.path.length-half-1;for(let round=0;round<2;round++)for(const c of lane.controls)if(at+half>=c.start&&at-half<=c.end)at=Math.min(at,c.start-half-1);return Math.max(0,at);}
 junctionStop(v){const lane=this.graph.lanes[v.lane];if(v.locks.has('scramble')&&this.signals.area.contains(v.x,v.z,3))return lane.path.length-VEHICLES[v.type].length/2-1;return this.stopAt(lane,v.type);}
 windowsFor(v){v.windowCount=0;const add=(controls,shift)=>{for(const c of controls){const start=c.start+shift,end=c.end+shift;if(end< -VEHICLES[v.type].length/2-2||start>40)continue;let w=null;for(let i=0;i<v.windowCount;i++)if(v.windows[i].group===c.group)w=v.windows[i];if(!w){if(v.windowCount===v.windows.length)throw Error('Traffic control window overflow');w=v.windows[v.windowCount++];w.group=c.group;w.start=start;w.end=end;w.axis=c.axis;}else{if(start<w.start)w.axis=c.axis;w.start=Math.min(w.start,start);w.end=Math.max(w.end,end);}}};const path=this.currentPath(v);if(v.transition<0){add(this.graph.lanes[v.lane].controls,-v.progress);if(v.next>=0){const t=this.graph.transitions[v.next];add(t.controls,path.length-v.progress);add(this.graph.lanes[t.to].controls,path.length-v.progress+t.path.length);}}else{const t=this.graph.transitions[v.transition];add(t.controls,-v.progress);add(this.graph.lanes[t.to].controls,path.length-v.progress);}for(const id of v.locks){let exists=false;for(let i=0;i<v.windowCount;i++)if(v.windows[i].group===id)exists=true;if(!exists){this.signals.groups.get(id)?.locks.delete(v.id);v.locks.delete(id);}}return v.windows;}
 step(dt){this.time+=dt;this.signals.update(dt);this.rebuildGrid();updateRotary(this,dt);updateCentralStreams(this,dt);for(const v of this.pool){if(!v.active||v.controlled||v.parked||v.service||v.platoon!==undefined)continue;v.age+=dt;if(v.stuck>.5&&v.transition<0){const l=this.graph.lanes[v.lane],half=VEHICLES[v.type].length/2,inside=l.controls.some(c=>v.progress+half>=c.start&&v.progress-half<=c.end+2);if(!inside){if(v.locks.size)this.stats.permitYields++;for(const id of v.locks)this.signals.groups.get(id)?.locks.delete(v.id);v.locks.clear();if(v.lane!==v.releaseLane){for(const [key,owner]of this.reservations)if(owner===v.id)this.reservations.delete(key);v.junction=null;}}}if(v.junction!==null&&v.transition<0&&v.lane===v.releaseLane&&v.progress>VEHICLES[v.type].length/2+2){for(const [k,owner]of this.reservations)if(owner===v.id)this.reservations.delete(k);v.junction=null;}const oldCell=this.cell(v.x,v.z),oldProgress=v.progress;const def=VEHICLES[v.type],lane=this.graph.lanes[v.lane],path=this.currentPath(v);let target=Math.min(def.speed,lane.edge.speed),stop=Infinity,junctionPermitted=true;v.leaderDistance=Infinity;
 // Scan 25m of chained route, so stopped queues beyond a junction are visible.
 for(let d=1;d<=25;d+=2){this.futurePose(v,d,this.future);if(this.blocked(this.future,v.type,v,.6)){v.leaderDistance=d;stop=Math.min(stop,Math.max(0,d-2));break;}}
 const controls=this.windowsFor(v);
 for(let ci=0;ci<v.windowCount;ci++){const c=controls[ci],rawRemaining=c.start-def.length/2-1,approach=v.transition<0&&v.next>=0&&c.start<path.length-v.progress+this.graph.transitions[v.next].path.length+def.length+3,remaining=approach?Math.min(rawRemaining,this.junctionStop(v)-v.progress):rawRemaining,g=this.signals.groups.get(c.group);if(v.locks.has(c.group))continue;const state=this.signals.getSignalState(c.group,c.axis),need=(Math.max(0,c.end-remaining)+def.length+8)/3+3;const yellowCanStop=v.speed<.5||remaining>v.speed*v.speed/(2*def.brake)+.2;if(state==='YELLOW'&&yellowCanStop)v.yellowStops.add(c.group);if(state==='GREEN')v.yellowStops.delete(c.group);const signalAllows=state==='GREEN'&&this.signals.remainingGreen(c.group,c.axis)>need||state==='YELLOW'&&!v.yellowStops.has(c.group)&&!yellowCanStop&&v.speed>.5;const junctionFree=!approach||this.graph.transitions[v.next].reservationKeys.every(k=>!this.reservations.has(k)||this.reservations.get(k)===v.id);const exitClear=!approach||this.clearAhead(v,Math.min(60,path.length-v.progress+this.graph.transitions[v.next].path.length+def.length+6));const clear=exitClear&&junctionFree&&g.locks.size===0&&this.clearAhead(v,c.group==='scramble'?85:Math.min(40,c.end+def.length+7));if(!signalAllows||!clear){if(approach)junctionPermitted=false;stop=Math.min(stop,Math.max(0,remaining));if(!clear&&remaining<15)this.stats.blockedEntries++;}else if(remaining<Math.max(1,v.speed*dt+.1)){g.locks.add(v.id);v.locks.add(c.group);const key=c.group+':'+c.axis;this.stats.admissions[key]=(this.stats.admissions[key]??0)+1;}}
 if(v.transition<0&&v.next>=0){const t=this.graph.transitions[v.next],remaining=this.junctionStop(v)-v.progress,occupied=t.reservationKeys.some(k=>this.reservations.has(k)&&this.reservations.get(k)!==v.id);if(remaining<25&&(occupied||!this.clearAhead(v,Math.min(60,path.length-v.progress+t.path.length+def.length+6))))stop=Math.min(stop,Math.max(0,remaining));else if(remaining<1&&junctionPermitted){for(const key of t.reservationKeys)this.reservations.set(key,v.id);v.junction=t.node;v.releaseLane=t.to;}if(path.length-v.progress<12&&Math.abs(t.turn)>.3)target=Math.min(target,4);}
 if(v.transition>=0)target=Math.min(target,4);
 if(Number.isFinite(stop))target=Math.min(target,Math.sqrt(2*def.brake*Math.max(0,stop-.2)));
 const old=v.speed;v.speed+=Math.max(-def.brake*dt,Math.min(def.accel*dt,target-v.speed));let advance=Math.min(v.speed*dt,Math.max(0,stop));v.brake=v.speed<old-.001||target<.1;v.blinker=v.next>=0&&path.length-v.progress<15?Math.sign(this.graph.transitions[v.next].turn):0;
 this.futurePose(v,advance,this.scratch);if(this.blocked(this.scratch,v.type,v,.2)){advance=0;v.speed=0;v.brake=true;}
 if(advance>0){for(let ci=0;ci<v.windowCount;ci++){const c=controls[ci],entry=c.start-def.length/2;if(entry>0&&advance>=entry){const key=c.group+':'+c.axis;this.stats.crossingEntries[key]=(this.stats.crossingEntries[key]??0)+1;}if(entry>0&&advance>=entry&&!v.locks.has(c.group)&&this.signals.getSignalState(c.group,c.axis)==='RED'){this.stats.redViolations++;if(this.stats.redEvents.length<20)this.stats.redEvents.push({time:this.time,id:v.id,lane:v.lane,group:c.group});}}this.stats.distanceTravelled+=advance;v.progress+=advance;if(v.progress>=path.length){v.progress-=path.length;if(v.transition<0){if(v.next<0){this.despawn(v,'route-end');continue;}v.transition=v.next;this.stats.junctionEntries++;v.next=-1;}else{const t=this.graph.transitions[v.transition];v.junction=t.node;v.releaseLane=t.to;v.lane=t.to;v.transition=-1;v.next=this.nextFor(this.graph.lanes[v.lane],v.type);v.futureEdge=v.next<0?-1:this.graph.transitions[v.next].to;v.passed.clear();}}pose(this.currentPath(v),v.progress,v);}
 v.stuck=v.speed<.05?v.stuck+dt:0;if(v.age>210)this.despawn(v,'ttl');else if(v.stuck>100)this.despawn(v,'stuck');else if(v.next<0&&v.transition<0&&v.progress>this.currentPath(v).length-def.length)this.despawn(v,'route-end');
 // Update the moved vehicle's bucket immediately; following cars see its new pose.
 const newCell=this.cell(v.x,v.z);if(newCell!==oldCell){const old=this.grid.get(oldCell);if(old){const i=old.indexOf(v);if(i>=0)old.splice(i,1);}if(!this.grid.has(newCell))this.grid.set(newCell,[]);this.grid.get(newCell).push(v);}}
 this.spawnClock+=dt;if(this.spawnClock>=1){this.spawnClock=0;this.refill();}}
 update(dt){const start=performance.now();this.accumulator+=Math.max(0,Math.min(dt,.25));while(this.accumulator>=1/30){this.step(1/30);this.accumulator-=1/30;}this.reconcileOccupancy();this.stats.updateMs=performance.now()-start;}

 /**
  * Keep the seats honest against the pool.
  *
  * RUN 9. A vehicle becomes active in three different places -- `spawn`, the central
  * streams, and the rotary service -- and seating a driver at each of them means the next
  * one added forgets. So occupancy is RECONCILED instead: the pool is the truth, this walks
  * it, and no activation path can be missed. The same reasoning produced
  * `reconcileOwnership` in the HQ crowd layer, for the same class of bug.
  *
  * It is O(pool) on a fixed 146 slots, once per frame, against typed arrays.
  *
  * Three cars deliberately stay empty:
  *   - PARKED cars. An empty parked car is what the player walks up to and simply gets into;
  *     it is the normal-entry case, and giving it a driver would remove it.
  *   - The car the player is CONTROLLING. Its seat is set by the player's own transitions.
  *   - A car whose driver has just been DRAGGED OUT (`driverless`). Without that marker this
  *     function would put a fresh driver in the seat on the very next frame, while the
  *     player is still walking round the bonnet to get in.
  */
 reconcileOccupancy(){
  const o=this.occupancy;if(!o)return;
  for(const v of this.pool){
   if(!v.active){if(!o.isEmpty(v.id))o.vacate(v.id);v.driverless=false;continue;}
   if(v.controlled)continue;
   if(v.parked||v.driverless){if(o.hasDriver(v.id))o.vacate(v.id);continue;}
   if(o.isEmpty(v.id))o.seat(v.id);
  }
 }
 snapshot(){const active=this.pool.filter(v=>v.active);return {...this.stats,centralStreams:this.centralStreams?{routes:this.centralStreams.routes.length,cars:active.filter(v=>v.platoon!==undefined).length,entries:this.centralStreams.entries}:null,rotary:this.rotary?{buses:active.filter(v=>v.service).length,arrivals:this.rotary.arrivals,departures:this.rotary.departures}:null,tier:this.tier,moving:active.filter(v=>!v.parked).length,parked:active.filter(v=>v.parked).length,types:Object.fromEntries(Object.keys(VEHICLES).map(t=>[t,active.filter(v=>v.type===t).length])),signalGroups:this.signals.groups.size};}
 audit(){const findings=[];if(this.signals.getPedestrianPhase('scramble')==='WALK')for(const v of this.pool)if(v.active&&!v.controlled&&this.signals.area.contains(v.x,v.z,Math.hypot(VEHICLES[v.type].width,VEHICLES[v.type].length)/2))findings.push({id:v.id,kind:'vehicle-during-pedestrian-green'});for(const v of this.pool){if(!v.active||v.controlled)continue;if(![v.x,v.z,v.heading,v.speed,v.progress].every(Number.isFinite))findings.push({id:v.id,kind:'finite'});if(!this.graph.lanes[v.lane]?.allowed.includes(v.type))findings.push({id:v.id,kind:'lane-type'});if(v.platoon!==undefined&&v.speed<.05){const r=this.centralStreams.routes[v.platoon];if(v.progress>r.entry&&v.progress<r.exit)findings.push({id:v.id,kind:'platoon-crossing-stop'});}if(!safePose(this.graph.ctx,v,v.type))findings.push({id:v.id,kind:'road-solid'});if(!v.parked&&!v.service&&v.platoon===undefined&&v.speed<.05){const controls=v.transition<0?this.graph.lanes[v.lane].controls:this.graph.transitions[v.transition].controls;if(controls.some(c=>v.progress+VEHICLES[v.type].length/2>c.start&&v.progress-VEHICLES[v.type].length/2<c.end))findings.push({id:v.id,kind:'crosswalk-stop'});if(v.transition>=0)findings.push({id:v.id,kind:'junction-stop'});}for(const w of this.pool)if(w.active&&w.id>v.id&&boxOverlap(v,VEHICLES[v.type],w,VEHICLES[w.type],0))findings.push({id:v.id,other:w.id,kind:'overlap'});}this.stats.overlaps+=findings.filter(f=>f.kind==='overlap').length;return {major:findings.length,findings};}
 dispose(){for(const v of this.pool)this.despawn(v,'dispose');this.grid.clear();}
}
