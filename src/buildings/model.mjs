import {finishSteps} from '../quality/runtime.mjs';
import {ring,signedArea,bounds,inPolygon,inRing,seededRandom,distance,SpatialIndex,overlaps,extend} from '../geo/core.mjs';
import {triangulate} from '../geo/geometry.mjs';
import {metric} from '../data/normalize.mjs';
import {intersection,area,polygons,clipped,nearest,buffer,surface,marked,roadWidth,union} from '../ground/model.mjs';
import {GROUND} from '../ground/config.mjs';
import {BUILDINGS as C,HEIGHT_OVERRIDES,reservationReason} from './config.mjs';
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a,b,p)=>Math.abs(cross(a,b,p))<1e-7&&p[0]>=Math.min(a[0],b[0])-1e-7&&p[0]<=Math.max(a[0],b[0])+1e-7&&p[1]>=Math.min(a[1],b[1])-1e-7&&p[1]<=Math.max(a[1],b[1])+1e-7;
export function intersects(a,b,c,d){const ab=[cross(a,b,c),cross(a,b,d)],cd=[cross(c,d,a),cross(c,d,b)];return (ab[0]*ab[1]<0&&cd[0]*cd[1]<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
const edges=r=>r.map((a,i)=>[a,r[(i+1)%r.length]]);
export const multi=p=>[[[...p.outer,p.outer[0]],...(p.holes??[]).map(h=>[...h,h[0]])]];
export function validateFootprint(input){
 try{
  const outer=ring(input?.outer),holes=(input.holes??[]).map(ring),rings=[outer,...holes];
  for(const r of rings){const e=edges(r);for(let i=0;i<e.length;i++)for(let j=i+1;j<e.length;j++){if(j===i+1||(i===0&&j===e.length-1))continue;if(intersects(...e[i],...e[j]))return {ok:false,reason:'self-intersection'};}}
  for(let i=1;i<rings.length;i++){if(!inRing(rings[i][0],outer,false))return {ok:false,reason:'invalid-hole'};for(let j=0;j<i;j++){if(edges(rings[i]).some(e=>edges(rings[j]).some(f=>intersects(...e,...f))))return {ok:false,reason:'intersecting-rings'};if(j>0&&(inRing(rings[i][0],rings[j])||inRing(rings[j][0],rings[i])))return {ok:false,reason:'nested-holes'};}}
  const polygon={outer:signedArea(outer)>0?outer:outer.reverse(),holes:holes.map(h=>signedArea(h)<0?h:h.reverse())},a=area(multi(polygon));
  if(a<C.minArea||a>C.maxArea)return {ok:false,reason:'footprint-area'};
  const b=bounds(outer);if(Object.values(b).some(v=>Math.abs(v)>2000))return {ok:false,reason:'gross-bounds'};
  const t=triangulate(polygon);let actual=0;for(let i=0;i<t.indices.length;i+=3)actual+=Math.abs(signedArea([t.vertices[t.indices[i]],t.vertices[t.indices[i+1]],t.vertices[t.indices[i+2]]]));
  if(!t.indices.length||Math.abs(actual-a)>Math.max(.001,a*1e-6))return {ok:false,reason:'triangulation-failure'};
  return {ok:true,polygon,area:a,bounds:b};
 }catch(error){return {ok:false,reason:/Degenerate/.test(String(error))?'zero-area':'malformed-polygon'};}
}
export function resolveHeight(source,features={area:100,roadDistance:10,zone:'west'}){
 const height=metric(source.tags?.height??source.height),levels=metric(source.tags?.['building:levels']??source.levels);let value,method;
 const forced=HEIGHT_OVERRIDES[source.id];
 if(forced>0){value=forced;method='reference-match';}else if(height>0){value=height;method='height';}else if(levels>0){value=levels*C.floorHeight;method='levels';}else{const rng=seededRandom(source.id+':height');const low=features.area<65?2:features.area>500?6:3;const spread=features.roadDistance<15?6:4;value=(low+Math.floor(rng()*spread))*C.floorHeight;method='seeded';}
 const resolved=Math.max(C.minHeight,Math.min(C.maxHeight,value));const min=metric(source.tags?.min_height??source.minHeight)??0;
 return {height:resolved,method,clamped:resolved!==value,base:Math.max(C.base,Math.min(min,resolved-C.floorHeight)),levels:Math.max(1,Math.floor(resolved/C.floorHeight))};
}
export function classify(f,source){
 const t=source.tags??{},residential=['apartments','residential','house'].includes(t.building)||t['building:use']==='residential';
 const commercial=['retail','commercial'].includes(t.building)||!!t.shop;
 if(residential)return 'balcony';
 if(f.height<=10.5||f.area<45)return 'plain';
 if(commercial&&f.height<22&&f.area<550)return 'shop';
 if(!commercial&&f.zone==='northwest'&&f.height<32&&f.area<350&&f.aspect<2.5&&f.roadDistance>2&&seededRandom(source.id+':residential')()<.65)return 'balcony';
 if(f.height>=45&&f.area>=300)return 'curtain';
 if((f.aspect>2.1||f.frontageLength<10)&&f.height>=16&&f.roadDistance<25)return 'zakkyo';
 if(f.area>450&&f.height>=20)return 'grid';
 if(f.height>=20)return 'band';
 if(f.roadDistance>12&&f.zone==='northwest')return 'balcony';
 return seededRandom(source.id+':archetype')()<.5&&f.roadDistance<20?'shop':'plain';
}
function centroid(p){let sum=0,x=0,z=0;for(const r of [p.outer,...p.holes])for(const [a,b] of edges(r)){const c=a[0]*b[1]-b[0]*a[1];sum+=c;x+=(a[0]+b[0])*c;z+=(a[1]+b[1])*c;}return [x/(3*sum),z/(3*sum)];}
function frontage(p,roads){let best=null;for(const [a,b] of edges(p.outer)){const l=distance(a,b);if(l<1)continue;const mid=a.map((v,i)=>(v+b[i])/2),near=nearest(mid,roads);const normal=[(b[1]-a[1])/l,-(b[0]-a[0])/l];const facing=near.point?normal[0]*(near.point[0]-mid[0])+normal[1]*(near.point[1]-mid[1]):0;const score=near.distance+(facing<0?20:0)-Math.min(l,30)*.1;if(!best||score<best.score)best={a,b,length:l,mid,normal,distance:near.distance,heading:Math.atan2(normal[0],normal[1]),score};}return best;}
export function roofFits(polygon,center,width,depth,margin=C.roofMargin){const w=width/2+margin,d=depth/2+margin,r=[[center[0]-w,center[1]-d],[center[0]+w,center[1]-d],[center[0]+w,center[1]+d],[center[0]-w,center[1]+d]];if(!r.every(v=>inPolygon(v,polygon)))return false;const rectangle=edges(r);for(const ring of [polygon.outer,...polygon.holes]){if(edges(ring).some(e=>rectangle.some(f=>intersects(...e,...f))))return false;if(ring===polygon.outer)continue;if(ring.some(p=>p[0]>r[0][0]&&p[0]<r[2][0]&&p[1]>r[0][1]&&p[1]<r[2][1]))return false;}return true;}
export function rooftop(building){const rng=seededRandom(building.key+':rooftop'),result=[],b=building.bounds;const types=[['ac',1.1,.7,1],['vent',.5,.7,.5],['hut',2.4,2,2],['cooling',1.8,1.3,1.4],['tank',1.2,1.6,1.2],['mast',.12,2.5,.12]];
 const count=Math.min(8,Math.max(1,Math.floor(building.area/90)));for(let i=0;i<count;i++){const [type,w,h,d]=types[Math.floor(rng()*types.length)];for(let attempt=0;attempt<24;attempt++){const center=[b.minX+rng()*(b.maxX-b.minX),b.minZ+rng()*(b.maxZ-b.minZ)];if(!roofFits(building.polygon,center,w,d)||result.some(r=>Math.abs(r.center[0]-center[0])<(r.width+w)/2+.4&&Math.abs(r.center[1]-center[1])<(r.depth+d)/2+.4))continue;result.push({type,center,width:w,height:h,depth:d,y:building.height+C.base});break;}}
 return result;
}
export function* buildBuildingModelSteps(data){let chunk=0;const started=performance.now(),reserved=[],skipped=[],buildings=[],stats={sourceBuildings:data.buildings.length,triangulationFailures:0,clippedBuildings:0,heightClamped:0};
 const reservedSources=data.buildings.filter(s=>reservationReason(s,data.landmarks));const reservedIndex=new SpatialIndex(40);reservedSources.forEach((s,i)=>reservedIndex.insert(i,s.bounds,s));const roadLines=data.roads.filter(surface).map(r=>r.points);const streets=[...roadLines,...data.footways.filter(f=>surface(f)&&f.tags?.footway!=='crossing').map(f=>f.points)];
 const roadIndex=new SpatialIndex(25);data.roads.filter(surface).forEach((r,i)=>{const p=buffer(r.points,roadWidth(r));if(p.length)roadIndex.insert(i,bounds(polygons(p).flatMap(p=>p.outer)),p);});
 const crossingIndex=new SpatialIndex(25);data.footways.filter(f=>f.tags.footway==='crossing'&&marked(f)).forEach((f,i)=>{const main=f.tags['crossing:scramble']==='yes',points=main?extend(f.points,GROUND.crossingExtension):f.points,p=buffer(points,main?GROUND.mainWidth+1:GROUND.normalWidth);crossingIndex.insert(i,bounds(polygons(p).flatMap(q=>q.outer)),p);});
 for(const source of data.buildings){if(++chunk%50===0)yield;const key=source.id+':'+source.part,reason=reservationReason(source,data.landmarks);if(reason){reserved.push({id:source.id,key,reason,polygon:source.polygon});continue;}
 const validation=validateFootprint(source.polygon);if(!validation.ok){skipped.push({key,reason:validation.reason});if(validation.reason==='triangulation-failure')stats.triangulationFailures++;continue;}
 if(['roof','bridge'].includes(source.tags?.building)||source.tags?.location==='underground'){skipped.push({key,reason:'non-generic-structure'});continue;}
 const r=reservedIndex.query(validation.bounds).find(r=>area(intersection(multi(validation.polygon),multi(r.value.polygon)))>.1);if(r){reserved.push({id:source.id,key,reason:'overlaps-reserved',reservedId:r.value.id,polygon:source.polygon});continue;}
 const pieces=polygons(clipped(multi(validation.polygon)));if(!pieces.length){skipped.push({key,reason:'outside-target'});continue;}if(Math.abs(pieces.reduce((s,p)=>s+area(multi(p)),0)-validation.area)>.001)stats.clippedBuildings++;
 for(const [part,polygon] of pieces.entries()){const valid=validateFootprint(polygon);if(!valid.ok){skipped.push({key,reason:'clipped-'+valid.reason});continue;}
 // Keep OSM geometry intact; reject obvious centerline/crossing conflicts, report small surface overlaps separately.
 const crossingConflict=crossingIndex.query(valid.bounds).some(({value:p})=>area(intersection(multi(polygon),p))>1);
 const roadConflict=roadLines.some(line=>line.some(p=>inPolygon(p,polygon)))||roadLines.some(line=>edges(polygon.outer).some(e=>line.some((p,i)=>i>0&&intersects(...e,line[i-1],p)))&&area(intersection(multi(polygon),buffer(line,.5)))>1);
 if(crossingConflict||roadConflict){skipped.push({key,reason:crossingConflict?'crossing-conflict':'road-centerline-conflict'});continue;}
 const roadArea=area(intersection(multi(polygon),union(...roadIndex.query(valid.bounds).map(r=>r.value))));if(roadArea>C.roadConflictArea&&roadArea/valid.area>C.roadConflictRatio){skipped.push({key,reason:'road-surface-conflict',overlapArea:roadArea,overlapRatio:roadArea/valid.area});continue;}
 const c=centroid(polygon),front=frontage(polygon,streets);if(!front){skipped.push({key,reason:'no-valid-edge'});continue;}const b=valid.bounds,w=b.maxX-b.minX,d=b.maxZ-b.minZ,zone=c[0]<0?(c[1]<-80?'northwest':'west'):'east';const f={area:valid.area,centroid:c,aspect:Math.max(w,d)/Math.max(.1,Math.min(w,d)),roadDistance:front.distance,frontageLength:front.length,zone};const resolved=resolveHeight(source,f);if(resolved.clamped)stats.heightClamped++;const building={id:source.id,sourceKey:key,key:key+':'+part,polygon,bounds:b,...f,...resolved,frontage:front};building.archetype=classify(building,source);building.rooftop=rooftop(building);buildings.push(building);
 }
 }
 const heights=buildings.map(b=>b.height).sort((a,b)=>a-b),byArchetype={},byReason={};for(const b of buildings)byArchetype[b.archetype]=(byArchetype[b.archetype]??0)+1;for(const s of skipped)byReason[s.reason]=(byReason[s.reason]??0)+1;
 return {buildings,reserved,skipped,stats:{...stats,genericBuildings:buildings.length,genericSources:new Set(buildings.map(b=>b.sourceKey)).size,reservedHeroBuildings:reserved.length,skippedBuildings:new Set(skipped.filter(s=>!buildings.some(b=>b.sourceKey===s.key)).map(s=>s.key)).size,skippedFragments:skipped.length,skippedByReason:byReason,archetypes:byArchetype,heightMin:heights[0]??0,heightMax:heights.at(-1)??0,heightMedian:heights.length%2?heights[Math.floor(heights.length/2)]:(heights[heights.length/2-1]+heights[heights.length/2])/2,buildTimeMs:performance.now()-started}};
}
export function auditGround(model,ground){
 const road=[],crossing=[],idx=new SpatialIndex(25);
 let id=0;for(const c of ground.crossings)for(const s of c.stripes)for(const p of polygons(s.polygon))idx.insert(id++,bounds(p.outer),multi(p));
 for(const b of model.buildings){const a=area(intersection(multi(b.polygon),ground.roads));if(a>.05)road.push({id:b.id,area:a,ratio:a/b.area});let ca=0;for(const {value:p} of idx.query(b.bounds))ca+=area(intersection(multi(b.polygon),p));if(ca>.05)crossing.push({id:b.id,area:ca});}
 return {roadSurfaceOverlapCount:road.length,obviousRoadOverlapCount:road.filter(r=>r.ratio>C.roadConflictRatio&&r.area>C.roadConflictArea).length,crossingOverlapCount:crossing.length,roadOverlaps:road,crossingOverlaps:crossing};
}

export function buildBuildingModel(...args){return finishSteps(buildBuildingModelSteps(...args));}
