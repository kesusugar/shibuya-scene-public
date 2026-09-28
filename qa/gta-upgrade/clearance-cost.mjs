// RUN 10 / Codex handoff: what the 0.55 m static-solid clearance costs the driver.
//
// Codex raised the player car's padding against static solids from 0.05 m to 0.55 m so the
// bonnet stops entering station walls and raised platforms that render slightly ahead of their
// map solids. It is a global number, so its side effect is measurable: walk every traffic lane,
// stand a sedan on it facing along the lane, and ask whether the body clears the solids at each
// padding. A lane pose that was legal at 0.05 and is illegal at 0.55 is road a car can no
// longer drive on. The same test the player's vehicle applies (src/player/vehicle.mjs
// clearOfSolids), restated here with the padding as a parameter.
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../../src/ground/model.mjs';
import {buildBuildingModel} from '../../src/buildings/model.mjs';
import {buildStationModel} from '../../src/station/model.mjs';
import {buildStreetscapeModel} from '../../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../../src/traffic/graph.mjs';
import {VEHICLES} from '../../src/traffic/config.mjs';
import {pose,corners} from '../../src/traffic/path.mjs';
import {bounds,inPolygon} from '../../src/geo/core.mjs';
import {CAR} from '../../src/player/vehicle.mjs';

const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core});

const cross=(a,b,c,d)=>{const s=(p,q,r)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
 return s(a,b,c)!==s(a,b,d)&&s(c,d,a)!==s(c,d,b);};
// `pad` is either one number (both axes, as Codex's change does) or [lateral, longitudinal].
function clear(p,def,pad){
 const [lat,lon]=Array.isArray(pad)?pad:[pad,pad];
 const ring=corners(p,def.width+2*lat,def.length+2*lon,0);
 for(const {value:s} of graph.ctx.solid.query(bounds(ring))){
  const outer=s.outer??s.polygon?.outer;if(!outer)continue;
  if(ring.some(q=>inPolygon(q,{outer,holes:[]})))return false;
  if(outer.some(q=>inPolygon(q,{outer:ring,holes:[]})))return false;
  for(let i=0;i<4;i++)for(let j=0;j<outer.length;j++)
   if(cross(ring[i],ring[(i+1)%4],outer[j],outer[(j+1)%outer.length]))return false;
 }
 return true;
}

const def=VEHICLES.sedan,out={},p={};
const PADS=[.05,.25,.35,.45,.55,[.05,.55],[.15,.55],[CAR.solidSide,CAR.solidEnd]];
const tag=p=>Array.isArray(p)?`lat ${p[0]} / lon ${p[1]}`:`${p.toFixed(2)} both`;
for(const pad of PADS)out[tag(pad)]={legal:0,samples:0};
const lost=[];
for(const lane of graph.lanes){
 if(!lane.allowed.includes('sedan'))continue;
 for(let d=def.length/2;d<lane.path.length-def.length/2;d+=3){
  pose(lane.path,d,p);
  const at={x:p.x,z:p.z,heading:p.heading};
  const ok={};
  for(const pad of PADS){const k=tag(pad);out[k].samples++;ok[k]=clear(at,def,pad);if(ok[k])out[k].legal++;}
  if(ok[tag(.05)]&&!ok[tag(.55)])lost.push({x:+p.x.toFixed(1),z:+p.z.toFixed(1),road:lane.edge.roadClass,width:+lane.edge.width.toFixed(1)});
 }
}
console.log('sedan lane poses that clear static solids, by padding');
for(const pad of PADS){const k=tag(pad),r=out[k];console.log(`  ${k.padEnd(20)} ${r.legal}/${r.samples}  (${(100*r.legal/r.samples).toFixed(2)}%)  lost ${r.samples-r.legal}`);}
console.log(`\nlegal at 0.05 m but not at 0.55 m: ${lost.length}`);
const byRoad={};for(const l of lost)byRoad[l.road]=(byRoad[l.road]??0)+1;
console.log('  by road class',JSON.stringify(byRoad));
console.log('  first few',JSON.stringify(lost.slice(0,8)));
