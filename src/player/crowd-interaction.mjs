// Bounded local reactions: no scans over the full population or changes to signal ownership.
export function reactToRunner(crowd,state){
 if(!crowd||!state.alive||state.speed<2.5)return 0;
 const sx=Math.sin(state.heading),sz=Math.cos(state.heading);let count=0;
 for(let x=Math.floor((state.x-3)/2);x<=Math.floor((state.x+3)/2);x++)for(let z=Math.floor((state.z-3)/2);z<=Math.floor((state.z+3)/2);z++){
  for(const p of crowd.grid.get(x+','+z)??[]){
   if(!p.active||p.controlled||p.struck!==undefined)continue;
   const dx=p.x-state.x,dz=p.z-state.z,along=dx*sx+dz*sz,side=dx*sz-dz*sx;
   if(along<0||along>2.8||Math.abs(side)>.85)continue;
   if((p.runnerUntil??0)>crowd.time)continue;
   p.runnerUntil=crowd.time+1.2;
   if(crowd.scatter(p,sz*(side>=0?1:-1),-sx*(side>=0?1:-1),.12))count++;
  }
 }
 return count;
}

// People give way to a walking player before they touch (plan Step B). Running keeps
// reactToRunner's scatter. Bounded to the same 3x3 grid cells round the player, and rate
// limited per person by the same `runnerUntil`. A step aside is the dodge flight the slow car
// uses, so someone on a crossing may shift only within it (`fleeAllowed`), the cast moves by
// its flee offset and comes back to its track, and nobody's crossing or queue is released.
export const YIELD=Object.freeze({
 walk:.5,            // m/s: below this the player is standing, and nobody moves for them
 run:2.5,            // m/s: at and above this, reactToRunner
 ahead:1.6,          // m: how far ahead of the player the cone reaches
 lane:.7,            // m: either side of the player's line
 oncoming:2,         // m: someone facing the player gives way this far out, cone or not
 facing:.7,          // cos: how squarely they have to be facing the player to count as oncoming
 step:[.35,.5],      // m: how far they step aside, per person
 clear:.8,           // m: the most anyone steps aside for a walker
 body:.6,            // m: the player's and a pedestrian's radii together (CONTACT.gap)
 level:1.2,          // m: the contact system's own level limit
 rate:1.2            // s: once per person per this long
});
const unit=(id,salt)=>((Math.imul((id|0)+salt*7919,0x9e3779b1)>>>0)%100003)/100002;
/**
 * `near`, when given, is the people the contact system already gathered round the player this
 * frame (`player.contact.nearby`, within 2.05 m, the down, dead and other-level already left
 * out), so the grid is not read a second time. Without it, the 3x3 cells are scanned here.
 */
