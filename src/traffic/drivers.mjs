// What you see through a windscreen.
//
// RUN 9. Occupancy says a car has a driver (src/traffic/occupancy.mjs). This draws them, and
// it is deliberately the cheapest thing that stops a car reading as empty.
//
// WHAT THIS IS NOT. It is not a character. There is no skeleton, no AnimationMixer, no clip
// and no per-frame AI. RUN 7 established the rule this follows: a body that is only ever seen
// at a distance, through glass, from the chest up, does not need the machinery a body you can
// walk around needs. Head, shoulders and a hint of arms is the whole silhouette a car cabin
// shows, and that is what is drawn.
//
// THREE DRAW CALLS, whatever the traffic count. Torso, head and hair are one InstancedMesh
// each, shared by every visible driver, so sixty drivers cost the same three batches as one.
//
// BOUNDED BY DISTANCE, not by population. Only the nearest `budget` occupied cars inside
// `radius` are written, so a city full of traffic costs the same as a street full.
//
// The identity comes from src/life/appearance.mjs -- the same recipe the crowd uses -- so the
// person you drag out of a car was already sitting in it, with that face, before you got
// there. That continuity is the point of the seed living in the occupancy model.
import {InstancedMesh,SphereGeometry,CylinderGeometry,MeshLambertMaterial,Object3D,Color,
        DynamicDrawUsage,Group} from 'three';
import {VEHICLES} from './config.mjs';
import {buildVehicleShape} from './vehicle-shape.mjs';
import {appearanceOf} from '../life/appearance.mjs';

export const SEATED_DRIVER=Object.freeze({
 // How far a driver is worth drawing. Beyond this a windscreen is a few pixels of glass and
 // a head inside it is not resolvable; the cost is real and the benefit is not.
 radius:46,
 // The most drivers written in one frame. Chosen against the HIGH profile's 62 moving cars,
 // so the cap is a safety rail rather than a routine clamp.
 budget:48,
 // Proportions, in metres. A seated person is mostly torso; the head sits a little forward of
 // the hips because a driver leans toward the wheel.
 shoulder:.20, chest:.17, torso:.42, headRadius:.105, lean:.055,
 // The seat anchor is the hips. Everything here is measured up from it.
 hipToShoulder:.30
});

/** The driver-seat anchor for each body, in vehicle-local metres. Measured once, not guessed. */
function seatAnchors(){
 const out={};
 for(const type of Object.keys(VEHICLES)){
  if(VEHICLES[type].twoWheel)continue;   // stage 6: nobody but the player rides one
  const shape=buildVehicleShape(type,{detail:0});
  const a=shape.anchors?.driverSeat;
  // A body with no anchor is not drawn rather than drawn in the wrong place.
  if(a)out[type]=[a[0],a[1],a[2]];
  shape.dispose?.();
 }
 return out;
}

