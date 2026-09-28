import {route} from '../life/network.mjs';
export const DELIVERY=Object.freeze({seconds:240,radius:3,dwell:1.2,stops:3});
export function planDelivery(network,start){
 const nodes=(network.eligible?.length?network.eligible:network.nodes).filter(n=>network.ctx.safe(n.x,n.z,.4));
 const from=[...nodes].sort((a,b)=>Math.hypot(a.x-start.x,a.z-start.z)-Math.hypot(b.x-start.x,b.z-start.z)||a.id-b.id)[0];
 if(!from)return [];
 let at=from;const selected=[];
 for(const [i,anchor]of [[-40,-35],[-75,-55],[15,25]].entries()){
  const candidates=nodes.filter(n=>n.component===from.component&&Math.hypot(n.x-at.x,n.z-at.z)>20&&Math.hypot(n.x,n.z)<130&&!selected.some(s=>Math.hypot(s.x-n.x,s.z-n.z)<15)).sort((a,b)=>Math.hypot(a.x-anchor[0],a.z-anchor[1])-Math.hypot(b.x-anchor[0],b.z-anchor[1])||a.id-b.id);
  let found=null;
  for(const n of candidates.slice(0,40)){const path=route(network,at.id,n.id);if(path.length){found={...n,label:`受け渡し地点 ${i+1}`,path};break;}}
  if(!found)return [];selected.push(found);at=found;
 }
 return selected;
}
export function createDelivery(network){
 let stops=[],index=0,elapsed=0,hold=0,status='idle',reason='',contacts=0;
 return {
  start(position){stops=planDelivery(network,position);index=0;elapsed=0;hold=0;contacts=0;status=stops.length===DELIVERY.stops?'running':'unavailable';reason='';return status==='running';},
  cancel(){status='idle';hold=0;},
  tick(dt,position,{driving=false,alive=true,hits=0}={}){
   if(status!=='running')return;
   if(!alive){status='failed';reason='転倒しました';return;}
   elapsed+=Math.max(0,dt);contacts+=Math.max(0,hits);
   if(elapsed>=DELIVERY.seconds){elapsed=DELIVERY.seconds;status='failed';reason='時間切れ';return;}
   const stop=stops[index];
   if(!driving&&Math.abs(position.speed??0)<.5&&Math.hypot(position.x-stop.x,position.z-stop.z)<=DELIVERY.radius){hold+=dt;if(hold>=DELIVERY.dwell){index++;hold=0;if(index===stops.length)status='complete';}}else hold=0;
  },
  snapshot(){return {status,reason,index,total:stops.length,elapsed,remaining:Math.max(0,DELIVERY.seconds-elapsed),progress:hold/DELIVERY.dwell,target:status==='running'?stops[index]:null,contacts,score:status==='complete'?Math.max(0,Math.round((DELIVERY.seconds-elapsed)*10+300-contacts*100)):0};}
 };
}
