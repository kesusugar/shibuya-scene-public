import {buildSignAccents} from './accent-lights.mjs';
import {buildCenterGai} from './center-gai.mjs';
import {finishStepsAsync} from '../quality/runtime.mjs';
import {createHeroHalos} from '../fidelity/halos.mjs';
import {Group,PlaneGeometry,BoxGeometry,Mesh,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,LineSegments,LineBasicMaterial} from 'three';
import {merge,InstancedBuilder,triangleCount} from '../geo/geometry.mjs';
import {inspectGeometry} from '../ground/render.mjs';
import {createSignAtlases} from './atlas.mjs';
import {createReferenceAtlas} from './reference-art.mjs';
import {buildSignModel,buildSignModelSteps} from './model.mjs';
import {commercialLayout} from './commercial-layout.mjs';
import {applyReferenceAds, clearLineOfSight} from './reference-layer.mjs';
import {resolveFaceOverlaps} from './overlap.mjs';
import {REGIONS} from './config.mjs';

export function calibrateSign(s){if(s.hero||s.category==='rooftop'||s.category==='blade'||Math.hypot(s.position[0],s.position[2])<105)return s;const seed=[...s.id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0),wide=seed%3===0,w=wide?.94:.55+(seed%4)*.09,h=wide?.62:.82+(seed%3)*.07;return {...s,width:s.width*w,height:s.height*h,position:[s.position[0],s.position[1]+(seed%2?1:-1)*s.height*(1-h)*.25,s.position[2]]};}
export function signFace(s,entry,reverse=false){const g=new PlaneGeometry(s.width,s.height);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,entry.u0+uv.getX(i)*(entry.u1-entry.u0),entry.v0+uv.getY(i)*(entry.v1-entry.v0));const heading=s.heading+(reverse?Math.PI:0),dir=reverse?-1:1;g.rotateY(heading);g.translate(s.position[0]+s.normal[0]*(s.depth/2+.035)*dir,s.position[1],s.position[2]+s.normal[2]*(s.depth/2+.035)*dir);g.setAttribute('s13GlowWeight',new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(s.hero?1.4:s.region.toLowerCase().includes('center')?1.18:.96),1));return g;}
function debugGeometry(model){const p=[],colors=[];const line=(a,b,color)=>{p.push(...a,...b);const rgb=[(color>>16&255)/255,(color>>8&255)/255,(color&255)/255];colors.push(...rgb,...rgb);};for(const s of [...model.signs,...model.rejected]){const color=s.issues?0xff3333:s.hero?0xffff77:REGIONS[s.region].color,center=s.position,n=s.normal,t=[n[2],0,-n[0]];line(center,center.map((v,i)=>v+n[i]*2),color);line([center[0]-.12,center[1],center[2]],[center[0]+.12,center[1],center[2]],color);const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[center[0]+t[0]*s.width/2*x,center[1]+y*s.height/2,center[2]+t[2]*s.width/2*x]);corners.forEach((c,i)=>line(c,corners[(i+1)%4],color));}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));return g;}
export function buildSignage(data,options={}){const start=performance.now(),model=options.model??buildSignModel(data,options);if(model.audit.major)throw Error('S7 placement audit failed');const atlas=createSignAtlases({...options,tier:model.tier}),root=new Group();root.name='s7-signage';
 const materials={print:new MeshStandardMaterial({map:atlas.city.texture,roughness:.72,emissive:0xffffff,emissiveMap:atlas.city.texture,emissiveIntensity:.12}),led:new MeshStandardMaterial({map:atlas.city.texture,roughness:.4,emissive:0xffffff,emissiveMap:atlas.city.texture,emissiveIntensity:.65}),heroScreen:new MeshStandardMaterial({map:atlas.screen.texture,roughness:.35,emissive:0xffffff,emissiveMap:atlas.screen.texture,emissiveIntensity:.65}),frame:new MeshStandardMaterial({color:0x25323d,roughness:.62}),};
 const layoutSigns=commercialLayout(model.signs,atlas.count).filter(s=>s.id!=='qfront:facadeSign:3:s7').map(s=>s.screenUV&&s.buildingId==='way/136691386'?{...s,height:10.5,position:[s.position[0],22.5,s.position[2]],depth:.48}:s);
 const reference=applyReferenceAds(layoutSigns,model.hosts,{variantOf:ad=>ad.id%atlas.count,context:model.context});
 // commercialLayout and the reference layer both run after the placement audit, so this
 // is the last chance to stop two panels rendering through each other.
 const resolved=resolveFaceOverlaps(reference.signs);
 const displaySigns=resolved.signs;
 // Only the advertisements that survived placement get sheet space: reserving tiles for
 // slots this scene cannot host would halve the pixels the visible ones receive.
 // A reference advertisement names its artwork through the ad it resolved from; a hero
 // facade panel names the same sheet directly, because the hero builder placed it rather
 // than the raycast pass.
 const artOf=s=>s.referenceAd?.id??s.brandArt??null;
 const referenceIds=[...new Set(displaySigns.map(artOf).filter(id=>id!=null))].sort((a,b)=>a-b);
 // Tiles are square and get stretched onto whatever shape the panel resolved to, so the
 // painters are told that shape. Without it a wide fascia draws type half again too wide.
 const referenceAspects={};for(const s of displaySigns){const id=artOf(s);if(id!=null&&s.height>0)referenceAspects[id]=s.width/s.height;}
 const referenceAtlas=createReferenceAtlas({...options,tier:model.tier,ids:referenceIds,aspects:referenceAspects});
 const accents=model.tier==='high'?buildSignAccents(displaySigns):null;if(accents)root.add(accents.root);
 const referenceSigns=displaySigns.filter(s=>s.referenceAd);
 const centerGai=model.tier==='high'?buildCenterGai({...options,clearFor:signs=>clearLineOfSight(signs,referenceSigns,reference.basis)}):null;if(centerGai)root.add(centerGai.root);
 // A single reference material, not one per mount type: two distinct shader programs in
 // this stage previously added a measured ~7.5s of first-use GPU shader-compile stall to
 // startup (Windows/ANGLE compiles each new program synchronously on first draw). Printed
 // panels and self-lit displays now share one program at a mid-point night intensity; the
 // per-mount day/night distinction this cost is a trade this stage no longer makes.
 materials.reference=new MeshStandardMaterial({map:referenceAtlas.texture,roughness:.42,emissive:0xffffff,emissiveMap:referenceAtlas.texture,emissiveIntensity:.58});
 const lists={print:[],led:[],heroScreen:[],reference:[]},geometries=[],checks={},box=new BoxGeometry(1,1,1),frames=new InstancedBuilder(box,materials.frame,Math.max(1,displaySigns.length));
 for(const source of displaySigns){const s=source;const artId=artOf(s),referenceEntry=artId!=null?referenceAtlas.entryFor(artId):null;const entry=referenceEntry??(s.screenUV?{u0:s.screenUV[0]*.98+.01,u1:s.screenUV[1]*.98+.01,v0:.02,v1:.98}:atlas.entries[s.variant%atlas.count]);const channel=referenceEntry?'reference':s.screenUV?'heroScreen':s.category==='screen'?'led':'print';lists[channel].push(signFace(s,entry));if(s.category==='blade')lists[channel].push(signFace(s,entry,true));frames.add(...s.position,s.heading,[s.width+(s.screenUV?.length?.3:.015),s.height+(s.screenUV?.length?.35:.015),s.depth],0xffffff);}
 for(const [key,list] of Object.entries(lists)){if(!list.length)continue;const g=merge(list);list.forEach(g=>g.dispose());const mesh=new Mesh(g,materials[key]);mesh.name='signs-'+key;mesh.castShadow=false;root.add(mesh);checks[key]=inspectGeometry(g);geometries.push(g);}
 if(frames.count)root.add(frames.build());const halos=options.fidelity?createHeroHalos(model):null;if(halos)root.add(halos.mesh);let debug=null;if(options.debug){const g=debugGeometry(model),mat=new LineBasicMaterial({vertexColors:true,depthTest:false});debug=new LineSegments(g,mat);debug.name='s7-anchor-normal-bounds-rejections-regions';debug.renderOrder=10;root.add(debug);}
 const stats={overlapsDropped:resolved.dropped.length,referenceAds:reference.placed.length,referenceUnplaced:reference.unplaced.map(u=>({id:u.id,brand:u.brand,priority:u.priority,reason:u.reason})),referenceReplaced:reference.replaced,accentLights:accents?.count??0,centerGai:centerGai?.stats,...model.stats,sourceSignCount:model.signs.length,displaySignCount:displaySigns.length,tier:model.tier,atlasCount:3,referenceAtlasSize:referenceAtlas.size,referenceAtlasMode:referenceAtlas.mode,referencePainted:displaySigns.filter(s=>artOf(s)!=null&&referenceAtlas.entryFor(artOf(s))).length,atlasDimensions:[[atlas.size,atlas.size],[atlas.screenWidth,atlas.screenWidth/2]],graphicVariants:atlas.count+1,atlasMode:atlas.city.mode,materials:4+(halos?1:0)+(accents?2:0),batches:geometries.length+(frames.count?1:0)+(halos?1:0)+(accents?2:0),drawCallContribution:geometries.length+(frames.count?1:0)+(halos?1:0)+(accents?2:0),triangles:geometries.reduce((s,g)=>s+triangleCount(g),0)+frames.count*12+(halos?.count??0)*2+(accents?.triangles??0),debugBatches:debug?1:0,checks,buildTimeMs:Math.round(performance.now()-start),haloCount:halos?.count??0,haloBatches:halos?1:0,emissiveDayOnly:true,pointLights:0};let disposed=false;
 return {root,model,atlas,stats,dispose(){if(disposed)return;disposed=true;accents?.dispose();halos?.dispose();centerGai?.dispose();root.removeFromParent();frames.dispose();box.dispose();geometries.forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());atlas.dispose();referenceAtlas.dispose();if(debug){debug.geometry.dispose();debug.material.dispose();}root.clear();}};
}

export async function buildSignageAsync(data,options={}){const timing=options.stageTiming,model=options.model??await finishStepsAsync(buildSignModelSteps(data,options),undefined,timing);const started=timing&&performance.now(),result=buildSignage(data,{...options,model});if(timing)timing.computeMs=(timing.computeMs??0)+(performance.now()-started);return result;}
