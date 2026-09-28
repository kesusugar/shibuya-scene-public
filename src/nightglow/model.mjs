import {seededRandom} from '../geo/core.mjs';
import {buildGroundModel,union,intersection,difference,polygons,area} from '../ground/model.mjs';
import {multi} from '../buildings/model.mjs';
export const NIGHT_PROFILES=Object.freeze({high:{patches:72,reflections:30,glow:1,bloom:.18,scale:.25},medium:{patches:36,reflections:15,glow:.6,bloom:.1,scale:.16},low:{patches:10,reflections:4,glow:.2,bloom:0,scale:0}});
export const ZONES=[{id:'scramble',x:0,z:0,r:32,color:0x779ed0},{id:'qfront',x:-22,z:-28,r:20,color:0xb294df},{id:'109',x:-145,z:0,r:26,color:0xe6a083},{id:'center-gai',x:-65,z:-55,r:27,color:0xc889c7},{id:'station',x:22,z:52,r:24,color:0xd6b686},{id:'arterial',x:2,z:-115,r:24,color:0x83b8cc}];
export function buildWetModel(data,ground=buildGroundModel(data)){
 const markings=union(...ground.crossings.flatMap(c=>c.stripes.map(s=>s.polygon)),...ground.stopLines,...ground.guides,...ground.arrows,...ground.tactiles);
 const buildings=union(...data.buildings.map(b=>multi(b.polygon))),cut=union(markings,buildings);
 const surfaces=[{y:0,shape:difference(ground.roads,cut)},{y:.15,shape:difference(difference(ground.flatSidewalk,ground.curbTop),cut)}];
 const rng=seededRandom('s13-wet-night'),patches=[],reflections=[];let used=[];
 for(const [kind,target,out] of [['patch',72,patches],['reflection',30,reflections]])for(let i=0;i<target;i++){
  const zone=ZONES[i%ZONES.length];for(let attempt=0;attempt<24;attempt++){const center=[zone.x+(rng()-.5)*2*zone.r,zone.z+(rng()-.5)*2*zone.r],angle=rng()*Math.PI,w=kind==='patch'?1.2+rng()*3:.65+rng()*1.5,l=kind==='patch'?2+rng()*4:4+rng()*8,c=Math.cos(angle),s=Math.sin(angle);
   const ring=Array.from({length:8},(_,j)=>{const a=j*Math.PI/4,k=.78+rng()*.22,u=Math.cos(a)*w*k,v=Math.sin(a)*l*k;return [center[0]+c*u-s*v,center[1]+s*u+c*v];});const candidate=multi({outer:ring,holes:[]});
   const pieces=surfaces.flatMap(surface=>polygons(difference(intersection(candidate,surface.shape),used)).filter(p=>area(multi(p))>.2).map(p=>({polygon:p,y:surface.y+(kind==='patch'?.004:.006)})));if(!pieces.length)continue;
   const shape=union(...pieces.map(p=>multi(p.polygon)));used=union(used,shape);out.push({id:kind+':'+i,zone:zone.id,center,angle,w,l,color:zone.color,pieces});break;
  }
 }
 return {patches,reflections,markings,surfaces};
}
