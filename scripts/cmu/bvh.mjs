// A minimal BVH reader. Offline only -- nothing here runs at runtime.
//
// RUN 5.6 needs five things out of a BVH and no more: the joint hierarchy, each joint's rest
// offset, the frame time, the root's translation per frame, and every joint's rotation per
// frame. It is deliberately not a general motion-capture library; a retarget framework is what
// the brief says not to build until one clip has been proven worth it.
//
// CMU BVH units are inches (the cgspeed conversion keeps the original CMU scale, where the
// skeleton is roughly 1/0.45 of a metre per unit). The caller supplies the scale -- this reader
// returns raw numbers and does not guess.

/** @returns {{joints: Array, root: object, frameTime: number, frames: number, motion: Float64Array}} */
export function parseBVH(text){
 const tok=text.split(/\s+/).filter(Boolean);
 let i=0;
 const next=()=>tok[i++];
 const expect=w=>{const t=next();if(t!==w)throw new Error(`expected ${w}, got ${t} at ${i}`);};

 const joints=[];
 let channelCount=0;

 function readJoint(parent){
  // caller has consumed ROOT/JOINT/End and the name
  const isEnd=joints.endPending;
  const joint={name:joints.pendingName,parent,offset:[0,0,0],channels:[],
   channelIndex:channelCount,children:[],end:isEnd};
  expect('{');
  for(;;){
   const t=next();
   if(t==='OFFSET'){joint.offset=[+next(),+next(),+next()];}
   else if(t==='CHANNELS'){
    const n=+next();
    for(let k=0;k<n;k++)joint.channels.push(next());
    joint.channelIndex=channelCount;channelCount+=n;
   }
   else if(t==='JOINT'){joints.pendingName=next();joints.endPending=false;
    joint.children.push(readJoint(joint));}
   else if(t==='End'){next();/* "Site" */ joints.pendingName=joint.name+'_end';
    joints.endPending=true;joint.children.push(readJoint(joint));}
   else if(t==='}')break;
   else throw new Error(`unexpected token ${t}`);
  }
  if(!joint.end)joints.push(joint);
  return joint;
 }

 expect('HIERARCHY');
 expect('ROOT');
 joints.pendingName=next();joints.endPending=false;
 const root=readJoint(null);
 delete joints.pendingName;delete joints.endPending;

 expect('MOTION');
 expect('Frames:');
 const frames=+next();
 expect('Frame');expect('Time:');
 const frameTime=+next();
 const motion=new Float64Array(frames*channelCount);
 for(let f=0;f<frames*channelCount;f++)motion[f]=+next();

 return {joints,root,frameTime,frames,channels:channelCount,motion};
}

/** Channel values for one joint on one frame, as {x,y,z} rotation in degrees and translation. */
export function sample(bvh,joint,frame){
 const base=frame*bvh.channels+joint.channelIndex;
 const out={rx:0,ry:0,rz:0,tx:0,ty:0,tz:0,order:''};
 joint.channels.forEach((c,k)=>{
  const v=bvh.motion[base+k];
  switch(c){
   case 'Xposition':out.tx=v;break;
   case 'Yposition':out.ty=v;break;
   case 'Zposition':out.tz=v;break;
   case 'Xrotation':out.rx=v;out.order+='X';break;
   case 'Yrotation':out.ry=v;out.order+='Y';break;
   case 'Zrotation':out.rz=v;out.order+='Z';break;
  }
 });
 return out;
}

/** Root world translation per frame, in BVH units. */
export function rootTrack(bvh){
 const out=new Float64Array(bvh.frames*3);
 for(let f=0;f<bvh.frames;f++){
  const s=sample(bvh,bvh.root,f);
  out[f*3]=s.tx;out[f*3+1]=s.ty;out[f*3+2]=s.tz;
 }
 return out;
}

// ---------------------------------------------------------------------------------------
// Forward kinematics.
//
// Rotation order is taken from the channel order and composed explicitly, rather than handed
// to a Euler helper. BVH lists channels in the order the rotations are applied, and the
// mapping from that to a library's Euler-order string is a well-known place to be quietly
// wrong by a sign or a swap -- and a skeleton that is wrong by a swap still animates, it just
// animates incorrectly. Multiplying the three matrices in the listed order cannot be
// misinterpreted.
import {Matrix4,Vector3,Quaternion} from 'three';

const DEG=Math.PI/180;
const rotX=(m,a)=>m.makeRotationX(a*DEG);
const rotY=(m,a)=>m.makeRotationY(a*DEG);
const rotZ=(m,a)=>m.makeRotationZ(a*DEG);

/**
 * World matrices for every joint on one frame.
 * @param scale metres per BVH unit; offsets and root translation are both scaled by it.
 * @returns Map from joint name to Matrix4
 */
export function forward(bvh,frame,scale=1,out=new Map()){
 const tmp=new Matrix4(),local=new Matrix4(),rot=new Matrix4();
 const walk=(joint,parentWorld)=>{
  const base=frame*bvh.channels+joint.channelIndex;
  local.makeTranslation(joint.offset[0]*scale,joint.offset[1]*scale,joint.offset[2]*scale);
  // Channels in listed order: translations fold into the offset, rotations multiply on.
  let tx=0,ty=0,tz=0;
  for(let k=0;k<joint.channels.length;k++){
   const c=joint.channels[k],v=bvh.motion[base+k];
   if(c==='Xposition')tx=v*scale;
   else if(c==='Yposition')ty=v*scale;
   else if(c==='Zposition')tz=v*scale;
  }
  if(tx||ty||tz){tmp.makeTranslation(tx,ty,tz);local.premultiply(tmp);}
  for(let k=0;k<joint.channels.length;k++){
   const c=joint.channels[k],v=bvh.motion[base+k];
   if(c==='Xrotation')rotX(rot,v);
   else if(c==='Yrotation')rotY(rot,v);
   else if(c==='Zrotation')rotZ(rot,v);
   else continue;
   local.multiply(rot);
  }
  const world=parentWorld?new Matrix4().multiplyMatrices(parentWorld,local):local.clone();
  out.set(joint.name,world);
  for(const child of joint.children)if(!child.end)walk(child,world);
 };
 walk(bvh.root,null);
 return out;
}

/** Convenience: world position of one joint on one frame. */
export function jointPosition(bvh,name,frame,scale=1,out=new Vector3()){
 const m=forward(bvh,frame,scale).get(name);
 return m?out.setFromMatrixPosition(m):null;
}

/** The scale that makes this skeleton's legs the same length as the target's. */
export function deriveScale(bvh,targetLegMetres=.790){
 const by=n=>bvh.joints.find(j=>j.name===n);
 const len=o=>Math.hypot(o[0],o[1],o[2]);
 const shin=by('RightLeg'),foot=by('RightFoot');
 if(!shin||!foot)throw new Error('expected CMU MotionBuilder leg naming');
 return targetLegMetres/(len(shin.offset)+len(foot.offset));
}
