// Same measurement as qa/gta-upgrade/archetype-feet.mjs, but against whatever the working
// tree currently is, using only APIs that existed before RUN 6.8.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as T from 'three';
import {humanoidCitizen} from '../../src/player/character-asset.mjs';
import {createPlayerFigure} from '../../src/player/figure.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};
const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const b=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((r,j)=>new GLTFLoader()
 .parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));
const asset=humanoidCitizen(gltf,report);
const box=new T.Box3();
for(const clip of ['Idle','Walk','Run']){
 const figure=createPlayerFigure(asset,{top:0x2f4858});
 figure.setHeight(1.76*(.965+3*.011));
 const speed=clip==='Idle'?0:clip==='Walk'?1.5:4.2;
 let minY=Infinity;
 for(let t=0;t<2;t+=1/60){
  figure.update({x:0,y:0,z:0,heading:0,speed,alive:true,animationPhase:0},1/60);
  if(t<.6)continue;
  figure.root.updateMatrixWorld(true);box.setFromObject(figure.root);
  minY=Math.min(minY,box.min.y);
 }
 console.log(`${clip.padEnd(6)} sole y ${(minY*1000).toFixed(1).padStart(8)} mm`);
 figure.dispose();
}
