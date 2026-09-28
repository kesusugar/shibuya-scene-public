// Planar contact response. Normal points from the obstacle toward the driven car.
export function edgeContact(ring, position) {
 let best=null;
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  if(length<1e-10)continue;
  const t=Math.max(0,Math.min(1,((position.x-a[0])*dx+(position.z-a[1])*dz)/length));
  const x=a[0]+t*dx,z=a[1]+t*dz,d=Math.hypot(position.x-x,position.z-z);
  if(d<1e-8||best&&d>=best.distance)continue;
  best={x,z,nx:(position.x-x)/d,nz:(position.z-z)/d,distance:d};
 }
 return best;
}
export function respondToContact(state,def,contact){
 const s=Math.sin(state.heading),c=Math.cos(state.heading);
 let vx=s*state.speed+c*state.lateral,vz=c*state.speed-s*state.lateral;
 const incoming=vx*contact.nx+vz*contact.nz;
 if(incoming>=0)return 0;
 // Inelastic normal response retains tangent momentum; friction removes 8%.
 vx=(vx-incoming*contact.nx)*.92;vz=(vz-incoming*contact.nz)*.92;
 const rx=contact.x-state.x,rz=contact.z-state.z;
 const inertia=(def.width**2+def.length**2)/12;
 const torque=(rz*contact.nx-rx*contact.nz)*(-incoming);
 const oldEnergy=state.speed**2+state.lateral**2+inertia*state.yawRate**2;
 state.yawRate=Math.max(-1.8,Math.min(1.8,state.yawRate+torque/inertia*.18));
 // Do not create energy by assigning rotation after a glancing impact.
 const energy=vx*vx+vz*vz+inertia*state.yawRate**2;
 const scale=energy>oldEnergy?Math.sqrt(oldEnergy/energy):1;
 state.speed=(vx*s+vz*c)*scale;state.lateral=(vx*c-vz*s)*scale;state.yawRate*=scale;
 return -incoming;
}
