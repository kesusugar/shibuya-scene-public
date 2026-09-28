// How a car hitting a person moves the person, and the car. RUN 11.1.
//
// No physics engine and no ragdoll: one pure function turns the contact the game already
// detects into an impulse, a lift and a state, and another turns each contact into speed the
// car loses. Both are data in, data out, so the thrown body can be driven by the existing
// simulation flight (`CrowdSimulation.fly`) and the HQ crowd can simply follow it.
//
// Before this, a hit threw the body along the car's course whatever part of the car struck
// it, at up to 57% of its horizontal speed upwards -- a 20 m/s hit flew about 36 m -- while the
// HQ body used a second, unrelated impulse, so what the player saw fell almost in place.

/** Kilograms. Only the ratio to a person matters. */
export const VEHICLE_MASS=Object.freeze({taxi:1400,sedan:1300,kei:850,van:1800,bus:11000,truck:7500,scooter:180,
 keiTruck:900,longVan:1950,minivan:2000,tallKei:950,cityTaxi:1450,truck2t:3500,police:1650,coupe:1250,ownCar:1280,unmarked:1650,riotBus:9000,heroSilver:1240,heroDark:1480});
export const PERSON_MASS=75;

export const IMPACT=Object.freeze({
 push:2.2,          // m/s of closing speed below which a person is shoved, not knocked down
 heavy:7,           // above this the throw is decisive
 launch:14,         // above this the body leaves the ground properly -- still not a cartoon
 transfer:.8,       // share of the closing speed the body carries away
 maxThrow:16,       // m/s cap on the body's horizontal speed
 maxLift:4,         // m/s cap on the vertical kick
 restitution:.2,    // bonnet and body both give; this is not a billiard ball
 contactDrag:.15,   // m/s every contact costs on top of the momentum exchange
 carry:.25          // share of the victim's own walking velocity kept through the hit
});

const clamp=(v,a,b)=>v<a?a:v>b?b:v;

/**
 * The contact, in the car's frame. `car` is {x,z,heading,course,speed}; `def` its dimensions;
 * `victim` {x,z,heading,speed}. Returns null if the victim is behind a car moving forward, i.e.
 * not in the way at all.
 */
export function vehicleImpact(car,def,victim,{type='sedan'}={}){
 const speed=car.speed??0,dir=Math.sign(speed)||1;
 const h=car.heading??0,fx=Math.sin(h),fz=Math.cos(h),rx=Math.cos(h),rz=-Math.sin(h);
 const dx=victim.x-car.x,dz=victim.z-car.z;
 const along=dx*fx+dz*fz,across=dx*rx+dz*rz;
 const halfL=def.length/2,halfW=def.width/2;
 // Which face made contact. The leading face for the direction of travel, otherwise a side.
 const leading=dir>0?along>halfL-.6:along<-halfL+.6;
 const contact=leading?(dir>0?'front':'rear'):'side';
 const course=car.course??h,vx=Math.sin(course)*speed,vz=Math.cos(course)*speed;
 const vs=victim.speed??0,vh=victim.heading??0,wx=Math.sin(vh)*vs,wz=Math.cos(vh)*vs;
 const side=across>=0?1:-1;
 // Contact normal: out of the face that hit. A glancing front hit leans towards the side the
 // person was standing on, so someone caught by a corner goes off that corner.
 let nx,nz;
 if(contact==='side'){nx=rx*side;nz=rz*side;}
 else{const lean=clamp(across/halfW,-1,1)*.35;nx=fx*dir+rx*lean;nz=fz*dir+rz*lean;const l=Math.hypot(nx,nz);nx/=l;nz/=l;}
 const relX=vx-wx,relZ=vz-wz;
 const closing=Math.max(0,relX*nx+relZ*nz);
 const carSpeed=Math.abs(speed);
 // Direction of the throw: mostly the way the car was going for a face-on hit, mostly out of
 // the side for a side swipe. The car's own velocity dominates the harder it is going.
 const mv=Math.hypot(vx,vz)||1,ux=vx/mv,uz=vz/mv;
 // A corner deflects harder than the middle of the bumper.
 const offset=Math.min(1,Math.abs(across)/halfW);
 const [a,b]=contact==='side'?[.35,.65]:[.8-.35*offset,.2+.35*offset];
 let tx=ux*a+nx*b,tz=uz*a+nz*b;const tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
 const kind=closing<IMPACT.push?'push':closing<IMPACT.heavy?'knock':closing<IMPACT.launch?'heavy':'launch';
 const throwSpeed=kind==='push'?Math.max(.8,closing*.6):Math.min(IMPACT.maxThrow,closing*IMPACT.transfer);
 const lift=kind==='push'?0:kind==='knock'?Math.min(1.2,.4+closing*.08)
  :kind==='heavy'?Math.min(2.4,.8+closing*.12):Math.min(IMPACT.maxLift,1+closing*.12);
 const impulse={x:tx*throwSpeed+wx*IMPACT.carry,z:tz*throwSpeed+wz*IMPACT.carry,y:lift};
 return {contact,kind,closing,carSpeed,along,across,impulse,
  state:kind==='push'?'HIT':'KNOCKDOWN',
  speedLoss:contactSpeedLoss(closing,VEHICLE_MASS[type]??VEHICLE_MASS.sedan)};
}

/** Speed the car loses to one contact at `closing` m/s. Momentum exchange plus a little drag. */
export function contactSpeedLoss(closing,mass=VEHICLE_MASS.sedan){
 return closing*(1+IMPACT.restitution)*PERSON_MASS/(mass+PERSON_MASS)+(closing>0?IMPACT.contactDrag:0);
}

/** Apply `loss` to a signed speed without ever reversing it. */
export function slowBy(speed,loss){
 if(!(loss>0))return speed;
 const s=Math.abs(speed)-loss;return s<=0?0:Math.sign(speed)*s;
}
