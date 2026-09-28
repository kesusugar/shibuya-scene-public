import {finishStepsAsync} from '../quality/runtime.mjs';
import {Group,Mesh,MeshStandardMaterial,PlaneGeometry,BoxGeometry,CylinderGeometry,BufferGeometry,Float32BufferAttribute,Color,HemisphereLight,Box3,CanvasTexture,SRGBColorSpace} from 'three';
import {extrude,polygonGeometry,colorize,merge,InstancedBuilder,triangleCount} from '../geo/geometry.mjs';
import {distance,seededRandom} from '../geo/core.mjs';
import {inspectGeometry} from '../ground/render.mjs';
import {BUILDINGS as C,ARCHETYPE_COLORS} from './config.mjs';
import {buildBuildingModel,buildBuildingModelSteps} from './model.mjs';
import {buildHighBuildingDetails} from './high-detail.mjs';
function sides(g){const group=g.groups.find(g=>g.materialIndex===1);if(!group)throw Error('Missing extrusion side group');const result=new BufferGeometry();for(const name of ['position','normal']){const a=g.getAttribute(name);result.setAttribute(name,new Float32BufferAttribute(a.array.slice(group.start*3,(group.start+group.count)*3),3));}return result;}
function shopTexture(){if(typeof document==='undefined')return null;const canvas=document.createElement('canvas');canvas.width=384;canvas.height=512;const ctx=canvas.getContext('2d');if(!ctx)return null;const glow=ctx.createLinearGradient(0,0,0,512);glow.addColorStop(0,'#3b261b');glow.addColorStop(.18,'#ffd591');glow.addColorStop(.72,'#9e6338');glow.addColorStop(1,'#21150f');ctx.fillStyle=glow;ctx.fillRect(0,0,384,512);ctx.fillStyle='#151a20';ctx.fillRect(0,0,384,54);ctx.fillStyle='#ffe9be';ctx.fillRect(24,20,336,10);for(let shelf=0;shelf<5;shelf++){const y=118+shelf*68;ctx.fillStyle='#4a2f20';ctx.fillRect(18,y,348,12);for(let item=0;item<12;item++){ctx.fillStyle=['#efc274','#c5684f','#6c9386','#7a83a4','#deb985'][(shelf+item)%5];ctx.fillRect(27+item*28,y-34,17,34);}}ctx.fillStyle='#14181d';ctx.fillRect(182,54,18,458);ctx.fillStyle='#d8edf028';ctx.fillRect(30,62,52,420);const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;return texture;}
export function buildBuildings(data,options={}){
 const start=performance.now(),model=options.model??buildBuildingModel(data),root=new Group();root.name='s3-generic-buildings';
 const retailMap=shopTexture(),materials={wall:new MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.02,envMapIntensity:.45}),roof:new MeshStandardMaterial({vertexColors:true,roughness:.96}),glass:new MeshStandardMaterial({color:0xffffff,roughness:.24,metalness:.55,envMapIntensity:1.3,emissive:0x000000}),glassTower:new MeshStandardMaterial({color:0xffffff,roughness:.22,metalness:.65,envMapIntensity:1.35,emissive:0x000000}),shop:new MeshStandardMaterial({color:0xffffff,map:retailMap,emissiveMap:retailMap,emissive:0x5a321b,emissiveIntensity:.16,roughness:.20,metalness:.45,envMapIntensity:1.35}),trim:new MeshStandardMaterial({color:0xffffff,roughness:.38,metalness:.7,envMapIntensity:1}),metal:new MeshStandardMaterial({color:0xffffff,roughness:.72,metalness:.2})};
 const plane=new PlaneGeometry(1,1),box=new BoxGeometry(1,1,1),cylinder=new CylinderGeometry(.5,.5,1,8);
 const definitions={windows:[plane,'glass'],curtainWindows:[plane,'glassTower'],shopWindows:[plane,'shop'],trim:[box,'trim'],rooftopBoxes:[box,'metal'],rooftopCylinders:[cylinder,'metal']};
 const records=Object.fromEntries(Object.keys(definitions).map(k=>[k,[]])),walls=[],roofs=[],wallWindows=[];
 let balconies=0;
 const add=(bucket,b,p,scale,yaw,color,role)=>{if(Math.abs(p[0])+Math.max(scale[0],scale[2])/2>C.limit+.9||Math.abs(p[2])+Math.max(scale[0],scale[2])/2>C.limit+.9)return;records[bucket].push({building:b.key,position:p,scale,yaw,color,role});};
 for(const b of model.buildings){
  const rng=seededRandom(b.key+':facade'),tint=new Color(ARCHETYPE_COLORS[b.archetype]).multiplyScalar(.9+rng()*.18),top=b.height+C.base;
  const body=extrude(b.polygon,top-b.base,b.base),wall=sides(body);body.dispose();walls.push(colorize(wall,tint));roofs.push(colorize(polygonGeometry(b.polygon,top),new Color(0x686b69).multiplyScalar(.85+rng()*.3)));
  let windowCount=0;
  for(let edge=0;edge<b.polygon.outer.length;edge++){
   const a=b.polygon.outer[edge],end=b.polygon.outer[(edge+1)%b.polygon.outer.length],l=distance(a,end);if(l<1.6)continue;
   const t=[(end[0]-a[0])/l,(end[1]-a[1])/l],n=[t[1],-t[0]],yaw=Math.atan2(n[0],n[1]),mid=a.map((v,i)=>(v+end[i])/2);
   const front=distance(a,b.frontage.a)<.01&&distance(end,b.frontage.b)<.01;
   const point=(along,y,out=C.windowOffset)=>[a[0]+t[0]*along+n[0]*out,y,a[1]+t[1]*along+n[1]*out];
   const floorCount=Math.max(1,Math.floor((top-b.base)/C.floorHeight));
   for(let floor=0;floor<floorCount;floor++){
    const y=b.base+(floor+.53)*C.floorHeight;if(y+1.3>top)continue;
    const isShop=front&&floor<4&&b.archetype!=='balcony'&&b.frontage.distance<18&&Math.hypot(...b.centroid)<180;
    const strip=b.archetype==='band',curtain=b.archetype==='curtain';
    const pitch=b.archetype==='zakkyo'?2.1:curtain?2.5:C.windowPitch;
    const cols=strip?1:Math.max(1,Math.floor((l-.8)/pitch));
    for(let col=0;col<cols&&windowCount<C.maxWindowsPerBuilding;col++){
     // Plain facades have fewer openings; all decisions are stable per OSM ID.
     if(b.archetype==='plain'&&!(isShop&&floor===0)&&rng()<.25)continue;
     const along=(col+.5)*l/cols,width=strip?Math.max(.5,l-.9):isShop&&(floor===0||Math.hypot(...b.centroid)<90)?Math.max(.3,l/cols-.12):Math.min(l/cols-.45,isShop?2.4:curtain?2.1:b.archetype==='zakkyo'?1.05:1.45),height=isShop?(floor===0?2.8:2.5):curtain?2.8:b.archetype==='zakkyo'?2.2:1.6;
     if(width<=.2)continue;const bucket=isShop?'shopWindows':curtain?'curtainWindows':'windows';const colors=curtain?[0x607f90,0x7897a4,0x455e70]:isShop?[0x8daba8,0xa5b6a3,0x8aa4b2]:[0x3e5666,0x68818a,0x849295];const color=colors[Math.floor(rng()*colors.length)];const p=point(along,y);
     add(bucket,b,p,[width,height,1],yaw,color,'window');wallWindows.push({building:b.key,edge,along,position:p,width,height,normal:n,offset:C.windowOffset});windowCount++;
    }
    if((['band','grid','curtain','shop'].includes(b.archetype)||(front&&Math.hypot(...b.centroid)<120))&&(floor>0||isShop))add('trim',b,point(l/2,b.base+floor*C.floorHeight+.065,.065),[Math.max(.2,l-.2),.13,.13],yaw,0xb8b8b1,'floor-band');
    if(b.archetype==='balcony'&&front&&floor>0&&l>3){const w=Math.min(l-.8,10),py=b.base+floor*C.floorHeight;add('trim',b,point(l/2,py,.3),[w,.16,.65],yaw,0xbcb8ac,'balcony-slab');add('trim',b,point(l/2,py+.85,.62),[w,.08,.07],yaw,0x7d8383,'balcony-rail');for(const along of [l/2-w/2,l/2+w/2])add('trim',b,point(along,py+.45,.62),[.07,.8,.07],yaw,0x7d8383,'balcony-post');balconies++;}
   }
   if(front&&b.archetype!=='balcony'&&b.frontage.distance<18&&Math.hypot(...b.centroid)<180&&l>3){const w=Math.min(l-.8,8);add('trim',b,point(l/2,b.base+3.05,.2),[w,.12,.4],yaw,[0x46675e,0x756559,0x4e657b][b.key.length%3],'store-awning');for(const along of [l/2-w/2,l/2,l/2+w/2])add('trim',b,point(along,b.base+1.5,.065),[.08,2.7,.08],yaw,0xc5c6b8,'store-divider');}
   if(b.archetype==='grid'||b.archetype==='curtain'||(front&&Math.hypot(...b.centroid)<120&&l>12))for(let along=3;along<l-1;along+=C.windowPitch*2)add('trim',b,point(along,(top+b.base)/2,.06),[.085,top-b.base,.1],yaw,0x8c999d,'mullion');
  }
  for(const p of b.rooftop){const isRound=['tank','mast'].includes(p.type);add(isRound?'rooftopCylinders':'rooftopBoxes',b,[p.center[0],top+p.height/2,p.center[1]],[p.width,p.height,p.depth],0,p.type==='hut'?0x92958e:p.type==='mast'?0x626969:0xa4aaa6,p.type);}
 }
 const checks={},batches={},builders=[];
 for(const [name,list] of [['wall',walls],['roof',roofs]])if(list.length){const g=merge(list);list.forEach(g=>g.dispose());const mesh=new Mesh(g,materials[name]);mesh.name='buildings-'+name;root.add(mesh);checks[name]=inspectGeometry(g);batches[name]={triangles:triangleCount(g),instances:1};}
 for(const [name,list] of Object.entries(records)){if(!list.length)continue;const [g,material]=definitions[name],builder=new InstancedBuilder(g,materials[material],list.length);for(const r of list)builder.add(...r.position,r.yaw,r.scale,r.color);const mesh=builder.build();mesh.name='buildings-'+name;root.add(mesh);builders.push(builder);checks[name]=inspectGeometry(g);batches[name]={triangles:triangleCount(g)*list.length,instances:list.length};}
 // Allows Buildings-only inspection; Ground already supplies its own daylight when enabled.
 const inspectionLight=new HemisphereLight(0xe8efff,0x72706b,1.2);inspectionLight.name='buildings-inspection-light';root.add(inspectionLight);
 const counts=Object.fromEntries(Object.entries(records).map(([k,v])=>[k,v.length]));const drawCalls=Object.keys(batches).length;
 const extent=new Box3().setFromObject(root);const buildingBounds={minX:extent.min.x,maxX:extent.max.x,minY:extent.min.y,maxY:extent.max.y,minZ:extent.min.z,maxZ:extent.max.z};const instanceMatrixNonFinite=root.children.filter(o=>o.isInstancedMesh).reduce((s,o)=>s+o.instanceMatrix.array.reduce((n,v)=>n+(!Number.isFinite(v)?1:0),0),0);
 const base={windowInstances:counts.windows+counts.curtainWindows+counts.shopWindows,rooftopInstances:counts.rooftopBoxes+counts.rooftopCylinders,detailInstances:counts.trim,buildingTriangles:Object.values(batches).reduce((s,b)=>s+b.triangles,0),materialChannels:Object.keys(materials).length,instancedBatches:builders.length,approximateDrawCalls:drawCalls,geometries:new Set(root.children.filter(o=>o.isMesh).map(o=>o.geometry)).size};
 const stats={...model.stats,buildingBounds,instanceMatrixNonFinite,...base,balconyCount:balconies,mergedBatches:root.children.filter(o=>o.isMesh&&!o.isInstancedMesh).length,textures:0,checks,batches,tier:options.tier??'medium',highDetail:null,buildTimeMs:Math.round(performance.now()-start)};let highDetail=null;
 const setTier=t=>{if(!['high','medium','low'].includes(t))throw Error('Invalid building tier');if(t==='high'&&!highDetail){highDetail=buildHighBuildingDetails(model);root.add(highDetail.root);}if(highDetail)highDetail.root.visible=t==='high';stats.tier=t;const h=t==='high'?highDetail?.stats:null;Object.assign(stats,{rooftopInstances:base.rooftopInstances+(h?.rooftopInstances??0),detailInstances:base.detailInstances+(h?.wallInstances??0),buildingTriangles:base.buildingTriangles+(h?.triangles??0),materialChannels:base.materialChannels+(h?.materials??0),instancedBatches:base.instancedBatches+(h?.drawCalls??0),approximateDrawCalls:base.approximateDrawCalls+(h?.drawCalls??0),geometries:base.geometries+(h?.geometries??0),textures:h?.textures??0,highDetail:h});};setTier(stats.tier);
 root.updateMatrixWorld(true);
 return {root,model,stats,records,windows:wallWindows,setTier,dispose(){root.removeFromParent();highDetail?.dispose();builders.forEach(b=>b.dispose());for(const child of [...root.children]){if(child.isMesh&&!child.isInstancedMesh)child.geometry.dispose();root.remove(child);}plane.dispose();box.dispose();cylinder.dispose();Object.values(materials).forEach(m=>m.dispose());retailMap?.dispose();}};
}

export async function buildBuildingsAsync(data,options={}){const timing=options.stageTiming,model=options.model??await finishStepsAsync(buildBuildingModelSteps(data,options),undefined,timing);const started=timing&&performance.now(),result=buildBuildings(data,{...options,model});if(timing)timing.computeMs=(timing.computeMs??0)+(performance.now()-started);return result;}
