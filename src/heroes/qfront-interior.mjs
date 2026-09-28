import {Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {edges,facadePoint} from './model.mjs';
import {inPolygon} from '../geo/core.mjs';
import {merge,triangleCount} from '../geo/geometry.mjs';

// Shallow real geometry behind glass, not a photograph pasted onto its surface.
export function createQfrontInterior(hero){
 const root=new Group();root.name='qfront-interior';const records=[];
 const materials={shell:new MeshStandardMaterial({color:0x665346,roughness:.9,emissive:0xa47748,emissiveIntensity:.025}),wood:new MeshStandardMaterial({color:0x99744e,roughness:.7,emissive:0xb88c58,emissiveIntensity:.02}),people:new MeshStandardMaterial({color:0x273039,roughness:.9}),warm:new MeshStandardMaterial({color:0xffd49a,emissive:0xffbc6b,emissiveIntensity:.12}),dim:new MeshStandardMaterial({color:0xc9bda3,emissive:0xeac793,emissiveIntensity:.04})};
 const lists=Object.fromEntries(Object.keys(materials).map(k=>[k,[]]));
 const add=(kind,e,u,y,offset,size)=>{const position=facadePoint(e,u,y,offset),g=new BoxGeometry(...size);g.rotateY(e.heading);g.translate(...position);lists[kind].push(g);records.push({kind,position,size});};
 if(hero)for(const e of edges(hero.footprint)){
  const bays=Math.floor((e.length-2)/3.2);if(bays<1)continue;
  for(let bay=0;bay<bays;bay++){
   const u=1+(bay+.5)*(e.length-2)/bays,width=Math.min(2.8,(e.length-2)/bays-.1);
   const corners=[[-width/2,-.3],[width/2,-.3],[-width/2,-2.8],[width/2,-2.8]].map(([du,o])=>{const p=facadePoint(e,u+du,0,o);return [p[0],p[2]];});
   if(!corners.every(p=>inPolygon(p,hero.footprint)))continue;
   for(let floor=0;floor<6;floor++){
    const y=8.2+floor*5.4,lit=(bay+floor+e.index)%4!==0;
    add('shell',e,u,y,-1.55,[width,.16,2.5]);
    add('shell',e,u,y+4.55,-1.55,[width,.15,2.5]);
    add('shell',e,u,y+2.2,-2.75,[width,4.4,.12]);
    add('wood',e,u-width*.43,y+2.1,-1.8,[.13,4.2,.15]);
    add(lit?'warm':'dim',e,u,y+4.35,-1.2,[width*.7,.055,.2]);
    if(lit){
     add('wood',e,u,y+1.1,-1.1,[width*.8,.12,.65]);
     for(const du of [-.65,.65]){add('people',e,u+du,y+.65,-1.85,[.42,.65,.4]);add('wood',e,u+du,y+.4,-1.6,[.45,.08,.45]);}
    }
   }
  }
 }
 let triangles=0;const geometries=[];
 for(const [kind,list]of Object.entries(lists)){if(!list.length)continue;const geometry=merge(list);list.forEach(g=>g.dispose());geometries.push(geometry);triangles+=triangleCount(geometry);const mesh=new Mesh(geometry,materials[kind]);mesh.name='qfront-interior-'+kind;root.add(mesh);}
 return {root,records,triangles,batches:geometries.length,dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());root.clear();}};
}
