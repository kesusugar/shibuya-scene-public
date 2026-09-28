// Roadmap stage 4: onlookers who film or call it in, the ambulance and patrol car that collect the
// dead, and a crowd whose size follows the time of day (no rain).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from '../src/player/character-asset.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createOnlookers,ONLOOK,canWatch} from '../src/life/onlookers.mjs';
import {createAftermath,AFTERMATH} from '../src/life/aftermath.mjs';
import {populationFor,POPULATION} from '../src/life/population.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {LIVERY} from '../src/traffic/fleet.mjs';
import {createImpactMarks} from '../src/player/impact-marks.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};
const REPORT=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const BYTES=readFileSync('public/data/character/citizen.glb');
let cached=null;
const humanoid=async()=>cached??=humanoidCitizen(await new Promise((res,rej)=>new GLTFLoader()
 .parse(BYTES.buffer.slice(BYTES.byteOffset,BYTES.byteOffset+BYTES.byteLength),'',res,rej)),REPORT);
const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
function traffic(){
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=data;
 const sim=new TrafficSimulation(graph,{tier:'high',street:pack.street.high});sim.refill(true);return sim;
}
const person=(id,x,z,extra={})=>({id,active:true,x,z,heading:0,archetype:'office',...extra});

test('onlookers: once it is quiet, the nearest few (not too near, not too far) stop, face the body and take out phones',()=>{
 const pool=[person(0,0,0,{combatDead:true,struck:3})];
 for(let i=1;i<=12;i++)pool.push(person(i,Math.cos(i)*(2+i*1.6),Math.sin(i)*(2+i*1.6)));
 pool.push(person(13,6,0,{archetype:'kid'}),person(14,-6,0,{officer:true}),person(15,0,7,{crossing:3}));
 const crowd={time:10,pool},o=createOnlookers();
 assert.equal(o.update(crowd,{lastGunshotAt:9}).length,0,'not while the shooting is fresh');
 const started=o.update(crowd,{lastGunshotAt:9-ONLOOK.calm});
 assert.equal(started.length,ONLOOK.max);
 for(const p of started){
  const d=Math.hypot(p.x,p.z);
  assert.ok(d>=ONLOOK.radius[0]&&d<=ONLOOK.radius[1],`${p.id} at ${d.toFixed(1)} m`);
  assert.ok(p.watchUntil>crowd.time&&['film','call'].includes(p.phone));
  const face=Math.atan2(-p.x,-p.z);assert.ok(Math.abs(Math.atan2(Math.sin(p.heading-face),Math.cos(p.heading-face)))<1e-6,'facing the body');
 }
 for(const id of [13,14,15])assert.ok(!started.some(p=>p.id===id),'a child, an officer, someone crossing: never');
 assert.equal(o.update(crowd,{lastGunshotAt:-99}).length,0,'one gathering per body');
 const s=o.stats;assert.equal(s.filming+s.calls,ONLOOK.max);
 crowd.time+=ONLOOK.watch[1]+1;o.update(crowd,{});
 assert.ok(started.every(p=>p.phone===null),'phones away when the watching is over');
 assert.ok(canWatch(person(99,5,5),0)&&!canWatch(person(98,5,5,{flee:{until:5}}),0),'someone running away does not stop');
});

test('the simulation holds a watcher facing the body, and a body killed in a fight stays down until collected',()=>{
 const src=readFileSync('src/life/simulation.mjs','utf8');
 assert.match(src,/p\.watchUntil>this\.time&&!p\.crossing\)\{p\.state='watching'/);
 assert.match(src,/p\.struck>=FALL_SECONDS&&\(!p\.combatDead\|\|p\.collected\)/);
});

test('the crowd follows the time of day, and never to nothing',async()=>{
 assert.equal(populationFor('day'),1);assert.ok(populationFor('night')<1&&populationFor('dawn')<populationFor('night'));
 assert.equal(populationFor('rain'),1,'no weather state changes it');
 const {PedestrianSimulation}=await import('../src/life/simulation.mjs').then(m=>({PedestrianSimulation:Object.values(m).find(v=>typeof v==='function'&&v.prototype?.setPopulation)}));
 const fake={};assert.equal(PedestrianSimulation.prototype.setPopulation.call(fake,.01),.1);
 assert.equal(PedestrianSimulation.prototype.setPopulation.call(fake,POPULATION.dusk),POPULATION.dusk);
});

test('the ambulance: a hand-driven white-and-red service vehicle, never in traffic',()=>{
 const a=VEHICLES.ambulance;
 assert.equal(a.weight,0);assert.ok(a.handDriven&&a.lightbar);assert.equal(a.livery,'ambulance');assert.ok(LIVERY.ambulance.id>0);
});

