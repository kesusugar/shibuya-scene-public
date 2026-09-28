import {inPolygon} from '../geo/core.mjs';

export function solidAt(ctx, x, z, y, radius = .32) {
 if (!ctx?.solids) return false;
 for (const {value: s} of ctx.solids.query({minX:x-radius,maxX:x+radius,minZ:z-radius,maxZ:z+radius})) {
  if (s.bottom > y+radius || s.top < y-radius) continue;
  if (inPolygon([x,z],s.polygon)) return true;
  const ring=s.polygon.outer;
  for(let i=0;i<ring.length;i++) {
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1];
   const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
   if(Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<radius)return true;
  }
 }
 return false;
}

// Sweep outward from the subject: checking only the destination misses thin walls.
export function clipCameraArm(origin, desired, ctx, out={}) {
 Object.assign(out,desired);
 const distance=Math.hypot(desired.x-origin.x,desired.y-origin.y,desired.z-origin.z);
 const steps=Math.max(1,Math.ceil(distance/.2));let safe=0;
 for(let i=1;i<=steps;i++) {
  const t=i/steps,x=origin.x+(desired.x-origin.x)*t,y=origin.y+(desired.y-origin.y)*t,z=origin.z+(desired.z-origin.z)*t;
  if(solidAt(ctx,x,z,y)||y<(ctx?.height?.(x,z)??0)+.3) break;
  safe=t;
 }
 out.x=origin.x+(desired.x-origin.x)*safe;
 out.y=origin.y+(desired.y-origin.y)*safe;
 out.z=origin.z+(desired.z-origin.z)*safe;
 return out;
}

export function createFollowCamera() {
 let pose=null,mode=null;
 return {
  reset(){pose=null;mode=null;},
  update(desired,origin,ctx,dt,nextMode) {
   if(!pose||mode!==nextMode||Math.hypot(pose.tx-desired.tx,pose.tz-desired.tz)>25)pose={...desired};
   else {const a=1-Math.exp(-8*Math.max(0,dt));for(const key of ['x','y','z','tx','ty','tz'])pose[key]+=(desired[key]-pose[key])*a;}
   mode=nextMode;
   // Clip after smoothing too, so smoothing cannot cut a corner through a facade.
   clipCameraArm(origin,pose,ctx,pose);
   return pose;
  }
 };
}
