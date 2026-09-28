// The street fleet: every traffic car on the loft, drawn in five batches (PLAN-LOOKS-AND-FLEET
// Step B).
//
// Before this, traffic bodies were rounded boxes, one InstancedMesh per type and part: seven
// types times up to five parts, so traffic draw calls grew with every type added. Now each part
// (body, glass, dark, front, rear) is ONE BatchedMesh holding every type's geometry, and a car
// is one instance per part. Adding a type adds geometry, not draw calls.
//
// Paint is per car, not per type, and a pure function of the car's pool id, so a car keeps its
// colour however often the simulation re-spawns it. Liveries (two-tone taxis, the city bus, the
// patrol car) are a band in the body shader: the batch colour's RGB is the lower colour, and its
// alpha -- which an opaque material ignores -- carries the livery id and the band height.
import {motorbikeFleetGeometry} from './motorbike-shape.mjs';
import {BatchedMesh,Color,Vector4,Matrix4,Object3D} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {BoxGeometry} from 'three';
import {buildVehicleShape} from './vehicle-shape.mjs';
import {VEHICLES} from './config.mjs';

/** The five traffic parts, in the names day-night.mjs and the fidelity pipeline match. */
export const FLEET_PARTS=Object.freeze(['body','glass','dark','front','rear']);

/**
 * Liveries. `second` is the upper colour (sRGB hex), `band` the height of the split as a fraction
 * of the vehicle's height. Generic schemes only: no company, operator or agency marks.
 */
export const LIVERY=Object.freeze({
 none:  Object.freeze({id:0}),
 // PLAN-POLICE-VOICE-KAZE-DETAIL Step P: .58 was found (device, day and night) to sit well
 // below the sedan profile's actual beltline (`SILHOUETTE.sedan.belt` reaches .755 across the
 // doors), deep in the lower door -- so the car was mostly white with a thin black sliver at
 // the rocker, which read as grey rather than a crisp black-and-white split. .74 sits just under
 // the door-top beltline, at the real proportion.
 police:Object.freeze({id:1,lower:0x121417,second:0xf1f1ec,band:.74}),
 taxiTwoTone:Object.freeze({id:2,lower:0xe7b823,second:0x2f6b45,band:.73}),
 bus:   Object.freeze({id:3,lower:0x2f7d4f,second:0xe9e2c8,band:.40}),
 taxiCream:Object.freeze({id:4,lower:0xe8e1cf,second:0x7a1f2b,band:.73}),
 riot:  Object.freeze({id:5,lower:0x1f3f7a,second:0xe9ecef,band:.52}),
 // Roadmap stage 4: the ambulance -- a red lower third, white above.
 ambulance:Object.freeze({id:6,lower:0xc42a2e,second:0xf3f3ef,band:.3})
});
const LIVERY_BY_ID=Object.values(LIVERY).sort((a,b)=>a.id-b.id);

/**
 * The Japanese street colour mix (the plan's table). Shares are percentages; each entry is a
 * small set of real-looking shades so two white cars are not always the same white.
 */
export const PAINT_MIX=Object.freeze({
 general:Object.freeze([
  {name:'pearl white',share:30,shades:[0xeeeeea,0xf2f1ec,0xe6e5df]},
  {name:'black',share:20,shades:[0x15171b,0x1c1e22,0x101114]},
  {name:'silver and grey',share:20,shades:[0xa8adb2,0x8e949a,0x6c7278,0xbfc3c6]},
  {name:'dark blue',share:8,shades:[0x1f2c47,0x263654]},
  {name:'red',share:5,shades:[0x9c1d22,0xb32a2a]},
  {name:'others',share:17,shades:[0x5a4a3a,0x33443a,0x8a7a5e,0x6d2330,0x4d6475,0xc9c0a8]}
 ]),
 // Commercial vans and trucks lean white.
 commercial:Object.freeze([
  {name:'pearl white',share:62,shades:[0xeeeeea,0xf2f1ec,0xe4e4de]},
  {name:'silver and grey',share:24,shades:[0xa8adb2,0x8e949a]},
  {name:'black',share:6,shades:[0x1a1c20]},
  {name:'others',share:8,shades:[0x2d4a6b,0x3d5a44]}
 ]),
 // Kei cars get the pastels.
 kei:Object.freeze([
  {name:'pearl white',share:26,shades:[0xeeeeea,0xf2f1ec]},
  {name:'pastel',share:30,shades:[0xbfd8c6,0xe8dcb4,0xe6c3c7,0xb7cbe0,0xd9d2e6]},
  {name:'silver and grey',share:16,shades:[0xa8adb2,0x8e949a]},
  {name:'black',share:10,shades:[0x15171b]},
  {name:'others',share:18,shades:[0x7a1f2b,0x3b4f6e,0x8a7a5e,0x5c6b3a]}
 ])
});
/** Which mix a type draws from. Types not listed use `general`. */
export const PAINT_CLASS=Object.freeze({van:'commercial',keiTruck:'commercial',kei:'kei',
 longVan:'commercial',truck2t:'commercial',tallKei:'kei'});

