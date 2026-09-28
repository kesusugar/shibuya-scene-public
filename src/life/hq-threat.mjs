/**
 * A car goes into a crowd, and everyone it reaches reacts.
 *
 * RUN 7A STEP 10-13. The requirement that shapes this file is "not eight people": if thirty
 * pedestrians are in front of a car, thirty of them must be able to react in the same frame.
 * So nothing here is bounded by a pool size -- only by how many people are actually near the
 * car, which is what a spatial index is for.
 *
 * TWO THOUSAND PEOPLE ARE NEVER SCANNED. The crowd is bucketed into a uniform grid rebuilt
 * from flat arrays, and a query walks only the cells a car's swept volume touches. The cost
 * is proportional to the CANDIDATES, not the population, and the difference between those two
 * is the whole reason this is a separate module.
 */
import {STATE} from './hq-crowd.mjs';
import {vehicleImpact} from '../player/vehicle-impact.mjs';
import {VEHICLES} from '../traffic/config.mjs';

export const THREAT={
 cell:4,                 // metres. A car is ~4.5 m long, so a swept box spans a few cells.
 look:14,                // sees a car this far away
 avoid:8,                // steps aside
 flee:5.5,               // runs
 fast:7,                 // m/s above which everything escalates
 hitRadius:1.15,         // half-width of the car plus a body
 knockSpeed:2.5,         // below this the car nudges rather than knocks down
 launch:.55              // how much of the car's speed a body carries away
};

/** A uniform grid over the crowd's flat position arrays. Rebuilt in one pass, no allocation per citizen. */
export function createCrowdGrid(cell=THREAT.cell){
 const buckets=new Map();
 const key=(x,z)=>Math.floor(x/cell)+','+Math.floor(z/cell);
 return {
  cell,
  get size(){return buckets.size;},
  /** @param crowd the HQ crowd; reads state.x/state.z directly. */
  rebuild(crowd){
   buckets.clear();
   const {x,z}=crowd.state;
   for(let i=0;i<crowd.population;i++){
    const k=key(x[i],z[i]);
    let bucket=buckets.get(k);
    if(!bucket){bucket=[];buckets.set(k,bucket);}
    bucket.push(i);
   }
   return buckets.size;
  },
  /**
   * Everyone within `radius` of (cx,cz), by walking only the cells that box touches.
   * `out` is reused by the caller so a query allocates nothing.
   */
  near(cx,cz,radius,out){
   out.length=0;
   const x0=Math.floor((cx-radius)/cell),x1=Math.floor((cx+radius)/cell);
   const z0=Math.floor((cz-radius)/cell),z1=Math.floor((cz+radius)/cell);
   for(let gx=x0;gx<=x1;gx++)for(let gz=z0;gz<=z1;gz++){
    const bucket=buckets.get(gx+','+gz);
    if(bucket)for(const i of bucket)out.push(i);
   }
   return out;
  }
 };
}

/**
 * Apply one car to the crowd.
 *
 * Returns what it did, which is also what the QA harness measures: how many cells were
 * visited, how many candidates that produced, and how many people actually changed state.
 * The ratio of candidates to population is the claim this module makes.
 */
export function applyVehicleThreat(crowd,grid,car,dt,scratch=[]){
 const speed=Math.abs(car.speed??0);
 const result={cells:0,candidates:0,looked:0,avoided:0,fled:0,hit:0,knocked:0};
 if(!crowd.population)return result;

 // The car's reach this frame: its stopping-ish envelope, not the whole map.
 const reach=Math.max(THREAT.look,speed*1.2)+2;
 grid.near(car.x,car.z,reach,scratch);
 result.cells=Math.ceil((2*reach/grid.cell+1)**2);
 result.candidates=scratch.length;

 const dirX=Math.sin(car.heading??0),dirZ=Math.cos(car.heading??0);
 const {x,z,behaviour}=crowd.state;

 for(const i of scratch){
  if(behaviour[i]===STATE.DOWNED||behaviour[i]===STATE.KNOCKDOWN)continue;
  const dx=x[i]-car.x,dz=z[i]-car.z;
  const distance=Math.hypot(dx,dz);
  // Along the car's axis, and across it. A pedestrian behind the car is not in danger.
  const along=dx*dirX+dz*dirZ;
  const across=Math.abs(dx*dirZ-dz*dirX);

  // Contact: inside the body of the car, whatever direction they were walking.
  if(along>-1.2&&along<2.6&&across<THREAT.hitRadius){
   // RUN 11.1: the same contact model the simulation's throw uses -- face, offset, closing
   // speed and the victim's own motion -- so the HQ body and the pedestrian agree. A stopped
   // car shoves nobody.
   const r=vehicleImpact(car,VEHICLES[car.type]??VEHICLES.sedan,
    {x:x[i],z:z[i],heading:crowd.state.heading[i],speed:crowd.state.speed[i]},{type:car.type});
   if(r.closing<.3)continue;
   crowd.setState(i,r.state==='HIT'?STATE.HIT:STATE.KNOCKDOWN,{
    impulseX:r.impulse.x,impulseZ:r.impulse.z,impulseY:r.impulse.y,
    light:r.kind==='push',force:true});
   if(r.kind==='push')result.hit++;else{result.knocked++;result.hit++;}
   continue;
  }
  if(along<0)continue;                          // behind the car
  if(distance>reach)continue;

  const urgent=speed>=THREAT.fast;
  if(distance<THREAT.flee&&urgent){if(crowd.setState(i,STATE.FLEE))result.fled++;}
  else if(distance<THREAT.avoid){if(crowd.setState(i,urgent?STATE.FLEE:STATE.AVOID))
   {if(urgent)result.fled++;else result.avoided++;}}
  else if(distance<THREAT.look){if(crowd.setState(i,STATE.LOOK))result.looked++;}
 }
 return result;
}
