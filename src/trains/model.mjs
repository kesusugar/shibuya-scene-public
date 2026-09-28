import {auditRails} from '../station/alignment.mjs';
import {STATION} from '../station/config.mjs';
import {makePath,pose} from '../traffic/path.mjs';
export const TRAIN_TYPES=Object.freeze({JR:{cars:4,length:18,width:2.75,height:3.4,gap:.7,speed:12,color:0x74a45c},Ginza:{cars:3,length:15,width:2.55,height:3.1,gap:.6,speed:8,color:0xe6ac32}});
export const TRAIN_PROFILES=Object.freeze({high:{sets:3,interval:14},medium:{sets:2,interval:24},low:{sets:2,interval:42}});
// Reuse S5's source joins, orientation, elevations and platform locations.
// No path smoothing moves the train off the mapped centerline.
export function buildTrainRoutes(data,core=null){
 const alignments=core?.alignments??auditRails(data).alignments;
 const jr=alignments.filter(a=>a.group==='JR:山手線:main');
 const ginza=alignments.filter(a=>a.group==='Ginza:東京メトロ銀座線:main');
 const selected=[jr[0],ginza[0],jr[1]].filter(Boolean);
 return selected.map((a,i)=>{const path=makePath(a.points,false),def=TRAIN_TYPES[a.family],half=(def.cars*def.length+(def.cars-1)*def.gap)/2;
  let stop=0,best=Infinity;for(let d=half+2;d<path.length-half-2;d++){const p=pose(path,d),v=a.family==='JR'?Math.abs(p.z-110):Math.abs(p.x-180);if(v<best){best=v;stop=d;}}
  return {id:a.id,type:a.family,sourceIds:a.sourceIds,points:a.points,path,stop,half,railY:a.deckY+STATION.railTop,direction:a.family==='Ginza'||i===2?-1:1,terminal:a.family==='Ginza'};
 });
}
// Only invisible staging extends the end tangent; rendered fragments are clipped
// to the same ±250 m scene boundary as S5. Recycle occurs after the whole set exits.
export function trainPose(route,d,out={}){const p=route.path;pose(p,d,out);if(d<0||d>p.length){const extra=d<0?d:d-p.length;const i=d<0?0:p.x.length-2,j=i+1,dx=p.x[j]-p.x[i],dz=p.z[j]-p.z[i],len=Math.hypot(dx,dz);out.x+=dx/len*extra;out.z+=dz/len*extra;}out.y=route.railY;return out;}
export class TrainSimulation{
 constructor(routes,{tier='medium'}={}){this.routes=routes;this.time=0;this.stats={stops:0,departures:0,recycles:0};this.sets=routes.map((route,id)=>({id,route,enabled:false,state:'waiting',speed:0,distance:0,direction:route.direction,wait:0,stopped:false}));this.setTier(tier);}
 reset(t,delay){t.direction=t.route.direction;t.distance=t.direction>0?-t.route.half-30:t.route.path.length+t.route.half+30;t.speed=0;t.state='waiting';t.wait=delay;t.stopped=false;}
 setTier(tier){if(!TRAIN_PROFILES[tier])throw Error('Unknown train tier');this.tier=tier;this.sets.forEach((t,i)=>{const enabled=i<TRAIN_PROFILES[tier].sets;if(enabled&&!t.enabled)this.reset(t,i*9+2);t.enabled=enabled;});}
 update(dt){dt=Math.max(0,Math.min(.1,dt));this.time+=dt;for(const t of this.sets){if(!t.enabled)continue;
  if(t.state==='waiting'||t.state==='stopped'){t.wait-=dt;if(t.wait>0)continue;if(t.state==='stopped'){this.stats.departures++;if(t.route.terminal)t.direction=1;}t.state='running';}
  const def=TRAIN_TYPES[t.route.type],remaining=(t.route.stop-t.distance)*t.direction;
  const target=t.stopped?def.speed:Math.min(def.speed,Math.sqrt(Math.max(0,2*.8*remaining)));
  t.speed+=Math.max(-1.2*dt,Math.min(.8*dt,target-t.speed));let advance=t.speed*dt;
  if(!t.stopped&&remaining<=advance+.003){t.distance=t.route.stop;t.speed=0;t.state='stopped';t.wait=7;t.stopped=true;this.stats.stops++;continue;}
  t.distance+=t.direction*advance;
  if(t.direction>0?t.distance>t.route.path.length+t.route.half+30:t.distance<-t.route.half-30){this.stats.recycles++;this.reset(t,TRAIN_PROFILES[this.tier].interval+t.id*5);}
 }}
 forEachCar(fn){for(const t of this.sets){if(!t.enabled||t.state==='waiting')continue;const def=TRAIN_TYPES[t.route.type];for(let i=0;i<def.cars;i++)fn(t,i,t.distance+(i-(def.cars-1)/2)*(def.length+def.gap),def);}}
 snapshot(debug=false){return {tier:this.tier,routeCount:this.routes.length,sets:this.sets.filter(t=>t.enabled).length,JR:this.sets.filter(t=>t.enabled&&t.route.type==='JR').length,Ginza:this.sets.filter(t=>t.enabled&&t.route.type==='Ginza').length,...this.stats,...(debug?{trains:this.sets.filter(t=>t.enabled).map(t=>({id:t.id,type:t.route.type,route:t.route.id,speed:t.speed,state:t.state,distance:t.distance,stop:t.route.stop,direction:t.direction}))}:{})};}
}
