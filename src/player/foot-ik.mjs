// Putting the feet on the actual ground.
//
// RUN 4 made the legs cycle at the right rate; the body still floats over Shibuya on a single
// height sample taken at its own centre. A kerb is 13 cm -- 15 cm of pavement against 2 cm of
// road -- so a character standing astride one has one foot 13 cm inside the tarmac or 13 cm
// above the kerb, and neither foot knows about the ramps that take a kerb down to a crossing.
//
// THE ROLE OF THIS FILE IS BOUNDED, AND THE BOUNDARY IS DELIBERATE.
//
// Foot IK adapts a CORRECT animation to the terrain. It does not correct the animation.
//
// The difference is not pedantry, it is the whole design. A solver that drove every sole onto
// the nearest surface would also hide a clip whose foot is in the wrong place -- and this
// character has one: the Run clip's sole sits 11 mm below the plane the Idle clip stands on,
// and at gameplay speed measures 49 mm mean error against a flat road. Sucking that foot down
// would make the screenshot better and the project worse: the defect would stop being visible,
// the heel-to-toe roll would be spent paying for it, and nobody would ever replace the clip.
//
// So on flat ground this file does NOTHING, by construction, and the audit that judges clips
// lives elsewhere (qa/gta-upgrade/clip-audit.mjs). Bad foot poses are an animation and retarget
// problem and are reported as one. If you are about to add an absolute-height term here to
// close a contact number, you are about to cross this line.
//
// What this is NOT: a system that pins feet to the ground. That produces skating, crouching,
// and knees bent the wrong way, because the animation never agreed to be pinned. The order of
// priorities here is natural animation, then a stable body, then contact -- and when they
// disagree the correction is abandoned rather than forced. A foot that slides a little is a
// much smaller error than a leg that folds backwards.
//
// The maths follows the standard two-bone solve (the same one three-player-controller's
// twoBoneIK.ts implements); the ground query, the stance windows and the failure rules are
// this project's. Everything is in metres. Nothing allocates per frame.
import {Vector3,Quaternion,Matrix4} from 'three';

export const FOOT_IK=Object.freeze({
 // How far the ankle may be moved from where the animation put it. Past this the correction is
 // abandoned: the animation is more likely to be right than the correction is.
 maxReach:.34,
 // A leg is never straightened past this fraction of its own length. At 1.0 the knee locks and
 // the solve becomes numerically unstable; a hair under keeps a bend to work with.
 maxExtension:.985,
 // How fast a correction fades in and out, in units of correction per second. Slow enough that
 // a kerb does not snap, fast enough that it is in place within a step.
 blendRate:9,
 // Pelvis. It drops so that a leg does not have to stretch to reach a low foot, and it drops
 // slowly -- a pelvis that tracks its target every frame is a character that vibrates.
 // The hips take the whole of the lower foot's drop, not a share of it.
 //
 // A share was tried at 0.55 and it does not work: these clips stand on nearly straight legs,
 // so there is no extension left to make up the rest with, and the lower foot stayed 96 mm in
 // the air. Taking all of it is also what a person does -- stand with one foot on a kerb and
 // one in the road and your hips drop by about the height of the kerb.
 maxPelvisDrop:.17, pelvisRate:6.5,
 // Ankle orientation. A ground normal steeper than this is a step, not a slope, so the foot
 // stays flat rather than trying to stand on the edge of a kerb.
 maxAnkleTilt:.42,           // radians, about 24 degrees
 normalEpsilon:.12,          // metres between the samples the normal is estimated from
 normalStep:.055,            // a height difference above this over that span is an edge
 // Stance. Contact windows come from the measured gait; these soften their edges so the
 // correction arrives and leaves over part of a step rather than switching on.
 stanceFade:.16,
 // Corrections below this are not worth making. Solving for a target the foot is already at
 // is not a no-op -- the solver re-derives the leg from its own extension limit, which puts a
 // bend in a leg the animation had straight -- so a walk on flat ground must not be solved at
 // all. This is the line that keeps "respect the animation" from being a slogan.
 deadzone:.006,
 // No ankle-height constant. An earlier draft aimed the ankle at a fixed distance above the
 // surface, which needed one and threw away the heel-to-toe roll the walk cycle has. What is
 // solved for instead is the *difference* between this foot's ground and the ground the body
 // is standing on, and a difference does not care how tall the ankle is. The measurement is
 // still taken by scripts/analyse-gait.mjs and carried in the character report -- the contact
 // benches need it to say how far a sole is from the pavement -- it is just not an input here.
});

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a||1),0,1);return t*t*(3-2*t);};

