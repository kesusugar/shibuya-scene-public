// Handling and suspension adapted from Cabsolutely c881e651 (MIT). See LICENSES/cabsolutely.txt.
// Lightweight planar handling and four-point suspension. No runtime asset generation.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const damp=(x,y,k,dt)=>y+(x-y)*Math.exp(-k*dt);
export function resetDynamics(s){Object.assign(s,{lateral:0,yawRate:0,roll:0,pitch:0,rollVelocity:0,pitchVelocity:0,verticalVelocity:0,acceleration:0,steerAngle:0,handbrake:false,wheelCompression:[0,0,0,0]});}
export function handling(s,def,input,dt){
 const throttle=clamp(Number(input.forward)||0,-1,1),turn=clamp(Number(input.strafe)||0,-1,1),before=s.speed;
 s.handbrake=!!input.handbrake;
 const health=Math.max(.45,1-.55*s.damage),limit=def.speed*health;
 const opposing=throttle*s.speed<0&&Math.abs(s.speed)>.2;
 if(opposing)s.speed-=Math.sign(s.speed)*Math.min(Math.abs(s.speed),11*Math.abs(throttle)*dt);
 else s.speed+=throttle*6.5*(throttle>0?def.power??1:1)*health*(throttle<0?.7:1)*dt;
 if(!throttle||s.handbrake)s.speed-=Math.sign(s.speed)*Math.min(Math.abs(s.speed),(s.handbrake?5:1.4)*dt);
 s.speed=clamp(s.speed,-4.5*health,limit);
 s.steering=damp(s.steering,turn,10,dt);
 // Looks C: steering lock and grip per body (VEHICLES.steer/grip/slide); a long van is heavy
 // and slow to turn, a coupe light and quick. The defaults are the old single tuning.
 s.steerAngle=s.steering*(def.steer??.62)/(1+Math.abs(s.speed)*.057);
 const wheelbase=def.length*.62;
 const target=-s.speed*Math.tan(s.steerAngle)/wheelbase*(s.handbrake?1.3:1);
 s.yawRate=damp(s.yawRate??0,clamp(target,-1.85,1.85),10,dt);
 // Rotate velocity into the new body frame; retain lateral momentum through a turn.
 const angle=s.yawRate*dt,lat=s.lateral??0,forward=s.speed;
 s.speed=forward*Math.cos(angle)+lat*Math.sin(angle);
 s.lateral=(lat*Math.cos(angle)-forward*Math.sin(angle))*Math.exp(-(s.handbrake?(def.slide??2.8):(def.grip??13))*dt);
 s.acceleration=damp(s.acceleration??0,clamp((s.speed-before)/dt,-28,15),7,dt);
 const direction=Math.sign(s.speed)||1;
 return {heading:s.heading+angle,course:s.heading+angle+Math.atan2(s.lateral*direction,s.speed*direction),travel:direction*Math.hypot(s.speed,s.lateral)*dt};
}
export function suspension(s,def,height,dt){
 const sn=Math.sin(s.heading),cs=Math.cos(s.heading),track=def.width*.86,base=def.length*.62;
 const offsets=[[-track/2,-base/2],[track/2,-base/2],[-track/2,base/2],[track/2,base/2]];
 const heights=offsets.map(([x,z])=>height(s.x+x*cs+z*sn,s.z-x*sn+z*cs));
 const ground=heights.reduce((a,b)=>a+b,0)/4;
 s.verticalVelocity=((s.verticalVelocity??0)+(ground-s.y)*165*dt)*Math.exp(-18*dt);
 s.y=Math.max(ground-.1,s.y+s.verticalVelocity*dt);
 const targetPitch=clamp(-Math.atan2((heights[2]+heights[3]-heights[0]-heights[1])/2,base)-s.acceleration*.0055,-.24,.24);
 const targetRoll=clamp(Math.atan2((heights[1]+heights[3]-heights[0]-heights[2])/2,track)+s.yawRate*s.speed*.0044,-.24,.24);
 for(const [key,target] of [['pitch',targetPitch],['roll',targetRoll]]){const v=key+'Velocity';s[v]=((s[v]??0)+(target-(s[key]??0))*80*dt)*Math.exp(-12*dt);s[key]=(s[key]??0)+s[v]*dt;}
 s.wheelCompression=heights.map((h,i)=>clamp(h-s.y-offsets[i][0]*Math.sin(s.roll)+offsets[i][1]*Math.sin(s.pitch),-.18,.28));
}
