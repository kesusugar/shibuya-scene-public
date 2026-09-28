import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseASF,parseAMC,forwardASF,UNIT} from '../scripts/cmu/asf.mjs';
import {PRESETS} from '../scripts/cmu/weapon-clip.mjs';

// The two-handed trial (GTA-FIDELITY-STATUS §9af). The CMU files are not committed, so the reader
// is checked on a two-line skeleton whose answer is known, and the baked clips on what they
// claim about themselves.

const ASF=`:units
  length 0.45
  angle deg
:root
   order TX TY TZ RX RY RZ
:bonedata
  begin
     id 1
     name arm
     direction 1 0 0
     length 0.45
     axis 0 0 0  XYZ
    dof rx ry rz
  end
:hierarchy
  begin
    root arm
  end
`;

test('ASF lengths are in 1/0.45 inch, and a bone composes its dofs Rz * Ry * Rx',()=>{
 const bones=parseASF(ASF);
 assert.ok(Math.abs(bones.get('arm').length-.0254)<1e-9,'0.45 units is one inch');
 const pose=frame=>forwardASF(bones,parseAMC(`:FULLY-SPECIFIED\n1\nroot 0 0 0 0 0 0\narm ${frame}\n`)[0]).get('arm').end;
 const flat=pose('0 0 90');
 assert.ok(flat.distanceTo({x:0,y:.0254,z:0})<1e-9,`rz 90 turns +X to +Y (${flat.toArray()})`);
 // Rx first, then Rz: +X is untouched by Rx and then turned to +Y. Composed the other way
 // round it would end on +Z.
 const both=pose('90 0 90');
 assert.ok(both.distanceTo({x:0,y:.0254,z:0})<1e-9,`rx 90, rz 90 ends on +Y, not +Z (${both.toArray()})`);
 assert.equal(UNIT,.0254/.45);
});

const load=id=>JSON.parse(readFileSync(`assets/character/cmu-weapons/${id}.json`,'utf8'));

for(const id of Object.keys(PRESETS)){
 test(`${id}: the baked clip is well formed and says where it came from`,()=>{
  const clip=load(id),n=clip.times.length;
  assert.equal(clip.preset,id);
  assert.match(clip.source.dataset,/mocap\.cs\.cmu\.edu/);
  assert.match(clip.source.asfSha256,/^[0-9a-f]{64}$/);assert.match(clip.source.amcSha256,/^[0-9a-f]{64}$/);
  for(let i=1;i<n;i++)assert.ok(clip.times[i]>clip.times[i-1],'times increase');
  assert.equal(clip.rootPos.length,n*3);
  for(const [bone,v] of Object.entries(clip.tracks)){
   assert.equal(v.length,n*4,bone);
   for(let i=0;i<n;i++){const l=Math.hypot(v[i*4],v[i*4+1],v[i*4+2],v[i*4+3]);assert.ok(Math.abs(l-1)<1e-3,`${bone} key ${i} is a unit quaternion`);}
  }
 });
}

test('katana: both hands on the handle, mirrored to a right-hand lead, a fast cut, a kept trunk',()=>{
 const clip=load('katana-cut'),m=clip.measured;
 assert.equal(PRESETS['katana-cut'].mirror,true,'02_07 leads with the left hand; the game\'s katana is in the right');
 assert.ok(m.handsApartTargetM>=.12&&m.handsApartTargetM<=.2,`hands ${m.handsApartTargetM} m apart`);
 // §9ah: the left clavicle helps a short arm, so the left palm is ON its place (was 4.4 cm off).
 assert.ok(m.leftMissCm<=.5,`the left palm misses its place on the handle by ${m.leftMissCm} cm`);
 // §9ah: the right hand rolls the blade up to 15° off the cut's plane for the wrist (was 50°).
 assert.ok(m.wristDeg.right.bendMedian<=20,`the right wrist bends ${m.wristDeg.right.bendMedian}° at median`);
 // Captured, the hands peak near 3 m/s; the cut is replayed at 2x.
 assert.ok(m.gripPeakMs>=5.5,`the fist peaks at ${m.gripPeakMs} m/s`);
 assert.ok(clip.duration<1.7,`the whole cut takes ${clip.duration} s`);
 // Captured, the follow-through folds the trunk 52° off vertical.
 assert.ok(m.trunkMaxDeg.captured>45&&m.trunkMaxDeg.kept<=38,`trunk ${JSON.stringify(m.trunkMaxDeg)}`);
});

for(const id of Object.keys(PRESETS)){
 test(`${id}: the wrists stay within a human range, the twist carried by the forearm`,()=>{
  const {wristDeg}=load(id).measured;
  for(const [hand,w] of Object.entries(wristDeg)){
   assert.ok(w.bendMax<=65,`${hand} wrist bends ${w.bendMax}°`);
   assert.ok(w.twistMax<=45,`${hand} wrist twists ${w.twistMax}° (a wrist hardly twists; the forearm does)`);
  }
 });
}

test('the gun: from a low ready to the shoulder, levelled, the eye on the sights, both hands on',()=>{
 const raise=load('rifle-raise'),hold=load('rifle-shouldered');
 const e=raise.perKey.elevationDeg;
 assert.ok(e[0]<-30,`it starts at a low ready, muzzle ${e[0]}° down`);
 assert.ok(e.slice(-60).every(x=>Math.abs(x)<.5),'and ends levelled');
 for(const clip of [raise,hold]){
  assert.equal(clip.measured.leftMissCm,0,`${clip.preset}: the left hand on the fore-end`);
  assert.ok(clip.measured.eyeToSightLineCm.median<=1,`${clip.preset}: eye ${clip.measured.eyeToSightLineCm.median} cm off the sight line`);
 }
 // The butt is in the pocket inside the shoulder joint, moved in until the sight line is within
 // 0.5 cm of the eye (§9ah: that is what keeps the head's tilt to 15°): 16-18 cm from the joint's
 // centre, toward the collarbone. A butt on the arm would be out past the joint.
 assert.ok(hold.perKey.buttToShoulderM.every(d=>d<.2),'the butt in the shoulder pocket');
 assert.ok(hold.perKey.elevationDeg.every(x=>x===0),'levelled');
});

test('the shouldered hold loops: its last key is its first',()=>{
 const clip=load('rifle-shouldered'),n=clip.times.length;
 for(const [bone,v] of Object.entries(clip.tracks)){
  const a=v.slice(0,4),b=v.slice((n-1)*4,n*4),dot=Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]);
  assert.ok(dot>.9999,`${bone} closes the loop`);
 }
 for(let c=0;c<3;c++)assert.ok(Math.abs(clip.rootPos[c]-clip.rootPos[(n-1)*3+c])<1e-4,'the pelvis closes the loop');
});
