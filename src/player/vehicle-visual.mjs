// Drive a VehicleAsset from the physics state.
//
// The simulation slot stays authoritative: position, heading, speed, steer angle, pitch, roll
// and a four-point suspension are all computed in vehicle-dynamics.mjs and only read here.
// Nothing in this file integrates anything.
//
// There used to be two copies of this update -- one in the generator the bake script ran, one
// in the runtime that loaded the baked result -- and they had drifted over whether body roll
// feeds wheel height. There is one now, and the generator is a generator.
import {Group,ObjectLoader} from 'three';
import {adoptVehicleAsset,createMotorbikeAsset,popupTarget,POPUP} from './vehicle-asset.mjs';
import {createDamageVisual} from './car-damage.mjs';
import {bikeLean} from '../traffic/motorbike-shape.mjs';
export {bikeLean};
import {VEHICLES} from '../traffic/config.mjs';
import {flashPhase} from '../police/siren.mjs';
import {createVehicleShadows} from '../traffic/vehicle-shadow.mjs';
import vehiclePack from './generated/vehicles.mjs';

// Suspension reports its four contact points in this order; the anchors are named so the
// mapping is a lookup rather than a comment about build order.
const CONTACTS=['rearLeftWheel','rearRightWheel','frontLeftWheel','frontRightWheel'];

/**
 * `onAssetReady` is called with each newly built asset's root.
 *
 * The systems that ramp emissives at dusk and record shadow casting walk a root once, when they
 * are handed it, and they unregister when it leaves the graph. Handing them the asset's own root
 * rather than this wrapper's means a vehicle that changes type is re-registered rather than
 * silently losing its headlights.
 */
