import {AnimationMixer,LoopOnce,LoopRepeat} from 'three';
import {bakedCitizen} from './character-asset.mjs';
import {buildGaitSpace,createGaitBlend,createBodyFacing,LOCOMOTION} from './locomotion.mjs';
import {createFootIK} from './foot-ik.mjs';
import {attackOf} from './attack-timing.mjs';
import {createWeaponRig} from './weapon-mesh.mjs';
import {createAimLayer} from './aim-layer.mjs';
import {createHands} from './hands.mjs';
import {createHandsUp,createLimp,createUpperPose,createPhone,createRideGrip,createKatanaGrip} from './body-states.mjs';
import {createHitReaction} from './hit-reaction.mjs';
import {createRagdoll} from './ragdoll.mjs';
import pack from './generated/character.mjs';

export const FIGURE=Object.freeze({height:1.76,shirt:0xc94d38,trousers:0x263443,skin:0xdfb994,hair:0x25282a,cycle:1.55});

const looping=new Set(['Idle','Walk','Run','Sprint','Death','Guard','Drive','SwordIdle','PistolIdle','CrouchWalk','Crawl']);
/** Clips the gait blend owns. Anything else is a one-shot the state machine plays over it. */
const GAIT=new Set(['Idle','Walk','Run','Sprint']);
/** The fists' swings. They own the whole body while they play; see STRIKE. */
const PUNCHES=new Set(['Punch','PunchCross']);
/** Every swing that takes the body over, the katana's cut included (PLAN-WEAPONS W1). */
// Roadmap stage 2: crawling owns the whole body the same way (it is Swim_Fwd_Loop laid on the ground).
const SWINGS=new Set([...PUNCHES,'SwordAttack','Roll','Crawl']);
/**
 * PLAN-WEAPONS W1: holding a weapon changes how the body stands. The weapon's idle takes the
 * Idle share of the gait blend, faded over `STANCE_FADE` s, so standing still with a katana out
 * is Sword_Idle and walking is still the walk.
 */
const STANCE={katana:'SwordIdle',pistol:'PistolIdle',revolver:'PistolIdle'};
const STANCE_FADE=.25;
/** Aiming: the turn rate onto the aim, and how far the upper body twists before the legs follow. */
const GUN_TURN=10,GUN_TWIST=1.75;

/**
 * How a swing takes the body over, and how fast the body turns onto its target.
 *
 * The punch used to go through the mixer at weight 1 ON TOP of a gait blend that already
 * summed to 1. three.js averages every action that animates a bone, so the arm was half punch
 * and half idle: at the jab's peak the fist sat 0.6 m out to the side at chest height instead
 * of 0.76 m forward at the shoulder, which is the sideways swing seen on real hardware. A
 * swing now takes weight from the gait instead of being added to it, so the sum stays 1 and
 * the fist goes where the clip puts it.
 */
export const STRIKE=Object.freeze({fadeIn:.08, fadeOut:.3, turnRate:14});

/**
 * What the body is doing, other than walking.
 *
 * Returns null when nothing is happening and the gait blend should have the body to itself.
 * This used to also pick which locomotion clip to play, by speed thresholds; it does not any
 * more, because a threshold is what put three clips inside a third of a second.
 */
/**
 * The punch envelope, -0.35..1 over the swing: a wind-up away, a drive through that peaks when
 * the fist is out, and a settle. Timing comes from the measured clip, not a fraction chosen by
 * eye. Pure, for the test.
 */
/** Spine lean at the peak of a punch, radians (replaces an 11 cm root slide; see below). */
export const PUNCH_LEAN=.13;
export function punchEmphasis(name,progress){
 const a=attackOf(name),w=a.windup/a.duration,p=a.peak/a.duration,u=Math.max(0,Math.min(1,progress));
 const ease=x=>x*x*(3-2*x);
 if(u<w)return -.35*Math.sin(Math.PI*.5*u/w);
 if(u<p)return -.35+1.35*ease((u-w)/Math.max(1e-6,p-w));
 return 1-ease((u-p)/Math.max(1e-6,1-p));
}

