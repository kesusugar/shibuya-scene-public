import {bounds,SpatialIndex} from '../geo/core.mjs';
import {intersection,area} from '../ground/model.mjs';
import {multi} from '../buildings/model.mjs';
import {footprint} from '../station-detail/model.mjs';
import {TRAIN_TYPES,trainPose} from './model.mjs';
// Offline swept envelope audit; never called by the render/update loop.
export function auditTrainRoutes(routes,{core,generic,detail}){
 const index=new SpatialIndex(20),solids=[...core.masses,...generic.buildings.map(b=>({role:b.id,polygon:b.polygon,bottom:0,top:b.height+.15})),...generic.reserved.filter(b=>!core.reservations.some(r=>r.id===b.id)).map(b=>({role:b.id,polygon:b.polygon,bottom:0,top:250})),...(detail?.fixtures??[]).map(f=>({...f,role:f.id})),...[...core.instances,...(detail?.instances??[])].filter(b=>b.position&&b.scale).map(b=>({role:b.role,polygon:footprint([b.position[0],b.position[2]],b.scale[0],b.scale[2],b.heading),bottom:b.position[1]-b.scale[1]/2,top:b.position[1]+b.scale[1]/2}))];
 solids.forEach((s,i)=>index.insert(i,bounds(s.polygon.outer),s));let samples=0;const findings=[],p={};
 for(const r of routes){const def=TRAIN_TYPES[r.type];for(let d=0;d<=r.path.length;d+=2){trainPose(r,d,p);const poly=footprint([p.x,p.z],def.width+.12,def.length+.12,p.heading);if(poly.outer.some(v=>Math.max(...v.map(Math.abs))>250))continue;samples++;
  if(p.y<0) findings.push({route:r.id,d,role:'ground'});
  for(const {value:s} of index.query(bounds(poly.outer))){if(p.y>=s.top-.01||p.y+def.height<=s.bottom+.01)continue;if(area(intersection(multi(poly),multi(s.polygon)))>.02)findings.push({route:r.id,d,role:s.role});}
 }}return {samples,major:findings.length,findings};
}