/** Taxi schemes, generic: black, deep indigo, and two two-tones. No company name. */
export const TAXI_SCHEMES=Object.freeze([
 {name:'black',share:35,hex:0x141619,livery:'none'},
 {name:'deep indigo',share:25,hex:0x1d2440,livery:'none'},
 {name:'yellow and green',share:22,livery:'taxiTwoTone'},
 {name:'cream and maroon',share:18,livery:'taxiCream'}
]);

function hash(id,salt){
 let h=Math.imul((id|0)^salt,0x85ebca6b);
 h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;
 return h>>>0;
}
function pickShare(list,u){
 const total=list.reduce((n,e)=>n+e.share,0);let x=u*total;
 for(const e of list){x-=e.share;if(x<0)return e;}
 return list[list.length-1];
}

/**
 * The paint of car `id` as type `type`. Pure. Returns the lower colour, the livery and its band.
 */
export function paintOf(id,type){
 const h=hash(id,0x5bd1e995),u=(h&0xffff)/65536,shade=h>>>16;
 // The player's own car is always its own colour.
 if(VEHICLES[type]?.owned||VEHICLES[type]?.fixedPaint)return {hex:VEHICLES[type].color,livery:0,band:0,name:VEHICLES[type].owned?'own':type};
 const fixed=VEHICLES[type]?.livery;
 if(fixed){const l=LIVERY[fixed];return {hex:l.lower,livery:l.id,band:l.band,name:fixed};}
 if(type==='taxi'||type==='cityTaxi'){
  const s=pickShare(TAXI_SCHEMES,u);
  if(s.livery!=='none'){const l=LIVERY[s.livery];return {hex:l.lower,livery:l.id,band:l.band,name:s.name};}
  return {hex:s.hex,livery:0,band:0,name:s.name};
 }
 const mix=PAINT_MIX[PAINT_CLASS[type]??'general'];
 const e=pickShare(mix,u);
 return {hex:e.shades[shade%e.shades.length],livery:0,band:0,name:e.name};
}

/** The livery code the body shader decodes from the batch colour's alpha. */
export const liveryCode=(livery,bandMetres)=>livery*8+Math.min(7.99,Math.max(0,bandMetres));

// Body shader: mix to the livery's upper colour above the band. Must end in a newline (§16a).
// The guard is USE_COLOR_ALPHA, not USE_BATCHING_COLOR: three defines the latter only in the
// VERTEX prefix; the fragment prefix gets USE_COLOR_ALPHA for a batch colour. Guarded by the
// vertex macro, the whole block compiled out and every livery was drawn as its lower colour.
const toLinear=hex=>new Color(hex);
function liveryGLSL(){
 const rows=LIVERY_BY_ID.filter(l=>l.id>0).map(l=>{
  const c=toLinear(l.second);
  return ` if(abs(fleetLiv-${l.id}.0)<0.5)fleetSecond=vec3(${c.r.toFixed(5)},${c.g.toFixed(5)},${c.b.toFixed(5)});\n`;
 }).join('');
 return `
#ifdef USE_COLOR_ALPHA
 {
  float fleetCode=vColor.a;
  float fleetLiv=floor(fleetCode/8.0+0.0001);
  float fleetBand=fleetCode-fleetLiv*8.0;
  vec3 fleetSecond=diffuseColor.rgb;
${rows}  if(fleetLiv>0.5)diffuseColor.rgb=mix(diffuseColor.rgb,fleetSecond,smoothstep(fleetBand-0.012,fleetBand+0.012,vFleetY));
  diffuseColor.a=opacity;
 }
#endif
`;
}
export const FLEET_LIVERY_GLSL=liveryGLSL();

/** Install the livery band on the body material. */
export function installLivery(material){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying float vFleetY;\n')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvFleetY=position.y;\n');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>','#include <common>\nvarying float vFleetY;\n')
   .replace('#include <color_fragment>','#include <color_fragment>\n'+FLEET_LIVERY_GLSL);
 };
 material.customProgramCacheKey=()=>'traffic-fleet-livery-v1';
}

/**
 * One type's traffic parts, from the loft at the lowest detail.
 *
 * paint -> body, glass -> glass, lamp -> front, tail -> rear, and dark, the plate and the four
 * wheels (tyre and rim, fixed at their anchors) -> dark. Every part is one geometry.
 */
