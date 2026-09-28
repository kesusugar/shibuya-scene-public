// What a vehicle is, so that what a vehicle looks like can change without the game noticing.
//
// The same split RUN 2 made for characters. The physics body is the source of truth -- position,
// heading, speed, steer angle, pitch, roll and a four-point suspension all come out of
// vehicle-dynamics.mjs and none of it is recomputed here. The visual body follows, and it is
// addressed through named anchors rather than by index into a build order:
//
//   body, frontLeftWheel, frontRightWheel, rearLeftWheel, rearRightWheel
//   driverSeat, driverDoor, driverEntry, driverExit      (for RUN 10 and RUN 11)
//
// An asset can be built from the shape generator or adopted from a scene graph that was baked
// offline, and both produce the same object, so the bake script and the game share one
// definition of what the graph looks like instead of two copies that drift.
import {Group,Mesh,MeshStandardMaterial,MeshPhysicalMaterial,Object3D} from 'three';
import {buildVehicleShape} from '../traffic/vehicle-shape.mjs';
import {buildMotorbikeShape} from '../traffic/motorbike-shape.mjs';
import {VEHICLES} from '../traffic/config.mjs';

/** Rear lamp colours. Amber wins over red, because an indicator is the one you must not miss. */
export const LAMP=Object.freeze({off:0x4a1216,brake:0xff2a22,indicator:0xffa32b});

// Mesh names are load-bearing. day-night.mjs ramps emissives by name at dusk and look.mjs
// records shadow-casting at registration; matching the names traffic already uses means the
// player's car lights up on exactly the curve every other car does, with no second tuning pass.
const NAMES={paint:'vehicle-paint',glass:'vehicle-glass',dark:'vehicle-dark',plate:'vehicle-plate',
 lamp:'traffic-player-front',tail:'traffic-player-rear',tyre:'vehicle-tyre',rim:'vehicle-rim',
 lightbar:'vehicle-lightbar'};
const WHEELS=['rearLeftWheel','rearRightWheel','frontLeftWheel','frontRightWheel'];
/** Kept from the previous model, because the vehicle transition already opens doors by this name. */
const doorName=side=>`player-vehicle-door-${side}`;
/** Step H: the pop-up lamp hinges. Fully open is a quarter turn about x. */
const popupName=side=>`player-vehicle-popup-${side}`;
export const POPUP=Object.freeze({open:Math.PI/2,rate:3.2,lampsOn:.45});
/**
 * Up or down. day-night.mjs ramps every head lamp's emissive by name at dusk (the day value is
 * the material's own .14, night about six times that), so the lamps being lit IS night.
 */
export const popupTarget=lampLevel=>lampLevel>POPUP.lampsOn?1:0;
const SEATS=['driverSeat','driverDoor','driverEntry','driverExit'];

function materialsFor(paintColour,rimColour=0x9aa4ab,clearcoat=false){
 return {
  // Step K2: Kaze FR alone gets a clearcoat physical material -- one extra reflective layer over
  // the base coat, which is what a fresh orange respray actually is, and what makes a paint job
  // read as "car paint" rather than "painted plastic" under a moving environment reflection.
  paint:clearcoat
   ?new MeshPhysicalMaterial({color:paintColour,roughness:.22,metalness:.55,clearcoat:1,clearcoatRoughness:.08})
   :new MeshStandardMaterial({color:paintColour,roughness:.34,metalness:.42}),
  // Glass is transparent enough to show the cabin behind it and glossy enough to catch a
  // street light, which is what keeps it separate from near-black paint after dark. It writes
  // depth on purpose: a car's glasshouse is a closed tube, and sorting its two sides per frame
  // costs more than the small error of letting the near pane hide the far one.
  glass:new MeshStandardMaterial({color:0x33505f,roughness:.04,metalness:.16,
   transparent:true,opacity:.52,emissive:0x1a2c38,emissiveIntensity:.5}),
  dark:new MeshStandardMaterial({color:0x1b2026,roughness:.86,metalness:.06}),
  plate:new MeshStandardMaterial({color:0xe8e6dd,roughness:.7,metalness:0}),
  lamp:new MeshStandardMaterial({color:0xfff2d6,emissive:0xffe5ae,emissiveIntensity:.14}),
  tail:new MeshStandardMaterial({color:LAMP.off,emissive:LAMP.off,emissiveIntensity:.25}),
  tyre:new MeshStandardMaterial({color:0x0e1114,roughness:.96,metalness:0}),
  rim:new MeshStandardMaterial({color:rimColour,roughness:.31,metalness:.78}),
  // Step P: the patrol car's light-bar lens, close up. This model has no siren state to flash
  // by, so it sits at its dark-red resting colour (matching the traffic batch's own at-rest
  // tint) rather than the leaked default material an unmatched part used to fall back to.
  lightbar:new MeshStandardMaterial({color:0x2a0605,roughness:.4,metalness:.05,
   emissive:0x7a0d08,emissiveIntensity:.3})
 };
}