/**
 * The victim's recoil envelope, 0..1 over a blow's hold: snaps in over the first fifth, then
 * eases out. claude/crowd-realism. The baked `Hit` barely moves the body (UAL2's
 * Hit_Knockback is still not pinned), so a punch landed on someone who hardly flinched; this
 * rides on top of it the way punchEmphasis rides on the punch. Pure, for the test.
 */
export function hitRecoil(progress){
 const u=Math.max(0,Math.min(1,progress)),ease=x=>x*x*(3-2*x);
 return u<.2?Math.sin(Math.PI*.5*u/.2):1-ease((u-.2)/.8);
}
/** How far the recoil bends a body, radians: [spine, head], for a jab and for a cross. */
export const RECOIL=Object.freeze({light:[.2,.22],strong:[.38,.34]});

export function characterAction(state){
 if(state.alive===false)return (state.runOver??0)<.6?'Fall':'Death';
 if(state.vehiclePhase>0)return state.vehicleKind==='exit'?'Exit':'Enter';
 // Roadmap stage 6: astride a motorbike, seated with the hands forward on the bars.
 if(state.riding)return 'Drive';
 // Roadmap stage 2: down on the ground with a leg wound, dragging themselves away.
 if(state.crawling)return 'Crawl';
 // PLAN-WEAPONS W4: a dodge roll owns the whole body, like a swing (STRIKE).
 if(state.rollTime>0)return 'Roll';
 if(state.hurtTime>0)return 'Hit';
 if(state.trafficReaction==='guard')return 'Guard';
 if(state.trafficReaction==='startle')return 'Startle';
 if(state.attackTime>0)return state.attackName==='PunchCross'?'PunchCross':state.attackName==='SwordAttack'?'SwordAttack':'Punch';
 return null;
}

/** The old discrete mapping, kept for anything that still asks which clip a speed looks like. */
export function gaitAction(speed=0){
 const v=Math.abs(speed);
 return v<LOCOMOTION.idleSpeed?'Idle':v<2.1?'Walk':v<3.7?'Run':'Sprint';
}

// The offline-baked figure, shared by every instance that does not name another asset. It is
// parsed once: its buffers, skin weights, skeleton and clips are authored at build time, so
// constructing a body allocates a skeleton and a mixer and nothing else.
let baked=null;
export function bakedAsset(){return baked??=bakedCitizen(pack);}

/**
 * One animated body.
 *
 * `asset` is a CharacterAsset (see character-asset.mjs) and decides what the body is made of;
 * everything below decides what it is doing. The two are kept apart because the humanoid
 * asset is loaded over the network and the baked one is not, so the same figure has to be
 * able to start on one and continue on the other.
 */
/**
 * States in which the feet are not walking on anything, and the solver stands down.
 *
 * Correcting a foot towards the ground during a knock-down, a vehicle transition or a death
 * is worse than not correcting it: the animation is deliberately not grounded, and forcing it
 * there folds the leg. Cheaper to believe the animation.
 */
const UNGROUNDED=new Set(['Fall','Death','Enter','Exit','Drive','Roll','Crawl']);
/** Stage 2: how high the crawl's root sits (the clip is a swim, centred on the chest), and its authored pace. */
export const CRAWL=Object.freeze({lift:.36,pace:.55});
/** PLAN-WEAPONS W4: crouching fades in over this long, and Crouch_Fwd_Loop's authored pace. */
const CROUCH_FADE=.25,CROUCH_PACE=.75;

/**
 * @param {any} [asset]
 * @param {any} [palette]
 * @param {{ctx?:any, variant?:any, weapons?:string[]|null, aimCorrection?:boolean}} [options] `weapons`: what the body
 *   carries (PLAN-WEAPONS), drawn in the hand when `state.weapon` names it and stowed otherwise.
 *   `aimCorrection` false leaves the aim pose uncorrected (for the R1 test's comparison only).
 */
