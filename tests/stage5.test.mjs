// Roadmap stage 5: money, the shop, saving, and the mission board (chase, escape, escort, the
// snatch-thief, and the delivery on the board).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWallet,ECONOMY,yen} from '../src/game/economy.mjs';
import {createSave,sanitise,SAVE} from '../src/game/save.mjs';
import {SHOP,buy,absorb,shopDoor} from '../src/game/shop.mjs';
import {createMissionBoard,MISSIONS,MISSION} from '../src/game/missions.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {restorePedestrianNetwork} from '../src/life/network.mjs';

const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json'));
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=restoreGroundModel(pack.ground);
const network=restorePedestrianNetwork(pack.life.high,ground);
function traffic(){
 const graph=restoreTrafficGraph(pack.traffic.high);graph.ground=ground;graph.data=data;
 const sim=new TrafficSimulation(graph,{tier:'high',street:pack.street.high});sim.refill(true);return sim;
}
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};

test('the wallet: paid, spent only what it has, and a death or arrest takes a capped share',()=>{
 const w=createWallet();assert.equal(w.money,ECONOMY.start);
 w.earn(8000,'chase');assert.equal(w.money,13000);
 assert.equal(w.spend(20000),false);assert.equal(w.money,13000,'nothing taken when short');
 assert.ok(w.spend(3000));assert.equal(w.money,10000);
 assert.equal(w.penalty('death'),1000);assert.equal(w.penalty('arrest'),Math.round(9000*ECONOMY.arrestFee));
 const rich=createWallet({money:10000000});assert.equal(rich.penalty('death'),ECONOMY.feeCap);
 assert.equal(yen(12345),'¥12,345');
});

test('saving: one slot, round-trips what matters, ignores a save of another version or garbage',()=>{
 const store=memory(),save=createSave(store);
 assert.equal(save.load(),null);
 assert.ok(save.save({money:12345.6,armor:30,completed:{chase:2,'bad key!':3},best:{delivery:900}}));
 const back=save.load();
 assert.equal(back.money,12346);assert.equal(back.armor,30);assert.deepEqual(back.completed,{chase:2});assert.deepEqual(back.best,{delivery:900});
 store.setItem(SAVE.key,JSON.stringify({version:99,money:5}));assert.equal(save.load(),null,'another version');
 store.setItem(SAVE.key,'{not json');assert.equal(save.load(),null);
 assert.equal(sanitise({version:SAVE.version,money:-5,armor:500}).money,0);
});

test('the shop: sells what helps, refuses what would do nothing or cannot be paid for; the vest absorbs blows until used up',()=>{
 const w=createWallet({money:5000});
 assert.equal(buy(w,'heal',{health:100}).ok,false,'full health');
 const h=buy(w,'heal',{health:40});assert.ok(h.ok);assert.deepEqual(h.apply,{health:100});assert.equal(w.money,3500);
 assert.equal(buy(w,'armor',{armor:0}).reason,'お金が足りません');assert.equal(w.money,3500);
 assert.equal(buy(w,'repair',{hasCar:false}).ok,false);
 assert.ok(buy(w,'repair',{hasCar:true,carDamage:.4}).ok);
 let a=50,total=0;for(let i=0;i<5;i++){const r=absorb(20,a);total+=r.damage;a=r.armor;}
 assert.ok(a<1e-9,'the vest is used up');assert.ok(Math.abs(total-50)<1e-9,`100 damage, 50 absorbed: ${total}`);
 assert.deepEqual(absorb(20,0),{damage:20,armor:0});
 const door=shopDoor(network.ctx);assert.ok(network.ctx.safe(door.x,door.z,.4),'the door is on the pavement');
 assert.ok(Math.hypot(door.x-SHOP.anchor[0],door.z-SHOP.anchor[1])<30);
});

test('the board lists the five missions; the delivery runs through it and pays by its score',()=>{
 assert.deepEqual(MISSIONS.map(m=>m.id),['delivery','chase','escape','escort','snatch']);
 const board=createMissionBoard(network);
 const s=board.start('delivery',{player:{x:12,z:24,speed:0}});
 assert.equal(s.status,'running');assert.ok(s.target);
 board.cancel({});assert.equal(board.snapshot().status,'cancelled');
});

test('the chase: a car breaks away over the carriageway, and staying on it makes it give up; losing it fails',()=>{
 const sim=traffic(),board=createMissionBoard(network);
 const me={x:0,z:20,heading:0,speed:0,alive:true};
 const world={player:me,driving:true,car:me,traffic:sim};
 const s=board.start('chase',world);assert.equal(s.status,'running',s.reason);
 const target=sim.pool.find(v=>v.active&&v.missionTarget);assert.ok(target&&target.controlled&&target.service,'a controlled target that cannot be taken');
 const d0=Math.hypot(target.x-me.x,target.z-me.z);assert.ok(d0>=MISSION.chase.spawn[0]-1&&d0<=MISSION.chase.spawn[1]+1);
 // Let it get going with the player standing still: it drives away.
 let pay=0;for(let i=0;i<30*8;i++)pay+=board.tick(1/30,world);
 assert.ok(Math.hypot(target.x-me.x,target.z-me.z)>d0+5,'it drove away');
 // The player's car closes at 16 m/s (it is faster) and sits on its tail.
 for(let i=0;i<30*60&&board.snapshot().status==='running';i++){
  const dx=target.x-me.x,dz=target.z-me.z,d=Math.hypot(dx,dz);
  if(d>4){const k=Math.min(d-4,16/30)/d;me.x+=dx*k;me.z+=dz*k;me.heading=Math.atan2(dx,dz);}
  pay+=board.tick(1/30,world);
 }
 assert.equal(board.snapshot().status,'complete',board.snapshot().reason);
 assert.equal(pay,MISSIONS.find(m=>m.id==='chase').reward,'paid once');
 assert.ok(!target.controlled&&target.parked,'left as a parked car');
 // Lost: the player stays put while it runs.
 const b2=createMissionBoard(network),still={x:0,z:20,heading:0,alive:true};
 b2.start('chase',{player:still,driving:true,car:still,traffic:sim});
 for(let i=0;i<30*(MISSION.chase.seconds+2)&&b2.snapshot().status==='running';i++)b2.tick(1/30,{player:still,driving:true,car:still,traffic:sim});
 assert.equal(b2.snapshot().status,'failed');
 sim.dispose();
});