/**
 * How much of the cycle a foot is planted for, as a weight from 0 to 1.
 *
 * Phase is shared by every locomotion clip and aligned on the left foot's contact (RUN 4), so
 * in phase terms the left foot plants at 0 and the right half a cycle later. The edges are
 * faded because an instant switch is a visible pop even when the position is right.
 */
export function stanceWeight(phase,duty,offset=0){
 // A duty of one is standing: both feet are down for the whole cycle and there is nothing to
 // fade in or out of.
 if(duty>=1)return 1;
 const p=((phase-offset)%1+1)%1;
 const fade=Math.min(FOOT_IK.stanceFade,duty*.45);
 if(p>duty)return 0;
 return Math.min(smoothstep(0,fade,p),smoothstep(0,fade,duty-p));
}

/**
 * Sample the surface and estimate its normal.
 *
 * There are no normals in this world -- the ground is polygons with a height function -- so the
 * normal comes from two finite differences. The catch is that the same difference describes a
 * ramp and a kerb, and standing a foot on a 47-degree kerb edge looks like a broken ankle, so a
 * difference too large for its span is treated as an edge and the surface is reported flat.
 */
export function sampleGround(ctx,x,z,out){
 const e=FOOT_IK.normalEpsilon;
 const h=ctx.heightExact(x,z);
 out.height=h;
 const dx=ctx.heightExact(x+e,z)-h,dz=ctx.heightExact(x,z+e)-h;
 if(Math.abs(dx)>FOOT_IK.normalStep||Math.abs(dz)>FOOT_IK.normalStep){
  out.normal.set(0,1,0);out.edge=true;return out;
 }
 // The plane through (0,0,0), (e,dx,0) and (0,dz,e), normalised.
 out.normal.set(-dx*e,e*e,-dz*e).normalize();
 out.edge=false;
 return out;
}

/**
 * The standard two-bone solve, in world space, driven from the pose the animation just wrote.
 *
 * The bend plane comes from where the animation put the knee, so the knee keeps bending the way
 * the walk cycle bends it. That is what stops a solver from inventing a direction and folding a
 * leg the wrong way, and it is why this takes the animated pose as input rather than replacing
 * it. Returns how far the ankle actually moved, so the caller can decide it went too far.
 */
export function createTwoBoneSolver(){
 const pA=new Vector3(),pB=new Vector3(),pC=new Vector3();
 const axis=new Vector3(),from=new Vector3(),to=new Vector3(),reach=new Vector3();
 const spin=new Quaternion(),world=new Quaternion(),parent=new Matrix4();
 const parentQuaternion=new Quaternion(),scratch=new Vector3();

 /** Turn a bone by `angle` about a world-space axis, keeping it in its parent's frame. */
 const turn=(bone,unit,angle)=>{
  if(!Number.isFinite(angle)||Math.abs(angle)<1e-6)return;
  spin.setFromAxisAngle(unit,angle);
  bone.getWorldQuaternion(world);
  world.premultiply(spin);
  if(bone.parent){
   bone.parent.updateWorldMatrix(true,false);
   parent.copy(bone.parent.matrixWorld);
   parent.decompose(scratch,parentQuaternion,scratch);
   world.premultiply(parentQuaternion.invert());
  }
  bone.quaternion.copy(world);
  bone.updateMatrixWorld(true);
 };
 const angleOf=(a,b,c)=>clamp((a*a+b*b-c*c)/(2*a*b),-1,1);

 return function solve(hip,knee,ankle,target){
  hip.updateWorldMatrix(true,false);
  pA.setFromMatrixPosition(hip.matrixWorld);
  pB.setFromMatrixPosition(knee.matrixWorld);
  pC.setFromMatrixPosition(ankle.matrixWorld);
  const l1=pA.distanceTo(pB),l2=pB.distanceTo(pC);
  if(l1<1e-4||l2<1e-4)return 0;

  reach.copy(target).sub(pA);
  const limit=(l1+l2)*FOOT_IK.maxExtension;
  let distance=reach.length();
  if(distance<1e-4)return 0;
  if(distance>limit){reach.multiplyScalar(limit/distance);distance=limit;}
  const floor=Math.abs(l1-l2)+.01;
  if(distance<floor){reach.multiplyScalar(floor/distance);distance=floor;}

  // The plane the knee already bends in. A straight leg has no plane, so nothing is done.
  axis.copy(pC).sub(pA).cross(scratch.copy(pB).sub(pA));
  if(axis.lengthSq()<1e-9)return 0;
  axis.normalize();

  const current=pA.distanceTo(pC);
  const hipNow=Math.acos(angleOf(l1,current,l2)),hipWanted=Math.acos(angleOf(l1,distance,l2));
  const kneeNow=Math.acos(angleOf(l1,l2,current)),kneeWanted=Math.acos(angleOf(l1,l2,distance));
  turn(hip,axis,hipWanted-hipNow);
  turn(knee,axis,kneeWanted-kneeNow);

  // Then swing the whole leg so the ankle points at the target.
  hip.updateWorldMatrix(true,false);
  pC.setFromMatrixPosition(ankle.matrixWorld);
  from.copy(pC).sub(pA);
  to.copy(reach);
  if(from.lengthSq()>1e-9&&to.lengthSq()>1e-9){
   from.normalize();to.normalize();
   const dot=clamp(from.dot(to),-1,1);
   axis.copy(from).cross(to);
   if(axis.lengthSq()>1e-9)turn(hip,axis.normalize(),Math.acos(dot));
  }
  ankle.updateWorldMatrix(true,false);
  pC.setFromMatrixPosition(ankle.matrixWorld);
  return pC.distanceTo(target);
 };
}

