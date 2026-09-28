// PLAN-PERFORMANCE-AND-PAD C1-C4: the Switch Pro Controller (and any standard pad) through one
// positional GTA-style layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createInputMap,profileOf,radial,controlHints,BUTTON,INPUT,createRumble,GLYPHS} from '../src/player/input-map.mjs';

const pad=(id='Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',mapping='standard')=>({id,mapping,connected:true,axes:[0,0,0,0],
 buttons:Array.from({length:18},()=>({pressed:false,value:0}))});
const press=(p,name,v=1)=>{p.buttons[BUTTON[name]]={pressed:v>.5,value:v};};
const release=(p,name)=>press(p,name,0);

test('the Switch Pro Controller is recognised, in Chrome\'s standard mapping or not',()=>{
 assert.equal(profileOf(pad()),'switch');
 assert.equal(profileOf(pad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')),'standard');
 assert.equal(profileOf(pad(undefined,'')),'switch-raw');
 assert.equal(profileOf(null),null);
});

test('C2 on foot: ZR fires, ZL aims, B runs, A reloads, Y rolls, X gets in, L/R weapons, stick press crouches',()=>{
 const map=createInputMap(),p=pad();
 const tap=(name)=>{press(p,name);const f=map.poll(p,1/60,'foot');release(p,name);map.poll(p,1/60,'foot');return f;};
 assert.deepEqual(tap('ZR').pressed,['fire']);
 assert.deepEqual(tap('right').pressed,['reload'],'A (right) is reload');
 assert.deepEqual(tap('left').pressed,['roll'],'Y (left) is roll');
 assert.deepEqual(tap('top').pressed,['enter'],'X (top) gets in');
 // Stage 1: L/R act when let go (held, they open the weapon wheel instead).
 const tapUp=(name)=>{press(p,name);map.poll(p,1/60,'foot');release(p,name);return map.poll(p,1/60,'foot');};
 assert.deepEqual(tapUp('L').pressed,['weaponPrev']);assert.deepEqual(tapUp('R').pressed,['weaponNext']);
 assert.deepEqual(tap('LS').pressed,['crouch']);
 assert.deepEqual(tap('plus').pressed,['menu']);assert.deepEqual(tap('minus').pressed,['map']);
 press(p,'ZL');press(p,'bottom');const held=map.poll(p,1/60,'foot');
 assert.ok(held.aim&&held.run,'ZL held aims, B held runs');
 assert.deepEqual(map.poll(p,1/60,'foot').pressed,[],'a held button fires once, not every frame');
});

test('C2 in a car: ZR throttle, ZL brake, R handbrake, X out, stick press horn, d-pad up siren',()=>{
 const map=createInputMap(),p=pad();
 press(p,'R');press(p,'top');press(p,'LS');press(p,'up');
 const f=map.poll(p,1/60,'car');
 assert.ok(f.handbrake);assert.deepEqual(f.pressed.sort(),['exit','horn','siren']);
 assert.equal(f.aim,false,'ZL does not aim from a car seat');
});

test('C3: digital ZL/ZR ramp the throttle and brake; an analogue trigger passes through',()=>{
 const map=createInputMap(),p=pad();press(p,'ZR');
 let f=map.poll(p,1/60,'car');assert.ok(f.throttle>0&&f.throttle<.1,`throttle jumped to ${f.throttle}`);
 for(let t=0;t<INPUT.ramp.up;t+=1/60)f=map.poll(p,1/60,'car');
 assert.ok(f.throttle>.99,'the ramp never reached full');
 release(p,'ZR');for(let t=0;t<INPUT.ramp.down+.02;t+=1/60)f=map.poll(p,1/60,'car');
 assert.equal(f.throttle,0);
 const xbox=pad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)');press(xbox,'ZR',.4);
 assert.equal(createInputMap().poll(xbox,1/60,'car').throttle,.4);
});

test('C3: a radial deadzone -- no drift at rest, full at the edge, diagonals not sticky',()=>{
 assert.deepEqual(radial(.1,.08),{x:0,y:0,m:0});
 assert.ok(radial(1,0).m>.999);
 const d=radial(.6,.6);assert.ok(Math.abs(d.x-d.y)<1e-9&&d.m>.7);
 // The camera is gentler near the centre than the walk.
 assert.ok(radial(.4,0,{curve:INPUT.lookCurve}).x<radial(.4,0).x);
 const map=createInputMap(),p=pad();p.axes=[0,-1,.05,0];
 const f=map.poll(p,1/60,'foot');assert.ok(f.move.y>.99,'stick up is forward');assert.equal(f.look.x,0);
});

test('a non-standard pad: no button is read (the indices mean nothing), the sticks still work',()=>{
 const p=pad(undefined,'');press(p,'ZR');p.axes=[0,-1,0,0];
 const f=createInputMap().poll(p,1/60,'foot');
 assert.deepEqual(f.pressed,[]);assert.ok(f.move.y>.99);
});

test('the HUD names the Switch buttons for a Switch pad and the Xbox ones otherwise',()=>{
 assert.match(controlHints('switch'),/ZR 攻撃/);assert.match(controlHints('switch'),/A 装填/);assert.match(controlHints('switch'),/Y 回避/);
 assert.match(controlHints('standard'),/RT 攻撃/);assert.match(controlHints('standard'),/B 装填/);
 assert.match(controlHints('switch',true),/ZR アクセル/);
 assert.match(controlHints('keyboard'),/1\/2\/3\/4 武器/);
 assert.equal(GLYPHS.switch.right,'A');assert.equal(GLYPHS.switch.bottom,'B');
});

test('C4 rumble: plays through the actuator, spaced out, and is silent without one',()=>{
 const effects=[];const p={vibrationActuator:{type:'dual-rumble',playEffect(t,o){effects.push(o);return Promise.resolve();}}};
 const r=createRumble();
 assert.ok(r.play(p,'shot',0));assert.ok(!r.play(p,'shot',.01),'two effects inside the gap');
 assert.ok(r.play(p,'crash',1));assert.equal(effects.length,2);assert.equal(effects[1].strongMagnitude,1);
 assert.equal(r.play({},'shot',5),false);assert.equal(r.play(null,'shot',6),false);
 assert.equal(r.play(p,'no-such',7),false);
});

// Through the player controller, as the scene uses it.
import {createPlayer,padSettings} from '../src/player/controller.mjs';
function attached(pad,opts={}){
 const listeners={};const on=(t,f)=>{listeners[t]=f;};
 globalThis.window={addEventListener:on,removeEventListener(){}};
 globalThis.document={pointerLockElement:null,exitPointerLock(){}};
 Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[pad]},configurable:true});
 const flat={solid:()=>false,safe:()=>true,height:()=>0,onRoad:()=>false};
 const player=createPlayer(flat,{start:[0,0],heading:0});player.place(0,0,0);
 const calls=[];const cb=name=>(...a)=>calls.push([name,...a]);
 player.attach({addEventListener(){},removeEventListener(){}},{onAttack:cb('attack'),onDrive:cb('drive'),onAim:cb('aim'),onReload:cb('reload'),
  onRoll:cb('roll'),onCrouch:cb('crouch'),onWeaponCycle:cb('cycle'),onSiren:cb('siren'),onHornOnly:cb('horn'),onMap:cb('map'),onExit:cb('exit'),...opts});
 return {player,calls};
}

