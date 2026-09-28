import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {MASK} from '../scripts/cmu/hybrid.mjs';

// The RUN 5.7 hybrid is a POC and its clips are not committed, so these tests check the
// invariants that would have to hold if it were ever baked in, and skip when the POC artefacts
// are not present. What they must never do is pass because a file was missing.
const CLIPS='qa/gta-upgrade/cmu-clips';
const have=n=>existsSync(`${CLIPS}/${n}`);
const load=n=>JSON.parse(readFileSync(`${CLIPS}/${n}`,'utf8'));
const POC=have('hybrid-E.json')&&have('16_45.json');

test('the hybrid bone mask covers the body once and only once',()=>{
 const all=[...MASK.legs,...MASK.pelvis,...MASK.upper];
 assert.equal(new Set(all).size,all.length,'a bone appears in more than one mask group');
 // Every group is non-empty and the leg chain is complete on both sides.
 for(const side of ['l','r'])
  for(const bone of [`thigh_${side}`,`calf_${side}`,`foot_${side}`,`ball_${side}`])
   assert.ok(MASK.legs.includes(bone),`${bone} missing from the leg mask`);
 assert.ok(MASK.upper.includes('spine_01'),'the boundary bone must be on the Quaternius side');
 // Fingers are explicitly out of scope for this run.
 assert.ok(!all.some(b=>/index|thumb|middle|ring|pinky/i.test(b)),'fingers must not be mapped');
});

test('a baked hybrid gives every animated bone exactly one owner',{skip:!POC},()=>{
 const clip=load('hybrid-E.json');
 const cmu=new Set(clip.source.cmuBones), q=new Set(clip.source.quaterniusBones);
 for(const b of cmu)assert.ok(!q.has(b),`${b} is owned by both sources`);
 for(const b of Object.keys(clip.tracks))
  assert.ok(cmu.has(b)||q.has(b),`${b} has a track but no declared owner`);
 assert.equal(cmu.size+q.size,Object.keys(clip.tracks).length);
});

test('the hybrid carries no world translation',{skip:!POC},()=>{
 const clip=load('hybrid-E.json');
 // Only the pelvis has a position track, and its horizontal components must not travel: the
 // player controller is the source of truth for movement, so the clip is in place.
 const xs=[],zs=[];
 for(let i=0;i<clip.rootPos.length;i+=3){xs.push(clip.rootPos[i]);zs.push(clip.rootPos[i+2]);}
 assert.ok(Math.max(...xs)-Math.min(...xs)<1e-6,'the clip translates sideways');
 // z is the Z-up skeleton's vertical, so it MAY vary -- that is the bob. What must not happen
 // is a net drift across the loop, which would walk the character out of the world.
 assert.ok(Math.abs(zs[0]-zs[zs.length-1])<1e-6,'the vertical track does not close the loop');
});

test('the hybrid has valid gait metadata and no NaN',{skip:!POC},()=>{
 const clip=load('hybrid-E.json');
 assert.ok(clip.duration>0&&Number.isFinite(clip.duration));
 assert.ok(clip.stride>0&&Number.isFinite(clip.stride),'stride drives the RUN 4 period');
 assert.ok(clip.speed>0&&Number.isFinite(clip.speed));
 assert.ok(clip.times.length>=8,'too few keys for a gait cycle');
 for(let i=1;i<clip.times.length;i++)
  assert.ok(clip.times[i]>clip.times[i-1],'key times must increase');
 for(const [bone,vals] of Object.entries(clip.tracks)){
  assert.equal(vals.length,clip.times.length*4,`${bone} track length does not match the times`);
  assert.ok(vals.every(Number.isFinite),`${bone} contains NaN`);
  // Quaternions must be unit, or the pose is a scale as well as a rotation.
  for(let k=0;k*4<vals.length;k++){
   const n=Math.hypot(vals[k*4],vals[k*4+1],vals[k*4+2],vals[k*4+3]);
   assert.ok(Math.abs(n-1)<1e-3,`${bone} key ${k} is not a unit quaternion (${n})`);
  }
 }
 assert.ok(clip.rootPos.every(Number.isFinite),'root track contains NaN');
});

test('the hybrid loop closes',{skip:!POC},()=>{
 const clip=load('hybrid-E.json');
 for(const [bone,vals] of Object.entries(clip.tracks)){
  const n=vals.length/4-1;
  for(let c=0;c<4;c++)
   assert.ok(Math.abs(vals[c]-vals[n*4+c])<1e-6,`${bone} does not return to its first key`);
 }
});

test('the hybrid leaves the lower body exactly as the CMU clip had it',{skip:!POC},async()=>{
 const {Quaternius,Quaternion}=await import('three').then(m=>({Quaternion:m.Quaternion}));
 const B=load('16_45.json'), C=load('hybrid-E.json');
 const sample=(d,phase,bone)=>{
  const span=d.times.length-1,x=phase*span,k0=Math.floor(x),k1=Math.min(span,k0+1),t=x-k0;
  const v=d.tracks[bone];
  return new Quaternion(v[k0*4],v[k0*4+1],v[k0*4+2],v[k0*4+3])
   .slerp(new Quaternion(v[k1*4],v[k1*4+1],v[k1*4+2],v[k1*4+3]),t);
 };
 let worst=0;
 for(const bone of [...MASK.legs,...MASK.pelvis])
  for(let i=0;i<24;i++){
   const ph=i/24;
   worst=Math.max(worst,sample(B,((ph+C.source.leftOffset)%1+1)%1,bone)
    .angleTo(sample(C,ph,bone))*180/Math.PI);
  }
 // The whole premise of the hybrid is that the legs are untouched. If this drifts, the
 // lower-body metrics measured for the full CMU clip no longer describe the hybrid.
 assert.ok(worst<.1,`lower body differs by ${worst.toFixed(2)} deg`);
});
