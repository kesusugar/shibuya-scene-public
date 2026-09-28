import test from 'node:test';
import assert from 'node:assert/strict';
import {SignalController} from '../src/traffic/signals.mjs';
import {buildSignAccents} from '../src/signs/accent-lights.mjs';
test('pedestrian clearance does not consume the next vehicle green',()=>{
 const s=new SignalController(new Map([['scramble',{locks:new Set()}]]),new Map());s.time=107;s.enterPedestrian('scramble',1);
 for(let i=0;i<1800;i++)s.update(1/30);assert.equal(s.getSignalState('scramble','NS'),'RED');assert.equal(s.phase()[0],'PEDESTRIAN');
 s.leavePedestrian('scramble',1);for(let i=0;i<65;i++)s.update(1/30);assert.equal(s.getSignalState('scramble','NS'),'GREEN');assert.ok(s.remainingGreen('scramble','NS')>34);
});
test('building accent glows use bounded fixtures and turn off in daylight',()=>{
 const a=buildSignAccents(Array.from({length:40},(_,i)=>({position:[i*10-100,20,0],width:5,height:3,heading:0,depth:.2,normal:[0,0,1]})));
 assert.ok(a.count>8&&a.count<=24);const glare=a.root.children[1],bulbs=a.root.children[0];glare.onBeforeRender();assert.equal(glare.material.uniforms.strength.value,0);bulbs.material.emissiveIntensity=12;glare.onBeforeRender();assert.ok(glare.material.uniforms.strength.value>.8);assert.equal(glare.material.depthTest,true);a.dispose();
});