export function createVehicleVisual({onAssetReady=null,onShatter=null}={}){
 const root=new Group();root.name='player-vehicle-detail';
 // One vehicle, five shadow instances: the floorpan and four tyres.
 const shadows=createVehicleShadows(5);root.add(shadows.mesh);
 let asset=null,type=null,slot=null,disposed=false;
 let lastSpeed=0,pitch=0,roll=0,spin=0,elapsed=0,lean=0;
 // Stage 6: dents and broken glass on the model, from the slot's wear.
 const damage=createDamageVisual();

 function build(next){
  damage.dispose();asset?.dispose();asset=null;
  type=next;
  if(VEHICLES[type]?.twoWheel)asset=createMotorbikeAsset(type);
  else{
   const parsed=new ObjectLoader().parse(vehiclePack.models[type]);
   asset=adoptVehicleAsset(type,parsed,{dimensions:vehiclePack.dimensions?.[type],
    anchors:vehiclePack.anchors?.[type]});
  }
  root.add(asset.root);
  if(!asset.twoWheel)damage.attach(asset);
  onAssetReady?.(asset.root,asset);
 }

 /** Stage 6: a bike -- no suspension roll: it leans into the turn, both wheels spin, the front steers. */
 function bike(state,dt){
  const target=bikeLean(state.speed,state.yawRate);
  lean+=(target-lean)*(1-Math.exp(-6*dt));
  asset.lean.rotation.z=lean;
  asset.body.rotation.set((state.pitch??0)*.5,0,0);
  root.position.set(state.x,state.y,state.z);root.rotation.y=state.heading;
  spin+=state.speed*dt/asset.dimensions.radius;
  asset.wheels.front.spin.rotation.x=spin;asset.wheels.rear.spin.rotation.x=spin;
  asset.wheels.front.steer.rotation.y=-(state.steerAngle??state.steering*.35)*.8;
  elapsed+=dt;
  asset.setRear(!!state.slot?.brake,0);
  shadows.begin();
  shadows.add({x:0,y:0,z:0,heading:0},{...asset.dimensions,width:.5},
   [[-.12,0,asset.anchorPoints.rearWheel[2]],[.12,0,asset.anchorPoints.rearWheel[2]],[-.12,0,asset.anchorPoints.frontWheel[2]],[.12,0,asset.anchorPoints.frontWheel[2]]]);
  shadows.end();
 }

 return {
  root,
  get asset(){return asset;},
  update(state,dt=0){
   if(disposed)return;
   if(slot&&slot!==state?.slot)slot.playerVisual=false;
   slot=state?.slot;
   // Scooters keep their existing two-wheel model in the instanced traffic renderer.
   if(!state?.active||state.type==='scooter'){root.visible=false;if(slot)slot.playerVisual=false;return;}
   if(type!==state.type){build(state.type);lastSpeed=state.speed;pitch=0;roll=0;spin=0;lean=0;}
   root.visible=true;if(slot)slot.playerVisual=true;
   if(asset.twoWheel){bike(state,dt);return;}
   // Stage 6: the dents and the glass, when the slot's wear has moved on.
   for(const s of damage.apply(slot?.wear))onShatter?.(s,asset.root);

   // Body lean. The suspension supplies real pitch and roll when it has ground under it; the
   // damped fallback covers the frame or two before it does.
   const accel=dt>0?(state.speed-lastSpeed)/dt:0;lastSpeed=state.speed;
   const a=1-Math.exp(-10*dt);
   pitch+=(Math.max(-.055,Math.min(.055,accel*.005))-pitch)*a;
   roll+=(Math.max(-.055,Math.min(.055,state.steering*state.speed*.006))-roll)*a;
   const bodyPitch=state.pitch??pitch,bodyRoll=state.roll??roll;
   asset.body.rotation.set(bodyPitch,0,bodyRoll);
   root.position.set(state.x,state.y,state.z);
   root.rotation.y=state.heading;

   // Wheels. Lean tilts the shell, not the wheels: they stay on the road because the
   // suspension already measured where the road is, so each one is lifted back by however
   // much the body above it rolled or pitched away.
   spin+=state.speed*dt/asset.dimensions.radius;
   const steer=state.steerAngle??state.steering*.35;
   for(const [i,name] of CONTACTS.entries()){
    const wheel=asset.wheels[name],rest=asset.anchorPoints?.[name];
    const x=rest?rest[0]:wheel.position.x,z=rest?rest[2]:wheel.position.z;
    wheel.position.y=asset.dimensions.radius+(state.wheelCompression?.[i]??0)
     +x*Math.sin(bodyRoll)-z*Math.sin(bodyPitch);
    // Ackermann, roughly: the inner wheel turns further than the outer one.
    const inner=Math.sign(steer)===Math.sign(x);
    wheel.rotation.set(spin,name.startsWith('front')?-steer*(inner?1.15:.85):0,0,'YXZ');
   }

   // Brake and indicator come from the simulation slot, which vehicle.mjs already writes for
   // the player exactly as the traffic simulation writes them for everyone else. Reading them
   // here rather than re-deriving them is what stops the player's car being the one vehicle in
   // the city whose lights disagree with its own AI record.
   elapsed+=dt;
   // W3: a patrol car with its siren on flashes its roof bar (and, like a real one, its rear lamps).
   if(state.slot?.siren)asset.setRear(false,0,flashPhase(elapsed)?0xff2a1a:0x7a0d08);
   else asset.setRear(!!state.slot?.brake,state.slot?.blinker??0);
   asset.setDoor(state.doorSide,state.doorPhase);
   // Step H: pop-up lamps rise when the lamps are lit and fold away by day.
   if(asset.popups!==null){
    const target=popupTarget(asset.lampLevel),step=POPUP.rate*dt;
    asset.setPopups(asset.popups+Math.max(-step,Math.min(step,target-asset.popups)));
   }

   // Grounding. The shadow mesh is a child of this root, which is already at the vehicle and
   // turned to its heading, so local y of zero is the road and the contacts are body-frame.
   shadows.begin();
   shadows.add({x:0,y:0,z:0,heading:0},asset.dimensions,
    CONTACTS.map(name=>asset.anchorPoints?.[name]
     ??[asset.wheels[name].position.x,0,asset.wheels[name].position.z]));
   shadows.end();
  },
  /** Stage 6: the rider's lean this frame (the figure leans with the bike). */
  get lean(){return lean;},
  get damage(){return damage;},
  hide(){root.visible=false;if(slot)slot.playerVisual=false;slot=null;},
  inspect(){return asset?{type,triangles:asset.triangles,materials:asset.materials.length,
   meshes:root.children.length}:{type:null,triangles:0,materials:0,meshes:0};},
  dispose(){
   if(disposed)return;disposed=true;
   if(slot)slot.playerVisual=false;slot=null;
   damage.dispose();asset?.dispose();asset=null;shadows.dispose();root.removeFromParent();root.clear();
  }
 };
}
