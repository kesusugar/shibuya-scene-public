// Getting into and out of a car, as a sequence of things that happen rather than one move.
//
// RUN 9. What this replaced was fifteen lines: a single smoothstep between two poses, with the
// door swung open and shut by `Math.sin(phase * PI)` from the caller, and ownership of the car
// already transferred before the animation started. The player walked to the door and then
// appeared in the seat; a carjack was `takeOver(slot)` at the moment the button went down.
//
// A transition is now a list of STAGES, each with its own duration, its own waypoints and its
// own door state. That buys three things the smoothstep could not express:
//
//   - the door opens BEFORE the body moves through it, and closes AFTER the body has cleared
//     it. Neither is possible when the door is a function of one overall phase.
//   - the seat is a real destination. Entry used to end at the DOOR, and sitting down was the
//     renderer hiding the player and the car starting to draw them.
//   - there is a defined moment when control transfers, and it is the end, not the beginning.
//
// MOVEMENT AUTHORITY. While a transition is active it owns the player's transform completely.
// Locomotion does not run, and the caller must not write x/z/heading from anywhere else. The
// stage list is the only thing moving the body, so the two can never fight over it.

/** Door positions, in the order a door goes through them. */
export const DOOR=Object.freeze({CLOSED:'closed',OPENING:'opening',OPEN:'open',CLOSING:'closing'});

/**
 * Getting in.
 *
 * ALIGN walks the last step or so to the door and turns to face the car -- without it a
 * player standing at the back corner slides sideways into the seat. DOOR_OPEN is a pause on
 * the spot while the panel swings; it is short, because a long one reads as a hesitation.
 * ENTRY is the only stage that moves the body through the doorway. SEAT is a beat of settling
 * so the body is still before the door shuts on it, and DOOR_CLOSE is the panel swinging back
 * with the player already inside.
 */
export const ENTER_STAGES=Object.freeze([
 Object.freeze({name:'ALIGN',     seconds:.40,from:'start',to:'entry',door:DOOR.CLOSED}),
 Object.freeze({name:'DOOR_OPEN', seconds:.30,from:'entry',to:'entry',door:DOOR.OPENING}),
 Object.freeze({name:'ENTRY',     seconds:.46,from:'entry',to:'seat', door:DOOR.OPEN}),
 Object.freeze({name:'SEAT',      seconds:.18,from:'seat', to:'seat', door:DOOR.OPEN}),
 Object.freeze({name:'DOOR_CLOSE',seconds:.28,from:'seat', to:'seat', door:DOOR.CLOSING})
]);

/**
 * Getting out. The mirror image, and deliberately not the same durations: a door is opened
 * from inside faster than it is found from outside, and stepping out is slower than dropping
 * in because the body has to clear the sill before the panel comes back.
 */
export const EXIT_STAGES=Object.freeze([
 Object.freeze({name:'DOOR_OPEN', seconds:.26,from:'seat', to:'seat', door:DOOR.OPENING}),
 Object.freeze({name:'EXIT',      seconds:.52,from:'seat', to:'exit', door:DOOR.OPEN}),
 Object.freeze({name:'STAND',     seconds:.16,from:'exit', to:'exit', door:DOOR.OPEN}),
 Object.freeze({name:'DOOR_CLOSE',seconds:.30,from:'exit', to:'exit', door:DOOR.CLOSING})
]);

/**
 * Taking a car off the person driving it.
 *
 * The same shape as an entry with three stages spliced in where the driver has to be dealt
 * with, so getting into a stolen car is not a separate animation from getting into an empty
 * one -- it is the same one with a fight in the middle.
 *
 *   GRAB   the door is open and the player reaches in.        driver -> ALERT
 *   PULL   the driver is hauled across the sill.              driver -> BEING_EXTRACTED
 *   THROW  the body lands on the road and the seat is free.   driver -> a pedestrian
 *
 * Nothing here decides any of that; the stage names are the schedule and the caller acts on
 * them. Splitting it this way is what makes the seat empty for a beat before the player is in
 * it -- so the car briefly has NO occupant, which is the honest description of a carjacking
 * in progress and is what stops the player driving off with the driver still sitting there.
 */
export const CARJACK_STAGES=Object.freeze([
 Object.freeze({name:'ALIGN',     seconds:.40,from:'start',to:'entry',door:DOOR.CLOSED}),
 Object.freeze({name:'DOOR_OPEN', seconds:.30,from:'entry',to:'entry',door:DOOR.OPENING}),
 Object.freeze({name:'GRAB',      seconds:.34,from:'entry',to:'entry',door:DOOR.OPEN}),
 Object.freeze({name:'PULL',      seconds:.46,from:'entry',to:'entry',door:DOOR.OPEN}),
 Object.freeze({name:'THROW',     seconds:.30,from:'entry',to:'entry',door:DOOR.OPEN}),
 Object.freeze({name:'ENTRY',     seconds:.46,from:'entry',to:'seat', door:DOOR.OPEN}),
 Object.freeze({name:'SEAT',      seconds:.18,from:'seat', to:'seat', door:DOOR.OPEN}),
 Object.freeze({name:'DOOR_CLOSE',seconds:.28,from:'seat', to:'seat', door:DOOR.CLOSING})
]);

