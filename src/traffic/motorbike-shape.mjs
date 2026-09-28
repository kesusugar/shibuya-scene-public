// Roadmap stage 6: the motorbike, built here from primitives.
//
// No CC0 motorcycle model small and clean enough to ship was at hand, so the bike is procedural
// like the cars' loft: a sport-naked street bike -- tank, short tail, a small cowl and screen, an
// inline engine block, a tubular frame, twin fork legs, a swingarm, an exhaust down the right, two
// spoked wheels. Generic and unbadged (tests/name-guard).
//
// It is built in the parts every vehicle uses (paint, dark, glass, lamp, tail, rubber, rim), with
// the wheels separate so the player's model can spin and steer them, and in the traffic fleet's
// parts (`motorbikeFleetGeometry`) for a bike standing parked. Frame: +z forward, +x to the rider's
// left, y up from the road, the same as the cars (whose driver's side, the right, is -x).

import {BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Matrix4, Vector3, Quaternion} from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {merge} from '../geo/geometry.mjs';

export const BIKE = Object.freeze({
 wheelbase: 1.42, radius: .31, tyre: .065,
 seat: [0, .84, -.16],          // where the rider sits (the top of the seat, under the pelvis)
 bars: [0, 1.02, .34],          // the handlebar's centre
 head: [0, .97, .53],           // the steering head
 pegs: [.19, .36, -.08],        // the left footpeg (+x; mirrored for the right)
 lean: .72,                     // rad, the most it leans into a turn
 stand: .16                     // rad, leaning on its side stand when parked
});

const front = BIKE.wheelbase / 2, rear = -BIKE.wheelbase / 2;

/**
 * How far a bike leans at this speed and yaw rate, radians (negative leans to the right, toward
 * local +x, which is the way a positive yaw rate turns): tan(lean) = v·ω/g, capped. Pure.
 */
export function bikeLean(speed, yawRate) {
 const a = Math.atan(Math.abs(speed) * (yawRate ?? 0) / 9.81);
 return -Math.max(-BIKE.lean, Math.min(BIKE.lean, a)) * Math.sign(speed || 1);
}

/** A tube from a to b, radius r. */
function tube(a, b, r, segments = 8) {
 const A = new Vector3(...a), B = new Vector3(...b), d = B.clone().sub(A), len = d.length();
 const g = new CylinderGeometry(r, r, len, segments, 1);
 g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
 const mid = A.add(B).multiplyScalar(.5); g.translate(mid.x, mid.y, mid.z);
 return g;
}
const box = (w, h, l, x, y, z, round = 0) => {
 const g = round ? new RoundedBoxGeometry(w, h, l, 2, round) : new BoxGeometry(w, h, l);
 g.translate(x, y, z); return g;
};
const blob = (sx, sy, sz, x, y, z, w = 14, h = 10) => {
 const g = new SphereGeometry(1, w, h); g.scale(sx, sy, sz); g.translate(x, y, z); return g;
};
const clean = g => {g.deleteAttribute('uv'); return g;};
const join = list => {const out = merge(list.map(clean)); list.forEach(g => g.dispose()); return out;};

/** One wheel at the origin, axle along x: {rubber, rim}. */
function wheel() {
 const r = BIKE.radius, t = BIKE.tyre;
 const rubber = new TorusGeometry(r - t * .9, t, 8, 26); rubber.rotateY(Math.PI / 2);
 const parts = [];
 const hub = new CylinderGeometry(.055, .055, .12, 10); hub.rotateZ(Math.PI / 2); parts.push(hub);
 const disc = new CylinderGeometry(.14, .14, .012, 18); disc.rotateZ(Math.PI / 2); disc.translate(-.05, 0, 0); parts.push(disc);
 const hoop = new TorusGeometry(r - t * 1.9, .016, 5, 26); hoop.rotateY(Math.PI / 2); parts.push(hoop);
 for (let i = 0; i < 5; i++) {       // five split spokes, like a cast street wheel
  const a = i / 5 * Math.PI * 2;
  for (const s of [-.05, .05]) parts.push(tube([0, Math.sin(a + s) * .05, Math.cos(a + s) * .05], [0, Math.sin(a) * (r - t * 1.9), Math.cos(a) * (r - t * 1.9)], .012, 5));
 }
 return {rubber: clean(rubber), rim: join(parts)};
}

/**
 * The bike: {geometry: {paint, dark, glass, lamp, tail, rim}, wheel: {rubber, rim},
 * anchors (frontWheel/rearWheel and the driver anchors the cars carry), dimensions}.
 */
