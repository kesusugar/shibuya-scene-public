// What the CMU skeleton actually is, and the only defensible way to scale it.
//
// The cgspeed README documents no unit, so the scale is not asserted here -- it is DERIVED from
// the requirement that actually matters: the source skeleton has to end up the same size as the
// target skeleton, or every retargeted foot lands in the wrong place. The scale is therefore
// target leg length / source leg length, measured from both rigs' rest offsets.
import {readFileSync} from 'node:fs';
import {parseBVH} from './bvh.mjs';

const file=process.argv[2];
const bvh=parseBVH(readFileSync(file,'utf8'));

console.log('joints:',bvh.joints.length);
console.log('frame time:',bvh.frameTime,`(${Math.round(1/bvh.frameTime)} fps), frames`,bvh.frames);
console.log('\nhierarchy (name, parent, rest offset in BVH units):');
const len=o=>Math.hypot(o[0],o[1],o[2]);
for(const j of bvh.joints)
 console.log('  '+j.name.padEnd(16),(j.parent?.name??'-').padEnd(16),
  j.offset.map(v=>v.toFixed(3).padStart(9)).join(' '),' |',len(j.offset).toFixed(3));

// The leg chain, by CMU/MotionBuilder naming.
const by=n=>bvh.joints.find(j=>j.name===n);
const chain=['RightUpLeg','RightLeg','RightFoot'].map(by);
if(chain.every(Boolean)){
 const thigh=len(chain[1].offset), shin=len(chain[2].offset);
 console.log('\nsource leg: thigh',thigh.toFixed(3),'+ shin',shin.toFixed(3),'=',(thigh+shin).toFixed(3),'units');
 // Target, measured in RUN 5 on the game character.
 const TARGET_THIGH=.381, TARGET_SHIN=.409;
 const scale=(TARGET_THIGH+TARGET_SHIN)/(thigh+shin);
 console.log('target leg:',(TARGET_THIGH+TARGET_SHIN).toFixed(3),'m');
 console.log('=> derived scale:',scale.toFixed(6),'m per BVH unit');
 // Cross-check against a standing hip height, which should land near 0.9-1.0 m.
 const rootY=[];
 for(let f=0;f<bvh.frames;f++)rootY.push(bvh.motion[f*bvh.channels+bvh.root.channelIndex+1]);
 const meanHip=rootY.reduce((a,b)=>a+b,0)/rootY.length;
 console.log('   check: mean root height',(meanHip*scale).toFixed(3),
  'm  (a running hip sits a little below standing, so ~0.85-1.0 is plausible)');
 console.log('   for reference, the often-quoted CMU constant 0.056444 would give',
  (meanHip*0.056444).toFixed(3),'m');
}