/** Kept for callers that only want to know roughly how long the whole thing takes. */
export const VEHICLE_TRANSITION=Object.freeze({
 enter:ENTER_STAGES.reduce((n,s)=>n+s.seconds,0),
 exit:EXIT_STAGES.reduce((n,s)=>n+s.seconds,0),
 carjack:CARJACK_STAGES.reduce((n,s)=>n+s.seconds,0)
});

const smooth=t=>t*t*(3-2*t);
const turn=(a,b)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a));
/** Interpolate a pose, taking the short way round the circle for the heading. */
const lerpPose=(a,b,k)=>({x:a.x+(b.x-a.x)*k,z:a.z+(b.z-a.z)*k,
 heading:a.heading+(turn(a.heading,b.heading)-a.heading)*k});

/** How far open the door is during a stage, 0 shut to 1 wide. */
const doorAt=(door,t)=>door===DOOR.OPENING?smooth(t)
 :door===DOOR.CLOSING?1-smooth(t)
 :door===DOOR.OPEN?1:0;

export function createVehicleTransition(){
 let action=null;

 /** Total seconds of a stage list, used for the overall phase a caller may want. */
 const total=stages=>stages.reduce((n,s)=>n+s.seconds,0);

 return {
  /**
   * Start a transition.
   *
   * `points` carries the real waypoints, which come from the vehicle's own anchors rather
   * than from numbers invented here: `start` where the player is now, `entry` the standing
   * spot beside the open door, `seat` the driver's seat, `exit` where they step out to. A
   * missing waypoint falls back to the nearest one that exists, so a body with no exit
   * anchor still produces a legal sequence instead of a NaN.
   */
  begin(kind,points,slot=null){
   if(action)return false;
   const stages=kind==='enter'?ENTER_STAGES:kind==='exit'?EXIT_STAGES
    :kind==='carjack'?CARJACK_STAGES:null;
   if(!stages)return false;
   const at={start:points.start??points.entry??points.seat,
             entry:points.entry??points.start??points.seat,
             seat:points.seat??points.entry??points.start,
             exit:points.exit??points.entry??points.seat};
   for(const p of Object.values(at))
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||!Number.isFinite(p.heading))return false;
   action={kind,stages,at,slot,index:0,time:0,elapsed:0,duration:total(stages),
    // Set once, when the body reaches the seat, and read by the caller to know when to stop
    // drawing the player on foot and start drawing them in the car.
    seated:false};
   return true;
  },

  /**
   * Advance by `dt` and report where everything is.
   *
   * Returns null when nothing is running. The returned pose is the whole truth for the
   * frame: where the body is, how far the door is open, which stage produced it, and whether
   * this was the last frame.
   */
  update(dt){
   if(!action)return null;
   action.time+=Math.max(0,dt);
   action.elapsed+=Math.max(0,dt);
   // A frame long enough to step over a whole stage must not skip it silently -- the same
   // rule RUN 8's hit window needed, and for the same reason.
   while(action.index<action.stages.length&&action.time>=action.stages[action.index].seconds){
    action.time-=action.stages[action.index].seconds;
    action.index++;
   }
   const done=action.index>=action.stages.length;
   const stage=done?action.stages[action.stages.length-1]:action.stages[action.index];
   const t=done?1:Math.min(1,action.time/stage.seconds);
   const pose=lerpPose(action.at[stage.from],action.at[stage.to],smooth(t));
   // The body is in the seat from the moment the stage that ends there completes. Both lists
   // are built so that is the stage before DOOR_CLOSE.
   if(action.kind!=='exit'&&(done||stage.name==='SEAT'||stage.name==='DOOR_CLOSE'))action.seated=true;
   const out={
    kind:action.kind,stage:stage.name,stageIndex:action.index,
    door:done?DOOR.CLOSED:stage.door,
    doorPhase:done?0:doorAt(stage.door,t),
    x:pose.x,z:pose.z,heading:pose.heading,
    t,phase:Math.min(1,action.elapsed/action.duration),
    seated:action.seated,slot:action.slot,done
   };
   if(done)action=null;
   return out;
  },

  /** Which stage is running, for anyone who needs to know without stepping the clock. */
  get stage(){return action?action.stages[action.index]?.name??null:null;},
  get kind(){return action?action.kind:null;},
  get active(){return !!action;},
  /**
   * Stop. The caller is responsible for putting the door back -- this cannot, because by the
   * time anyone cancels, the car may not be the one this transition was about.
   */
  cancel(){const was=action;action=null;return was?{kind:was.kind,stage:was.stages[was.index]?.name??null,
   seated:was.seated,slot:was.slot}:null;}
 };
}