/** Wrap a built graph. `owned` says whether this asset may dispose the geometry it was handed. */
function wrap(type,root,materials,{owned,dimensions,anchors}){
 const body=root.getObjectByName('vehicle-body');
 if(!body)throw new Error(`vehicle asset ${type} has no body`);
 const wheels={};for(const name of WHEELS)wheels[name]=root.getObjectByName(name);
 const seats={};for(const name of SEATS)seats[name]=root.getObjectByName(name);
 for(const [name,node] of Object.entries(wheels))
  if(!node)throw new Error(`vehicle asset ${type} has no ${name}`);
 const doors=[-1,1].map(side=>({side,pivot:root.getObjectByName(doorName(side))})).filter(d=>d.pivot);
 const popups=[-1,1].map(side=>root.getObjectByName(popupName(side))).filter(Boolean);
 let popupPhase=0;
 let disposed=false,triangles=0;
 const geometries=new Set();
 root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);
  triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;
  // Recorded before the fidelity system registers the root, which preserves whatever it finds.
  o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;});
 return {
  type,root,body,wheels,doors,anchors:seats,dimensions,anchorPoints:anchors,
  materials:Object.values(materials),triangles,
  /** Repaint without rebuilding: one material, one instance, one colour. */
  setPaint(hex){materials.paint.color.setHex(hex);},
  /** Swing the door on the side the driver is using; the other one stays shut. */
  setDoor(side,phase){
   const open=Math.max(0,Math.min(1,phase??0));
   for(const door of doors)door.pivot.rotation.y=door.side*(door.side===side?open:0)*1.05;
  },
  /** Step H: does this body have pop-up lamps, and how far up are they (0 shut, 1 open)? */
  get popups(){return popups.length?popupPhase:null;},
  /** How bright the head lamps are right now (day-night owns this). */
  get lampLevel(){return materials.lamp.emissiveIntensity;},
  setPopups(phase){
   popupPhase=Math.max(0,Math.min(1,phase??0));
   for(const pivot of popups)pivot.rotation.x=-POPUP.open*popupPhase;
  },
  /** Brake beats nothing, an indicator beats a brake. */
  setRear(brake,indicator,override=null){
   const hex=override??(indicator?LAMP.indicator:brake?LAMP.brake:LAMP.off);
   materials.tail.color.setHex(hex);materials.tail.emissive.setHex(hex);
  },
  dispose(){
   if(disposed)return;disposed=true;
   // Leave the scene graph first. day-night and the fidelity system unregister on `removed`,
   // and unregistering restores emissive intensity and shader hooks on the materials -- which
   // has to happen while they still exist. Disposing first leaves them holding freed materials
   // and can pull a program out from under a shader warm-up that is still polling for it.
   root.removeFromParent();
   Object.values(materials).forEach(m=>m.dispose());
   if(owned)geometries.forEach(g=>g.dispose());
   root.clear();
  }
 };
}

/** Build one from the shape generator. This is what the bake script runs. */
export function createVehicleAsset(type,{detail=1,paint=null}={}){
 const shape=buildVehicleShape(type,{detail});
 const materials=materialsFor(paint??VEHICLES[type].color,VEHICLES[type].rim,VEHICLES[type].clearcoat);
 const root=new Group();root.name='vehicle-'+type;
 // The shell hangs off its own node so body lean can be applied without tilting the wheels,
 // which stay on the road because the suspension already told them where the road is.
 const body=new Group();body.name='vehicle-body';root.add(body);
 for(const [part,geometry] of Object.entries(shape.geometry)){
  const mesh=new Mesh(geometry,materials[part]);mesh.name=NAMES[part];body.add(mesh);
 }
 for(const name of WHEELS){
  const pivot=new Group();pivot.name=name;pivot.position.fromArray(shape.anchors[name]);
  const tyre=new Mesh(shape.wheel.rubber,materials.tyre);tyre.name=NAMES.tyre;
  const rim=new Mesh(shape.wheel.rim,materials.rim);rim.name=NAMES.rim;
  // A right-hand wheel is the left one mirrored, so the dish faces out on both sides.
  if(name.includes('Right'))pivot.scale.x=-1;
  pivot.add(tyre,rim);root.add(pivot);
 }
 for(const name of SEATS){
  const node=new Object3D();node.name=name;node.position.fromArray(shape.anchors[name]);root.add(node);
 }
 for(const {side,hinge,pod,face} of shape.popups??[]){
  const pivot=new Group();pivot.name=popupName(side);pivot.position.fromArray(hinge);
  const shell=new Mesh(pod,materials.paint);shell.name=NAMES.paint;
  const lamp=new Mesh(face,materials.lamp);lamp.name=NAMES.lamp;
  pivot.add(shell,lamp);body.add(pivot);
 }
 for(const {side,hinge,panel} of shape.doors??[]){
  const pivot=new Group();pivot.name=doorName(side);pivot.position.fromArray(hinge);
  pivot.add(new Mesh(panel,materials.paint));body.add(pivot);
 }
 return wrap(type,root,materials,{owned:true,dimensions:shape.dimensions,anchors:shape.anchors});
}