const yieldedAt=new WeakMap();
export function yieldToPlayer(crowd,state,near=null){
 if(!crowd||!state.alive)return 0;
 // The crowd only moves on its own fixed step (30 Hz); between two steps nothing about it has
 // changed, so giving way once per step is all there is to do. At 60 fps this halves the calls.
 if(yieldedAt.get(crowd)===crowd.time)return 0;
 yieldedAt.set(crowd,crowd.time);
 const speed=state.speed??0;
 if(speed>=YIELD.run)return reactToRunner(crowd,state);
 if(speed<YIELD.walk)return 0;
 // Where the body is going, which is what an oncoming walker reads, not where the camera looks.
 const h=state.bodyHeading??state.heading,ux=Math.sin(h),uz=Math.cos(h);
 const r=Math.max(YIELD.ahead,YIELD.oncoming);let count=0;
 const consider=p=>{
   // Geometry first; the flags are the expensive reads.
   const dx=p.x-state.x,dz=p.z-state.z,along=dx*ux+dz*uz;
   if(along<=0||along>r)return;
   const side=dx*uz-dz*ux,d=Math.hypot(dx,dz);
   if(d>r)return;
   if(!p.active||p.controlled||p.struck!==undefined||p.combatDead||p.flee)return;
   if(Math.abs((p.height??0)-(state.y??0))>YIELD.level)return;
   if((p.runnerUntil??0)>crowd.time)return;
   const inCone=along<=YIELD.ahead&&Math.abs(side)<=YIELD.lane;
   // Facing the player: their heading points back along the line to the player.
   const facing=d>1e-6&&(-(Math.sin(p.heading)*dx+Math.cos(p.heading)*dz)/d)>=YIELD.facing;
   const oncoming=!inCone&&d<=YIELD.oncoming&&facing&&(p.speed??0)>.1;
   if(!inCone&&!oncoming)return;
   // Which way: off the player's line on the side they are already on. Someone walking
   // straight at the player picks a side by who they are, so two people never mirror each
   // other into the same gap.
   const pick=facing&&Math.abs(side)<.25?(p.id%2?1:-1):(Math.sign(side)||(p.id%2?1:-1));
   p.runnerUntil=crowd.time+YIELD.rate;
   // Far enough to clear the player's shoulder: someone right on the line needs more than
   // the usual half step, or the player still walks into them.
   const distance=Math.min(YIELD.clear,Math.max(YIELD.step[0]+(YIELD.step[1]-YIELD.step[0])*unit(p.id,11),
    YIELD.body+.1-Math.abs(side)));
   if(crowd.flee(p,uz*pick+ux*.15,-ux*pick+uz*.15,{urgency:0,dodge:true,from:state,speed:1.1,distance,voice:false}))count++;
 };
 if(near)for(const p of near)consider(p);
 else for(let x=Math.floor((state.x-r)/2);x<=Math.floor((state.x+r)/2);x++)for(let z=Math.floor((state.z-r)/2);z<=Math.floor((state.z+r)/2);z++)
  for(const p of crowd.grid.get(x+','+z)??[])consider(p);
 crowd.stats.yielded=(crowd.stats.yielded??0)+count;
 return count;
}

// Small, deterministic adjustments within the pavement make waiters less regimented.
// Every step checks neighbours, vehicles and walkable ground; crossings are never moved here.
export function settleNearbyWaiters(crowd,state,dt){
 if(!crowd||dt<=0)return 0;let moved=0;
 const candidates=[];
 for(let x=Math.floor((state.x-15)/2);x<=Math.floor((state.x+15)/2);x++)for(let z=Math.floor((state.z-15)/2);z<=Math.floor((state.z+15)/2);z++)candidates.push(...(crowd.grid.get(x+','+z)??[]));
 for(const p of candidates){
  if(!p.active||p.controlled||p.crossing||p.struck!==undefined||p.state!=='waiting'){p.waitAnchor=null;continue;}
  if(!p.waitAnchor)p.waitAnchor={x:p.x,z:p.z};
  const jitter=Math.sin(p.id*13.17),back=.2+(Math.sin(p.id*7.1)*.5+.5)*.7;
  let tx=p.waitAnchor.x+Math.cos(p.heading)*jitter*.45-Math.sin(p.heading)*back;
  let tz=p.waitAnchor.z-Math.sin(p.heading)*jitter*.45-Math.cos(p.heading)*back;
  if(p.scatterUntil>crowd.time){tx=p.x+p.scatterX;tz=p.z+p.scatterZ;}
  const distance=Math.hypot(tx-p.x,tz-p.z);if(distance<.04)continue;
  const step=Math.min(distance,dt*(p.scatterUntil>crowd.time?1.2:.24));
  const x=p.x+(tx-p.x)/distance*step,z=p.z+(tz-p.z)/distance*step;
  if(!crowd.network.ctx.safe(x,z,.32)||crowd.vehicleOverlap(x,z,.35))continue;
  let blocked=false;
  for(let gx=Math.floor((x-.6)/2);gx<=Math.floor((x+.6)/2);gx++)for(let gz=Math.floor((z-.6)/2);gz<=Math.floor((z+.6)/2);gz++)for(const other of crowd.grid.get(gx+','+gz)??[]){if(other!==p&&other.active&&Math.hypot(other.x-x,other.z-z)<.55)blocked=true;}
  if(blocked)continue;
  const bucket=crowd.grid.get(crowd.cell(p.x,p.z)),index=bucket?.indexOf(p);if(index>=0)bucket.splice(index,1);
  p.previousX=p.x;p.previousZ=p.z;p.x=x;p.z=z;p.height=crowd.network.ctx.height(x,z);crowd.insert(p);moved++;
 }
 return moved;
}
