import {Group,Mesh,MeshStandardMaterial,PlaneGeometry,BoxGeometry,BufferGeometry,Float32BufferAttribute,Box3,HemisphereLight} from 'three';
import {extrude,polygonGeometry,merge,triangleCount,InstancedBuilder} from '../geo/geometry.mjs';
import {inspectGeometry} from '../ground/render.mjs';
import {difference,polygons,union,area,intersection} from '../ground/model.mjs';
import {multi} from '../buildings/model.mjs';
import {HERO_DEFINITIONS} from './config.mjs';
import {prepareHero,auditReservations} from './model.mjs';
import {BUILDERS} from './builders.mjs';
import {createQfrontCafe} from './cafe.mjs';
import {createQfrontInterior} from './qfront-interior.mjs';
import {refineQfrontGlass} from './qfront-glass.mjs';
import {finish109} from './finish-109.mjs';
import {createCentralPolish} from './polish.mjs';
function sideGeometry(g){const group=g.groups.find(x=>x.materialIndex===1),result=new BufferGeometry();for(const name of ['position','normal'])result.setAttribute(name,new Float32BufferAttribute(g.attributes[name].array.slice(group.start*3,(group.start+group.count)*3),3));return result;}
export function buildHeroScene(data){const started=performance.now(),audit=auditReservations(data),root=new Group();root.name='s4-hero-landmarks';const heroes=[],missing=[],failures=[];
 const materials={qfrontGlass:new MeshStandardMaterial({color:0x68818e,roughness:.17,metalness:.28,envMapIntensity:1.1,transparent:true,opacity:.38,depthWrite:false}),concreteLight:new MeshStandardMaterial({color:0xd0d1c9,roughness:.55,metalness:.05,envMapIntensity:.45}),concreteDark:new MeshStandardMaterial({color:0x5a6064,roughness:.9}),glass:new MeshStandardMaterial({color:0x688595,roughness:.24,metalness:.55,envMapIntensity:1.3}),glassDark:new MeshStandardMaterial({color:0x354b59,roughness:.24,metalness:.45,envMapIntensity:1.25}),metal:new MeshStandardMaterial({color:0xa6afb5,roughness:.38,metalness:.7,envMapIntensity:1}),trim:new MeshStandardMaterial({color:0xffffff,roughness:.75}),screenPlaceholder:new MeshStandardMaterial({color:0x202c35,roughness:.78,emissive:0x000000}),roof:new MeshStandardMaterial({color:0x767d7e,roughness:.94})};
 const statics=Object.fromEntries(Object.keys(materials).map(k=>[k,[]])),panelRecords={glass:[],glassDark:[],screenPlaceholder:[]},detailRecords=[],builders=[],staticGeometries=[];const plane=new PlaneGeometry(1,1),box=new BoxGeometry(1,1);
 for(const def of HERO_DEFINITIONS){if(!data.buildings.some(s=>s.id===def.id)){missing.push(def.key);continue;}
  if(!audit.some(r=>r.id===def.id&&r.phase==='S4')){failures.push({id:def.id,reason:'source-not-reserved'});continue;}
  const h=prepareHero(data,def);BUILDERS[def.builder](h);refineQfrontGlass(h);h.triangles=0;
  for(const m of h.masses){const full=extrude(m.polygon,m.top-m.bottom,m.bottom),sides=sideGeometry(full);full.dispose();statics[m.material].push(sides);h.triangles+=triangleCount(sides);
   const above=union(...h.masses.filter(n=>n!==m&&n.bottom<=m.top+.001&&n.top>m.top+.001).map(n=>multi(n.polygon)));
   for(const p of polygons(difference(multi(m.polygon),above))){if(area(multi(p))<1e-6)continue;const g=polygonGeometry(p,m.top);statics.roof.push(g);h.triangles+=triangleCount(g);}
  }
  // Selected central concrete faces: shallow bands reuse the existing trim batch.
  if(['magnet','seibuA','seibuB'].includes(h.key))for(const m of h.masses){
   if(!m.material.startsWith('concrete'))continue;
   const ring=m.polygon.outer;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<12)continue;const nx=dz/length,nz=-dx/length,heading=Math.atan2(nx,nz);
    for(let y=m.bottom+4;y<m.top-1;y+=4){detailRecords.push({hero:h.key,position:[(a[0]+b[0])/2+nx*.09,y,(a[1]+b[1])/2+nz*.09],heading,scale:[length-.3,.16,.12],color:0x737e87,role:'calibration-band'});h.triangles+=12;}
   }
  }
  for(const p of h.panels){panelRecords[p.material].push({...p,hero:h.key});h.triangles+=2;}
  for(const d of h.details){detailRecords.push({...d,hero:h.key});h.triangles+=12;}
  h.rootWorldPosition=[h.sourceCentroid[0],h.base,h.sourceCentroid[1]];
  h.signAnchorCandidates=h.anchors.filter(a=>!['emissiveFacade','entranceRecess'].includes(a.category)).map(a=>a.id);
  h.emissiveSurfaceCandidates=h.anchors.filter(a=>['emissiveFacade','largeScreen'].includes(a.category)).map(a=>a.id);
  const screens=h.anchors.filter(a=>a.category==='largeScreen');if(screens.length){const width=screens.reduce((s,a)=>s+a.width,0),position=[0,1,2].map(i=>screens.reduce((s,a)=>s+a.worldPosition[i]*a.width/width,0));h.largeScreenAnchor={...screens[0],id:h.key+':largeScreenGroup',width,worldPosition:position,localPosition:[(position[0]-h.sourceCentroid[0])*h.axes.u[0]+(position[2]-h.sourceCentroid[1])*h.axes.u[1],position[1]-h.base,(position[0]-h.sourceCentroid[0])*h.axes.v[0]+(position[2]-h.sourceCentroid[1])*h.axes.v[1]],segments:screens.map(a=>a.id)};}
  h.windowPanelInstances=h.panels.filter(p=>p.role==='window').length;h.rooftopInstances=h.details.filter(d=>d.role==='mechanical').length;heroes.push(h);
  audit.find(r=>r.id===h.id).status='built';
 }
 const checks={},batches={};for(const [name,list] of Object.entries(statics)){if(!list.length)continue;const g=merge(list);list.forEach(g=>g.dispose());const mesh=new Mesh(g,materials[name]);mesh.name='hero-'+name;root.add(mesh);staticGeometries.push(g);checks[name]=inspectGeometry(g);batches[name]={type:'merged',triangles:triangleCount(g)};}
 for(const [name,list] of Object.entries(panelRecords)){if(!list.length)continue;const b=new InstancedBuilder(plane,materials[name],list.length);for(const p of list)b.add(...p.position,p.heading,p.scale,0xffffff);const mesh=b.build();mesh.name='hero-panels-'+name;root.add(mesh);builders.push(b);batches['panels-'+name]={type:'instanced',triangles:2*list.length,instances:list.length};}
 if(detailRecords.length){const b=new InstancedBuilder(box,materials.trim,detailRecords.length);for(const d of detailRecords)b.add(...d.position,d.heading,d.scale,d.color);const mesh=b.build();mesh.name='hero-repeated-detail';root.add(mesh);builders.push(b);batches.detail={type:'instanced',triangles:12*detailRecords.length,instances:detailRecords.length};}
 const cafes=heroes.filter(h=>h.key==='qfront').map(h=>{const cafe=createQfrontCafe(h);root.add(cafe.mesh);h.triangles+=cafe.triangles;batches.cafe={type:'merged',triangles:cafe.triangles};return cafe;});
 const interior=createQfrontInterior(heroes.find(h=>h.key==='qfront'));root.add(interior.root);
 const landmark109=finish109(heroes.find(h=>h.key==='109'));root.add(landmark109.root);
 const polish=createCentralPolish(heroes);root.add(polish.root);batches.centralPolish={type:'merged',triangles:polish.triangles,fronts:polish.fronts,drawCalls:polish.drawCalls};
 const light=new HemisphereLight(0xeaf2ff,0x686b65,1);light.name='hero-inspection-light';root.add(light);root.updateMatrixWorld(true);
 const extent=new Box3().setFromObject(root),worldBounds={minX:extent.min.x,maxX:extent.max.x,minY:extent.min.y,maxY:extent.max.y,minZ:extent.min.z,maxZ:extent.max.z};
 const stats={reservedCount:audit.length,s4TargetFootprints:HERO_DEFINITIONS.length,generatedFootprints:heroes.length,landmarkGroups:new Set(heroes.map(h=>h.builder==='markCity'?'markCity':h.key)).size,untouchedReserved:audit.filter(r=>r.status==='untouched').length,unknownReserved:audit.filter(r=>r.phase==='other').length,missing,failures,heroTriangles:heroes.reduce((s,h)=>s+h.triangles,0),materials:Object.keys(materials).length,mergedBatches:staticGeometries.length,instancedBatches:builders.length,approximateDrawCalls:Object.keys(batches).length,geometries:staticGeometries.length+(builders.length?2:0),textures:0,windowPanelInstances:heroes.reduce((s,h)=>s+h.windowPanelInstances,0),detailInstances:detailRecords.length,rooftopInstances:heroes.reduce((s,h)=>s+h.rooftopInstances,0),screenPlaceholders:new Set(heroes.flatMap(h=>h.placeholders.filter(p=>p.category==='largeScreen').map(p=>p.id))).size,placeholderSurfaces:heroes.reduce((s,h)=>s+h.placeholders.length,0),signAnchors:heroes.reduce((s,h)=>s+h.anchors.filter(a=>!['emissiveFacade','entranceRecess'].includes(a.category)).length,0),emissiveAnchors:heroes.reduce((s,h)=>s+h.anchors.filter(a=>a.category==='emissiveFacade').length,0),bounds:worldBounds,checks,batches,buildTimeMs:Math.round(performance.now()-started)};
 stats.textures=cafes.length+2;stats.materials+=cafes.length*2+4;stats.geometries+=cafes.length*2+polish.drawCalls;stats.mergedBatches+=cafes.length*2+polish.drawCalls;stats.approximateDrawCalls+=cafes.length+Math.max(0,polish.drawCalls-1);stats.heroTriangles+=polish.triangles;
 if(landmark109.root.children.length){const mesh=landmark109.root.children[0],triangles=triangleCount(mesh.geometry);stats.textures++;stats.materials++;stats.geometries++;stats.mergedBatches++;stats.approximateDrawCalls++;stats.heroTriangles+=triangles;stats.batches.finish109={type:'merged',triangles};stats.checks.finish109=inspectGeometry(mesh.geometry);}
 stats.heroTriangles+=interior.triangles;stats.materials+=interior.batches;stats.geometries+=interior.batches;stats.mergedBatches+=interior.batches;stats.approximateDrawCalls+=interior.batches;stats.batches.qfrontInterior={triangles:interior.triangles,drawCalls:interior.batches};
 return {root,heroes,audit,stats,panelRecords,detailRecords,dispose(){root.removeFromParent();interior.dispose();landmark109.dispose();polish.dispose();cafes.forEach(c=>c.dispose());builders.forEach(b=>b.dispose());staticGeometries.forEach(g=>g.dispose());plane.dispose();box.dispose();Object.values(materials).forEach(m=>m.dispose());root.clear();}};
}
