import {finishSteps} from '../quality/runtime.mjs';
import {bounds,seededRandom,SpatialIndex,inPolygon} from '../geo/core.mjs';
import {buildBuildingModel,multi} from '../buildings/model.mjs';
import {buildGroundModel,area,intersection,nearest} from '../ground/model.mjs';
import {edges,prepareHero} from '../heroes/model.mjs';
import {BUILDERS} from '../heroes/builders.mjs';
import {HERO_DEFINITIONS} from '../heroes/config.mjs';
import {buildStationModel} from '../station/model.mjs';
import {QUALITY,REGIONS,regionAt,HERO_SIGNS,CATEGORIES} from './config.mjs';

export function signPolygon(s){const n=s.normal,t=[n[2],-n[0]],p=s.position,d=s.depth/2,w=s.width/2;return {outer:[[-w,-d],[w,-d],[w,d],[-w,d]].map(([x,z])=>[p[0]+t[0]*x+n[0]*z,p[2]+t[1]*x+n[2]*z]),holes:[]};}
export function makePlacement(host,e,{id,category='flush',along=e.length/2,y,width,height,region,hero=null,anchorId=null,offset=.16,variant=0,screenUV=null,brandArt=null}){
 const blade=category==='blade',depth=blade?.12:category==='box'?.16:.055;
 const facadeNormal=[e.normal[0],0,e.normal[1]],normal=blade?[e.tangent[0],0,e.tangent[1]]:facadeNormal;
 const projection=blade?width/2+.16:offset,point=[e.a[0]+e.tangent[0]*along,y,e.a[1]+e.tangent[1]*along];
 const position=[point[0]+facadeNormal[0]*projection,y,point[2]+facadeNormal[2]*projection];
 return {id,buildingId:host.id,hostKey:host.key,hostMass:host.label,category,region,hero,anchorId,brandArt,position,normal,facadeNormal,width,height,depth,along,edge:e,hostBottom:host.bottom,hostTop:host.top,hostPolygon:host.polygon,heading:Math.atan2(normal[0],normal[2]),variant,screenUV,projection,priority:hero?3:1,zone:category==='rooftop'?'roofline-mounted':y<4?'ground-floor':'upper-floor',emissive:{class:category==='screen'?'screen':'commercial',day:category==='screen'?.65:.12,nightTarget:1.2,glowAnchor:position},visibilityWeight:REGIONS[region].density};
}
// The road surface is one polygon with a 1370-vertex outer ring spanning the whole scene,
// so clipping a 2 m sign against it costs about 6 ms — 115 ms for one pass of reference
// advertisements, and minutes across the thousands of audits a bake performs. Cutting it
// into cells once turns that into a lookup: a sign touches one or two of them. Splitting on
// a grid partitions the area, so summing the pieces gives the same number as clipping the
// whole thing, which is why the threshold below can stay where it was. Verified identical
// across all 761 signs the scene places.
export const ROAD_CELL=25,ROAD_EXTENT=252;
export function tileRoads(roads,cell=ROAD_CELL,extent=ROAD_EXTENT){
 const index=new SpatialIndex(cell);let serial=0;
 for(let x=-extent;x<extent;x+=cell)for(let z=-extent;z<extent;z+=cell){
  const piece=intersection(roads,[[[[x,z],[x+cell,z],[x+cell,z+cell],[x,z+cell],[x,z]]]]);
  if(piece.length)index.insert(serial++,{minX:x,maxX:x+cell,minZ:z,maxZ:z+cell},piece);
 }
 return index;
}
// `facade-distance` already confines a flush mount to .3 m of its wall, so everything inside
// that band is facade rather than an obstruction over the street. That distinction matters
// because the road surface is a centreline buffer with a guessed width: on a narrow back
// street the guess is wider than the carriageway, so the polygon swallows the pavement and
// the wall itself, and a panel 3.5 cm off that wall read as hanging over traffic. Clipping
// the footprint to the part beyond the facade band asks what the rule is named for -- does
// this sign reach out over open roadway -- and leaves blades, which reach up to 1.1 m,
// measured exactly as before.
export const FACADE_BAND=.3;
/** Convex clip of a footprint ring to the half-plane at least `band` out from its wall. */
export function beyondFacade(s,ring,band=FACADE_BAND){
 const n=[s.facadeNormal[0],s.facadeNormal[2]];
 const o=[s.edge.a[0]+s.edge.tangent[0]*s.along+n[0]*band,s.edge.a[1]+s.edge.tangent[1]*s.along+n[1]*band];
 const side=p=>(p[0]-o[0])*n[0]+(p[1]-o[1])*n[1],out=[];
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],da=side(a),db=side(b);
  if(da>=0)out.push(a);
  if((da>=0)!==(db>=0)){const t=da/(da-db);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 }
 return out;
}
/** Road area under a sign footprint, summed over the cells it touches. */
export function roadAreaUnder(ctx,polygon,box){
 const p=multi(polygon);
 if(!ctx.roadTiles)return area(intersection(p,ctx.ground.roads));
 let total=0;for(const {value:tile} of ctx.roadTiles.query(box))total+=area(intersection(p,tile));
 return total;
}
export function createAuditContext(data,generic,heroes,ground,core){const solids=new SpatialIndex(25),crossings=new SpatialIndex(20);let serial=0;for(const b of generic.buildings)solids.insert(serial++,b.bounds,{id:b.id,polygon:b.polygon,bottom:b.base,top:b.base+b.height});for(const h of heroes)for(const m of h.masses)solids.insert(serial++,bounds(m.polygon.outer),{...m,id:h.id});for(const m of core.masses)solids.insert(serial++,bounds(m.polygon.outer),{...m,id:'station:'+m.owner});for(const c of ground.crossings)for(const s of c.stripes)crossings.insert(serial++,bounds(s.polygon.flat(2)),s.polygon);return {solids,crossings,roadTiles:tileRoads(ground.roads),ground};}
export function placementIssues(s,ctx,accepted=[]){const issues=[],values=[...s.position,...s.normal,...s.facadeNormal,s.width,s.height,s.depth,s.along,s.hostBottom,s.hostTop];if(!values.every(Number.isFinite)||Math.min(s.width,s.height,s.depth)<=0)return ['invalid-transform'];const bottom=s.position[1]-s.height/2,top=s.position[1]+s.height/2;
 if(Math.abs(Math.hypot(...s.normal)-1)>1e-6)issues.push('invalid-normal');
 if(bottom<Math.max(1.5,s.hostBottom+.08)||top>s.hostTop-.03)issues.push('vertical-host-bounds');
 const half=s.category==='blade'?s.depth/2:s.width/2;if(s.along-half<.12||s.along+half>s.edge.length-.12)issues.push('corner-overrun');
 const base=[s.edge.a[0]+s.edge.tangent[0]*s.along,s.edge.a[1]+s.edge.tangent[1]*s.along],delta=[s.position[0]-base[0],s.position[2]-base[1]],dist=delta[0]*s.facadeNormal[0]+delta[1]*s.facadeNormal[2];
 if(Math.abs(dist-s.projection)>1e-5||dist>(s.category==='blade'?1.1:.3)||dist<.04)issues.push('facade-distance');
 if(inPolygon([base[0]+s.facadeNormal[0]*.02,base[1]+s.facadeNormal[2]*.02],s.hostPolygon,false)||!inPolygon([base[0]-s.facadeNormal[0]*.02,base[1]-s.facadeNormal[2]*.02],s.hostPolygon))issues.push('backface');
 if(s.category!=='blade'&&s.normal.reduce((sum,v,i)=>sum+v*s.facadeNormal[i],0)<.999)issues.push('backface');
 const p=signPolygon(s),box=bounds(p.outer);if(p.outer.some(p=>Math.abs(p[0])>250||Math.abs(p[1])>250))issues.push('tile-edge');
 const overhang=beyondFacade(s,p.outer);if(overhang.length>2&&roadAreaUnder(ctx,{outer:overhang,holes:[]},bounds(overhang))>.001)issues.push('road-projection');
 if(ctx.crossings.query(box).some(({value:stripe})=>area(intersection(multi(p),stripe))>.001))issues.push('crosswalk-projection');
 for(const {value:b} of ctx.solids.query(box)){if(top<=b.bottom||bottom>=b.top)continue;if(area(intersection(multi(p),multi(b.polygon)))>.001){issues.push(b.id===s.buildingId?'host-penetration':'neighbor-penetration');break;}}
 // Conservative station/rail envelope: station front commercial signs stay outside S5 rail corridors.
 if(ctx.railLines&&bottom<23&&top>5&&ctx.railLines.some(line=>nearest([s.position[0],s.position[2]],[line]).distance<3))issues.push('rail-clearance');
 for(const a of accepted){if(Math.min(top,a.position[1]+a.height/2)-Math.max(bottom,a.position[1]-a.height/2)<=.08)continue;const separation=Math.hypot(s.position[0]-a.position[0],s.position[2]-a.position[2]);if(separation>(s.width+a.width)/2+s.depth+a.depth+1)continue;if(separation<.3||area(intersection(multi(p),multi(signPolygon(a))))>.001){issues.push('duplicate-overlap');break;}if(s.hostKey===a.hostKey&&s.edge.index===a.edge.index&&Math.abs(s.along-a.along)<(s.width+a.width)/2+.12&&s.category!=='blade'&&a.category!=='blade'){issues.push('near-overlap');break;}}
 return [...new Set(issues)];
}
export function auditPlacements(model){const findings=[],accepted=[],hostKeys=new Set(model.hosts.map(h=>h.key));for(const s of model.signs){const issues=placementIssues(s,model.context,accepted);if(!hostKeys.has(s.hostKey))issues.push('invalid-association');if(issues.length)findings.push({id:s.id,issues,position:s.position});accepted.push(s);}return {major:findings.length,minor:0,minorCategories:{},findings};}
export function* buildSignModelSteps(data,{tier='medium',referenceMatch=false,generic=buildBuildingModel(data),ground=buildGroundModel(data),heroes,core=buildStationModel(data,{ground,generic})}={}){let chunk=0;
 const started=performance.now(),q=QUALITY[tier];if(!q)throw Error('Unknown signs tier');heroes??=HERO_DEFINITIONS.map(d=>{const h=prepareHero(data,d);BUILDERS[d.builder](h);return h;});
 const context=createAuditContext(data,generic,heroes,ground,core);context.railLines=core.alignments.map(r=>r.points);
 const signs=[],rejected=[],hosts=[],candidates=[];
 const submit=s=>{s.variant=CATEGORIES.indexOf(s.category)+8*(s.variant%4);candidates.push(s);const issues=placementIssues(s,context,signs);if(issues.length)rejected.push({id:s.id,position:s.position,normal:s.normal,width:s.width,height:s.height,heading:s.heading,region:s.region,hero:s.hero,issues});else signs.push(s);};
 for(const b of generic.buildings){if(++chunk%25===0)yield;const region=regionAt(b.centroid),density=Math.min(1,REGIONS[region].density*(referenceMatch?(['frontage','scramble','centerGai'].includes(region)?1.2:region==='secondary'?.75:1):1))*q.factor;if(b.archetype==='balcony'&&region==='peripheral')continue;
  const host={id:b.id,key:b.key,label:'generic-facade',polygon:b.polygon,bottom:b.base,top:b.base+b.height};hosts.push(host);const rng=seededRandom(b.key+':s7');const e={...b.frontage,tangent:[(b.frontage.b[0]-b.frontage.a[0])/b.frontage.length,(b.frontage.b[1]-b.frontage.a[1])/b.frontage.length],index:0};if(e.length<2||e.distance>25)continue;
  const central=referenceMatch&&['frontage','scramble','centerGai'].includes(region)&&Math.hypot(...b.centroid)<120;const slot=Math.max(1,Math.floor((e.length-.5)/(central?4:5)));const rows=Math.min(central?8:region==='centerGai'?4:3,Math.floor((b.height-1.5)/3.5));
  for(let row=0;row<rows;row++)for(let col=0;col<slot;col++){const roll=rng(),kindRoll=rng(),variant=Math.floor(rng()*32);if(roll>density)continue;const w=Math.min(5,e.length/slot-.45),height=row===0?(central?1.8:1):central?2.65:1.55,y=b.base+2.5+row*3.5;let category=row===0?(col%2?'entrance':'box'):kindRoll<.35?'directory':kindRoll<.65?'flush':kindRoll<.85?'billboard':'screen';submit(makePlacement(host,e,{id:b.key+':'+row+':'+col,category,along:(col+.5)*e.length/slot,y,width:category==='directory'?Math.min(w,1):w,height:category==='directory'?2.6:height,region,variant}));}
  const bladeRoll=rng();if(bladeRoll<density&&region!=='peripheral'&&b.height>11&&e.length>3)submit(makePlacement(host,e,{id:b.key+':blade',category:'blade',along:.4,y:b.base+8,width:1.25,height:3.8,region,variant:2}));
  if(rng()<density*.4&&b.height>16&&e.length>4)submit(makePlacement(host,e,{id:b.key+':roofline',category:'rooftop',y:host.top-1.15,width:Math.min(5,e.length-.5),height:1.9,region,variant:3}));
 }
 for(const h of heroes){const config=HERO_SIGNS[h.key],region=['qfront','magnet','seibuA','seibuB'].includes(h.key)?'frontage':h.key==='109'?'dogenzaka':'station';const heroHosts=h.masses.map((m,i)=>({id:h.id,key:h.key+':mass:'+i,...m}));hosts.push(...heroHosts);
  const sourceAnchors=h.anchors.filter(a=>!['entranceRecess','emissiveFacade'].includes(a.category)&&a.worldPosition[1]<config.upper+.2);let used=0;const screenAnchors=sourceAnchors.filter(a=>a.category==='largeScreen'),screenTotal=screenAnchors.reduce((n,a)=>n+a.width,0);let screenAlong=0;
  for(const a of sourceAnchors){if(used>=config.limit)break;const available=heroHosts.filter(m=>a.worldPosition[1]-a.height/2>m.bottom&&a.worldPosition[1]+a.height/2<m.top);const candidates=available.flatMap(host=>edges(host.polygon).map(e=>({host,e,d:nearest([a.worldPosition[0],a.worldPosition[2]],[[e.a,e.b]]).distance}))).filter(x=>x.e.normal[0]*a.normal[0]+x.e.normal[1]*a.normal[2]>.8).sort((a,b)=>a.d-b.d);const found=candidates[0];if(!found)continue;const {host,e}=found,screen=a.category==='largeScreen',category=screen?'screen':a.category==='rooftopSign'?'rooftop':'billboard';const uv=screen?[1-(screenAlong+a.width)/screenTotal,1-screenAlong/screenTotal]:null;if(screen)screenAlong+=a.width;
   const height=Math.min(a.height,host.top-host.bottom-.25),y=Math.max(host.bottom+height/2+.1,Math.min(host.top-height/2-.1,config.upper-height/2-.05,a.worldPosition[1]));submit(makePlacement(host,e,{id:a.id+':s7',anchorId:a.id,hero:h.key,category,y,width:Math.min(a.width,e.length-.3),height,offset:Math.max(.17,a.offset+.08),region,variant:h.key==='109'?1:4,screenUV:uv,brandArt:a.art??null}));used++;
  }
  const host=heroHosts[0],facades=edges(host.polygon).filter(e=>e.normal[0]*h.primaryFacade.normal[0]+e.normal[1]*h.primaryFacade.normal[1]>.5&&e.length>3).sort((a,b)=>b.length-a.length);
  for(const [i,e] of facades.slice(0,h.key==='qfront'?0:Math.max(1,config.limit-used)).entries())submit(makePlacement(host,e,{id:h.key+':lower:'+i,hero:h.key,category:'box',y:host.bottom+Math.min(4.8,(host.top-host.bottom)/2),width:Math.min(e.length-.5,h.key==='109'?5:12),height:1,region,variant:h.key==='109'?11:h.key.startsWith('seibu')?9:1}));
 }
 const model={signs,rejected,hosts,context,tier,genericCount:generic.buildings.length,heroCount:heroes.length,candidateCount:candidates.length};model.audit=auditPlacements(model);const countBy=k=>Object.fromEntries([...new Set(signs.map(s=>s[k]??'generic'))].map(v=>[v,signs.filter(s=>(s[k]??'generic')===v).length]));model.stats={signCount:signs.length,categories:countBy('category'),regions:countBy('region'),heroes:countBy('hero'),centerGai:signs.filter(s=>s.region==='centerGai').length,rejected:rejected.length,candidates:candidates.length,majorPenetration:model.audit.major,minorOverlap:model.audit.minor,minorCategories:model.audit.minorCategories,generationMs:Math.round(performance.now()-started)};return model;
}

export function buildSignModel(...args){return finishSteps(buildSignModelSteps(...args));}
