import {Group,BoxGeometry,Mesh,MeshStandardMaterial} from 'three';
import {facadePoint} from './model.mjs';
import {merge,triangleCount} from '../geo/geometry.mjs';

// Shallow physical framing follows the existing texture's eight bays.
export function createCafeFrames(fronts){
 const root=new Group(),pieces=[],records=[];root.name='qfront-cafe-frames';
 const material=new MeshStandardMaterial({color:0x536063,metalness:.65,roughness:.32});
 const add=(e,u,y,w,h,depth=.12)=>{
  const position=facadePoint(e,u,y,.32),g=new BoxGeometry(w,h,depth);
  g.rotateY(e.heading);g.translate(...position);pieces.push(g);records.push({position,size:[w,h,depth]});
 };
 for(const e of fronts){
  const width=e.length-.18,left=.09;
  for(const y of [.45,3.33,4.2,7.15])add(e,e.length/2,y,width,.075);
  for(let bay=0;bay<=8;bay++){
   const u=left+width*(.015+bay*.12);
   add(e,u,1.88,.055,2.78);add(e,u,5.67,.055,2.83);
  }
  // Door bars sit on the two entrance bays, not across the public walkway.
  for(const bay of [3,4]){
   const u=left+width*(.025+bay*.12+.112*.5);
   add(e,u,1.8,.035,2.2,.16);
   for(const side of [-1,1])add(e,u+side*width*.009,1.55,.025,.38,.2);
  }
 }
 const geometry=merge(pieces);pieces.forEach(g=>g.dispose());
 const mesh=new Mesh(geometry,material);mesh.name='qfront-cafe-metal-frames';root.add(mesh);
 let disposed=false;
 return {root,records,triangles:triangleCount(geometry),dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometry.dispose();material.dispose();root.clear();}};
}
