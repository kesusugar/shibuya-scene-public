// The two-handed trial: a CMU capture onto the game's humanoid, with both hands put on the
// weapon. Offline only; the output is a JSON of quaternion tracks the bench turns into a clip.
// Nothing here is wired into the game.
//
//   node scripts/cmu/weapon-clip.mjs <dir with the .asf/.amc> <preset> <out.json>
//
// Presets (below) name a trial, a window and the weapon. The CMU files are fetched from
// mocap.cs.cmu.edu into a scratch directory and never committed (the RUN 5.6 rule: convert only
// what is used, never ship the raw data).
//
// Three stages per key:
//
// 1. Rotations. Each mapped bone gets the SOURCE bone's turn from rest applied to the TARGET's
//    rest -- RUN 5.6's rest correction. In ASF the rest turn is simply the world rotation (see
//    asf.mjs), and both rigs rest in a T facing +Z, so nothing else is needed.
// 2. The weapon. A retarget gets the pose; it does not get the object. The two rigs' arms differ
//    in length and shoulder height (RUN 5.7 measured the shoulder chain 10° high), so two hands
//    that met on a handle in the capture miss it on the character. The weapon's axis is taken
//    from the SOURCE hands -- the one thing the capture measures reliably about the object --
//    and the right hand is turned to hold it along that axis. The left hand is then placed on the
//    weapon by two-bone IK: on the handle behind the right fist (katana), or on the fore-end
//    ahead of it (long gun).
// 3. The root: the source's hip height and travel, scaled by the ratio of the two rigs' hip
//    heights, then the whole clip lowered once so its lowest sole meets the floor (RUN 5.6).
//
// Every number the bench shows comes out of here: how far the left palm ends from its target
// (the IK's miss), and how far each wrist had to bend from the retarget to hold the weapon.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Quaternion,Vector3,Matrix4} from 'three';
import {parseASF,parseAMC,forwardASF,restHipHeight} from './asf.mjs';
import {GRIP,SHAPE} from '../../src/player/weapons.mjs';

globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

/** ASF bone -> the character's bone. Parents before children. */
export const ASF_MAP=Object.freeze({
 root:'pelvis',lowerback:'spine_01',upperback:'spine_02',thorax:'spine_03',lowerneck:'neck_01',head:'Head',
 lclavicle:'clavicle_l',lhumerus:'upperarm_l',lradius:'lowerarm_l',lhand:'hand_l',
 rclavicle:'clavicle_r',rhumerus:'upperarm_r',rradius:'lowerarm_r',rhand:'hand_r',
 lfemur:'thigh_l',ltibia:'calf_l',lfoot:'foot_l',ltoes:'ball_l',
 rfemur:'thigh_r',rtibia:'calf_r',rfoot:'foot_r',rtoes:'ball_r'
});

/**
 * The trials. Times are seconds into the take (02 is 120 fps, 80 is 60 fps -- both read from the
 * site's index, which the AMC does not carry).
 *
 * katana: 02_07 holds its hands 0.14-0.23 m apart for the whole take, and 6.8-7.6 s is an
 *   overhead cut from above the head to below the hips. The subject holds the sword with the
 *   LEFT hand at the guard (the left-to-right hand line points back at the chest in 170 of 188
 *   samples), and the game's katana is in the right hand, so the take is mirrored left for
 *   right. The left hand then goes 0.15 m behind the right fist on the 0.26 m handle.
 * rifle: 80_03 raises a long gun and holds the aim from 4.5 s to 7 s with the hands 0.44 m
 *   apart, the left ahead.
 */
