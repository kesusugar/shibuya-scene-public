import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {createPlayerFigure,characterAction,gaitAction} from '../src/player/figure.mjs';
import pack from '../src/player/generated/character.mjs';
const state={x:0,y:0,z:0,heading:0,speed:0,alive:true};
test('baked rig weights normalize and animation clips match their source',()=>{
 assert.equal(pack.sourceKey,createHash('sha256').update(readFileSync('scripts/bake-character.mjs')).digest('hex'));
 const f=createPlayerFigure();assert.equal(f.root.animations.length,12);let meshes=0;
 f.root.traverse(o=>{if(!o.isSkinnedMesh)return;meshes++;const weights=o.geometry.attributes.skinWeight;for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<.0001);});assert.equal(meshes,6);f.dispose();
});
test('all actions deform vertices finitely, revival clears the death pose and disposal is idempotent',()=>{
 const f=createPlayerFigure(),poses=[{trafficReaction:'guard'},{trafficReaction:'startle'},{speed:1.3},{speed:3},{speed:4.2},{attackTime:.21},{hurtTime:.17},{vehiclePhase:.5,vehicleKind:'enter'},{vehiclePhase:.5,vehicleKind:'exit'},{alive:false,runOver:.3},{alive:false,runOver:1}];
 // characterAction now answers only for what covers the legs; locomotion is a blend, and
 // which clip is uppermost in it is gaitAction's answer.
 for(const pose of poses){const s={...state,...pose};for(let i=0;i<4;i++)f.update(s,.05);assert.equal(f.action,characterAction(s)??gaitAction(s.speed));f.root.traverse(o=>{if(!o.isSkinnedMesh)return;o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i+=13){const v=new Vector3().fromBufferAttribute(o.geometry.attributes.position,i);o.applyBoneTransform(i,v);assert.ok(v.toArray().every(Number.isFinite));assert.ok(v.length()<3);}});}
 for(let i=0;i<12;i++)f.update(state,.05);assert.equal(f.action,'Idle');assert.ok(Math.abs(f.root.getObjectByName('Body').rotation.z)<.01);f.dispose();f.dispose();assert.equal(f.root.children.length,0);
});
test('locomotion transition settles and stopping does not leave arms in an attack pose',()=>{
 const f=createPlayerFigure();f.update({...state,attackTime:.2},.1);for(let i=0;i<12;i++)f.update(state,.05);assert.equal(f.action,'Idle');assert.ok(Math.abs(f.root.getObjectByName('ArmR').rotation.x)<.2);f.dispose();
});
