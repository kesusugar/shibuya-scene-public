import {pose} from './path.mjs';
import {safePose} from './graph.mjs';
import {VEHICLES} from './config.mjs';

// Join existing surveyed lanes and connectors once. No per-frame route searches.
export function centralRoutes(sim){const g=sim.graph,routes=[];
 for(const seed of [283,284,285,286,281,282]){
  if(!g.lanes[seed])continue;const laneIds=[seed],transitions=[];
  for(let n=0;n<6;n++){const id=laneIds[0],choices=g.transitions.filter(t=>t.to===id&&t.allowed.includes('sedan')&&!laneIds.includes(t.from)).sort((a,b)=>Math.abs(a.turn)-Math.abs(b.turn));if(!choices.length)break;const t=choices[0];laneIds.unshift(t.from);transitions.unshift(t.id);if(laneIds.reduce((sum,id)=>sum+g.lanes[id].path.length,0)>120)break;}
  for(let n=0;n<8;n++){const id=laneIds.at(-1),choices=g.lanes[id].next.map(id=>g.transitions[id]).filter(t=>t.allowed.includes('sedan')&&!laneIds.includes(t.to)).sort((a,b)=>Math.abs(a.turn)-Math.abs(b.turn));if(!choices.length)break;const t=choices[0];transitions.push(t.id);laneIds.push(t.to);const p=pose(g.lanes[t.to].path,g.lanes[t.to].path.length);if(!sim.signals.area.contains(p.x,p.z,65))break;}
  const samples=[];for(let i=0;i<laneIds.length;i++){for(const path of [g.lanes[laneIds[i]].path,i<transitions.length?g.transitions[transitions[i]].path:null].filter(Boolean)){for(let d=0;d<path.length;d+=.5)samples.push(pose(path,d));samples.push(pose(path,path.length));}}
  const x=[],z=[],h=[],s=[];let distance=0;for(const p of samples){if(x.length){const gap=Math.hypot(p.x-x.at(-1),p.z-z.at(-1));if(gap<.001)continue;distance+=gap;}x.push(p.x);z.push(p.z);h.push(p.heading);s.push(distance);}
  const path={x:Float64Array.from(x),z:Float64Array.from(z),h:Float64Array.from(h),s:Float64Array.from(s),length:distance};let entry=Infinity,exit=0;
  for(let d=0;d<distance;d+=.5){const p=pose(path,d);if(sim.signals.area.contains(p.x,p.z,3.3)){entry=Math.min(entry,d);exit=Math.max(exit,d);}}
  // A route must have actual upstream queue space and a clear downstream outlet.
  if(entry<25||exit>distance-18||!Number.isFinite(entry))continue;
  let valid=true;for(let d=2;d<distance-2;d+=.5)if(!safePose(g.ctx,pose(path,d),'sedan')){valid=false;break;}
  if(valid)routes.push({id:routes.length,seed,axis:g.lanes[seed].axis,path,entry,exit,laneIds,departures:0});
 }return routes;}

export function initializeCentralStreams(sim){
 const routes=centralRoutes(sim);sim.centralStreams={routes,entries:0};sim.streamLanes=new Set(routes.flatMap(r=>r.laneIds));
 if(!routes.length)return;
 // The dedicated lanes are owned by their queue controller, not random traffic.
 for(const v of sim.pool)if(v.active&&!v.service&&(sim.streamLanes.has(v.lane)||routes.some(r=>{for(let d=0;d<r.path.length;d+=4){const p=pose(r.path,d);if(Math.hypot(v.x-p.x,v.z-p.z)<5)return true;}return false;})))sim.despawn(v,'stream-allocation');
 sim.rebuildGrid();
 for(const r of routes)for(let i=0;i<18;i++){
  const progress=r.entry-4.5-i*6.2;if(progress<3)break;const v=sim.pool.find(v=>!v.active),type=i%4===0?'taxi':i%4===1?'van':i%4===2?'sedan':'kei',p=pose(r.path,progress);if(!v||!safePose(sim.graph.ctx,p,type)||sim.blocked(p,type,null,.6))continue;
  Object.assign(v,{active:true,parked:false,platoon:r.id,service:false,type,lane:r.laneIds[0],transition:-1,next:-1,progress,speed:0,brake:true,age:0,stuck:0,...p});v.locks.clear();sim.rebuildGrid();
 }
}

export function updateCentralStreams(sim,dt){if(!sim.centralStreams)return;const group=sim.signals.groups.get('scramble');
 for(const r of sim.centralStreams.routes){const cars=sim.pool.filter(v=>v.active&&v.platoon===r.id).sort((a,b)=>b.progress-a.progress);
  for(const v of cars){const oldCell=sim.cell(v.x,v.z);let stop=Infinity;
   if(v.progress<r.entry&&!v.locks.has('scramble')){
    const remaining=sim.signals.remainingGreen('scramble',r.axis),green=sim.signals.getSignalState('scramble',r.axis)==='GREEN'&&remaining>(r.exit-r.entry)/7.2+5;
    const compatible=[...group.locks].every(id=>sim.pool[id]?.platoon!==undefined&&sim.centralStreams.routes[sim.pool[id].platoon]?.axis===r.axis);
    if(!green||!compatible)stop=Math.max(0,r.entry-4.5-v.progress);
    else if(v.progress>=r.entry-2){group.locks.add(v.id);v.locks.add('scramble');r.departures++;sim.centralStreams.entries++;}
   }
   for(let d=.5;d<20;d+=.5)if(sim.blocked(pose(r.path,v.progress+d),v.type,v,.45)){stop=Math.min(stop,Math.max(0,d-1));break;}
   const target=Math.min(7.2,Math.sqrt(6*Math.max(0,stop-.05))),old=v.speed;v.speed+=Math.max(-3*dt,Math.min(2*dt,target-v.speed));const advance=Math.min(v.speed*dt,stop),q=pose(r.path,v.progress+advance);
   if(!sim.blocked(q,v.type,v,.2)){v.progress=Math.min(r.path.length,v.progress+advance);Object.assign(v,q);}else v.speed=0;v.brake=v.speed<.05||v.speed<old;
   if(v.progress>r.exit+1&&v.locks.has('scramble')){v.locks.delete('scramble');group.locks.delete(v.id);}
   if(v.progress>=r.path.length-3&&!sim.blocked(pose(r.path,3),v.type,v,1)){v.progress=3;v.speed=0;Object.assign(v,pose(r.path,3));}
   const newCell=sim.cell(v.x,v.z);if(newCell!==oldCell){const bucket=sim.grid.get(oldCell),index=bucket?.indexOf(v)??-1;if(index>=0)bucket.splice(index,1);if(!sim.grid.has(newCell))sim.grid.set(newCell,[]);sim.grid.get(newCell).push(v);}
  }
 }
 sim.rebuildGrid();
}