export const PRESETS=Object.freeze({
 // The cut is replayed faster than it was captured: the subject's hands peak near 3 m/s, a
 // committed two-handed cut is about twice that. `warp` is [source second, playback speed]
 // knots (linear between): the raise a little brisker, the cut itself at 2x, the recovery 1.3x.
 // The subject also folds deep at the hips in the follow-through (the trunk 60° off vertical);
 // `trunk` softens anything past 28° to a third of the excess.
 'katana-cut':{trial:'02_07',subject:'02',fps:120,from:6.2,to:8.4,weapon:'katana',left:-.15,mirror:true,
  warp:[[6.2,1.25],[6.85,1.25],[7.0,2.0],[7.5,2.0],[7.7,1.3],[8.4,1.3]],trunk:{limit:28,keep:.33}},
 // The two-handed guard the katana stands in: 02_07's one quiet stretch with the hands together
 // at the chest (18.0-18.6 s, the hands 0.18 m apart, 0.23 m above the hips), looped.
 'katana-guard':{trial:'02_07',subject:'02',fps:120,from:17.95,to:18.7,weapon:'katana',left:-.15,mirror:true,loop:.3,
  trunk:{limit:28,keep:.33}},
 // The raise, from a low ready to the shouldered aim. The capture holds the gun 17° high and in
 // front of the chest, and starts with it hanging sideways from the hands: so the gun is at a
 // low ready (muzzle forward and 40° down) while the source's hands are low, and in the shoulder,
 // levelled, once they are up -- the blend follows the source's hand height, so the timing is
 // the capture's. With the stock at the shoulder the left hand cannot reach the source's 0.46 m
 // fore-end (13 cm short on this body's 0.48 m arm), so it goes 0.28 m ahead of the grip: a
 // short weapon's fore-end, which is what a submachine gun would have.
 'rifle-raise':{trial:'80_03',subject:'80',fps:60,from:1.9,to:7.0,weapon:'rifle',shoulder:'raise',spacing:SHAPE.smg.foreEnd},
 // The held aim alone, looped (the last 0.4 s eases back onto the first key).
 'rifle-shouldered':{trial:'80_03',subject:'80',fps:60,from:4.2,to:6.8,weapon:'rifle',shoulder:'hold',spacing:SHAPE.smg.foreEnd,loop:.4}
});

// The gun is the game's submachine gun (§9ah): its grip frame and its shape (butt, fore-end,
// sight) are read from src/player/weapons.mjs, so the clips and the mesh cannot drift apart.
const GRIPS={katana:GRIP.katana,rifle:GRIP.smg};

const basis=(forward,up)=>{
 const z=forward.clone().normalize(),x=up.clone().cross(z).normalize(),y=z.clone().cross(x);
 return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z));
};
// The left hand is the right one mirrored in the body's sagittal plane; in hand space that is
// (x, y, z) -> (-x, y, z) (hand_r rests at +90° about Z, hand_l at -90°).
const mirror=v=>new Vector3(-v[0],v[1],v[2]);
/** A source pose mirrored in its own sagittal plane (x -> -x), left and right swapped. */
const swap=n=>/^l[a-z]/.test(n)&&n!=='lowerback'&&n!=='lowerneck'?'r'+n.slice(1):/^r[a-z]/.test(n)&&n!=='root'?'l'+n.slice(1):n;
function mirrored(pose){
 const out=new Map();
 const flip=v=>new Vector3(-v.x,v.y,v.z);
 for(const [n,j] of pose){const r=j.rotation;
  out.set(swap(n),{rotation:new Quaternion(r.x,-r.y,-r.z,r.w),start:flip(j.start),end:flip(j.end)});}
 return out;
}
/** The segment each target bone's rest direction is measured along: bone -> child. */
const SEGMENT=Object.freeze({spine_01:'spine_02',spine_02:'spine_03',spine_03:'neck_01',neck_01:'Head',
 clavicle_l:'upperarm_l',upperarm_l:'lowerarm_l',lowerarm_l:'hand_l',clavicle_r:'upperarm_r',upperarm_r:'lowerarm_r',lowerarm_r:'hand_r',
 thigh_l:'calf_l',calf_l:'foot_l',foot_l:'ball_l',thigh_r:'calf_r',calf_r:'foot_r',foot_r:'ball_r'});
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.dot(b))))*180/Math.PI;

function worldQuat(bone){bone.updateWorldMatrix(true,false);return new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(bone.matrixWorld));}
function setWorldQuat(bone,q){
 const parent=worldQuat(bone.parent);
 bone.quaternion.copy(parent.invert().multiply(q));
 bone.updateMatrixWorld(true);
}
const pos=bone=>{bone.updateWorldMatrix(true,false);return new Vector3().setFromMatrixPosition(bone.matrixWorld);};

const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
/** Turn a bone by a world-space rotation, keeping its children's world poses only through it. */
const turnWorld=(bone,q)=>setWorldQuat(bone,q.clone().multiply(worldQuat(bone)));

/**
 * Forearm twist. A hand turned to hold a weapon mostly TWISTS about the forearm, and a wrist
 * cannot twist -- pronation and supination happen along the forearm's two bones. So `share` of
 * the hand's twist about the bone axis (+Y, the hand's origin sits on the forearm's +Y) moves
 * into the forearm; the hand's world rotation, and the wrist's position, do not change.
 * Returns the wrist's remaining swing (bend) and twist, in degrees.
 */