/** One leg's running state. Preallocated; nothing here is built per frame. */
function leg(names){
 return {
  names,hip:null,knee:null,ankle:null,
  target:new Vector3(),anchor:new Vector3(),rise:0,ready:false,
  // Where the animation pointed the sole, in world space, before the solve touched the leg.
  pose:new Quaternion(),
  sample:{height:0,normal:new Vector3(0,1,0),edge:false},
  weight:0,active:false
 };
}

/**
 * Foot IK for one figure.
 *
 * `bones` names the six joints. `read` is called each frame with the figure's world-space root
 * and the gait blend, and does the work in this order: sample the ground under each foot, decide
 * how planted each foot is, drop the pelvis if a leg would otherwise have to stretch, solve each
 * leg, then tilt each ankle to its surface. Anything that fails is skipped, not forced.
 */
export function createFootIK(root,{bones=null,ctx=null}={}){
 const legs={left:leg(['thigh_l','calf_l','foot_l']),right:leg(['thigh_r','calf_r','foot_r'])};
 const names=bones??{pelvis:'pelvis',
  left:['thigh_l','calf_l','foot_l'],right:['thigh_r','calf_r','foot_r']};
 legs.left.names=names.left;legs.right.names=names.right;
 const pelvis=root.getObjectByName(names.pelvis)??null;
 for(const side of ['left','right']){
  const l=legs[side];
  [l.hip,l.knee,l.ankle]=l.names.map(n=>root.getObjectByName(n)??null);
 }
 const solve=createTwoBoneSolver();
 const usable=!!pelvis&&Object.values(legs).every(l=>l.hip&&l.knee&&l.ankle);

 const ankleWorld=new Vector3();
 const hipWorld=new Vector3(),kneeWorld=new Vector3();
 const up=new Vector3(0,1,0),tilt=new Quaternion(),roll=new Quaternion();
 const ankleWorldQuaternion=new Quaternion();
 const identity=new Quaternion();
 const parentQuaternion=new Quaternion(),scratch=new Vector3(),parent=new Matrix4();
 const down=new Vector3(),pelvisScale=new Vector3(1,1,1);
 const stats={solved:0,locked:0,queries:0,pelvisDrop:0,maxError:0,skipped:0};
 let pelvisDrop=0,enabled=true;

 return {
  get usable(){return usable;},
  get stats(){return stats;},
  get pelvisDrop(){return pelvisDrop;},
  setEnabled(value){enabled=!!value;},
  /** Stand down. Called on teleport, respawn, and whenever the feet are not on anything. */
  reset(){
   // The animation rewrites the pelvis every frame, so there is nothing to restore. The
   // counters are cleared too: a solver that has stood down must not still be reporting the
   // legs it solved before it did.
   pelvisDrop=0;
   stats.solved=0;stats.locked=0;stats.queries=0;stats.skipped=0;
   stats.pelvisDrop=0;stats.maxError=0;
   for(const side of ['left','right']){const l=legs[side];l.weight=0;l.active=false;l.ready=false;}
  },

  /**
   * @param phase  the RUN 4 blend's shared cycle phase
   * @param duty   blended stance fraction, and `offset` where the right foot plants
   * @param dt     seconds
   */
  update({phase=0,duty=.4,offset=.5}={},dt=1/60){
   stats.solved=0;stats.locked=0;stats.queries=0;stats.skipped=0;
   stats.maxError=0;
   if(!usable||!enabled||!ctx?.heightExact){stats.skipped=1;return false;}
   const step=clamp(dt,0,.1);
   const fade=1-Math.exp(-FOOT_IK.blendRate*step);

   root.updateMatrixWorld(true);
   // The surface the body is standing on, which is the one the animation was authored over.
   const groundY=root.position.y;
   // Where each foot wants to be, and how planted it is.
   for(const side of ['left','right']){
    const l=legs[side];
    const want=stanceWeight(phase,duty,side==='left'?0:offset);
    l.weight+=(want-l.weight)*fade;
    l.ankle.updateWorldMatrix(true,false);
    ankleWorld.setFromMatrixPosition(l.ankle.matrixWorld);
    if(l.weight<.02){l.ready=false;continue;}

    sampleGround(ctx,ankleWorld.x,ankleWorld.z,l.sample);stats.queries+=3;
    // How far this foot's ground is from the ground the body is standing on, which is the
    // surface the animation was authored over.
    //
    // Two things this deliberately does not do, both measured rather than assumed. It does not
    // aim the ankle at a fixed height above the ground: that throws away the heel-to-toe roll
    // the walk cycle has. And it does not pull the foot horizontally towards where it landed:
    // pinning a planted foot while the body walks past it produces skating and over-extended
    // legs, and RUN 4 already matched stride length to ground speed, so there is little slip
    // left to take. Pulling was tried, and on flat pavement it doubled the contact error it
    // was meant to remove.
    l.rise=l.sample.height-groundY;
    l.anchor.copy(ankleWorld);
    // The sole's world orientation as the animation left it, kept so the solve can be
    // undone on the ankle. See the restore below for why that is not optional.
    l.ankle.getWorldQuaternion(l.pose);
    l.ready=true;
   }

   // Pelvis. When one foot's ground is lower than the other's -- astride a kerb, or on a ramp
   // -- the hips come down with it rather than the leg stretching to meet it. Damped and
   // bounded, or the body vibrates.
   let lowest=0;
   for(const side of ['left','right']){
    const l=legs[side];
    if(l.ready&&l.weight>.1)lowest=Math.min(lowest,l.rise*l.weight);
   }
   // The hips take the WHOLE drop, not a share of it, and that is measured rather than
   // asserted: qa/scratch swept the cap from 0 to 170 mm against a 13 cm kerb and the mean
   // contact error falls monotonically, 64.7 mm at no drop to 7.3 mm at the full 130 --
   // which is the same error flat ground has, i.e. none attributable to the kerb. It is also
   // what a person does; stand with one foot on a kerb and one in the road and your hips go
   // down by about the kerb.
   //
   // An earlier draft capped this at a fraction and reported a residual it blamed on the Idle
   // clip's locked knees. That was wrong twice over, and both were bugs in this file rather
   // than limits of the asset: the drop was being applied along the bone's local Y on a Z-up
   // skeleton, and the solve was left free to pitch the planted foot. See below for each.
   // maxPelvisDrop is therefore a safety rail, not an operating point -- a 13 cm kerb asks
   // for 13 cm and gets it.
   const wantDrop=clamp(-lowest,0,FOOT_IK.maxPelvisDrop);
   pelvisDrop+=(wantDrop-pelvisDrop)*(1-Math.exp(-FOOT_IK.pelvisRate*step));
   if(pelvis&&pelvisDrop>1e-5){
    // Down, in the world, expressed in the pelvis's parent frame.
    //
    // Not `pelvis.position.y -= drop`. This skeleton is authored Z-up: the pelvis bone's rest
    // position is (0.005, 0.086, 0.877), and the height is that 0.877 on Z. A wrapper node
    // rotates the whole armature into the scene's Y-up, so subtracting from the bone's local
    // y moves the hips thirteen centimetres BACKWARDS and not one millimetre down. It looked
    // like it worked, because shoving the pelvis back also drags the feet and changes the
    // contact numbers -- in the wrong direction, for the wrong reason.
    //
    // Converting a world-space down vector into the parent's frame is right whatever axis
    // convention the next character arrives with, which is the point: CharacterAsset exists so
    // a different model can be dropped in, and a hard-coded axis is a trap set for that day.
    //
    // Added to what the animation just wrote, never assigned. Every bone in these clips has an
    // animated translation, so assigning here would replace the walk cycle's own rise and fall
    // with a constant.
    down.set(0,-pelvisDrop,0);
    if(pelvis.parent){
     pelvis.parent.updateWorldMatrix(true,false);
     parent.copy(pelvis.parent.matrixWorld);
     parent.decompose(scratch,parentQuaternion,pelvisScale);
     down.applyQuaternion(parentQuaternion.invert());
     // The parent chain may be scaled (this asset is at 0.95). A local offset is in local
     // units, so the world-space drop has to be divided by that scale to stay in metres.
     down.set(down.x/(pelvisScale.x||1),down.y/(pelvisScale.y||1),down.z/(pelvisScale.z||1));
    }
    pelvis.position.add(down);
    pelvis.updateMatrixWorld(true);
   }
   stats.pelvisDrop=pelvisDrop;

   // What each leg is being asked for. The anchors were taken before the pelvis moved, so a
   // leg whose own ground needs no correction still has to be solved once the hips have come
   // down -- otherwise the pelvis pushes that foot through the pavement, which is exactly what
   // it did before this was split in two.
   const moved=pelvisDrop>FOOT_IK.deadzone;
   for(const side of ['left','right']){
    const l=legs[side];
    l.active=false;
    if(!l.ready)continue;
    const rise=l.rise*l.weight;
    if(Math.abs(rise)<FOOT_IK.deadzone&&!moved)continue;
    if(Math.abs(rise)>FOOT_IK.maxReach){stats.skipped++;continue;}
    l.target.set(l.anchor.x,l.anchor.y+rise,l.anchor.z);
    l.active=true;stats.locked++;
   }

   // Solve, then tilt.
   for(const side of ['left','right']){
    const l=legs[side];
    if(!l.active)continue;
    const error=solve(l.hip,l.knee,l.ankle,l.target);
    stats.solved++;stats.maxError=Math.max(stats.maxError,error);
    if(error>FOOT_IK.maxReach)continue;

    // Put the sole back where the animation pointed it.
    //
    // A two-bone solve turns the thigh and the shin; the foot is rigidly parented to the shin,
    // so it comes along and pitches by however much the knee had to bend. On a kerb that is
    // not small: dropping the hips 130 mm to reach the low foot swung the planted foot's toe
    // 58 mm down into the pavement, while its ankle sat exactly where it was asked to. The
    // ankle is what the solver aims; the sole is what the viewer sees standing on something.
    //
    // So the animated world orientation is restored first, and the ground tilt below is then
    // applied on top of it rather than on top of whatever the solve happened to leave.
    tilt.copy(l.pose);
    // Roll the sole onto the surface. Flat ground and kerb edges both report straight up, so
    // this does nothing at all except on a ramp -- which is the only slope this city has.
    if(l.sample.normal.y<=.9999){
     roll.setFromUnitVectors(up,l.sample.normal);
     const angle=2*Math.acos(clamp(Math.abs(roll.w),-1,1));
     // Cap the tilt by rotating part of the way back towards upright, rather than refusing it:
     // a ramp should tilt the sole, a cliff should not, and everything between should be
     // shortened rather than switched off.
     if(angle>FOOT_IK.maxAnkleTilt){
      identity.identity();identity.slerp(roll,FOOT_IK.maxAnkleTilt/angle);roll.copy(identity);
     }
     tilt.premultiply(roll);
    }
    ankleWorldQuaternion.copy(tilt);
    if(l.ankle.parent){
     l.ankle.parent.updateWorldMatrix(true,false);
     parent.copy(l.ankle.parent.matrixWorld);
     parent.decompose(scratch,parentQuaternion,scratch);
     ankleWorldQuaternion.premultiply(parentQuaternion.invert());
    }
    l.ankle.quaternion.slerp(ankleWorldQuaternion,l.weight);
    l.ankle.updateMatrixWorld(true);
   }
   return true;
  }
 };
}
