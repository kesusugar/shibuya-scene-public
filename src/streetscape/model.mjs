import {finishSteps} from '../quality/runtime.mjs';
import {bounds,distance,length,sample,seededRandom,SpatialIndex,inPolygon} from '../geo/core.mjs';
import {buildGroundModel,nearest,surface,area,intersection as rawIntersection,buffer,contains,rect} from '../ground/model.mjs';
import {buildBuildingModel,multi} from '../buildings/model.mjs';
import {buildStationModel} from '../station/model.mjs';
import {buildSignModel,signPolygon,FACADE_BAND} from '../signs/model.mjs';
import {regionAt} from '../signs/config.mjs';
import {footprint} from '../station-detail/model.mjs';
import {DEFINITIONS,QUALITY,REGIONS,STATION_EXCLUSION} from './config.mjs';
import {chooseCategory} from './config.mjs';
export function stationExcluded(p,margin=0){const b=STATION_EXCLUSION;return p[0]>=b.minX-margin&&p[0]<=b.maxX+margin&&p[1]>=b.minZ-margin&&p[1]<=b.maxZ+margin;}
const roundCache=new WeakMap();
const rounded=v=>{if(!Array.isArray(v))return Math.round(v*1e6)/1e6;let r=roundCache.get(v);if(!r){r=v.map(rounded);roundCache.set(v,r);}return r;};
const intersection=(a,b)=>rawIntersection(rounded(a),rounded(b));
const intersects=(p,q)=>area(intersection(multi(p),q))>.0001;
export function contextFor(data,ground,generic,core,signs){const solids=new SpatialIndex(15),flow=new SpatialIndex(15),occupied=new SpatialIndex(8);let id=0;
 const add=(polygon,bottom,top,kind,overhang=false)=>solids.insert(id++,bounds(polygon.outer),{polygon,bottom,top,kind,overhang});
 for(const b of generic.buildings)add(b.polygon,b.base,b.base+b.height,'building');
 for(const h of signs.hosts.filter(h=>h.label!=='generic-facade'))add(h.polygon,h.bottom,h.top,'hero');
 for(const s of core.masses)add(s.polygon,s.bottom,s.top,'station');
 for(const s of core.supports)if(s.polygon)add(s.polygon,s.base??0,s.top??25,'station-support');
 // A flush panel sits inside the facade band its host building already occupies in this
 // index; only a blade stands proud of the wall. Traffic reads these volumes as roadside
 // obstacles, so it needs to tell the two apart -- see safetyContext in traffic/graph.mjs.
 for(const s of signs.signs)add(signPolygon({...s,width:s.width+.06,depth:s.depth+.06}),s.position[1]-s.height/2-.03,s.position[1]+s.height/2+.03,'sign',s.projection>FACADE_BAND);
 for(const f of data.footways.filter(surface)){if(f.tags?.footway==='crossing')continue;for(let i=1;i<f.points.length;i++){const shape=rect(f.points[i-1],f.points[i],f.tags?.highway==='steps'?2.4:1.2);if(shape.length)flow.insert(id++,bounds(shape.flat(2)),shape);}}
 return {ground,generic,solids,flow,occupied,roads:data.roads.filter(surface).map(r=>r.points)};
}
export function fixtureAt(category,anchor,id,extra={}){const d=DEFINITIONS[category],normal=anchor.normal,heading=Math.atan2(normal[0],normal[1]),polygon=footprint(anchor.point,d.width,d.depth,heading);return {id,category,region:regionAt(anchor.point),point:anchor.point,normal,heading,polygon,width:d.width,depth:d.depth,height:d.height,bottom:.15,top:.15+d.height,sourceId:anchor.sourceId,route:anchor.route,sourcePoint:anchor.sourcePoint??anchor.point,variation:seededRandom(id+':variation')(),...extra};}
export function fixtureIssues(f,ctx){const issues=[];if(![...f.point,...f.normal,f.heading,f.width,f.depth,f.height,f.bottom,f.top].every(Number.isFinite)||Math.min(f.width,f.depth,f.height)<=0)return ['invalid-transform'];if(Math.abs(Math.hypot(...f.normal)-1)>.0001)issues.push('normal');if(f.polygon.outer.some(p=>Math.abs(p[0])>249.8||Math.abs(p[1])>249.8))issues.push('boundary');if(stationExcluded(f.point,Math.max(f.width,f.depth)/2))issues.push('S6-exclusion');
 if(issues.length)return issues;
 const bb=bounds(f.polygon.outer),shape=multi(f.polygon);
 if(!f.polygon.outer.every(p=>contains(ctx.ground.sidewalks,p))||Math.abs(area(intersection(shape,ctx.ground.sidewalks))-f.width*f.depth)>.001)return ['off-sidewalk'];
 if(intersects(f.polygon,ctx.ground.roads))issues.push('road');if(intersects(f.polygon,ctx.ground.corridors))issues.push('crosswalk-approach');if(intersects(f.polygon,ctx.ground.ramps))issues.push('curb-ramp');
 if(ctx.flow.query(bb).some(({value:p})=>intersects(f.polygon,p)))issues.push('pedestrian-path');
 if(Math.abs(f.bottom-ctx.ground.height(f.point))>.01)issues.push('floating');
 if(ctx.solids.query(bb).some(({value:s})=>f.bottom<s.top&&f.top>s.bottom&&intersects(f.polygon,multi(s.polygon))))issues.push('solid-penetration');
 if(ctx.occupied.query({minX:bb.minX-.5,maxX:bb.maxX+.5,minZ:bb.minZ-.5,maxZ:bb.maxZ+.5}).some(({value:s})=>distance(f.point,s.point)<1.8||intersects(f.polygon,multi(s.polygon))))issues.push('duplicate-clearance');
 if(['vending','box','bench','information'].includes(f.category)&&ctx.generic.buildings.some(b=>distance(f.point,b.frontage.mid)<2.5))issues.push('entrance-clearance');
 // Reserve a clear 1.2m pedestrian strip inland from each curb-mounted fixture.
 const pathCenter=f.point.map((v,i)=>v+(f.curbNormal??f.normal)[i]*((f.category==='tree'?.1:f.depth/2)+.65)),path=footprint(pathCenter,f.category==='tree'?1.2:Math.max(f.width,1.2),1.2,Math.atan2((f.curbNormal??f.normal)[0],(f.curbNormal??f.normal)[1]));
 if(!path.outer.every(p=>contains(ctx.ground.sidewalks,p))||ctx.solids.query(bounds(path.outer)).some(({value:s})=>s.bottom<2.2&&intersects(path,multi(s.polygon))))issues.push('walkway-width');
 if(f.category==='signal'&&(!f.signal||Math.abs(f.normal[0]*f.signal.travel[0]+f.normal[1]*f.signal.travel[1]+1)>.001))issues.push('signal-direction');
 return [...new Set(issues)];
}
export function cablePoints(a,b,segments){return Array.from({length:segments+1},(_,i)=>{const t=i/segments;return [a.point[0]*(1-t)+b.point[0]*t,a.top-.1+(b.top-a.top)*t-.3*4*t*(1-t),a.point[1]*(1-t)+b.point[1]*t];});}
export function cableIssues(c,ctx,fixtures){const a=fixtures.find(f=>f.id===c.from),b=fixtures.find(f=>f.id===c.to);if(!a||!b||a.category!=='pole'||b.category!=='pole')return ['cable-anchor'];if(c.points.flat().some(v=>!Number.isFinite(v)))return ['cable-finite'];if(distance([c.points[0][0],c.points[0][2]],a.point)>.001||distance([c.points.at(-1)[0],c.points.at(-1)[2]],b.point)>.001||Math.abs(c.points[0][1]-(a.top-.1))>.001||Math.abs(c.points.at(-1)[1]-(b.top-.1))>.001)return ['cable-endpoint'];
 for(let i=1;i<c.points.length;i++){const p=c.points[i-1],q=c.points[i],shape=buffer([[p[0],p[2]],[q[0],q[2]]],.08),bb=bounds(shape.flat(2));if(Math.hypot(...p.map((v,j)=>v-q[j]))>12||Math.min(p[1],q[1])<6)return ['cable-spike'];if(fixtures.some(f=>f.id!==c.from&&f.id!==c.to&&f.top>Math.min(p[1],q[1])&&intersects(f.polygon,shape)))return ['cable-fixture'];if(ctx.solids.query(bb).some(({value:s})=>Math.min(p[1],q[1])<s.top&&Math.max(p[1],q[1])>s.bottom&&area(intersection(shape,multi(s.polygon)))>.0001))return ['cable-solid'];if(stationExcluded([p[0],p[2]])||stationExcluded([q[0],q[2]]))return ['cable-station'];}return [];
}
export function auditStreetscape(model){const context={...model.context,occupied:new SpatialIndex(8)},findings=[];for(const f of model.fixtures){const issues=fixtureIssues(f,context);if(issues.length)findings.push({id:f.id,issues});context.occupied.insert(f.id,bounds(f.polygon.outer),f);}for(const c of model.cables){const issues=cableIssues(c,context,model.fixtures);if(issues.length)findings.push({id:c.id,issues});}return {major:findings.length,minor:0,minorCategories:{},findings};}
export function* buildStreetscapeModelSteps(data,{tier='medium',ground=buildGroundModel(data),generic=buildBuildingModel(data),core=buildStationModel(data,{ground,generic}),signs=buildSignModel(data,{tier:'high',ground,generic,core})}={}){let chunk=0;
 const start=performance.now(),quality=QUALITY[tier];if(!quality)throw Error('Unknown streetscape tier');const ctx=contextFor(data,ground,generic,core,signs),fixtures=[],cables=[],rejected=[],anchors=[];
 for(const [route,ring] of ground.boundaries.entries()){yield;const total=length(ring);for(let d=3;d<total-2;d+=5){if(++chunk%50===0)yield;const s=sample(ring,d),n=[-s.tangent[1],s.tangent[0]];if(!contains(ground.sidewalks,s.point.map((v,i)=>v+n[i]*.55)))n.forEach((v,i)=>n[i]=-v);const point=s.point.map((v,i)=>v+n[i]*.65);if(!contains(ground.flatSidewalk,point))continue;anchors.push({point,normal:n,route,sourceId:'ground-boundary:'+route,sourcePoint:s.point,key:route+':'+Math.round(d)});}}
 const submit=f=>{const issues=fixtureIssues(f,ctx);if(issues.length){rejected.push({id:f.id,category:f.category,point:f.point,issues});return false;}fixtures.push(f);ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);return true;};
 // Snap mapped signal structures beside their road; never invent road-centre poles.
 for(const source of data.signals){if(++chunk%25===0)yield;if(source.point.some(v=>Math.abs(v)>248)||stationExcluded(source.point))continue;const nearby=anchors.filter(a=>distance(a.point,source.point)<18).sort((a,b)=>distance(a.point,source.point)-distance(b.point,source.point));const near=nearest(source.point,ctx.roads);if(!near.tangent)continue;const direction=source.tags['traffic_signals:direction']==='backward'?-1:1,travel=near.tangent.map(v=>v*direction),normal=travel.map(v=>-v);for(const a of nearby.slice(0,12)){const f=fixtureAt('signal',{...a,normal,sourceId:source.id,sourcePoint:source.point},source.id+':structure',{signal:{signalId:source.id,intersectionGroup:Math.round(source.point[0]/30)+':'+Math.round(source.point[1]/30),travel,class:source.tags.crossing?'pedestrian':'vehicle',stateHook:'unbound-static',directionSource:source.tags['traffic_signals:direction']?'OSM':'nearest-road-forward-assumption'},curbNormal:a.normal});if(submit(f))break;}}
 // OSM trees take priority. Position adjustments are limited to 3.5m and recorded.
 if(tier!=='low')for(const source of data.trees){if(++chunk%50===0)yield;if(source.point.some(v=>Math.abs(v)>248))continue;if(seededRandom(source.id)()>quality.density)continue;const nearby=anchors.filter(a=>distance(a.point,source.point)<3).sort((a,b)=>distance(a.point,source.point)-distance(b.point,source.point));for(const a of nearby){if(submit(fixtureAt('tree',{...a,point:a.point.map((v,i)=>v+a.normal[i]*.5),sourceId:source.id,sourcePoint:source.point},source.id+':tree')))break;}}
 for(const a of anchors){if(++chunk%50===0)yield;const region=regionAt(a.point),rng=seededRandom('s8:'+a.key),r=rng();if(r>quality.density*REGIONS[region].density*.7)continue;let category=chooseCategory(region,rng());if(tier==='low'&&!['light','rail','bollard'].includes(category))continue;const d=DEFINITIONS[category],point=a.point.map((v,i)=>v+a.normal[i]*Math.max(0,d.depth/2-(category==='tree'?.45:.18)));submit(fixtureAt(category,{...a,point},'s8:'+a.key+':'+category));}
 if(quality.cables){const poles=fixtures.filter(f=>f.category==='pole');const linked=new Set();for(const a of poles){const b=poles.filter(b=>b.id!==a.id&&b.route===a.route&&distance(a.point,b.point)>5&&distance(a.point,b.point)<36).sort((b,c)=>distance(a.point,b.point)-distance(a.point,c.point))[0];if(!b)continue;const key=[a.id,b.id].sort().join('|');if(linked.has(key))continue;const c={id:'cable:'+key,from:a.id,to:b.id,region:a.region,points:cablePoints(a,b,quality.segments)};const issues=cableIssues(c,ctx,fixtures);if(issues.length)rejected.push({id:c.id,category:'cable',point:a.point,issues});else{cables.push(c);linked.add(key);}}}
 const model={tier,fixtures,cables,rejected,anchors,context:ctx,exclusion:STATION_EXCLUSION};model.audit=auditStreetscape(model);const counts=k=>Object.fromEntries([...new Set(fixtures.map(f=>f[k]))].map(v=>[v,fixtures.filter(f=>f[k]===v).length]));model.stats={fixtureCount:fixtures.length,categories:counts('category'),regions:counts('region'),cableRuns:cables.length,cableSegments:cables.reduce((s,c)=>s+c.points.length-1,0),osmTrees:fixtures.filter(f=>f.category==='tree'&&f.sourceId.startsWith('node/')).length,rejected:rejected.length,major:model.audit.major,minor:model.audit.minor,generationMs:Math.round(performance.now()-start)};return model;
}

export function buildStreetscapeModel(...args){return finishSteps(buildStreetscapeModelSteps(...args));}