export function createPlayerFigure(asset=bakedAsset(),palette=undefined,{ctx=null,variant=null,weapons=null,aimCorrection=true}={}){
 // `variant` names an appearance archetype (RUN 6.8). Assets with one look ignore it.
 const instance=asset.instance(palette,variant),root=instance.root;
 const mixer=new AnimationMixer(root),actions={};
 for(const clip of instance.clips){
  const action=mixer.clipAction(clip),loop=looping.has(clip.name);
  action.setLoop(loop?LoopRepeat:LoopOnce,loop?Infinity:1);
  action.clampWhenFinished=!loop;actions[clip.name]=action;
 }
 const head=root.getObjectByName(asset.bones.head);
 // RUN 11.2: what a punch leans on. Present on the humanoid rig, absent on the baked figure,
 // which simply goes without the emphasis.
 const spine=root.getObjectByName('spine_02');
 const gait=createGaitBlend(buildGaitSpace(instance.clips,asset.gait,asset.gaitDetail));
 const facing=createBodyFacing(0);
 // Foot IK only exists where the skeleton names the joints it needs; the offline-baked figure
 // has eleven bones and none of these names, so it simply goes without.
 const footIK=asset.legBones?createFootIK(root,{bones:asset.legBones,ctx}):null;
 let overlay=null,previousAttack=0,disposed=false,seeded=false,dominant='Idle';
 const strike={Punch:0,PunchCross:0,SwordAttack:0,Roll:0,Crawl:0};
 // PLAN-WEAPONS: how far each weapon stance has faded in.
 const stance={SwordIdle:0,PistolIdle:0};
 // W4: the crouch, its own two actions so it never fights the Guard reaction for one: a copy of
 // Crouch_Idle_Loop (which is the Guard clip) and Crouch_Fwd_Loop.
 const guardClip=instance.clips.find(c=>c.name==='Guard'),crouchWalk=actions.CrouchWalk??null;
 const crouchIdle=guardClip?mixer.clipAction(Object.assign(guardClip.clone(),{name:'CrouchIdle'})):null;
 crouchIdle?.setLoop(LoopRepeat,Infinity);
 let crouchK=0;
 // A jump in world position is a teleport, not a stride. Locked feet have to be forgotten or
 // one gets dragged across the city on the next frame.
 let lastX=null,lastZ=null;
 const teleported=state=>{
  const jumped=lastX!==null&&Math.hypot(state.x-lastX,state.z-lastZ)>1.2;
  lastX=state.x;lastZ=state.z;return jumped;
 };

 // The gait clips are driven by hand: weight and time are set every frame from the blend, and
 // the mixer is only asked to evaluate. Crossfades are what a blend exists to avoid.
 for(const name of GAIT)actions[name]?.play().setEffectiveWeight(0);
 for(const name of GAIT)if(actions[name])actions[name].paused=true;
 if(actions.Idle){actions.Idle.paused=false;actions.Idle.setEffectiveWeight(1);}
 for(const name of Object.keys(stance))actions[name]?.play().setEffectiveWeight(0);
 mixer.update(0);
 // What the body carries (null: nothing, as for every pedestrian). Built on the Idle pose just
 // set, which is the pose the carry positions in weapon-mesh.mjs were placed against.
 const weaponRig=weapons?.length?createWeaponRig(root,{carry:weapons}):null;
 // PLAN-WEAPONS W2: a gun is aimed by an upper-body layer with a muzzle correction (aim-layer.mjs).
 const aimLayer=weaponRig&&weapons.some(w=>w==='pistol'||w==='revolver'||w==='smg')
  ?createAimLayer(root,instance.clips,weaponRig,{correction:aimCorrection}):null;
 // Stage 1: weapon changes and the submachine gun's magazine are hand movements (hands.mjs).
 const hands=weaponRig?createHands(root,weaponRig):null;
 // Roadmap stage 2: hands up at gunpoint, a limp, and the katana's guard held while walking.
 const handsUp=root.getObjectByName('upperarm_l')?createHandsUp(root):null;
 const limp=root.getObjectByName('calf_r')?createLimp(root):null;
 // Stage 4: an onlooker's phone (built on first use: most bodies never hold one).
 let phone=null,ride=null,katanaGrip=null;
 const swordWalk=weaponRig&&weapons.includes('katana')?createUpperPose(root,instance.clips,'SwordIdle'):null;
 let swordK=0;
 // §9ai: a blow you can see land (hit-reaction.mjs), and a body that falls the way it was hit
 // (ragdoll.mjs). Only on a rig that has the bones; the eleven-bone baked figure goes without.
 const hitReaction=root.getObjectByName('spine_02')?createHitReaction(root):null;
 let ragdoll=null,hitSeq=null,ragdollSeq=null;

 /** Play a one-shot or a held pose over the legs, or hand the body back to the gait. */
 function setOverlay(next,state){
  const restart=SWINGS.has(next)&&(state.attackTime??0)>previousAttack+.01;
  if(next===overlay&&!restart)return;
  // A swing's weight is not the mixer's to fade: it is set every frame against the gait (see
  // STRIKE), so it neither fades in over the legs nor out to nothing.
  if(overlay&&actions[overlay]&&!SWINGS.has(overlay))actions[overlay].fadeOut(next==='Fall'?.06:.14);
  if(next&&actions[next]){
   const action=actions[next];
   if(SWINGS.has(next))action.reset().play();
   else action.reset().setEffectiveWeight(1).fadeIn(overlay?.14:.1).play();
  }
  overlay=next&&actions[next]?next:null;
 }

 return {
  root,asset,
  get gait(){return gait;},
  update(state,dt=0){
   if(disposed)return;
   dt=Math.max(0,Math.min(.1,Number(dt)||0));root.visible=true;
   // §9ai H4: killed by a blade or a bullet, the body falls under physics from the pose it had.
   // The ragdoll owns every bone from then on; the root stays where the blow found it.
   if(state.ragdoll&&state.ragdoll.seq!==ragdollSeq){
    ragdollSeq=state.ragdoll.seq;
    ragdoll??=hitReaction?createRagdoll(root):null;
    if(ragdoll?.ready){hitReaction?.reset();footIK?.reset();weaponRig?.show(null,{hidden:true});
     ragdoll.start(state.ragdoll);}
   }
   if(ragdoll?.active){ragdoll.update(dt);return;}
   const speed=Math.abs(state.speed??0);

   // Legs first: an overlay covers them rather than replacing them, so a hit taken at speed
   // does not freeze the feet. A swing is the exception (STRIKE): it is a standing punch, the
   // controller plants the player for it, and it takes the whole body.
   const weights=gait.update(speed,dt);
   // A swing takes its share from the gait rather than being averaged with it (STRIKE).
   const requested=characterAction(state);
   let swung=0;
   for(const name of SWINGS){
    const on=requested===name&&actions[name]?1:0,rate=dt/(on?STRIKE.fadeIn:STRIKE.fadeOut);
    strike[name]+=Math.max(-rate,Math.min(rate,on-strike[name]));
    actions[name]?.setEffectiveWeight(strike[name]);swung+=strike[name];
   }
   const share=Math.max(0,1-swung);
   // The weapon's stance takes the Idle share (STANCE); with nothing out it fades back to Idle.
   const held=STANCE[state.weapon]??null;let stood=0;
   for(const name of Object.keys(stance)){
    const on=held===name&&actions[name]?1:0,rate=dt/STANCE_FADE;
    stance[name]+=Math.max(-rate,Math.min(rate,on-stance[name]));stood+=stance[name];
   }
   // The crouch (W4) takes its share from the whole gait: crouched and still is Crouch_Idle,
   // crouched and moving is Crouch_Fwd_Loop at the pace the body is actually making.
   const crouchOn=!!state.crouching&&!!crouchIdle&&!!crouchWalk;
   crouchK+=Math.max(-dt/CROUCH_FADE,Math.min(dt/CROUCH_FADE,(crouchOn?1:0)-crouchK));
   const idleFrac=weights.get('Idle')??0,upright=share*(1-crouchK);
   if(crouchIdle&&crouchWalk){
    if(crouchK>0&&!crouchIdle.isRunning())crouchIdle.play();
    if(crouchK>0&&!crouchWalk.isRunning())crouchWalk.play();
    crouchIdle.setEffectiveWeight(share*crouchK*idleFrac);
    crouchWalk.setEffectiveWeight(share*crouchK*(1-idleFrac));
    crouchWalk.timeScale=Math.max(.2,speed/CROUCH_PACE);
   }
   const idleShare=idleFrac*upright;
   for(const name of Object.keys(stance))actions[name]?.setEffectiveWeight(idleShare*stance[name]);
   for(const name of GAIT){
    const action=actions[name];if(!action)continue;
    const weight=(weights.get(name)??0)*upright*(name==='Idle'?Math.max(0,1-stood):1);
    action.setEffectiveWeight(weight);
    if(name==='Idle'){action.paused=false;action.timeScale=1;continue;}
    const time=gait.timeFor(name);
    if(time!==null)action.time=time;
   }
   // A phase offset from outside: the near-NPC pool gives every pedestrian its own, so a
   // crowd walks out of step with itself rather than marching.
   if(!seeded&&Number.isFinite(state.animationPhase)){seeded=true;gait.seed(state.animationPhase);}
   dominant='Idle';
   {let best=-1;for(const [name,weight] of weights)if(weight>best){best=weight;dominant=name;}}

   setOverlay(requested&&actions[requested]?requested:null,state);
   mixer.update(dt);

   // Clips the game scrubs rather than plays: their progress is a game quantity, not a clock.
   if(overlay){
    const action=actions[overlay],duration=action.getClip().duration;
    let time=null;
    if(SWINGS.has(overlay)){
     // The player's swing carries its real length: play the clip at its own speed, so the
     // frame the fist is out is the frame the hit test runs (attack-timing.mjs measured both).
     // NPC swings come in as the old 0.42 s pulse and keep that mapping.
     const total=state.attackDuration>0?state.attackDuration:.42;
     time=state.attackDuration>0?duration*(1-state.attackTime/total):duration-state.attackTime*(duration/.42);
     // A katana cut that met a wall holds the frame it met it on (combat.mjs cut()).
     if(overlay==='SwordAttack'&&Number.isFinite(state.attackHold))time=state.attackHold*duration;
     // W4: the roll is scrubbed by its own clock, not the attack's.
     if(overlay==='Roll')time=duration*(1-(state.rollTime??0)/(state.rollDuration||duration));
     // Stage 2: the crawl loops at the pace the body is dragging itself.
     if(overlay==='Crawl'){time=null;action.timeScale=Math.max(.25,Math.min(2,speed/CRAWL.pace));}
    }
    if(overlay==='Hit'){const total=state.hurtDuration>0?state.hurtDuration:.34;
     time=state.hurtTime>0?duration*(1-state.hurtTime/total):duration/2;}
    if(overlay==='Enter'||overlay==='Exit')time=state.vehiclePhase*duration;
    if(overlay==='Fall')time=state.runOver??0;
    if(time!==null){action.time=Math.max(0,Math.min(duration,time));mixer.update(0);}
   }
   previousAttack=state.attackTime??0;

   // Moving, the body faces where it is going. Standing, it faces where the camera is
   // looking -- but only once the camera has swung far enough to be worth turning for, which
   // is createBodyFacing's job. Feeding it the body heading in both cases, as this did, meant
   // a standing character never learned the view had moved at all and stood facing a wall
   // while the camera orbited it.
   // A swing faces what it is thrown at: combat picks the target when the swing starts and
   // tracks it through the wind-up (`attackHeading`), and the body turns onto it fast enough
   // to be square before the fist is out.
   const aiming=(state.attackTime>0||Number.isFinite(state.attackHold)&&strike.SwordAttack>0)&&Number.isFinite(state.attackHeading);
   // PLAN-WEAPONS R2: a gun is aimed left and right by turning. Standing, the body turns onto the
   // aim; walking, the legs keep facing the way they walk (there are no strafe clips) and the aim
   // layer turns the upper body, unless the aim is behind the walk, when the body turns round.
   const gunAim=(state.aim>0||(state.shotLeft??0)>0)&&Number.isFinite(state.aimHeading);
   const walkHeading=state.bodyHeading??state.heading??0;
   const behind=gunAim&&Math.abs(Math.atan2(Math.sin(state.aimHeading-walkHeading),Math.cos(state.aimHeading-walkHeading)))>GUN_TWIST;
   const turnToAim=gunAim&&(speed<=LOCOMOTION.idleSpeed||behind)&&!(state.rollTime>0);
   const desired=aiming?state.attackHeading:turnToAim?state.aimHeading:speed>LOCOMOTION.idleSpeed
    ?walkHeading
    :(state.heading??state.bodyHeading??0);
   facing.update(desired,speed,dt,aiming?STRIKE.turnRate:state.rollTime>0?STRIKE.turnRate*2:turnToAim?GUN_TURN:undefined);
   root.position.set(state.x,state.y+(overlay==='Crawl'?CRAWL.lift*strike.Crawl:0),state.z);
   // Stage 6: on a bike the body is the bike's: its heading at once, and its lean into the turn.
   if(state.riding)root.rotation.set(0,state.heading??0,state.riderLean??0,'YXZ');
   else root.rotation.set(0,facing.heading,overlay==='Crawl'?0:facing.lean,'YXZ');
   if(state.trafficReaction==='look'&&Number.isFinite(state.threatHeading)&&head)
    head.rotation.y=Math.max(-.8,Math.min(.8,Math.atan2(Math.sin(state.threatHeading-facing.heading),Math.cos(state.threatHeading-facing.heading))));
   // RUN 11.2: weight behind a punch: the body leans into it as the fist goes out. Additive
   // and bounded, and only for a swing that carries its timing (the player's).
   //
   // It used to twist the torso as well (spine .24 and chest .2 rad). The twist ran the wrong
   // way -- positive yaw pulls the left shoulder BACK -- and any twist at all swings an
   // extended arm off its line: at the jab's peak it alone moved the fist 28 cm outward. The
   // clips already turn the shoulders into the punch, so the twist is gone and the lean stays.
   if(PUNCHES.has(overlay)&&state.attackDuration>0&&spine){
    const k=punchEmphasis(overlay,1-state.attackTime/state.attackDuration);
    // claude/crowd-realism: the weight goes forward through the spine, not by sliding the whole
    // body. Moving the root 11 cm with both feet planted slid both feet 11 cm on every punch;
    // a deeper lean puts the chest about as far forward and leaves the feet where they are.
    const lean=Math.max(0,k);spine.rotateX(PUNCH_LEAN*lean);
   }
   // claude/crowd-realism: the victim's side of a blow. Bend away from it -- back for a blow
   // from the front, sideways for one from the side -- in the body's own frame, snapping in and
   // settling over the blow's hold.
   if(overlay==='Hit'&&spine&&state.hurtTime>0&&(state.hurtX||state.hurtZ)){
    const total=state.hurtDuration>0?state.hurtDuration:.34,k=hitRecoil(1-state.hurtTime/total);
    const [bend,snap]=state.hurtStrong?RECOIL.strong:RECOIL.light;
    const s=Math.sin(facing.heading),c=Math.cos(facing.heading);
    const back=-(state.hurtX*s+state.hurtZ*c),across=state.hurtX*c-state.hurtZ*s;
    spine.rotateX(-bend*k*back);spine.rotateZ(-bend*k*across*.8);
    head?.rotateX(-snap*k*back);head?.rotateZ(-snap*k*across*.8);
   }
   root.updateMatrixWorld(true);
   // The weapon in the hand, and the rest where they are carried (PLAN-WEAPONS R3). Stage 1: while
   // the hand is changing weapons it holds the old one until it has put it away.
   const inHand=hands?hands.begin(state,dt):state.weapon??null;
   weaponRig?.show(inHand);
   // The gun arm over whatever the legs are doing, pointed at the target (R1). Not during a
   // swing, a fall or a car. Mid-change it poses the weapon actually in the hand, lowered.
   const posed=inHand!==(state.weapon??null)?{...state,weapon:inHand,aim:0,shotLeft:0}:state;
   // Stage 2: walking with the katana out, the upper body keeps the two-handed guard.
   // Held standing too, not only walking: fading it in as the walk starts left the walk's
   // swinging arm in charge for a fifth of a second, and the blade swung back behind the body
   // every time the player set off (seen on a phone, where the stick starts and stops a lot).
   if(swordWalk){const on=inHand==='katana'&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay);
    swordK+=Math.max(-dt/.2,Math.min(dt/.2,(on?1:0)-swordK));if(swordK>0){const k=swordK*swordK*(3-2*swordK);swordWalk.update(k,dt);
     // The clip's elbows are raised and turned in; point them down and out (body-states).
     katanaGrip??=createKatanaGrip(root);katanaGrip.update(k);}}
   if(aimLayer&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay))aimLayer.update(posed,dt);
   if(hands&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay))hands.update(posed,dt);
   // Stage 2: hands up (over whatever the arms were doing), and the limp (before the feet are planted).
   handsUp?.update(!!state.handsUp&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay)&&state.alive!==false,dt);
   if(state.phone&&!phone&&handsUp)phone=createPhone(root);
   phone?.update(state.phone&&!state.handsUp&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay)?state.phone:null,dt);
   // Stage 6: on the bike, hands on the grips and feet on the pegs.
   if(state.riding&&!ride&&handsUp)ride=createRideGrip(root);
   ride?.update(!!state.riding&&overlay==='Drive');
   limp?.update(!!state.limp&&!state.crawling&&!SWINGS.has(overlay)&&!UNGROUNDED.has(overlay),gait.phase,dt,speed>LOCOMOTION.idleSpeed);

   // Feet last, on top of the finished pose, because it corrects what the animation produced
   // rather than producing it. A teleport or a state where the feet are not on anything drops
   // every lock instead of dragging one across the city.
   if(footIK){
    const grounded=state.alive!==false&&!UNGROUNDED.has(overlay)&&!state.riding;
    if(!grounded||teleported(state))footIK.reset();
    else footIK.update({phase:gait.phase,...gait.stance()},dt);
   }
   // §9ai H3: each blow that lands (a new `hitSeq`) kicks the bones that took it, on top of all
   // of the above; a burst adds up round after round.
   if(hitReaction){
    if(Number.isFinite(state.hitSeq)&&state.hitSeq!==hitSeq){
     // A blow older than a quarter second (a body picked up by the near pool after it was hit)
     // is history, not something to flinch at now.
     if(!((state.hitAge??0)>.25))hitReaction.hit({dirX:state.hitX??0,dirZ:state.hitZ??1,heading:facing.heading,zone:state.hitZone??'body',strength:state.hitStrength??1});
     hitSeq=state.hitSeq;
    }
    hitReaction.update(dt,facing.heading);
   }
  },
  get footIK(){return footIK;},
  reset(){
   footIK?.reset();
   mixer.stopAllAction();
   for(const action of Object.values(actions))action.reset();
   overlay=null;previousAttack=0;seeded=false;dominant='Idle';strike.Punch=strike.PunchCross=strike.SwordAttack=0;
   stance.SwordIdle=stance.PistolIdle=0;aimLayer?.reset();hands?.reset();handsUp?.reset();phone?.reset();limp?.reset();swordK=0;strike.Crawl=0;strike.Roll=0;crouchK=0;crouchIdle?.stop();
   hitReaction?.reset();ragdoll?.reset();hitSeq=null;ragdollSeq=null;
   gait.reset();facing.reset(0);
   for(const name of GAIT)actions[name]?.play().setEffectiveWeight(0);
   for(const name of GAIT)if(actions[name])actions[name].paused=true;
   if(actions.Idle){actions.Idle.paused=false;actions.Idle.setEffectiveWeight(1);}
   for(const name of Object.keys(stance))actions[name]?.play().setEffectiveWeight(0);
   mixer.update(0);
  },
  /** PLAN-WEAPONS: the carried weapons, or null on a body that carries none. */
  get weapons(){return weaponRig;},
  /** Stage 4: the phone an onlooker holds (null until first used). */
  get phone(){return phone;},
  /** Stage 1: the weapon-change and reload hands (null on a body that carries nothing). */
  get hands(){return hands;},
  /** §9ai: the blow springs and the ragdoll (null on a rig without them / until first used). */
  get hitReaction(){return hitReaction;},
  get ragdoll(){return ragdoll;},
  /** PLAN-WEAPONS W2: the aim layer (weight, and how far the muzzle ray passed from the target). */
  get aim(){return aimLayer;},
  recolour(palette){instance.recolour(palette);},
  setHeight(metres){instance.setHeight(metres);},
  /** RUN 6.8: how broad this body is. A no-op on an asset that has one build. */
  setBuild(width){instance.setBuild?.(width);},
  /** What the body is mostly doing, for diagnostics and for the capture harness. */
  get action(){return overlay??dominant;},
  hide(){root.visible=false;},
  dispose(){
   if(disposed)return;disposed=true;
   mixer.stopAllAction();mixer.uncacheRoot(root);
   weaponRig?.dispose();phone?.dispose();
   instance.dispose();
  }
 };
}
