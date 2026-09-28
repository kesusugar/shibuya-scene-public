// RUN 7A STEP 7 + 20: the success ladder, measured rather than guessed.
// CPU-side only -- draw calls, triangles, memory, per-frame CPU. GPU cost is reported as
// counts, never as a SwiftShader frame rate, which this project does not accept as evidence.
import {readFileSync} from 'node:fs';
import {createHQCrowd,STATE} from '../../src/life/hq-crowd.mjs';
import {appearanceOf,ARCHETYPES} from '../../src/life/appearance.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const laneOf=new Map(manifest.archetypes.map((a,i)=>[a.id,i]));

const COUNTS=[32,64,128,256,512,1024,1978];
const LOD=process.argv[2]??'L1';

console.log(`RUN 7A ladder -- LOD ${LOD}, ${manifest.archetypes.length} archetypes, `
 +`${manifest.clips.length} clips, ${manifest.bones} bones\n`);
console.log('count  spawn ms  update ms  us/citizen  draws  triangles   verts   heap MB  states/s');

const rows=[];
for(const count of COUNTS){
 if(global.gc)global.gc();
 const before=process.memoryUsage().heapUsed;
 const crowd=createHQCrowd(manifest,bin,{capacity:Math.ceil(count/ARCHETYPES.length)+8,lod:LOD});
 const t0=performance.now();
 for(let id=0;id<count;id++){
  const look=appearanceOf(id);
  const angle=id*.618*Math.PI*2,radius=2+Math.sqrt(id)*1.1;
  crowd.spawn(id,look,laneOf.get(look.archetype.id)??0,
   {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,heading:angle,speed:1.3});
 }
 const spawnMs=performance.now()-t0;
 // Warm, then measure a run of frames.
 for(let f=0;f<10;f++)crowd.update(1/60,{time:f/60});
 const t1=performance.now();
 const FRAMES=120;
 for(let f=0;f<FRAMES;f++){
  for(let i=0;i<crowd.population;i++){
   const s=crowd.state;
   crowd.place(i,s.x[i]+Math.cos(s.heading[i])*.02,0,s.z[i]+Math.sin(s.heading[i])*.02,s.heading[i]);
  }
  crowd.update(1/60,{time:(10+f)/60});
 }
 const updateMs=(performance.now()-t1)/FRAMES;
 const after=process.memoryUsage().heapUsed;
 const got=crowd.inspect();
 rows.push({count,spawnMs,updateMs,got,heap:(after-before)/1048576});
 console.log(
  String(count).padStart(5)
  +spawnMs.toFixed(1).padStart(10)
  +updateMs.toFixed(3).padStart(11)
  +((updateMs*1000)/Math.max(1,got.population)).toFixed(2).padStart(12)
  +String(got.drawCalls).padStart(7)
  +String(got.triangles).padStart(11)
  +String(got.vertices).padStart(9)
  +((after-before)/1048576).toFixed(1).padStart(10)
  +'        -');
 crowd.dispose();
}

// State churn: how many reactions a second can the CPU actually apply?
console.log('\n--- mass reaction cost ---');
const crowd=createHQCrowd(manifest,bin,{capacity:600,lod:LOD});
for(let id=0;id<1978;id++){
 const look=appearanceOf(id);
 const angle=id*.618*Math.PI*2,radius=2+Math.sqrt(id)*1.1;
 crowd.spawn(id,look,laneOf.get(look.archetype.id)??0,
  {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,heading:angle,speed:1.3});
}
crowd.update(1/60,{time:0});
console.log(`population ${crowd.population}`);
for(const batch of [1,5,10,20,50,100,300]){
 const t=performance.now();
 const ROUNDS=200;
 for(let r=0;r<ROUNDS;r++)
  for(let k=0;k<batch;k++)
   crowd.setState((r*batch+k)%crowd.population,
    r%2?STATE.KNOCKDOWN:STATE.NORMAL,
    {impulseX:Math.cos(k)*6,impulseZ:Math.sin(k)*6,impulseY:2.5,force:true});
 const per=(performance.now()-t)/ROUNDS;
 console.log(`${String(batch).padStart(4)} simultaneous state changes: ${per.toFixed(4)} ms `
  +`(${(per*1000/batch).toFixed(2)} us each)`);
}
crowd.dispose();