test('the aftermath: at ☆0 an ambulance and a patrol car come up the lane, stop by the bodies, take them and the blood, and go',()=>{
 const sim=traffic(),after=createAftermath();
 // Two bodies beside a police lane, a third far away.
 const lane=sim.graph.lanes.filter(l=>l.allowed.includes('police')).reduce((a,b)=>b.path.length>a.path.length?b:a);
 const at={x:lane.path.x[Math.floor(lane.path.x.length*.7)],z:lane.path.z[Math.floor(lane.path.z.length*.7)]};
 const pool=[person(0,at.x+3,at.z,{combatDead:true,struck:0}),person(1,at.x-2,at.z+4,{combatDead:true,struck:0}),person(2,at.x+200,at.z,{combatDead:true,struck:0})];
 const crowd={time:0,pool},marks=createImpactMarks();
 marks.pool(at.x+3,0,at.z);marks.pool(at.x+300,0,at.z);
 const step=(stars=0,secs=1/10)=>{crowd.time+=secs;for(const p of pool)if(p.struck!==undefined)p.struck+=secs;return after.update(secs,{traffic:sim,crowd,stars,marks});};
 for(let t=0;t<AFTERMATH.wait-1;t+=.1)step();
 assert.equal(after.job,null,'nobody before the wait');
 for(let t=0;t<3;t+=.1)step(2);
 assert.equal(after.job,null,'nobody while the police are chasing');
 step();
 assert.equal(after.job?.phase,'coming');assert.equal(after.job.bodies,2,'the two near bodies are one scene');
 const amb=sim.pool.find(v=>v.active&&v.type==='ambulance'),cop=sim.pool.find(v=>v.active&&v.type==='police'&&v.service);
 assert.ok(amb&&cop,'an ambulance and a patrol car');assert.ok(amb.siren&&amb.controlled);
 let t=0;while(after.job?.phase==='coming'&&t<60){step();t+=.1;}
 assert.equal(after.job?.phase,'working',`still ${after.job?.phase} after ${t.toFixed(1)} s`);
 assert.ok(Math.hypot(amb.x-at.x,amb.z-at.z)<AFTERMATH.reach,'stopped by the scene');
 assert.ok(cop.progress<amb.progress,'the patrol car behind it');
 for(let k=0;k<AFTERMATH.work+.5;k+=.1)step();
 assert.ok(pool[0].collected&&pool[1].collected&&!pool[2].collected,'the two bodies taken, the far one not');
 assert.equal(marks.live.pools,1,'the blood washed there, not elsewhere');
 t=0;while(after.job&&t<60){step();t+=.1;}
 assert.equal(after.job,null);assert.ok(!amb.active&&!cop.active,'they leave and are gone');
 assert.equal(after.stats.dispatched,1);
 marks.dispose();sim.dispose();
});

test('an onlooker on the body: the phone in front of the face to film, at the ear to call',async()=>{
 const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['revolver']});
 const s={x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:0,phone:'film'};
 for(let i=0;i<40;i++)figure.update(s,1/30);figure.root.updateMatrixWorld(true);
 const head=figure.root.getObjectByName('Head').getWorldPosition(new Vector3()),hand=()=>figure.root.getObjectByName('hand_r').getWorldPosition(new Vector3());
 let h=hand();
 assert.ok(h.z>head.z+.15&&Math.abs(h.y-head.y)<.3,`filming: hand ${h.toArray().map(v=>v.toFixed(2))} head ${head.toArray().map(v=>v.toFixed(2))}`);
 assert.ok(figure.phone?.mesh?.visible,'the phone is in the hand');
 s.phone='call';for(let i=0;i<40;i++)figure.update(s,1/30);figure.root.updateMatrixWorld(true);
 h=hand();assert.ok(h.distanceTo(head)<.28,`calling: hand ${h.distanceTo(head).toFixed(2)} m from the head`);
 s.phone=null;for(let i=0;i<40;i++)figure.update(s,1/30);
 assert.ok(!figure.phone.mesh.visible,'put away');
 figure.dispose();
});

test('the phone arm and raised arms stay out of the chest: the elbow out beside the body, the phone well in front',async()=>{
 for(const [key,value] of [['phone','film'],['phone','call'],['handsUp',true]]){
  const figure=createPlayerFigure(await humanoid(),undefined,{weapons:['revolver']});
  const s={x:0,y:0,z:0,speed:0,heading:0,alive:true,attackTime:0,[key]:value};
  for(let i=0;i<40;i++)figure.update(s,1/30);figure.root.updateMatrixWorld(true);
  const w=n=>figure.root.getObjectByName(n).getWorldPosition(new Vector3());
  const chest=w('spine_03'),shoulder=w('upperarm_r'),elbow=w('lowerarm_r'),hand=w('hand_r');
  // Outside the shoulder's line, not tucked in front of the chest (the §-stage-4 report: the
  // forearm through the chest when the hand came up to film).
  assert.ok(elbow.x<shoulder.x-.03,`${value}: elbow x ${elbow.x.toFixed(2)} inside the shoulder ${shoulder.x.toFixed(2)}`);
  // The upper arm's middle is outside the trunk's section at the chest: an ellipse 0.17 m to
  // each side and 0.12 m front to back (the body faces +z, so x is across it).
  const mid=shoulder.clone().add(elbow).multiplyScalar(.5),e=((mid.x-chest.x)/.17)**2+((mid.z-chest.z)/.12)**2;
  assert.ok(e>1.1,`${value}: upper arm inside the chest (${e.toFixed(2)})`);
  if(value==='film')assert.ok(hand.z>chest.z+.3,`filming: the phone ${(hand.z-chest.z).toFixed(2)} m in front of the chest`);
  figure.dispose();
 }
});
