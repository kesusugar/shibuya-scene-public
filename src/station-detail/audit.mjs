import {bounds,SpatialIndex} from '../geo/core.mjs';import {area,intersection,union,buffer,surface} from '../ground/model.mjs';import {multi} from '../buildings/model.mjs';
/** Independent acceptance audit of placed fixture footprints; rejected candidates are not collisions. */
export function auditDetails(model,core,ground,data,generic){const findings=[],cross=union(...ground.crossings.flatMap(c=>c.stripes.map(s=>s.polygon))),stairs=union(...core.pedestrians.filter(d=>d.stair).flatMap(d=>d.masses.map(s=>multi(s.polygon))));
 const tactile=core.masses.filter(m=>m.role==='platform-tactile'),index=new SpatialIndex(20);core.masses.forEach((s,i)=>index.insert(i,s.bounds??bounds(s.polygon.outer),s));const obstacles=[...generic.buildings.map(b=>({polygon:b.polygon,top:b.height+.15,id:b.id})),...generic.reserved.filter(r=>!core.reservations.some(s=>s.id===r.id)).map(r=>({polygon:r.polygon,top:250,id:r.id}))];
 const test=(f,shape,kind,classification='major')=>{const a=area(intersection(multi(f.polygon),shape));if(a>.001)findings.push({fixture:f.id,kind,classification,area:a,point:f.point});};
 for(const f of model.fixtures){if(f.bottom<4){test(f,ground.roads,'road');test(f,cross,'crosswalk');test(f,stairs,'stairs');test(f,ground.sidewalks,'sidewalk','minor');if(f.role==='gadoshita')test(f,ground.sidewalks,'storefront-sidewalk');}
 if(f.platform)for(const s of tactile.filter(s=>s.owner===f.platform))test(f,multi(s.polygon),'tactile');for(const s of core.supports)if(f.bottom<s.top&&f.top>s.base)test(f,multi(s.polygon),'pier');for(const o of obstacles)if(f.bottom<o.top)test(f,multi(o.polygon),'building');
 for(const {value:s} of index.query(bounds(f.polygon.outer)))if(f.bottom<s.top-.001&&f.top>s.bottom+.001)test(f,multi(s.polygon),'core:'+s.role);
 }
 // The model's mounted details deliberately touch only their stated S5 host.
 const expectedMounted=[...new Set([...model.instances,...model.faces].filter(r=>r.owner?.includes('mounted')).map(r=>r.owner))];
 return {baselineMajor:model.baseline.major,baselineMinor:model.baseline.minor,newMajor:findings.filter(f=>f.classification==='major').length,newMinor:findings.filter(f=>f.classification==='minor').length,findings,expectedMounted};
}