/**
 * Adopt a graph that was baked offline.
 *
 * The baked JSON carries geometry and node names but not materials worth keeping -- a
 * serialised material is a snapshot, and this one has to be repainted and have its brake lights
 * switched. So the graph is kept and the materials are rebuilt from the same definitions the
 * generator uses, which is also what stops the baked path and the live path drifting apart.
 */
export function adoptVehicleAsset(type,root,{paint=null,dimensions=null,anchors=null}={}){
 const materials=materialsFor(paint??VEHICLES[type].color,VEHICLES[type].rim,VEHICLES[type].clearcoat);
 const byName=new Map(Object.entries(NAMES).map(([part,name])=>[name,part]));
 root.traverse(o=>{
  if(!o.isMesh)return;
  const part=byName.get(o.name);
  if(part)o.material=materials[part];
 });
 const points=anchors??{};
 if(!dimensions){
  const d=VEHICLES[type],front=root.getObjectByName('frontLeftWheel');
  dimensions={length:d.length,width:d.width,height:d.height,
   wheelbase:front?front.position.z*2:d.length*.6,radius:front?front.position.y:.33};
 }
 return wrap(type,root,materials,{owned:false,dimensions,anchors:points});
}

/**
 * Roadmap stage 6: the motorbike's close-range model, from traffic/motorbike-shape.mjs.
 *
 * The same object a car's asset is, as far as the visual and the damage need it -- `root`,
 * `body`, `materials`, `dimensions`, `setRear`, `dispose` -- with two wheels (`wheels.front` and
 * `wheels.rear`) and a `lean` node between the root and everything else, pivoting on the line
 * the tyres touch the road along, so leaning into a turn keeps both tyres on the tarmac.
 */
export function createMotorbikeAsset(type='motorbike'){
 const shape=buildMotorbikeShape();
 const materials=materialsFor(paintOrDefault(type),0x8d949b,true);
 const root=new Group();root.name='vehicle-'+type;
 const lean=new Group();lean.name='vehicle-lean';root.add(lean);
 const body=new Group();body.name='vehicle-body';lean.add(body);
 const partMaterial={paint:'paint',dark:'dark',rim:'rim',glass:'glass',lamp:'lamp',tail:'tail'};
 for(const [part,geometry] of Object.entries(shape.geometry)){
  const mesh=new Mesh(geometry,materials[partMaterial[part]]);mesh.name=NAMES[partMaterial[part]];body.add(mesh);
 }
 const wheels={};
 for(const [key,anchor] of [['front','frontWheel'],['rear','rearWheel']]){
  const steer=new Group();steer.name=anchor+'-steer';steer.position.fromArray(shape.anchors[anchor]);
  const spin=new Group();spin.name=anchor;steer.add(spin);
  const tyre=new Mesh(shape.wheel.rubber,materials.tyre);tyre.name=NAMES.tyre;
  const rim=new Mesh(shape.wheel.rim,materials.rim);rim.name=NAMES.rim;
  spin.add(tyre,rim);lean.add(steer);wheels[key]={steer,spin};
 }
 let triangles=0,disposed=false;const geometries=new Set();
 root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);
  triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;
  o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;});
 return {
  type,root,body,lean,wheels,twoWheel:true,doors:[],anchors:{},dimensions:shape.dimensions,anchorPoints:shape.anchors,
  materials:Object.values(materials),triangles,
  setPaint(hex){materials.paint.color.setHex(hex);},
  setDoor(){},
  get popups(){return null;},
  get lampLevel(){return materials.lamp.emissiveIntensity;},
  setPopups(){},
  setRear(brake,indicator,override=null){
   const hex=override??(indicator?LAMP.indicator:brake?LAMP.brake:LAMP.off);
   materials.tail.color.setHex(hex);materials.tail.emissive.setHex(hex);
  },
  dispose(){
   if(disposed)return;disposed=true;
   root.removeFromParent();
   Object.values(materials).forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
   root.clear();
  }
 };
}
const paintOrDefault=type=>VEHICLES[type]?.color??0xb3161c;
