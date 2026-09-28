// Bounded local prediction over existing spatial cells; no new navigation graph or assets.
const HORIZON=1.6,STEP=.1;
export function vehicleClearance(p,car,def){
 const dx=p.x-car.x,dz=p.z-car.z,s=Math.sin(car.heading),c=Math.cos(car.heading);
 const a=Math.abs(dx*s+dz*c)-def.length/2,b=Math.abs(dx*c-dz*s)-def.width/2;
 return Math.hypot(Math.max(0,a),Math.max(0,b))+Math.min(0,Math.max(a,b))-.35;
}
export function predictContact(p,car,def){
 const yaw=car.yawRate??0,course=car.course??car.heading,speed=car.speed;
 const vx=Math.sin(course)*speed,vz=Math.cos(course)*speed,px=Math.sin(p.heading??0)*(p.speed??0),pz=Math.cos(p.heading??0)*(p.speed??0);
 for(let t=0;t<=HORIZON+.001;t+=STEP){const a=yaw*t,pose={heading:car.heading+a,
  x:car.x+(Math.abs(yaw)<.001?vx*t:(vx*Math.sin(a)+vz*(1-Math.cos(a)))/yaw),
  z:car.z+(Math.abs(yaw)<.001?vz*t:(vz*Math.sin(a)-vx*(1-Math.cos(a)))/yaw)};
  if(vehicleClearance({x:p.x+px*t,z:p.z+pz*t},pose,def)<.15)return Math.max(0,t-STEP);
 }
 return null;
}
export function safeEscape(p,car,def,crowd){
 const ctx=crowd.network.ctx,edge=crowd.network.edges?.[p.edge];let best=null;
 for(const radius of [1.2,2])for(let i=0;i<8;i++){
  const angle=i*Math.PI/4,dx=Math.sin(angle),dz=Math.cos(angle),target={x:p.x+dx*radius,z:p.z+dz*radius};
  if(vehicleClearance(target,car,def)<.3||predictContact({...target,speed:0},car,def)!==null||predictContact({...p,heading:angle,speed:3},car,def)!==null)continue;
  let safe=true;for(let j=1;j<=Math.ceil(radius/.25);j++){const d=Math.min(j*.25,radius),x=p.x+dx*d,z=p.z+dz*d;
   if((p.crossing?(!edge||!crowd.allowed?.(x,z,p,edge)):!ctx.safe(x,z,.3))||crowd.vehicleOverlap?.(x,z)||crowd.blocked?.(x,z,p,.55,false)){safe=false;break;}}
  if(!safe||!ctx.safe(target.x,target.z,.3))continue;
  const score=vehicleClearance(target,car,def)-radius*.25;if(!best||score>best.score)best={dx,dz,score};
 }
 return best;
}
export function createPedestrianWarnings(){
 let last=-Infinity;
 return (crowd,car,def)=>{
  if(!crowd||!car.active||Math.abs(car.speed)<2)return 0;
  const now=crowd.time??0;if(now>=last&&now-last<.1)return 0;last=now;
  const radius=Math.min(24,Math.abs(car.speed)*HORIZON+def.length/2+2),list=[];
  for(let x=Math.floor((car.x-radius)/2);x<=Math.floor((car.x+radius)/2);x++)for(let z=Math.floor((car.z-radius)/2);z<=Math.floor((car.z+radius)/2);z++)for(const p of crowd.grid.get(x+','+z)??[]){
   if(p.active&&!p.controlled&&p.struck===undefined&&!p.combatDead&&Math.abs((p.height??car.y??0)-(car.y??0))<2.2&&Math.hypot(p.x-car.x,p.z-car.z)<radius)list.push(p);
  }
  list.sort((a,b)=>Math.hypot(a.x-car.x,a.z-car.z)-Math.hypot(b.x-car.x,b.z-car.z)||a.id-b.id);
  let warned=0;for(const p of list.slice(0,64)){
   const time=predictContact(p,car,def);if(time===null)continue;
   p.threatHeading=Math.atan2(car.x-p.x,car.z-p.z);p.reactionUntil=now+.35;
   if(time>1){p.trafficReaction='look';continue;}
   // Choreography and occupied crossings retain their existing movement ownership.
   const escape=p.choreographed||p.crossing?null:safeEscape(p,car,def,crowd);
   p.trafficReaction=escape?'escape':time<.4?'guard':'startle';
   if(escape&&now>=(p.nextThreatScatter??0)){if(crowd.scatter(p,escape.dx,escape.dz,1-time/HORIZON))warned++;p.nextThreatScatter=now+.45;}
  }
  return warned;
 };
}