function shareTwist(forearm,hand,bindHand,share){
 const local=bindHand.clone().invert().multiply(hand.quaternion);   // the hand's turn from rest
 const twist=new Quaternion(0,local.y,0,local.w).normalize();
 const part=new Quaternion().slerp(twist,share);
 forearm.quaternion.multiply(part);
 hand.quaternion.premultiply(part.clone().invert());
 forearm.updateMatrixWorld(true);
 const after=bindHand.clone().invert().multiply(hand.quaternion);
 const tw=new Quaternion(0,after.y,0,after.w).normalize(),swing=after.clone().multiply(tw.clone().invert());
 return {bend:angle(swing,new Quaternion()),twist:angle(tw,new Quaternion())};
}

/** A wrist's bend from rest with its twist about the bone axis (+Y) taken out, in degrees. */
function bendOf(handQ,bindQ){
 const local=bindQ.clone().invert().multiply(handQ),tw=new Quaternion(0,local.y,0,local.w).normalize();
 return angle(local.multiply(tw.invert()),new Quaternion());
}

/**
 * Elbow swivel: turn the upper arm about the shoulder-to-wrist line (the wrist stays where it is),
 * up to 40° either way, to the angle where the hand -- held at `want` in world -- bends least at
 * the wrist. Leaves the arm there with the hand set; returns that bend (plus a small cost per
 * degree of swivel, so a straight wrist is not bought with a flailing elbow).
 */
function swivel(upper,hand,want,bindHand){
 const shoulder=pos(upper),axis=pos(hand).sub(shoulder).normalize(),start=upper.quaternion.clone();
 let best=Infinity,bestAngle=0;
 const at=a=>{upper.quaternion.copy(start);upper.updateMatrixWorld(true);
  turnWorld(upper,new Quaternion().setFromAxisAngle(axis,a*Math.PI/180));setWorldQuat(hand,want);
  return bendOf(hand.quaternion,bindHand)+Math.abs(a)*.08;};
 for(let a=-40;a<=40;a+=5){const b=at(a);if(b<best){best=b;bestAngle=a;}}
 return at(bestAngle);
}

/** Two-bone IK: move `c`'s origin (the wrist) to `target`, keeping the elbow in its plane. */
function reach(a,b,c,target){
 const A=pos(a),B=pos(b),C=pos(c);
 const la=A.distanceTo(B),lb=B.distanceTo(C);
 const d=Math.min(la+lb-1e-4,Math.max(Math.abs(la-lb)+1e-4,A.distanceTo(target)));
 // The elbow: its current bend about the plane's normal, changed to the bend that gives d.
 const n=new Vector3().subVectors(B,A).cross(new Vector3().subVectors(C,B));
 if(n.lengthSq()<1e-10)n.set(0,1,0);n.normalize();
 const now=new Vector3().subVectors(A,B).angleTo(new Vector3().subVectors(C,B));
 const want=Math.acos(Math.min(1,Math.max(-1,(la*la+lb*lb-d*d)/(2*la*lb))));
 setWorldQuat(b,new Quaternion().setFromAxisAngle(n,now-want).multiply(worldQuat(b)));
 // The shoulder: swing the whole arm so the wrist lands on the target.
 const C2=pos(c);
 const swing=new Quaternion().setFromUnitVectors(C2.sub(A).normalize(),target.clone().sub(A).normalize());
 setWorldQuat(a,swing.multiply(worldQuat(a)));
 return pos(c).distanceTo(target);
}