export function createSeatedDrivers({capacity=SEATED_DRIVER.budget}={}){
 const anchors=seatAnchors();
 const root=new Group();root.name='s9-seated-drivers';
 // Lambert, not Standard: this is a shape inside tinted glass, and a full PBR response on it
 // is spent on pixels nobody can see.
 const skinMaterial=new MeshLambertMaterial({name:'driver-skin'});
 const clothMaterial=new MeshLambertMaterial({name:'driver-cloth'});
 const hairMaterial=new MeshLambertMaterial({name:'driver-hair'});
 // A tapered cylinder reads as shoulders far better than a box does, and costs 96 triangles.
 const torsoGeometry=new CylinderGeometry(SEATED_DRIVER.shoulder,SEATED_DRIVER.chest,1,8,1);
 const headGeometry=new SphereGeometry(1,8,6);
 const hairGeometry=new SphereGeometry(1,8,5,0,Math.PI*2,0,Math.PI*.62);
 const meshes={};
 for(const [key,geometry,material] of [['torso',torsoGeometry,clothMaterial],
                                       ['head',headGeometry,skinMaterial],
                                       ['hair',hairGeometry,hairMaterial]]){
  const m=new InstancedMesh(geometry,material,capacity);
  m.instanceMatrix.setUsage(DynamicDrawUsage);
  m.frustumCulled=false;                 // the bounds change every frame; culling by hand is cheaper
  m.name='s9-driver-'+key;
  m.castShadow=false;m.receiveShadow=false;
  m.count=0;
  root.add(m);meshes[key]=m;
 }

 const obj=new Object3D(),colour=new Color();
 const looks=new Map();                  // seed -> appearance, so the recipe runs once per person
 const stats={drawn:0,candidates:0,skipped:0,updateMs:0,drawCalls:3,skeletons:0,mixers:0};
 let disposed=false;

 const lookFor=seed=>{
  let look=looks.get(seed);
  if(!look){look=appearanceOf(seed);looks.set(seed,look);
   // The cache is per person, and people are recycled with their cars. Without a bound it
   // would grow for the life of the session.
   if(looks.size>512)looks.delete(looks.keys().next().value);}
  return look;
 };

 const api={
  root,meshes,stats,

  /**
   * Write every driver worth drawing.
   *
   * `focus` is where the camera is. Cars are ranked by distance from it and the nearest
   * `budget` are drawn -- so the traffic behind you costs nothing, and a jam in front costs
   * the same three draw calls as an empty street.
   */
  update(sim,focus){
   if(disposed||!sim?.occupancy)return 0;
   const start=(typeof performance!=='undefined'?performance.now():0);
   const fx=focus?.x??0,fz=focus?.z??0,r2=SEATED_DRIVER.radius**2;
   const near=[];
   sim.occupancy.eachDriver(id=>{
    const v=sim.pool[id];
    if(!v?.active)return;
    const dx=v.x-fx,dz=v.z-fz,d2=dx*dx+dz*dz;
    if(d2>r2)return;
    near.push({v,d2});
   });
   stats.candidates=near.length;
   near.sort((a,b)=>a.d2-b.d2);
   const take=Math.min(near.length,capacity);
   stats.skipped=near.length-take;

   let n=0;
   for(let i=0;i<take;i++){
    const v=near[i].v,anchor=anchors[v.type];
    if(!anchor)continue;
    const look=lookFor(sim.occupancy.read(v.id).seed);
    // The anchor is vehicle-local: x across, y up, z forward. The car's heading rotates it
    // about y, exactly as the traffic renderer rotates the body.
    const s=Math.sin(v.heading),c=Math.cos(v.heading);
    const ax=anchor[0],az=anchor[2]+SEATED_DRIVER.lean;
    const x=v.x+c*ax+s*az, z=v.z-s*ax+c*az;
    const base=(v.y??0)+anchor[1];
    const scale=look.height/1.76;

    obj.rotation.set(0,v.heading,0);
    obj.position.set(x,base+SEATED_DRIVER.torso*.5*scale,z);
    obj.scale.set(look.width,SEATED_DRIVER.torso*scale,look.width);
    obj.updateMatrix();
    meshes.torso.setMatrixAt(n,obj.matrix);
    meshes.torso.setColorAt(n,colour.setHex(look.top));

    const headY=base+(SEATED_DRIVER.hipToShoulder+SEATED_DRIVER.headRadius*1.35)*scale;
    obj.position.set(x,headY,z);
    obj.scale.setScalar(SEATED_DRIVER.headRadius*scale);
    obj.updateMatrix();
    meshes.head.setMatrixAt(n,obj.matrix);
    meshes.head.setColorAt(n,colour.setHex(look.skin));

    obj.scale.setScalar(SEATED_DRIVER.headRadius*1.06*scale);
    obj.updateMatrix();
    meshes.hair.setMatrixAt(n,obj.matrix);
    meshes.hair.setColorAt(n,colour.setHex(look.hairColour));
    n++;
   }
   for(const m of Object.values(meshes)){
    m.count=n;
    m.instanceMatrix.needsUpdate=true;
    if(m.instanceColor)m.instanceColor.needsUpdate=true;
   }
   stats.drawn=n;
   stats.updateMs=(typeof performance!=='undefined'?performance.now():0)-start;
   return n;
  },

  /** Stop drawing, without tearing anything down. Used when the player leaves player mode. */
  hide(){for(const m of Object.values(meshes))m.count=0;stats.drawn=0;},

  inspect(){return {drawn:stats.drawn,candidates:stats.candidates,skipped:stats.skipped,
   drawCalls:stats.drawn?3:0,skeletons:0,mixers:0,capacity,
   updateMs:Number(stats.updateMs.toFixed(3)),
   triangles:stats.drawn*(torsoGeometry.index?torsoGeometry.index.count/3:0
    +(headGeometry.index?.count??0)/3+(hairGeometry.index?.count??0)/3)|0};},

  dispose(){
   if(disposed)return;disposed=true;
   for(const m of Object.values(meshes)){m.dispose();root.remove(m);}
   torsoGeometry.dispose();headGeometry.dispose();hairGeometry.dispose();
   skinMaterial.dispose();clothMaterial.dispose();hairMaterial.dispose();
   looks.clear();root.parent?.remove(root);
  }
 };
 return api;
}
