import {Group,InstancedMesh,SphereGeometry,MeshStandardMaterial,Matrix4} from 'three';
import {lampGlows} from '../streetscape/lamp-glows.mjs';

// Fixtures mounted to real sign faces; separate from road/street lighting.
export function buildSignAccents(signs){
 const chosen=[];for(const s of [...signs].sort((a,b)=>b.position[1]-a.position[1])){if(s.position[1]<6||Math.hypot(s.position[0],s.position[2])>115||s.width<2)continue;
  const n=s.normal??[Math.sin(s.heading),0,Math.cos(s.heading)],p=[s.position[0]+n[0]*((s.depth??.2)/2+.2),s.position[1]-s.height/2+.15,s.position[2]+n[2]*((s.depth??.2)/2+.2)];
  if(chosen.some(a=>Math.hypot(p[0]-a.position[0],p[1]-a.position[1],p[2]-a.position[2])<9))continue;chosen.push({position:p});if(chosen.length===24)break;
 }
 const root=new Group(),material=new MeshStandardMaterial({color:0xfff5df,emissive:0xfff0d2,emissiveIntensity:.05}),geometry=new SphereGeometry(.13,8,6),mesh=new InstancedMesh(geometry,material,Math.max(1,chosen.length)),matrix=new Matrix4();mesh.count=chosen.length;mesh.name='sign-accent-bulbs';chosen.forEach((a,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(...a.position)));root.add(mesh);
 const glare=lampGlows(chosen,material);glare.mesh.geometry.scale(3,3,1);glare.mesh.name='sign-accent-glare';root.add(glare.mesh);root.name='building-advertisement-lights';
 return {root,count:chosen.length,triangles:chosen.length*(geometry.index.count/3+2),dispose(){root.removeFromParent();glare.dispose();mesh.dispose();geometry.dispose();material.dispose();root.clear();}};
}