export async function weaponClip({dir,preset,glbPath='public/data/character/citizen.glb',fps=30}){
 const P=PRESETS[preset];if(!P)throw new Error(`unknown preset ${preset}`);
 const asfText=readFileSync(`${dir}/${P.subject}.asf`,'utf8'),amcText=readFileSync(`${dir}/${P.trial}.amc`,'utf8');
 const skeleton=parseASF(asfText),frames=parseAMC(amcText);

 const bytes=readFileSync(glbPath);
 const gltf=await new Promise((res,rej)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const root=gltf.scene;root.updateMatrixWorld(true);
 const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 const tgtRest=new Map();
 for(const ue of Object.values(ASF_MAP))tgtRest.set(ue,worldQuat(bones.get(ue)));
 const bind=new Map([...bones].map(([n,b])=>[n,b.quaternion.clone()]));
 // The two rests are both T poses, but not the same T: CMU's thighs splay 20° out and its
 // clavicles run a different line. Copying turns from rest onto a different rest carries that
 // difference into every frame (crossed legs, the RUN 5.7 shoulder). So each target bone is
 // first swung, at rest, onto the source bone's rest direction; the turn is applied after.
 const align=new Map();
 const flipX=P.mirror?v=>new Vector3(-v.x,v.y,v.z):v=>v;
 const asfOf=Object.fromEntries(Object.entries(ASF_MAP).map(([a,u])=>[u,a]));
 for(const [ue,child] of Object.entries(SEGMENT)){
  // Mirrored, the target's left bone follows the source's right one.
  const asf=P.mirror?swap(asfOf[ue]):asfOf[ue];
  const src=flipX(skeleton.get(asf).direction.clone()).normalize();
  const tgt=pos(bones.get(child)).sub(pos(bones.get(ue))).normalize();
  align.set(ue,new Quaternion().setFromUnitVectors(tgt,src));
 }

 // Scale for travel and height: the two rigs' hip heights at rest.
 const k=pos(bones.get('pelvis')).y/restHipHeight(skeleton);

 // Face +Z. The long gun: the yaw that turns the weapon's mean horizontal direction over the
 // window's second half (the held aim) onto +Z. The katana: the chest's mean facing over the
 // window, since a follow-through's blade can point anywhere and the body is what the game turns.
 const at=t=>frames[Math.min(frames.length-1,Math.round(t*P.fps))];
 const pose=frame=>P.mirror?mirrored(forwardASF(skeleton,frame)):forwardASF(skeleton,frame);
 const axisOf=src=>{
  const L=src.get('lhand').end,R=src.get('rhand').end;
  return P.weapon==='katana'?R.clone().sub(L):L.clone().sub(R);
 };
 const mean=new Vector3();
 if(P.weapon==='katana')for(let t=P.from;t<=P.to;t+=.05)mean.add(new Vector3(0,0,1).applyQuaternion(pose(at(t)).get('thorax').rotation).setY(0).normalize());
 else for(let t=(P.from+P.to)/2;t<=P.to;t+=.05)mean.add(axisOf(pose(at(t))).setY(0).normalize());
 // atan2(x, z) is the heading of `mean`; turning by minus that heading brings it onto +Z.
 const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.atan2(mean.x,mean.z));
 const start=pose(at(P.from)).get('root').start.clone();

 // The fore-end spacing for the long gun: the source's own, median over the window, scaled.
 let spacing=0;
 if(P.weapon==='rifle'){
  const d=[];for(let t=P.from;t<P.to;t+=.05){const s=pose(at(t));d.push(s.get('lhand').end.distanceTo(s.get('rhand').end));}
  d.sort((a,b)=>a-b);spacing=P.spacing??d[d.length>>1]*k;
 }
 const grip=GRIPS[P.weapon];
 const gripR=basis(new Vector3(...grip.forward),new Vector3(...grip.up));
 const gripL=basis(mirror(grip.forward),mirror(grip.up)),atL=mirror(grip.at);

 // Playback time -> source time, through the warp (identity without one).
 const knots=P.warp??[[P.from,1],[P.to,1]];
 const speedAt=u=>{for(let i=1;i<knots.length;i++)if(u<=knots[i][0]){const [a,sa]=knots[i-1],[b,sb]=knots[i];return sa+(sb-sa)*(u-a)/(b-a);}return knots[knots.length-1][1];};
 const table=[[0,P.from]];
 for(let u=P.from,out=0;u<P.to;){const du=Math.min(1/480,P.to-u);out+=du/speedAt(u+du/2);u+=du;table.push([out,u]);}
 const sourceAt=t=>{let lo=0,hi=table.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(table[m][0]<=t)lo=m;else hi=m;}
  const [t0,u0]=table[lo],[t1,u1]=table[hi];return t1>t0?u0+(u1-u0)*(t-t0)/(t1-t0):u0;};
 const duration=table[table.length-1][0],steps=Math.max(2,Math.round(duration*fps)+1);
 const times=[],tracks=new Map(Object.values(ASF_MAP).map(n=>[n,[]])),rootPos=[];
 // The eye, in the head's frame: 7 cm above and 9 cm in front of the head bone at bind.
 const headBone=bones.get('Head'),eyeLocal=headBone.worldToLocal(pos(headBone).add(new Vector3(0,.07,.09)));
 const grips=[],eyeGap=[],trunkMax={before:0,after:0};
 const stats={leftMiss:0,handsSource:[],handsTarget:[],wrist:{r:[],l:[]},elevation:[],butt:[]};
 // The gun's butt, in the weapon frame (SHAPE.smg; the mesh is built from the same numbers).
 const BUTT=new Vector3(...SHAPE.smg.butt);
 for(let s=0;s<steps;s++){
  const t=s/(steps-1)*duration;times.push(t);
  const src=pose(at(sourceAt(t)));
  for(const [n,b] of bones)b.quaternion.copy(bind.get(n));
  // 1. Rotations, parents first.
  for(const [asf,ue] of Object.entries(ASF_MAP)){
   const turn=yaw.clone().multiply(src.get(asf).rotation);
   setWorldQuat(bones.get(ue),turn.multiply(align.get(ue)??new Quaternion()).multiply(tgtRest.get(ue)));
  }
  // 3 (first half). The pelvis: scaled travel from the window's start, turned with the yaw.
  const hip=src.get('root').start.clone().sub(start).applyQuaternion(yaw).multiplyScalar(k);
  const pelvis=bones.get('pelvis'),world=new Vector3(hip.x,start.y*k+hip.y,hip.z);
  pelvis.position.copy(pelvis.parent.worldToLocal(world));
  root.updateMatrixWorld(true);

  // The trunk: anything past `limit` degrees off vertical kept at `keep` of the excess, spread
  // over the three spine bones. The legs are untouched; the weapon turns with the chest.
  const fix=new Quaternion();
  if(P.trunk){
   const trunk=pos(bones.get('neck_01')).sub(pos(bones.get('pelvis'))).normalize();
   const tilt=Math.acos(Math.min(1,trunk.y))*180/Math.PI;
   trunkMax.before=Math.max(trunkMax.before,tilt);
   // Turning the spine does not turn the pelvis-to-spine_01 segment the tilt is measured along,
   // so the correction is applied until the measured tilt is where it should be.
   const want=tilt>P.trunk.limit?P.trunk.limit+(tilt-P.trunk.limit)*P.trunk.keep:tilt;
   for(let i=0;i<4;i++){
    const now=pos(bones.get('neck_01')).sub(pos(bones.get('pelvis'))).normalize();
    const excess=Math.acos(Math.min(1,now.y))*180/Math.PI-want;if(excess<.5)break;
    const axis=now.clone().cross(new Vector3(0,1,0)).normalize();
    const step=new Quaternion().setFromAxisAngle(axis,excess*Math.PI/180/3);
    for(const b of ['spine_01','spine_02','spine_03'])turnWorld(bones.get(b),step);
    fix.premultiply(new Quaternion().setFromAxisAngle(axis,excess*Math.PI/180));
   }
   trunkMax.after=Math.max(trunkMax.after,Math.acos(Math.min(1,pos(bones.get('neck_01')).sub(pos(bones.get('pelvis'))).normalize().y))*180/Math.PI);
  }

  // 2. The weapon.
  const L=src.get('lhand').end.clone().applyQuaternion(yaw),R=src.get('rhand').end.clone().applyQuaternion(yaw);
  stats.handsSource.push(L.distanceTo(R));
  const axis=(P.weapon==='katana'?R.clone().sub(L):L.clone().sub(R)).normalize().applyQuaternion(fix);
  const chest=fix.clone().multiply(yaw).multiply(src.get('thorax').rotation);   // turned further below if bladed
  let up,weapon,raised=1;
  if(P.weapon==='katana'){
   // The edge leads in the plane of the cut: perpendicular to the blade, across the chest's
   // right-left line (edge down at the middle guard, forward when raised overhead).
   up=axis.clone().cross(new Vector3(-1,0,0).applyQuaternion(chest));
   weapon=basis(axis,up);
  }else{
   // Aimed: level, along the source's heading. Low ready: the same heading, 40° down. The raise
   // blends between them by the source's hand height above its hips (low below -0.05 m, up
   // from +0.25 m).
   const heading=axis.clone().setY(0).normalize();
   const aim=basis(heading,new Vector3(0,1,0));
   const down=new Quaternion().setFromAxisAngle(new Vector3(0,1,0).cross(heading).normalize(),40*Math.PI/180);
   const low=basis(heading.clone().applyQuaternion(down),new Vector3(0,1,0).applyQuaternion(down));
   const hands=(L.y+R.y)/2-src.get('root').start.y;
   raised=P.shoulder==='raise'?smooth(-.05,.25,hands):1;
   weapon=low.clone().slerp(aim,raised);
  }
  const forward=new Vector3(0,0,1).applyQuaternion(weapon);
  const handR=bones.get('hand_r'),handL=bones.get('hand_l');
  const wantR=weapon.clone().multiply(gripR.clone().invert());
  const scaleR=new Vector3();handR.getWorldScale(scaleR);
  const gripOffset=new Vector3(...grip.at).multiply(scaleR).applyQuaternion(wantR);
  if(P.shoulder){
   // A shouldered long gun wants the body bladed further than the capture's 35° and the stock
   // under the eye. The spine turns up to 15° more (half at spine_02, half at spine_03), in
   // whichever direction brings the right shoulder toward the head across the line of fire,
   // and the neck turns back by the same so the face stays on the target.
   const side=new Vector3(0,1,0).cross(forward).normalize();      // +side is the player's left
   const lateral=()=>pos(bones.get('upperarm_r')).sub(headBone.localToWorld(eyeLocal.clone())).dot(side);
   const blade=15*raised*Math.PI/180,before=Math.abs(lateral());
   let turn=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),blade);
   const tryTurn=q=>{for(const b of ['spine_02','spine_03'])turnWorld(bones.get(b),new Quaternion().slerp(q,.5));turnWorld(bones.get('neck_01'),q.clone().invert());};
   tryTurn(turn);
   if(Math.abs(lateral())>before){tryTurn(turn.clone().invert());turn=turn.invert();tryTurn(turn);}
   chest.premultiply(turn);
   // The butt in the shoulder pocket: 5 cm in front of the shoulder joint, 8 cm in toward the
   // chest (the pocket is inside the deltoid, not on the joint) and 2 cm below it -- then, as the
   // gun comes up, moved across the line of fire until the sight line is within 0.5 cm of the eye
   // (a cheek weld is then a small lean of the head, not an ear on the shoulder).
   const pocket=pos(bones.get('upperarm_r')).addScaledVector(new Vector3(0,0,1).applyQuaternion(chest),.05)
    .addScaledVector(new Vector3(1,0,0).applyQuaternion(chest),.08).add(new Vector3(0,-.02,0));
   const across=headBone.localToWorld(eyeLocal.clone()).sub(pocket).dot(side);
   if(Math.abs(across)>.005)pocket.addScaledVector(side,(across-Math.sign(across)*.005)*raised);
   // The low ready keeps the butt in the shoulder and dips the muzzle 40°: the gun pivots about
   // the butt, so the stock never swings into the chest (tilting it about the grip did).
   const gripAt=pocket.sub(BUTT.clone().applyQuaternion(weapon));
   // Whatever the pose, the fore-end must be within the left arm's reach: if it is not, the whole
   // gun comes toward the left shoulder by the shortfall (97% of the arm, so the elbow keeps a bend).
   const shoulderL=pos(bones.get('upperarm_l')),arm=pos(bones.get('lowerarm_l')).distanceTo(shoulderL)+pos(handL).distanceTo(pos(bones.get('lowerarm_l')));
   const fore=gripAt.clone().addScaledVector(forward,spacing),short=fore.distanceTo(shoulderL)-arm*.97;
   if(short>0)gripAt.addScaledVector(shoulderL.clone().sub(fore).normalize(),short);
   reach(bones.get('upperarm_r'),bones.get('lowerarm_r'),handR,gripAt.sub(gripOffset));
  }
  if(P.weapon==='katana'){
   // The right hand may turn the blade up to 15° off the plane of the cut (at a cost of 0.6° of
   // wrist bend per degree, so the edge still leads): the roll that bends the wrist least wins.
   let bestRoll=0,best=Infinity;
   const tryRoll=roll=>{
    const w=new Quaternion().setFromAxisAngle(forward,roll*Math.PI/180).multiply(weapon);
    return swivel(bones.get('upperarm_r'),handR,w.multiply(gripR.clone().invert()),bind.get('hand_r'))+Math.abs(roll)*.6;
   };
   for(let roll=-15;roll<=15;roll+=5){const b=tryRoll(roll);if(b<best){best=b;bestRoll=roll;}}
   tryRoll(bestRoll);
   weapon.premultiply(new Quaternion().setFromAxisAngle(forward,bestRoll*Math.PI/180));
  }else{
   setWorldQuat(handR,wantR);
   // The right elbow swings about the shoulder-to-wrist line to where the wrist bends least.
   swivel(bones.get('upperarm_r'),handR,wantR,bind.get('hand_r'));
  }
  const origin=handR.localToWorld(new Vector3(...grip.at));
  grips.push(origin.clone());
  const target=origin.clone().addScaledVector(forward,P.weapon==='katana'?P.left:spacing);
  // The left hand may roll about the weapon's axis (a hand closes round a handle or a fore-end
  // at any roll), up to 60° either way: the roll that leaves the wrist least bent is kept.
  const scale=new Vector3();handL.getWorldScale(scale);
  const placeL=roll=>{
   const want=new Quaternion().setFromAxisAngle(forward,roll*Math.PI/180).multiply(weapon).multiply(gripL.clone().invert());
   // Where the wrist must be for the left grip point to land on the target with that rotation.
   reach(bones.get('upperarm_l'),bones.get('lowerarm_l'),handL,target.clone().sub(atL.clone().multiply(scale).applyQuaternion(want)));
   return swivel(bones.get('upperarm_l'),handL,want,bind.get('hand_l'))+Math.abs(roll)*.05;
  };
  // The left shoulder girdle helps a short arm: if the place is past 97% of the arm, the clavicle
  // turns toward it (up to 20°), which brings the shoulder joint that much closer.
  {
   const clav=bones.get('clavicle_l'),shoulder=pos(bones.get('upperarm_l'));
   const arm=pos(bones.get('lowerarm_l')).distanceTo(shoulder)+pos(handL).distanceTo(pos(bones.get('lowerarm_l')));
   const short=target.distanceTo(shoulder)-arm*.97;
   if(short>0){
    const base=pos(clav),len=shoulder.distanceTo(base);
    const toward=new Quaternion().setFromUnitVectors(shoulder.clone().sub(base).normalize(),target.clone().sub(base).normalize());
    const need=Math.min(20*Math.PI/180,short/len),full=2*Math.acos(Math.min(1,Math.abs(toward.w)));
    if(full>1e-4)turnWorld(clav,new Quaternion().slerp(toward,Math.min(1,need/full)));
   }
  }
  let bestRoll=0,best=Infinity;
  for(let roll=-60;roll<=60;roll+=10){const b=placeL(roll);if(b<best){best=b;bestRoll=roll;}}
  placeL(bestRoll);
  stats.leftMiss=Math.max(stats.leftMiss,handL.localToWorld(atL.clone()).distanceTo(target));
  stats.handsTarget.push(handL.localToWorld(atL.clone()).distanceTo(origin));
  // The wrists: 70% of each hand's twist into its forearm (what is left is measured).
  stats.wrist.r.push(shareTwist(bones.get('lowerarm_r'),handR,bind.get('hand_r'),.7));
  stats.wrist.l.push(shareTwist(bones.get('lowerarm_l'),handL,bind.get('hand_l'),.7));
  stats.elevation.push(Math.asin(forward.y)*180/Math.PI);
  if(P.weapon==='rifle'){
   stats.butt.push(BUTT.clone().applyQuaternion(weapon).add(origin).distanceTo(pos(bones.get('upperarm_r'))));
   // The head down to the sights, as far as the gun is up: the eye 3.5 cm above the sight line
   // (the rear sight's top, 11.5 cm over the grip), 60% of the turn at the neck, 40% at the head,
   // at most 10° in all (25° read as a lolling head from the front in the game, §9ah).
   const sight=new Vector3(...SHAPE.smg.sight).applyQuaternion(weapon).add(origin);
   // The eye can only swing on a sphere about the neck, so its target is where the sight line
   // (raised 3.5 cm) crosses that sphere, on the side nearest the eye -- the nearest point of
   // the line would sit inside the sphere and never be reached.
   const headTurn=()=>{
    const eye=headBone.localToWorld(eyeLocal.clone()),neck=pos(bones.get('neck_01'));
    const base=sight.clone().add(new Vector3(0,.035,0)),r=eye.distanceTo(neck);
    const w=base.clone().sub(neck),b=w.dot(forward),c=w.lengthSq()-r*r,disc=b*b-c;
    const near=eye.clone().sub(base).dot(forward);
    const lam=disc>=0?[-b-Math.sqrt(disc),-b+Math.sqrt(disc)].sort((x,y)=>Math.abs(x-near)-Math.abs(y-near))[0]:-b;
    return {eye,neck,onLine:base.addScaledVector(forward,lam)};
   };
   const lineGap=eye=>{const base=sight.clone().add(new Vector3(0,.035,0));return eye.clone().sub(base).projectOnPlane(forward).length();};
   // Iterated: the head bone pivots above the neck, so one pass lands short.
   let budget=10*raised;
   for(let i=0;i<5&&budget>.5;i++){
    const {eye,neck,onLine}=headTurn();
    const full=new Quaternion().setFromUnitVectors(eye.clone().sub(neck).normalize(),onLine.clone().sub(neck).normalize());
    const deg=angle(full,new Quaternion());if(deg<.3)break;
    const part=new Quaternion().slerp(full,Math.min(1,budget/deg));budget-=Math.min(deg,budget);
    turnWorld(bones.get('neck_01'),new Quaternion().slerp(part,.6));
    turnWorld(headBone,new Quaternion().slerp(part,.4));
   }
   if(raised>.99)eyeGap.push(lineGap(headBone.localToWorld(eyeLocal.clone())));
  }

  for(const [ue,v] of tracks){const q=bones.get(ue).quaternion;v.push(q.x,q.y,q.z,q.w);}
  rootPos.push(pelvis.position.x,pelvis.position.y,pelvis.position.z);
 }

 // A loop: the last `loop` seconds ease back onto the first key.
 if(P.loop){
  const qa=new Quaternion(),qb=new Quaternion();
  for(let s=0;s<steps;s++){
   const u=smooth(duration-P.loop,duration,times[s]);if(!u)continue;
   for(const [,v] of tracks){qa.fromArray(v,s*4);qb.fromArray(v,0);qa.slerp(qb,u).toArray(v,s*4);}
   for(let c=0;c<3;c++)rootPos[s*3+c]+=(rootPos[c]-rootPos[s*3+c])*u;
  }
 }

 // 3 (second half). Ground the clip once: the lowest ball of the foot across it onto the floor.
 const BALL_TO_SOLE=.0215;
 let lowest=Infinity;
 for(let s=0;s<steps;s++){
  for(const [ue,v] of tracks)bones.get(ue).quaternion.fromArray(v,s*4);
  bones.get('pelvis').position.fromArray(rootPos,s*3);root.updateMatrixWorld(true);
  lowest=Math.min(lowest,pos(bones.get('ball_l')).y-BALL_TO_SOLE,pos(bones.get('ball_r')).y-BALL_TO_SOLE);
 }
 const pelvis=bones.get('pelvis');
 const lift=pelvis.parent.worldToLocal(new Vector3(0,-lowest,0)).sub(pelvis.parent.worldToLocal(new Vector3()));
 for(let s=0;s<steps;s++){rootPos[s*3]+=lift.x;rootPos[s*3+1]+=lift.y;rootPos[s*3+2]+=lift.z;}

 const sha=text=>createHash('sha256').update(text).digest('hex');
 const med=a=>[...a].sort((x,y)=>x-y)[a.length>>1];
 return {
  source:{dataset:'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu)',trial:P.trial,
   asf:`${P.subject}.asf`,asfSha256:sha(asfText),amc:`${P.trial}.amc`,amcSha256:sha(amcText),from:P.from,to:P.to,fps:P.fps},
  preset,weapon:P.weapon,duration,fps,times,scale:k,groundOffset:-lowest,spacing,warp:P.warp??null,loop:P.loop??null,
  measured:{leftMissCm:+(stats.leftMiss*100).toFixed(1),
   handsApartSourceM:+med(stats.handsSource).toFixed(3),handsApartTargetM:+med(stats.handsTarget).toFixed(3),
   // The wrist after the forearm takes its share of the twist: bend (flexion and deviation
   // together) and the twist left in it. A human wrist bends to about 70° and does not twist.
   wristDeg:Object.fromEntries(['r','l'].map(h=>[h==='r'?'right':'left',{bendMedian:+med(stats.wrist[h].map(w=>w.bend)).toFixed(0),bendMax:+Math.max(...stats.wrist[h].map(w=>w.bend)).toFixed(0),
    twistMax:+Math.max(...stats.wrist[h].map(w=>w.twist)).toFixed(0)}])),
   // The weapon grip's peak speed (the fist on the handle), and the katana's tip.
   gripPeakMs:+Math.max(...grips.slice(1).map((g,i)=>g.distanceTo(grips[i])*fps)).toFixed(1),
   ...(P.trunk?{trunkMaxDeg:{captured:+trunkMax.before.toFixed(0),kept:+trunkMax.after.toFixed(0)}}:{}),
   ...(eyeGap.length?{eyeToSightLineCm:{median:+(med(eyeGap)*100).toFixed(1),max:+(Math.max(...eyeGap)*100).toFixed(1)}}:{})},
  perKey:{elevationDeg:stats.elevation.map(x=>+x.toFixed(1)),...(stats.butt.length?{buttToShoulderM:stats.butt.map(x=>+x.toFixed(3))}:{})},
  tracks:Object.fromEntries(tracks),rootPos
 };
}

if(process.argv[1]?.endsWith('weapon-clip.mjs')){
 const [,,dir,preset,out]=process.argv;
 if(!out){console.error(`usage: weapon-clip.mjs <cmu dir> <${Object.keys(PRESETS).join('|')}> <out.json>`);process.exit(1);}
 const clip=await weaponClip({dir,preset});
 mkdirSync(dirname(out),{recursive:true});
 const round=a=>a.map(x=>+x.toFixed(5));
 writeFileSync(out,JSON.stringify({...clip,times:round(clip.times),rootPos:round(clip.rootPos),
  tracks:Object.fromEntries(Object.entries(clip.tracks).map(([k,v])=>[k,round(v)]))})+'\n');
 console.log(`${out}: ${clip.duration.toFixed(2)} s, ${clip.times.length} keys, scale ${clip.scale.toFixed(3)}, grounded ${(clip.groundOffset*1000).toFixed(0)} mm`,JSON.stringify(clip.measured));
}
