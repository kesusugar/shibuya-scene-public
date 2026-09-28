// PLAN-POLICE-AND-OWN-CAR W2/W4 ☆4–☆5: unmarked car, roadblock, riot transport, balance cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPoliceUnits,UNITS} from '../src/police/units.mjs';
import {allowBumpFight,isPolice,POLICE} from '../src/police/director.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {buildVehicleShape} from '../src/traffic/vehicle-shape.mjs';
import {paintOf,LIVERY} from '../src/traffic/fleet.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';

const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
function traffic(){
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=restoreGroundModel(pack.ground);graph.data=data;
 const sim=new TrafficSimulation(graph,{tier:'high',street:pack.street.high});sim.refill(true);return sim;
}

test('the extra units are police, never ordinary traffic, and unlettered',()=>{
 for(const t of ['police','unmarked','riotBus'])assert.ok(isPolice({type:t}),t);
 assert.ok(!isPolice({type:'sedan'}));
 for(const t of ['unmarked','riotBus'])assert.equal(VEHICLES[t].weight,0,`${t} would appear in traffic`);
 assert.equal(paintOf(3,'unmarked').hex,VEHICLES.unmarked.color,'the unmarked car is always dark');
 assert.equal(paintOf(3,'riotBus').livery,LIVERY.riot.id);
 assert.ok(buildVehicleShape('unmarked').anchors.lightbar,'no beacon');
});

test('☆4 puts up a roadblock and an unmarked car; ☆5 adds the riot transport; caps hold',()=>{
 const sim=traffic(),units=createPoliceUnits();
 const me={x:0,z:20},visible=()=>false;
 for(let i=0;i<60*30;i++)units.update(1/30,{stars:4,traffic:sim,me,visible});
 const cars=[...units.cars];
 assert.ok(cars.length<=UNITS.cars[4]);
 const block=cars.filter(v=>v.pursuit?.roadblock);
 assert.equal(block.length,2,'no roadblock');
 const [a,b]=block;
 assert.ok(Math.abs(Math.atan2(Math.sin(a.heading-b.heading),Math.cos(a.heading-b.heading)))<1e-6,'the pair is not parallel');
 const x=a.x,z=a.z;
 for(let i=0;i<5*30;i++)units.update(1/30,{stars:4,traffic:sim,me,visible});
 assert.equal(a.x,x);assert.equal(a.z,z);
 assert.ok(cars.some(v=>v.type==='unmarked'),'no unmarked car at ☆4');
 for(let i=0;i<60*30;i++)units.update(1/30,{stars:5,traffic:sim,me,visible});
 assert.ok([...units.cars].some(v=>v.type==='riotBus'),'no riot transport at ☆5');
 assert.ok(units.cars.size<=UNITS.cars[5]);
 sim.dispose();
});

test('the balance cap: while wanted, a bump starts a fight only while fewer than two fight',()=>{
 const fighter=id=>({id,active:true,combatTarget:'player',combatUntil:10});
 assert.equal(allowBumpFight(0,[fighter(1),fighter(2),fighter(3)],0),true,'not wanted: no cap');
 assert.equal(allowBumpFight(2,[fighter(1)],0),true);
 assert.equal(allowBumpFight(2,[fighter(1),fighter(2)],0),false);
 assert.equal(allowBumpFight(2,[fighter(1),{...fighter(2),officer:true}],0),true,'officers do not count');
 assert.equal(allowBumpFight(2,[fighter(1),{...fighter(2),combatUntil:-1}],0),true,'a finished fight does not count');
 assert.equal(POLICE.bumpFightCap,2);
});
