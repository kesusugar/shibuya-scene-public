// RUN 6.8 STEP 9: does each archetype still stand ON the ground after height and build
// scaling, and does every clip still drive every rig?
//
// Foot IK adapts a correct animation to terrain; it is not there to hide a body that floats.
// So this measures the bodies with NO IK at all, against a flat floor at y=0.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as T from 'three';
import {humanoidCitizen} from '../../src/player/character-asset.mjs';
import {createPlayerFigure} from '../../src/player/figure.mjs';
import {ARCHETYPES,appearanceOf,paletteOf} from '../../src/life/appearance.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const b=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((r,j)=>new GLTFLoader()
 .parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));
const asset=humanoidCitizen(gltf,report);

const box=new T.Box3();
console.log('archetype        clip   sole y (min over cycle)   head y    height   frames');
let worst=0;
for(const archetype of ARCHETYPES){
 // A representative citizen of this archetype, so the height and build are real ones.
 let look=null;
 for(let id=0;id<500&&!look;id++){const a=appearanceOf(id);if(a.archetype.id===archetype.id)look=a;}
 for(const clip of ['Idle','Walk','Run']){
  const figure=createPlayerFigure(asset,paletteOf(look),{variant:archetype});
  figure.setBuild(look.width);figure.setHeight(look.height);
  const speed=clip==='Idle'?0:clip==='Walk'?1.5:4.2;
  let minY=Infinity,maxY=-Infinity,frames=0;
  for(let t=0;t<2;t+=1/60){
   figure.update({x:0,y:0,z:0,heading:0,speed,alive:true,animationPhase:0},1/60);
   if(t<.6)continue;                                  // let the blend settle
   figure.root.updateMatrixWorld(true);
   box.setFromObject(figure.root);
   minY=Math.min(minY,box.min.y);maxY=Math.max(maxY,box.max.y);frames++;
  }
  worst=Math.max(worst,Math.abs(minY));
  console.log(`${archetype.name.padEnd(12)} ${clip.padEnd(6)} `
   +`${(minY*1000).toFixed(1).padStart(10)} mm ${maxY.toFixed(3).padStart(10)} `
   +`${look.height.toFixed(3).padStart(8)} ${String(frames).padStart(7)}`);
  figure.dispose();
 }
}
console.log(`\nworst |sole y| across every archetype and clip: ${(worst*1000).toFixed(1)} mm`);