test('the controller: ZR attacks, ZL aims while held, L/R cycle, B runs -- on a Switch Pro Controller',()=>{
 const p=pad(),{player,calls}=attached(p);
 press(p,'ZR');player.updateInput(1/60);release(p,'ZR');player.updateInput(1/60);
 press(p,'ZL');player.updateInput(1/60);release(p,'ZL');player.updateInput(1/60);
 press(p,'R');player.updateInput(1/60);release(p,'R');player.updateInput(1/60);
 // Item 3: the pad's calls say they came from the pad (the arsenal hard-locks, and ZR alone fires no gun).
 assert.deepEqual(calls,[['attack',{pad:true}],['aim',true,{pad:true}],['aim',false,{pad:true}],['cycle',1]]);
 press(p,'bottom');p.axes=[0,-1,0,0];player.updateInput(1/60);
 const i=player.input();assert.ok(i.running&&i.forward>.99);
 assert.equal(player.lastDevice,'pad');assert.equal(player.padProfile,'switch');
});

test('the controller in a car: X gets out, ZR ramps the throttle into input().forward, R is the handbrake',()=>{
 const p=pad(),{player,calls}=attached(p,{driving:()=>true});
 press(p,'top');press(p,'ZR');press(p,'R');player.updateInput(1/60);
 assert.deepEqual(calls,[['drive']]);
 let f=player.input().forward;assert.ok(f>0&&f<.2,`throttle ${f} on the first frame`);
 for(let t=0;t<.35;t+=1/60)player.updateInput(1/60);
 assert.ok(player.input().forward>.99);assert.ok(player.input().handbrake);
});

