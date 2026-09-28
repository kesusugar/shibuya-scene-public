// Roadmap stage 3: ☆4-5 and getting away -- the helicopter and its searchlight, the search
// circle, roadblocks ahead of the player and patrol cars coming from in front (the pincer).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHelicopter,createHelicopterMesh,HELI} from '../src/police/helicopter.mjs';

const run=(heli,seconds,opts,dt=1/20)=>{let s;for(let t=0;t<seconds;t+=dt)s=heli.update(dt,opts);return s;};

test('below ☆4 there is no helicopter; at ☆4 one comes in from far out and settles into an orbit over the player',()=>{
 const heli=createHelicopter(),me={x:10,z:-20};
 assert.equal(run(heli,2,{stars:3,me}).active,false);
 const s=heli.update(1/20,{stars:4,me,seen:true});
 assert.ok(s.active);
 assert.ok(Math.hypot(s.x-me.x,s.z-me.z)>HELI.enterFrom*.95,'it appears far out');
 run(heli,40,{stars:4,me,seen:true});
 const d=Math.hypot(s.x-me.x,s.z-me.z);
 assert.ok(d<HELI.orbit*1.7&&d>HELI.orbit*.4,`orbiting at ${d.toFixed(1)} m`);
 assert.ok(Math.abs(s.y-HELI.altitude)<3,`at ${s.y.toFixed(1)} m`);
 assert.ok(Math.hypot(s.light.x-me.x,s.light.z-me.z)<HELI.light,'the light is on the player');
 assert.ok(s.sees);
});

test('lost, it sweeps a widening spiral round where the player was last seen; found in the light, it sees them again',()=>{
 const heli=createHelicopter(),me={x:0,z:0};
 run(heli,40,{stars:4,me,seen:true,night:true});
 const away={x:70,z:0},lastSeen={x:0,z:0};
 const spots=[];
 for(let t=0;t<12;t+=1/20){const s=heli.update(1/20,{stars:4,me:away,seen:false,lastSeen,night:true});spots.push(Math.hypot(s.light.x,s.light.z));}
 assert.ok(!heli.state.sees,'at night, out of the light, not seen');
 assert.ok(spots.at(-1)>spots[40]+5,'the sweep widens');
 // Standing where the light passes: seen.
 const s=heli.state,under={x:s.light.x,z:s.light.z};
 heli.update(1/20,{stars:4,me:under,seen:false,lastSeen,night:true});
 assert.ok(heli.state.sees,'caught in the light');
 // Under cover, even in the light, they are not.
 heli.update(1/20,{stars:4,me:under,seen:false,lastSeen,night:true,covered:()=>true});
 assert.ok(!heli.state.sees);
});

test('by day the crew see near without the light; the level dropping sends it away and it is gone',()=>{
 const heli=createHelicopter(),me={x:0,z:0};
 run(heli,40,{stars:5,me,seen:true});
 heli.update(1/20,{stars:5,me:{x:30,z:0},seen:false,lastSeen:me,night:false});
 assert.ok(heli.state.sees,'daylight, 30 m from an orbit of ~26 m');
 run(heli,40,{stars:2,me,seen:false});
 assert.equal(heli.state.active,false,'gone');
});

test('the helicopter mesh follows the state and shows its light brighter at night',()=>{
 const heli=createHelicopter(),mesh=createHelicopterMesh(),me={x:0,z:0};
 run(heli,30,{stars:4,me,seen:true});
 mesh.update(heli.state,{night:true});
 assert.ok(mesh.hull.visible&&mesh.beam.visible&&mesh.spot.visible);
 assert.ok(Math.abs(mesh.hull.position.y-heli.state.y)<1e-6);
 const night=mesh.spot.material.opacity;mesh.update(heli.state,{night:false});
 assert.ok(mesh.spot.material.opacity<night);
 mesh.update({active:false});assert.ok(!mesh.hull.visible);
 mesh.dispose();
});

// ---- the pincer, the roadblock ahead, the director's use of the helicopter ----------------------
import {readFileSync} from 'node:fs';
import {createPoliceUnits,UNITS} from '../src/police/units.mjs';
import {createPoliceDirector} from '../src/police/director.mjs';
import {rotorLevel} from '../src/audio/rotor.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
function traffic(){
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=data;
 const sim=new TrafficSimulation(graph,{tier:'high',street:pack.street.high});sim.refill(true);return sim;
}

test('☆4, a player driving north: patrol cars come from in front as well as behind, and the roadblock is set ahead',()=>{
 const sim=traffic(),units=createPoliceUnits(),visible=()=>false;
 // Heading -z (north on the map) at 10 m/s, in a loop so they stay on the map.
 const me={x:0,z:60};
 for(let i=0;i<60*30;i++){me.z-=10/30;if(me.z<-80)me.z=60;units.update(1/30,{stars:4,traffic:sim,me,visible});}
 assert.ok(units.motion.speed>8&&units.motion.z<0,`travel estimated ${JSON.stringify(units.motion)}`);
 const st=units.stats;
 assert.ok(st.ahead>=1,`no patrol car came from ahead (${JSON.stringify(st)})`);
 assert.equal(st.roadblocks,1);assert.equal(st.roadblocksAhead,1,'the roadblock was not put ahead');
 const block=[...units.cars].filter(v=>v.pursuit?.roadblock);
 assert.equal(block.length,2);
 sim.dispose();
 // Standing still, nothing counts as ahead.
 const sim2=traffic(),u2=createPoliceUnits(),still={x:0,z:20};
 for(let i=0;i<60*30;i++)u2.update(1/30,{stars:4,traffic:sim2,me:still,visible});
 assert.equal(u2.stats.ahead,0);assert.equal(u2.stats.roadblocksAhead,0);
 sim2.dispose();
 assert.ok(UNITS.pincerFrom===4);
});

test('the director flies the helicopter at ☆4, and its searchlight keeps the player seen at night',()=>{
 const d=createPoliceDirector({getAudioContext:()=>null,getAudioBus:()=>null,speech:null});
 d.wanted.crime('officerKill',{x:0,z:0,t:0});d.wanted.crime('officerKill',{x:0,z:0,t:0});
 assert.ok(d.wanted.state.stars>=4,`stars ${d.wanted.state.stars}`);
 let w;for(let t=0;t<40;t+=1/10)w=d.frame(1/10,{player:{x:0,z:0,y:0,alive:true},solid:()=>false,night:true});
 assert.ok(w.heli?.active,'no helicopter at ☆4');
 assert.ok(w.seen,'held in the searchlight, the player is seen (no officer is near)');
 assert.equal(w.escape,0,'so the escape clock does not run');
 // Walk well away, out of the light: the light has to find them again.
 for(let t=0;t<2;t+=1/10)w=d.frame(1/10,{player:{x:150,z:0,y:0,alive:true},solid:()=>false,night:true});
 assert.equal(w.seen,false);assert.ok(w.flashing);
 d.dispose();
});

test('the rotor is loud overhead and fades out with distance',()=>{
 assert.ok(rotorLevel(10)>.95);assert.ok(rotorLevel(100)<rotorLevel(40));assert.equal(rotorLevel(500),0);
});
