// RUN 7B STEP 11: does anything about a citizen change when their level of detail does?
// Offline and deterministic: drive a camera in and out and watch identity across LOD moves.
import {readFileSync} from 'node:fs';
import {createHQLayer,HQ_LOD} from '../../src/life/hq-layer.mjs';
import {appearanceOf} from '../../src/life/appearance.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);

const people=[];
for(let id=0;id<900;id++){
 const row=Math.floor(id/30),col=id%30;
 people.push({id,active:true,controlled:false,archetype:'adult',state:'walking',
  x:(col-15)*1.3,z:(row-15)*1.3,renderX:(col-15)*1.3,renderZ:(row-15)*1.3,
  height:0,heading:Math.PI,speed:1.3,crossing:null,queueKey:null,edge:3,route:[3]});
}
const layer=createHQLayer(manifest,bin,{budget:900});
const seen=new Map();          // id -> {lane archetype, phase, height, width, palette}
let moves=0,identityBreaks=0,phaseBreaks=0,lodHistogram={};
const camera={x:0,z:0};
for(let f=0;f<400;f++){
 // Sweep the camera through the block and back, crossing every LOD boundary repeatedly.
 camera.z=Math.sin(f*.05)*30;
 layer.sync(people,camera,HQ_LOD.reviewInterval,{time:f*HQ_LOD.reviewInterval});
 const c=layer.crowd;
 for(let i=0;i<c.population;i++){
  const id=c.state.id[i];
  const lane=c.lanes[c.state.lane[i]];
  const now={arch:lane.archetype.id,lod:lane.lod,phase:c.state.phase[i],
   height:c.state.height[i],width:c.state.width[i]};
  lodHistogram[now.lod]=(lodHistogram[now.lod]??0)+1;
  const was=seen.get(id);
  if(was){
   if(was.lod!==now.lod)moves++;
   if(was.arch!==now.arch||was.height!==now.height||was.width!==now.width)identityBreaks++;
   if(was.phase!==now.phase)phaseBreaks++;
  }
  seen.set(id,now);
 }
}
console.log('LOD changes observed :',moves);
console.log('lod occupancy        :',JSON.stringify(lodHistogram));
console.log('identity changed     :',identityBreaks,identityBreaks?'<-- FAIL':'(body/height/build held)');
console.log('phase reset          :',phaseBreaks,phaseBreaks?'<-- FAIL':'(walk cycle held)');
// And the archetype must still match what the id says it is.
let wrong=0;
for(let i=0;i<layer.crowd.population;i++){
 const id=layer.crowd.state.id[i];
 if(appearanceOf(id).archetype.id!==layer.crowd.lanes[layer.crowd.state.lane[i]].archetype.id)wrong++;
}
console.log('archetype mismatched :',wrong,wrong?'<-- FAIL':'(matches the recipe)');
layer.dispose();
