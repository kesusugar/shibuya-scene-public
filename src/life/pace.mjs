// How fast a body is ACTUALLY going, and whether it is moving at all.
//
// claude/crowd-realism. The HQ crowd chose Idle only from the simulation's waiting flags and
// played Walk at a fixed cadence otherwise, so anyone stopped for any other reason -- a jam, a
// queue that is not a crossing queue, a blocked cast member, a reacting citizen the simulation
// was not moving -- walked on the spot. `p.speed` could not fix it: it is what the simulation
// intends (a choreographed walker reports its base speed on a frame it was blocked), not what
// the body did. The only honest measure is the displacement of the drawn position, per frame.
//
// One rule for both renderers (the mass HQ crowd and the eight near humanoids):
//   - measured = drawn displacement / dt, clamped (a teleport is not a sprint);
//   - smoothed with a short time constant, so a single stalled frame is not a stop;
//   - hysteresis: a stopped body starts walking above `moveAbove`, a walking one stops below
//     `stopBelow`, so a shuffle on the threshold does not flicker between Idle and Walk.
// And the stride arithmetic every clip-based locomotion needs: a cycle takes stride / speed.

export const PACE=Object.freeze({
 stopBelow:.12,      // m/s: a moving body at or below this is standing
 moveAbove:.3,       // m/s: a standing body above this is walking (a jam creeps at .15-.3)
 response:7,         // 1/s: smoothing rate of the measured speed
 maxMeasured:9,      // m/s: anything faster in one frame is a jump, not a stride
 // Ground covered by one full cycle of each baked clip, from public/data/character/citizen.json
 // (scripts/analyse-gait.mjs): Walk 1.30 m in 1.333 s (0.975 m/s), Run 2.687 m in 0.708 s.
 stride:Object.freeze({Walk:1.3,Run:2.687}),
 // A clip played far off its authored rate reads as wrong whatever the feet do, so the
 // playback scale is bounded; outside it the feet slide a little, which is the cheaper error.
 minScale:.5,maxScale:1.75,
 // Above this a body that is getting out of the way (AVOID/FLEE) runs rather than walks. m/s.
 walkTop:2.2,
 // ...and a body that is just going somewhere (NORMAL/LOOK). Higher, because nobody strolls
 // into a jog, and because the simulation moves far-LOD walkers in 0.2 s bursts that measure
 // up to ~3 m/s in the frame they land: live, 24 walkers 170 m away flickered into Run.
 strollTop:3.2
});

/**
 * One frame of pace for one body. Pure.
 *
 * The VELOCITY is smoothed, not the distance: a walker the simulation holds in a jam
 * sidesteps left and right on alternate ticks (its right-side passing rule), which is a lot of
 * path and no progress. Measured live that read 0.4 m/s of distance and 0.05 m/s of progress,
 * which is exactly a walk on the spot. Averaging the vector cancels the dither.
 * @param {number} vx  previous smoothed velocity, m/s
 * @param {number} vz
 * @param {boolean} moving  previous moving flag
 * @param {number} dx  drawn displacement this frame, m
 * @param {number} dz
 * @param {number} dt  seconds
 * @returns {{vx:number,vz:number,speed:number,moving:boolean}}
 */
export function paceStep(vx,vz,moving,dx,dz,dt){
 if(!(dt>0)){const speed=Math.hypot(vx,vz);return {vx,vz,speed,moving};}
 let mx=dx/dt,mz=dz/dt;
 const m=Math.hypot(mx,mz);
 if(m>PACE.maxMeasured){mx*=PACE.maxMeasured/m;mz*=PACE.maxMeasured/m;}
 const k=Math.min(1,dt*PACE.response);
 vx+=(mx-vx)*k;vz+=(mz-vz)*k;
 const speed=Math.hypot(vx,vz);
 return {vx,vz,speed,moving:moving?speed>PACE.stopBelow:speed>PACE.moveAbove};
}

/**
 * Cycles per second for a locomotion clip at a ground speed, or null for a clip that does not
 * cover ground (Idle, Startle, Guard, Fall): those keep their own authored rate.
 */
export function cadence(clipName,duration,speed){
 const stride=PACE.stride[clipName];
 if(!stride||!(duration>0))return null;
 const natural=1/duration;
 return Math.max(natural*PACE.minScale,Math.min(natural*PACE.maxScale,Math.max(0,speed)/stride));
}
