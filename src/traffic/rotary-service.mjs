import {makePath,pose} from './path.mjs';
import {safePose} from './graph.mjs';
import generated from './rotary-generated.json' with {type:'json'};

// Reuse the mapped one-way rotary centreline, including the small connecting gaps.
export function rotaryPath(graph,diagnostic=false,regenerate=false){
 const ids=['1414217947','265139656','1143863679','215955234','1143863680','1033129758','1109680532','375676167','310155101'];
 const points=[];
 for(const id of ids){const edge=graph.edges.find(e=>e.sourceId==='way/'+id);if(!edge)return null;for(const p of edge.points)if(!points.length||Math.hypot(p[0]-points.at(-1)[0],p[1]-points.at(-1)[1])>.01)points.push(p);}
 const source=JSON.stringify(points);
 if(!diagnostic&&!regenerate&&source===generated.source){const path={...generated.path};for(const key of ['x','z','h','s'])path[key]=Float64Array.from(path[key]);let valid=true;for(let d=0;d<=path.length;d+=.1)if(!safePose(graph.ctx,pose(path,d),'bus')){valid=false;break;}if(valid)return path;}
 let path=makePath(points);const p={};
 // The map line hugs the inside of the tight northern bend. Offset the swept
 // body, not the road or pavement, and keep the full-sized 9m bus envelope.
 if(!diagnostic){
  const samples=[],offsets=[0,-.1,.1,-.2,.2,-.3,.3,-.4,.4,-.5,.5,-.6,.6,-.7,.7,-.8,.8,-.9,.9,-1,1],angles=[0,-.05,.05,-.1,.1,-.15,.15,-.2,.2,-.25,.25,-.3,.3,-.35,.35,-.4,.4];
  let previousOffset=0,previousAngle=0;
  for(let d=5;d<=path.length-5;d+=.05){
   const base=pose(path,d),candidates=[];
   for(const offset of offsets)for(const angle of angles)candidates.push({offset,angle,cost:offset*offset+angle*angle*4+Math.pow(offset-previousOffset,2)*8+Math.pow(angle-previousAngle,2)*20});
   candidates.sort((a,b)=>a.cost-b.cost);let chosen;
   for(const candidate of candidates){const q={x:base.x+Math.cos(base.heading)*candidate.offset,z:base.z-Math.sin(base.heading)*candidate.offset,heading:base.heading+candidate.angle};if(safePose(graph.ctx,q,'bus',.2)&&safePose(graph.ctx,q,'bus')){chosen={...candidate,...q};break;}}
   if(!chosen)return null;
   previousOffset=chosen.offset;previousAngle=chosen.angle;samples.push(chosen);
  }
  path={x:Float64Array.from(samples.map(p=>p.x)),z:Float64Array.from(samples.map(p=>p.z)),h:Float64Array.from(samples.map(p=>p.heading)),s:Float64Array.from(samples.map((_,i)=>i*.05)),length:(samples.length-1)*.05};
 }
 const failures=[];for(let d=5;d<path.length-5;d+=.5)if(!safePose(graph.ctx,pose(path,d,p),'bus'))failures.push({d,...p});
 if(diagnostic)return {path,failures};
 if(failures.length)return null;
 return {...path,source};
}

export function initializeRotary(sim){
 const path=rotaryPath(sim.graph);if(!path)return;
 let entry=Infinity,exit=0;
 for(let d=0;d<=path.length;d+=.2){const p=pose(path,d);if(sim.signals.area.contains(p.x,p.z,5.7)){entry=Math.min(entry,d);exit=Math.max(exit,d);}}
 sim.rotary={path,entry,exit,departures:0,arrivals:0};
 const lane=sim.graph.lanes.find(l=>l.allowed.includes('bus'));
 for(const progress of [52,38,24,10]){
  const v=sim.pool.find(v=>!v.active),p=pose(path,progress);if(!v||sim.blocked(p,'bus',null,1))continue;
  Object.assign(v,{active:true,type:'bus',parked:false,service:true,lane:lane.id,transition:-1,next:-1,progress,speed:0,brake:true,age:0,stuck:0,dwell:0,served:false,...p});
  v.locks.clear();sim.rebuildGrid();sim.rotary.arrivals++;
 }
}

export function updateRotary(sim,dt){
 if(!sim.rotary)return;
 const {path,entry,exit}=sim.rotary,group=sim.signals.groups.get('scramble');
 for(const v of sim.pool){if(!v.active||!v.service)continue;
  let stop=Infinity;
  if(!v.served){stop=Math.max(0,52-v.progress);if(stop<.1){v.dwell+=dt;if(v.dwell>=18){v.served=true;sim.rotary.departures++;}}}
  if(v.progress<entry&&!v.locks.has('scramble')){
   stop=Math.min(stop,Math.max(0,entry-v.progress-.5));
   if(entry-v.progress<2&&!group.locks.size){
    const green=['EW','NS'].some(axis=>sim.signals.getSignalState('scramble',axis)==='GREEN'&&sim.signals.remainingGreen('scramble',axis)>(exit-entry+12)/3+3);
    if(green){let clear=true;for(let d=entry;d<=exit+12;d+=2)if(sim.blocked(pose(path,d),'bus',v,.6)){clear=false;break;}
     if(clear){group.locks.add(v.id);v.locks.add('scramble');stop=Infinity;}
    }
   }
  }
  for(let d=.5;d<16;d+=.5)if(sim.blocked(pose(path,Math.min(path.length,v.progress+d)),'bus',v,.6)){stop=Math.min(stop,Math.max(0,d-1));break;}
  const target=Math.min(3.2,Math.sqrt(6*Math.max(0,stop-.05))),old=v.speed;
  v.speed+=Math.max(-3*dt,Math.min(.8*dt,target-v.speed));
  const advance=Math.min(v.speed*dt,stop),q=pose(path,Math.min(path.length,v.progress+advance));
  // Interpolation between safe 5cm samples can graze a corner of the narrow bend.
  // Keep the full bus envelope valid at the actual sub-frame pose too.
  if(!safePose(sim.graph.ctx,q,'bus')){
   const base={...q};let corrected=false;
   for(const offset of [0,-.01,.01,-.02,.02,-.04,.04,-.08,.08]){for(const yaw of [0,-.005,.005,-.01,.01,-.02,.02]){
    const candidate={x:base.x+Math.cos(base.heading)*offset,z:base.z-Math.sin(base.heading)*offset,heading:base.heading+yaw};
    if(safePose(sim.graph.ctx,candidate,'bus')){Object.assign(q,candidate);corrected=true;break;}
   }if(corrected)break;}
  }
  if(safePose(sim.graph.ctx,q,'bus')&&!sim.blocked(q,'bus',v,.3)){v.progress=Math.min(path.length,v.progress+advance);Object.assign(v,q);}else v.speed=0;
  v.brake=v.speed<.05||v.speed<old;v.age+=dt;
  if(v.progress>exit+1&&v.locks.has('scramble')){v.locks.delete('scramble');group.locks.delete(v.id);}
  if(v.progress>=path.length-.05&&!sim.blocked(pose(path,0),'bus',v,2)){v.progress=0;v.dwell=0;v.served=false;v.speed=0;Object.assign(v,pose(path,0));sim.rotary.arrivals++;}
  sim.rebuildGrid();
 }
}