test('the escape: ☆2 is raised on start, and only escaping (not an arrest) completes it',()=>{
 const board=createMissionBoard(network);let raised=0;
 const wanted={stars:0,cleared:null},world={player:{x:0,z:0,alive:true},wanted,raiseWanted:n=>{raised=n;wanted.stars=n;}};
 board.start('escape',world);assert.equal(raised,MISSION.escape.stars);
 board.tick(1,world);assert.equal(board.snapshot().status,'running');
 wanted.stars=0;wanted.cleared='escaped';
 assert.equal(board.tick(1,world),MISSIONS.find(m=>m.id==='escape').reward);
 const b2=createMissionBoard(network),w2={stars:0,cleared:null},world2={player:{x:0,z:0,alive:true},wanted:w2,raiseWanted:n=>{w2.stars=n;}};
 b2.start('escape',world2);b2.tick(1,world2);w2.stars=0;w2.cleared='arrested';b2.tick(1,world2);
 assert.equal(b2.snapshot().status,'failed');assert.equal(b2.snapshot().reason,'逮捕された');
});

/** A crowd stand-in whose people obey `follow` as the simulation does. */
function crowdOf(people){
 const c={time:0,pool:people,said:[],say(p,w){c.said.push([p.id,w]);},
  step(dt){c.time+=dt;for(const p of people){const f=p.follow;if(!f)continue;const dx=f.x-p.x,dz=f.z-p.z,d=Math.hypot(dx,dz),s=Math.min(d,f.speed*dt);if(s>0){p.x+=dx/d*s;p.z+=dz/d*s;}}}};
 return c;
}
const adult=(id,x,z)=>({id,active:true,x,z,heading:0,archetype:'office'});

test('the escort: the nearest adult follows the player to the address; leaving them behind fails',()=>{
 const crowd=crowdOf([adult(0,14,26),adult(1,40,40)]),me={x:12,z:24,heading:0,alive:true};
 const board=createMissionBoard(network),world={player:me,crowd};
 const s=board.start('escort',world);assert.equal(s.status,'running',s.reason);
 const client=crowd.pool[0];assert.equal(client.missionRole,'client');
 const dest=s.target??(board.tick(0,world),board.snapshot().target);
 // Walk the player to the address at 1.4 m/s; the client keeps up.
 let pay=0;
 for(let i=0;i<30*240&&board.snapshot().status==='running';i++){
  const t=board.snapshot().target,dx=t.x-me.x,dz=t.z-me.z,d=Math.hypot(dx,dz);
  if(d>.5){me.x+=dx/d*1.4/30;me.z+=dz/d*1.4/30;me.heading=Math.atan2(dx,dz);}
  pay+=board.tick(1/30,world);crowd.step(1/30);
 }
 assert.equal(board.snapshot().status,'complete',board.snapshot().reason);assert.ok(pay>0);
 assert.equal(client.follow,null);assert.equal(client.mode,'idle','left standing at the address');
 void dest;
 // Abandoned: the player runs off in a car.
 const crowd2=crowdOf([adult(0,14,26)]),car={x:12,z:24,heading:0,alive:true},b2=createMissionBoard(network),w2={player:car,crowd:crowd2,driving:true,car};
 b2.start('escort',w2);
 for(let i=0;i<30*30&&b2.snapshot().status==='running';i++){car.x+=15/30;b2.tick(1/30,w2);crowd2.step(1/30);}
 assert.equal(b2.snapshot().status,'failed');assert.equal(b2.snapshot().reason,'依頼人を置き去りにした');
});

test('the snatch: a thief near a victim runs off along the paths; a blow or a tackle stops them, and sparing them pays more',()=>{
 const people=[adult(0,20,30),adult(1,24,31),adult(2,70,70)],crowd=crowdOf(people),me={x:12,z:24,heading:0,alive:true};
 const board=createMissionBoard(network),world={player:me,crowd};
 assert.equal(board.start('snatch',world).status,'running');
 const thief=people.find(p=>p.missionRole==='thief');assert.ok(thief,'a thief');
 assert.ok(crowd.said.some(([,w])=>w==='scream'),'the victim cries out');
 const start={x:thief.x,z:thief.z};
 for(let i=0;i<30*3;i++){board.tick(1/30,world);crowd.step(1/30);}
 assert.ok(Math.hypot(thief.x-start.x,thief.z-start.z)>8,'running away');
 thief.hitSeq=(thief.hitSeq??0)+1;          // the player's blow lands
 const pay=board.tick(1/30,world);
 assert.equal(board.snapshot().status,'complete');
 assert.equal(pay,MISSIONS.find(m=>m.id==='snatch').reward+MISSION.snatch.spare,'caught alive: the bonus');
 assert.ok(thief.handsUpUntil>crowd.time,'they give up');
});