test('item 3: locked on, the right stick flicks (no camera turn); unlocked, it turns the camera',()=>{
 let locked=false;const p=pad(),{player,calls}=attached(p,{locked:()=>locked,onLockFlick:d=>calls.push(['flick',d])});
 press(p,'ZL');player.updateInput(1/60);locked=true;
 const h=player.state.heading;p.axes=[0,0,.95,0];player.updateInput(.1);player.updateInput(.1);
 assert.equal(player.state.heading,h,'the stick turned the camera while locked');
 p.axes=[0,0,0,0];player.updateInput(.1);p.axes=[0,0,0,-.95];player.updateInput(.1);
 assert.deepEqual(calls.filter(c=>c[0]==='flick'),[['flick','right'],['flick','up']]);
 locked=false;p.axes=[0,0,.95,0];player.updateInput(.1);assert.ok(player.state.heading<h,'unlocked, the stick did not turn');
});

test('the controller: the right stick turns the camera, and invert-Y flips the pitch',()=>{
 const p=pad(),{player}=attached(p);p.axes=[0,0,1,0];
 const h=player.state.heading;player.updateInput(.1);assert.ok(player.state.heading<h,'right stick right did not turn right');
 const s=padSettings('?padLook=2&invertY=1',null);assert.equal(s.look,2);assert.equal(s.invertY,true);
 const stored=new Map();const store={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)};
 padSettings('?padLook=1.5',store);assert.equal(padSettings('',store).look,1.5,'the setting was not kept');
 assert.equal(padSettings('?padLook=99',null).look,3);assert.equal(padSettings('?padLook=-1',null).look,1);
});

test('stage 1: L or R held opens the weapon wheel, the right stick picks, and no tap fires',()=>{
 const map=createInputMap(),p=pad();
 press(p,'L');
 let f;for(let t=0;t<.2;t+=1/60){f=map.poll(p,1/60,'foot');assert.equal(f.wheel,false,'a tap is not the wheel yet');}
 for(let t=0;t<.2;t+=1/60)f=map.poll(p,1/60,'foot');
 assert.equal(f.wheel,true,'held: the wheel');
 p.axes[2]=.9;p.axes[3]=0;f=map.poll(p,1/60,'foot');assert.deepEqual(f.stick,{x:.9,y:0});
 release(p,'L');f=map.poll(p,1/60,'foot');
 assert.equal(f.wheel,false);assert.deepEqual(f.pressed,[],'letting go of the wheel is not a weapon step');
 press(p,'R');f=map.poll(p,1/60,'car');release(p,'R');f=map.poll(p,1/60,'car');
 assert.deepEqual(f.pressed,[],'in a car R is the handbrake, never a weapon');
});
