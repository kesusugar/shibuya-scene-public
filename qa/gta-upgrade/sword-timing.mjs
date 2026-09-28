// PLAN-WEAPONS W1 (R6): measure Sword_Attack instead of guessing when the blade cuts.
//
// The katana's tip is placed where the game places it (GRIP.katana, SHAPE.katana in
// src/player/weapons.mjs) and followed through the clip at 120 steps in the body's own frame.
// The ACTIVE window is where the tip is in front of the body (z > 0) and moving at least half
// its peak speed: the part of the swing that would cut someone standing there. The sweep is the
// tip's bearing (atan2(x, z), + is the body's left) at the start and end of that window.
//
//   node qa/gta-upgrade/sword-timing.mjs
//
// Paste the printed object into SWORD in src/player/attack-timing.mjs.
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GRIP,SHAPE} from '../../src/player/weapons.mjs';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const b=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((r,j)=>new GLTFLoader()
 .parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));
const rigOf=id=>{let f=null;gltf.scene.traverse(o=>{if(!f&&o.userData?.rig===id)f=o;});return f;};
const rig=rigOf(report.rigs[0].id);
const bone=name=>{let f=null;rig.traverse(o=>{if(!f&&o.isBone&&o.name===name)f=o;});return f;};
const hand=bone('hand_r'),pelvis=bone('pelvis');
const clip=gltf.animations.find(c=>c.name==='SwordAttack');
if(!clip)throw new Error('SwordAttack missing: run npm run convert:character');
const mixer=new T.AnimationMixer(rig),action=mixer.clipAction(clip);action.play();

const g=GRIP.katana,tipLocal=new T.Vector3(...g.at).addScaledVector(new T.Vector3(...g.forward).normalize(),SHAPE.katana.tip);
const STEPS=120,rows=[];
const inv=new T.Matrix4(),p=new T.Vector3(),hip=new T.Vector3();
for(let i=0;i<=STEPS;i++){
 mixer.setTime(0);action.time=i/STEPS*clip.duration;mixer.update(0);rig.updateMatrixWorld(true);
 inv.copy(rig.matrixWorld).invert();
 p.copy(tipLocal).applyMatrix4(hand.matrixWorld).applyMatrix4(inv);
 pelvis.getWorldPosition(hip).applyMatrix4(inv);
 rows.push({t:i/STEPS*clip.duration,x:p.x-hip.x,y:p.y,z:p.z-hip.z});
}
for(let i=1;i<rows.length;i++){const a=rows[i-1],c=rows[i];c.speed=Math.hypot(c.x-a.x,c.y-a.y,c.z-a.z)/(c.t-a.t);}
rows[0].speed=0;
const peakSpeed=Math.max(...rows.map(r=>r.speed));
// Only the first fast pass in front: the clip's follow-through lifts the blade again later.
let first=-1,last=-1;
for(let i=0;i<rows.length;i++){
 const on=rows[i].z>0&&rows[i].speed>=peakSpeed*.5;
 if(on&&first<0)first=i;
 if(first>=0){if(on)last=i;else break;}
}
const bearing=r=>Math.atan2(r.x,r.z);
const peak=rows.slice(first,last+1).reduce((a,r)=>Math.hypot(r.x,r.z)>Math.hypot(a.x,a.z)?r:a);
// The window opens on the first fast sample in front: the one before it is still over the
// shoulder, behind the body, and would let a cut reach someone standing behind the player.
const open=rows[first],close=rows[last];
const out={name:'SwordAttack',hand:'right',duration:+clip.duration.toFixed(3),
 windup:+open.t.toFixed(3),activeEnd:+close.t.toFixed(3),peak:+peak.t.toFixed(3),
 sweepFrom:+bearing(open).toFixed(3),sweepTo:+bearing(close).toFixed(3),
 tipReach:+Math.max(...rows.slice(first,last+1).map(r=>Math.hypot(r.x,r.z))).toFixed(3),
 // The tip's bearing through the window, for the hit test: [seconds, radians], sampled.
 sweep:rows.slice(first,last+1).map(r=>[+r.t.toFixed(3),+bearing(r).toFixed(3)]),
 tipHeight:[+Math.min(...rows.slice(first,last+1).map(r=>r.y)).toFixed(2),+Math.max(...rows.slice(first,last+1).map(r=>r.y)).toFixed(2)]};
console.log(`peak tip speed ${peakSpeed.toFixed(1)} m/s, fast pass steps ${first}-${last}`);
for(const r of rows.slice(Math.max(0,first-3),last+3))
 console.log(`  t ${r.t.toFixed(3)}  tip x ${r.x.toFixed(2)} y ${r.y.toFixed(2)} z ${r.z.toFixed(2)}  bearing ${(bearing(r)*180/Math.PI).toFixed(0)}°  ${r.speed.toFixed(1)} m/s`);
console.log(JSON.stringify(out));