export function fleetGeometry(type){
 // Stage 6: two wheels are not a loft.
 if(VEHICLES[type]?.twoWheel)return motorbikeFleetGeometry();
 const shape=buildVehicleShape(type,{detail:0});
 const g=shape.geometry,parts={body:[],glass:[],dark:[],front:[],rear:[],lightbar:[]};
 const add=(k,geo)=>{if(geo)parts[k].push(geo);};
 add('body',g.paint);add('glass',g.glass);add('dark',g.dark);add('dark',g.plate);
 add('dark',g.rubber);add('dark',g.rim);add('front',g.lamp);add('rear',g.tail);
 // Step P: the patrol car's light-bar lens is its own batch, not the tail lamp, so the siren can
 // flash it without also being bound to the tail lamp's colour (or vice versa).
 add('lightbar',g.lightbar);
 const a=shape.anchors,m=new Matrix4();
 for(const key of ['frontLeftWheel','frontRightWheel','rearLeftWheel','rearRightWheel']){
  const [x,y,z]=a[key];const flip=x<0;
  for(const src of [shape.wheel.rubber,shape.wheel.rim]){
   const w=src.clone();
   // The rim is built facing +x; the left-hand wheels face the other way.
   if(flip)w.applyMatrix4(m.makeRotationY(Math.PI));
   w.translate(x,y,z);parts.dark.push(w);
  }
 }
 shape.wheel.rubber.dispose();shape.wheel.rim.dispose();
 // The door panels sit a centimetre inside the flank for the player's opening doors; a traffic
 // car never opens one, so they are left out.
 shape.doors.forEach(d=>d.panel.dispose());
 // Pop-up lamp pods, closed: flush with the bonnet. They only open on the player's close-up model.
 for(const p of shape.popups??[]){parts.body.push(p.pod.translate(...p.hinge));p.face.dispose();}
 const extra=VEHICLES[type]?.roofSign;
 if(extra){
  const sign=new BoxGeometry(.56,.2,.26);sign.deleteAttribute('uv');
  sign.translate(0,shape.dimensions.height+.1,0);parts.front.push(sign);
 }
 const out={};
 for(const [k,list] of Object.entries(parts)){
  if(!list.length)continue;
  const merged=list.length===1?list[0]:mergeGeometries(list.map(x=>{x.deleteAttribute?.('uv');return x;}),false);
  if(list.length>1)list.forEach(x=>x.dispose());
  out[k]=merged;
 }
 return out;
}

/**
 * The fleet's batches: one BatchedMesh per part, instance i of every batch is pool slot i.
 *
 * `types` maps a type to its parts (from `fleetGeometry` or, for the scooter, the old box
 * geometry). A slot whose type lacks a part (a scooter has no glass) hides that instance.
 */
export function createFleetBatches(types,capacity,materials){
 const meshes={},ids={};
 // BatchedMesh wants every geometry indexed or none; the scooter's box pile is not.
 for(const parts of Object.values(types))for(const g of Object.values(parts))
  if(!g.index)g.setIndex([...Array(g.attributes.position.count).keys()]);
 // Step P: the light-bar lens is a sixth, optional batch -- only types with `d.lightbar` (the
 // patrol car) contribute geometry to it, exactly like `glass` already skips the scooter. The
 // plan allows at most one extra draw call for all police cars together, for exactly this.
 for(const part of [...FLEET_PARTS,'lightbar']){
  let vertices=0,indices=0;
  for(const parts of Object.values(types)){const g=parts[part];if(!g)continue;
   vertices+=g.attributes.position.count;indices+=g.index?g.index.count:g.attributes.position.count;}
  if(!vertices)continue;
  const mesh=new BatchedMesh(capacity,vertices,indices,materials[part]);
  mesh.name=`traffic-fleet-${part}`;
  mesh.frustumCulled=false;mesh.sortObjects=false;mesh.perObjectFrustumCulled=true;
  ids[part]={};
  for(const [type,parts] of Object.entries(types))if(parts[part])ids[part][type]=mesh.addGeometry(parts[part]);
  const first=Object.values(ids[part])[0];
  for(let i=0;i<capacity;i++){const id=mesh.addInstance(first);mesh.setVisibleAt(id,false);}
  meshes[part]=mesh;
 }
 const shown=new Array(capacity).fill(null);        // the type each slot is currently drawn as
 const lower=new Color(),code=new Vector4();
 return {
  meshes,ids,
  /** Show slot i as `type` at `matrix`, painted for car `id`. */
  show(i,type,matrix,paint,height){
   for(const [part,mesh] of Object.entries(meshes)){
    const geometry=ids[part][type];
    if(geometry===undefined){mesh.setVisibleAt(i,false);continue;}
    if(shown[i]!==type)mesh.setGeometryIdAt(i,geometry);
    mesh.setMatrixAt(i,matrix);mesh.setVisibleAt(i,true);
   }
   if(shown[i]!==type&&meshes.body){
    lower.setHex(paint.hex);
    code.set(lower.r,lower.g,lower.b,liveryCode(paint.livery,paint.band*height));
    meshes.body.setColorAt(i,code);
   }
   shown[i]=type;
  },
  hide(i){if(shown[i]===null)return;for(const mesh of Object.values(meshes))mesh.setVisibleAt(i,false);shown[i]=null;},
  /** Force a repaint on the next show (a slot re-spawned as the same type keeps its paint). */
  forget(i){shown[i]=null;},
  dispose(){for(const mesh of Object.values(meshes))mesh.dispose();}
 };
}
