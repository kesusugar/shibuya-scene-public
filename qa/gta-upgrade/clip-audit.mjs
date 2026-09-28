// Every clip, against the ground it is played over.
//
// RUN 5 draws a hard line: foot IK adapts a CORRECT animation to the terrain. It does not drag
// a wrong foot pose down to the floor, because doing that costs the heel-to-toe roll and hides
// the defect instead of reporting it. This audit is the other side of that line -- it says, per
// clip, how far each sole is from a flat floor while the clip believes that foot is planted,
// with the solver out of the picture entirely.
//
// Run with `node qa/gta-upgrade/clip-audit.mjs`. No browser, no GPU.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Vector3} from 'three';
import * as T from 'three';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const bytes=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));

const root=gltf.scene;
const scale=report.body.scaleToGame;
root.scale.setScalar(scale);
root.updateMatrixWorld(true);
const mixer=new AnimationMixer(root);
const byName=new Map(gltf.animations.map(c=>[c.name,c]));
const bone=n=>root.getObjectByName(n);

// Where the sole is, relative to the lowest point of the whole body in the idle pose. Measuring
// against the ball bone alone would conflate a lifted foot with a pitched one, so both feet are
// tracked and the lower of the two is what "the foot that is down" means here.
const BALL_TO_SOLE=.0215;
const p=new Vector3();
const soleY=name=>{const b=bone(name);if(!b)return null;
 b.updateWorldMatrix(true,false);return p.setFromMatrixPosition(b.matrixWorld).y-BALL_TO_SOLE;};

/** Sample a clip at `steps` even phases and report what its feet do. */
function audit(clipName){
 const clip=byName.get(clipName);
 if(!clip)return null;
 mixer.stopAllAction();
 const action=mixer.clipAction(clip);
 action.reset().play();
 const steps=120,dt=clip.duration/steps;
 const rows=[];
 action.time=0;mixer.setTime(0);
 for(let i=0;i<steps;i++){
  action.time=i*dt;mixer.update(0);
  root.updateMatrixWorld(true);
  const l=soleY('ball_l'),r=soleY('ball_r');
  rows.push({t:i/steps,l,r,low:Math.min(l,r)});
 }
 mixer.stopAllAction();
 // The floor the clip is authored over: the lowest the lower sole ever gets. A clip whose feet
 // are consistent with a floor touches it and never goes below.
 const floor=Math.min(...rows.map(x=>x.low));
 // Penetration: how far BELOW that floor the other measurements go is zero by definition, so
 // what matters is the opposite -- take the floor as y=0 and ask how far each sole is from it
 // while it is the lower of the two, which is this clip's own idea of "planted".
 const planted=rows.map(x=>({...x,lowRel:(x.low-floor)*1000}));
 const contact=planted.filter(x=>x.lowRel<20);
 const lift=Math.max(...planted.map(x=>x.lowRel));
 return {
  name:clipName,duration:+clip.duration.toFixed(3),
  floor:+(floor*1000).toFixed(1),
  contactFraction:contact.length/steps,
  meanWhilePlanted:contact.reduce((a,b)=>a+b.lowRel,0)/Math.max(1,contact.length),
  maxLift:lift,
  tracks:clip.tracks.length
 };
}

// The clips are renamed to their game names when the pack is baked; the report's `upstream`
// field keeps the Quaternius originals for provenance. Look them up by game name and print the
// upstream beside it.
const upstreamOf=new Map(report.clips.map(c=>[c.name,c.upstream??'']));
const WANTED=['Idle','Walk','Run','Sprint','Punch','PunchCross','Hit','Startle',
 'Guard','Enter','Exit','Drive','Interact','Fall'];
console.log('clip audit -- soles against the floor each clip authors, solver not involved\n');
console.log('clip         upstream             dur    floor(mm)  contact%  mean when planted  max lift  tracks');
for(const game of WANTED){
 const upstream=upstreamOf.get(game)??'?';
 const a=audit(game);
 if(!a){console.log(game.padEnd(12),upstream.padEnd(20),'MISSING');continue;}
 console.log(game.padEnd(12),upstream.padEnd(20),
  a.duration.toFixed(3).padStart(6),
  a.floor.toFixed(1).padStart(10),
  (100*a.contactFraction).toFixed(0).padStart(8)+'%',
  a.meanWhilePlanted.toFixed(1).padStart(17),
  a.maxLift.toFixed(0).padStart(10),
  String(a.tracks).padStart(8));
}
console.log(`
floor(mm)  where the lower sole bottoms out, relative to the model origin. A clip authored on a
           floor at y=0 reads near zero; a negative number means the sole goes below the origin.
contact%   the share of the cycle in which the lower sole is within 20 mm of that floor.
max lift   the highest the LOWER sole gets -- for a locomotion loop this is the flight phase,
           and for a standing clip it should be near zero or the character is hovering.`);