export function buildMotorbikeShape() {
 const paint = [], dark = [], metal = [], glass = [], lamp = [], tail = [];
 // Bodywork: the tank, the tail unit, a small headlamp cowl, the belly pan.
 paint.push(blob(.19, .13, .3, 0, .93, .2));
 paint.push(box(.24, .1, .48, 0, .88, -.52, .04));
 {const g = blob(.13, .12, .2, 0, .82, -.66); paint.push(g);}
 paint.push(blob(.16, .15, .14, 0, .98, .66));
 paint.push(box(.24, .05, .3, 0, .27, .08, .02));
 for (const x of [-.12, .12]) paint.push(box(.03, .16, .3, x, .72, .34, .012));   // radiator shrouds
 // The seat, the frame, the swingarm, the forks, the bars.
 dark.push(box(.26, .07, .5, 0, BIKE.seat[1] - .02, -.2, .03));
 for (const x of [-.1, .1]) {
  dark.push(tube([x * .6, BIKE.head[1], BIKE.head[2]], [x, .56, -.12], .026));      // spars
  dark.push(tube([x, .56, -.12], [x, .38, -.2], .026));
  dark.push(tube([x, .38, -.2], [x * 1.1, BIKE.radius, rear], .024));               // swingarm
  dark.push(tube([x * .5, .8, -.3], [x * .7, .88, -.7], .014));                     // subframe
  metal.push(tube([x, BIKE.head[1] + .05, BIKE.head[2] - .03], [x, BIKE.radius, front], .03));   // fork legs
 }
 dark.push(tube([-.35, BIKE.bars[1], BIKE.bars[2]], [.35, BIKE.bars[1], BIKE.bars[2]], .014));
 for (const x of [-.34, .34]) dark.push(tube([x - .05, BIKE.bars[1], BIKE.bars[2]], [x + .05, BIKE.bars[1], BIKE.bars[2]], .02));
 dark.push(tube([0, BIKE.bars[1] - .02, BIKE.bars[2]], [0, BIKE.head[1] + .06, BIKE.head[2]], .02));
 for (const x of [-.26, .26]) dark.push(tube([x, BIKE.bars[1], BIKE.bars[2] + .02], [x * 1.05, BIKE.bars[1] + .14, BIKE.bars[2] + .08], .007, 4)),
  dark.push(box(.08, .05, .012, x * 1.05, BIKE.bars[1] + .16, BIKE.bars[2] + .08));   // mirrors
 // The engine: block, head, cases; the exhaust down the right (-x) to a short muffler.
 dark.push(box(.3, .28, .36, 0, .44, .12, .03));
 metal.push(box(.28, .12, .26, 0, .63, .18, .02));
 for (let i = 0; i < 4; i++) metal.push(tube([-.105 + i * .07, .6, .31], [-.105 + i * .07, .3, .4], .018, 6));
 metal.push(tube([-.1, .28, .38], [-.16, .24, -.1], .03));
 metal.push(tube([-.16, .24, -.1], [-.2, .5, -.62], .032));
 metal.push(tube([-.2, .48, -.55], [-.21, .58, -.82], .058, 10));
 // Fenders, the chain guard, the footpegs.
 dark.push(box(.14, .02, .38, 0, BIKE.radius * 2 + .03, front + .02, .008));
 dark.push(box(.05, .06, .5, .13, BIKE.radius + .05, -.43));   // the chain guard, on the left
 for (const s of [-1, 1]) dark.push(tube([s * .1, BIKE.pegs[1], BIKE.pegs[2]], [s * BIKE.pegs[0] * 1.2, BIKE.pegs[1], BIKE.pegs[2]], .014, 5));
 // The screen, the lamps, the number plate hanger.
 {const g = box(.26, .2, .012, 0, 1.12, .7); g.rotateX(0); glass.push(g);
  const m = new Matrix4().makeRotationX(-.55); g.translate(0, -1.12, -.7); g.applyMatrix4(m); g.translate(0, 1.12, .7);}
 {const g = new CylinderGeometry(.075, .075, .04, 16); g.rotateX(Math.PI / 2); g.translate(0, .98, .79); lamp.push(g);}
 tail.push(box(.12, .04, .03, 0, .88, -.86, .01));
 dark.push(box(.18, .12, .01, 0, .72, -.9));
 const geometry = {paint: join(paint), dark: join(dark), rim: join(metal), glass: join(glass), lamp: join(lamp), tail: join(tail)};
 const side = -1;   // the anchors are authored on -x, like the cars'
 const anchors = {
  frontWheel: [0, BIKE.radius, front], rearWheel: [0, BIKE.radius, rear],
  // The rider mounts from the side: stands beside the seat, swings a leg over, sits.
  driverSeat: [0, BIKE.seat[1], BIKE.seat[2]],
  driverDoor: [side * .45, .6, -.1],
  driverEntry: [side * .85, 0, -.1],
  driverExit: [side * .95, 0, -.1]
 };
 const dimensions = {length: 2.1, width: .78, height: 1.2, wheelbase: BIKE.wheelbase, radius: BIKE.radius};
 return {geometry, wheel: wheel(), anchors, dimensions};
}

/** The traffic fleet's parts for a bike standing parked (on its side stand). */
export function motorbikeFleetGeometry() {
 const shape = buildMotorbikeShape(), g = shape.geometry;
 const lean = new Matrix4().makeRotationZ(-BIKE.stand);   // over to its left (+x), onto the stand
 const place = (geo, [x, y, z]) => {const c = geo.clone(); c.translate(x, y, z); return c;};
 const darkParts = [g.dark, g.rim,
  place(shape.wheel.rubber, shape.anchors.frontWheel), place(shape.wheel.rim, shape.anchors.frontWheel),
  place(shape.wheel.rubber, shape.anchors.rearWheel), place(shape.wheel.rim, shape.anchors.rearWheel)];
 const out = {body: g.paint, dark: merge(darkParts), glass: g.glass, front: g.lamp, rear: g.tail};
 darkParts.forEach(x => x.dispose()); shape.wheel.rubber.dispose(); shape.wheel.rim.dispose();
 for (const geo of Object.values(out)) geo.applyMatrix4(lean);
 return out;
}
