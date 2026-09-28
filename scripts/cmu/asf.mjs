// A minimal ASF/AMC reader, for the weapon trial (PLAN-WEAPONS, the two-handed question).
// Offline only -- nothing here runs at runtime, and no CMU file is committed.
//
// RUN 5.6 read the cgspeed BVH conversion; the two-handed trials (02_07 swordplay, 80_03
// shooting a gun) are taken from the official site's ASF/AMC instead, which is the original
// capture format. Two facts about it matter for retargeting:
//
// - The unit: lengths are in 1/0.45 inch (`:units length 0.45`), so metres = value / 0.45 * 0.0254.
// - The rest pose is the zero-rotation hierarchy itself: every bone's world rotation is the
//   identity there, and that pose is a T with the subject facing +Z, left on +X, +Y up -- the
//   same frame the game's humanoid is bound in. So a bone's world rotation on a frame IS its turn
//   away from rest, and no reference frame has to be picked (the BVH path needed its frame 0).
//
// A bone's local rotation is C * R * C^-1, where C is the bone's `axis` (degrees, XYZ) and R is
// its dof values composed Rz * Ry * Rx; its world rotation is the parent's times that; its
// segment runs from the parent's end along world(direction) * length.
import {Matrix4,Vector3,Quaternion,Euler} from 'three';

export const UNIT=.0254/.45;
const rad=d=>d*Math.PI/180;
// three's Euler 'ZYX' is the matrix product Rz * Ry * Rx, which is the ASF composition.
const eulerZYX=(x,y,z)=>new Matrix4().makeRotationFromEuler(new Euler(rad(x),rad(y),rad(z),'ZYX'));

export function parseASF(text){
 const bones=new Map([['root',{name:'root',direction:new Vector3(),length:0,C:new Matrix4(),Cinv:new Matrix4(),dof:[],children:[],parent:null}]]);
 const [,bonedata,hierarchy]=text.split(/:bonedata|:hierarchy/);
 for(const block of bonedata.split(/\bbegin\b/).slice(1)){
  const field=k=>new RegExp(`\\n\\s*${k}\\s+([^\\n]+)`).exec(block)?.[1].trim().split(/\s+/);
  const name=field('name')[0],axis=field('axis').slice(0,3).map(Number);
  const C=eulerZYX(...axis);
  bones.set(name,{name,direction:new Vector3(...field('direction').map(Number)).normalize(),
   length:+field('length')[0]*UNIT,C,Cinv:C.clone().invert(),dof:field('dof')??[],children:[],parent:null});
 }
 for(const line of hierarchy.split('\n')){
  const t=line.trim().split(/\s+/);
  if(t.length<2||t[0]==='begin'||t[0]==='end')continue;
  for(const c of t.slice(1)){bones.get(t[0]).children.push(c);bones.get(c).parent=t[0];}
 }
 return bones;
}

/** Frames as {bone: numbers[]}, in file order. */
export function parseAMC(text){
 const frames=[];let cur=null;
 for(const line of text.split('\n')){
  const t=line.trim();if(!t||t[0]==='#'||t[0]===':')continue;
  if(/^\d+$/.test(t)){cur={};frames.push(cur);continue;}
  const p=t.split(/\s+/);cur[p[0]]=p.slice(1).map(Number);
 }
 return frames;
}

/**
 * World pose on one frame: name -> {rotation: Quaternion (turn from rest), start, end: Vector3}.
 * `root` starts and ends at the pelvis position.
 */
export function forwardASF(bones,frame){
 const out=new Map();
 const r=frame.root??[0,0,0,0,0,0];
 const rootPos=new Vector3(r[0],r[1],r[2]).multiplyScalar(UNIT);
 const rootM=eulerZYX(r[3],r[4],r[5]);
 out.set('root',{matrix:rootM,rotation:new Quaternion().setFromRotationMatrix(rootM),start:rootPos,end:rootPos.clone()});
 const walk=name=>{
  const parent=out.get(name);
  for(const child of bones.get(name).children){
   const b=bones.get(child),v=frame[child]??[],a={rx:0,ry:0,rz:0};
   b.dof.forEach((d,i)=>{a[d]=v[i]??0;});
   const M=parent.matrix.clone().multiply(b.C).multiply(eulerZYX(a.rx,a.ry,a.rz)).multiply(b.Cinv);
   const end=b.direction.clone().multiplyScalar(b.length).applyMatrix4(M).add(parent.end);
   out.set(child,{matrix:M,rotation:new Quaternion().setFromRotationMatrix(M),start:parent.end.clone(),end});
   walk(child);
  }
 };
 walk('root');
 return out;
}

/** Hip height above the lowest foot point, in the rest pose (metres). */
export function restHipHeight(bones){
 const rest=forwardASF(bones,{root:[0,0,0,0,0,0]});
 let low=0;for(const [,j] of rest)low=Math.min(low,j.end.y);
 return -low;
}
