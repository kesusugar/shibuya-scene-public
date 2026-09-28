import test from 'node:test';
import assert from 'node:assert/strict';
import {headlightGlows} from '../src/traffic/headlight-glows.mjs';
test('headlight halos track active vehicles and switch off by day',()=>{
 const source={emissiveIntensity:.12},g=headlightGlows(3,source);
 const v={active:true,parked:false,type:'sedan',x:4,z:8,heading:0};g.sync([v,{...v,parked:true},{...v,active:false}]);assert.equal(g.mesh.count,2);
 g.mesh.onBeforeRender();assert.equal(g.mesh.material.uniforms.strength.value,0);
 source.emissiveIntensity=6;g.mesh.onBeforeRender();assert.ok(g.mesh.material.uniforms.strength.value>.8);
 const initial=g.mesh.instanceMatrix.array[12];v.x+=10;g.sync([v]);assert.ok(Math.abs(g.mesh.instanceMatrix.array[12]-initial-10)<.001);
 assert.equal(g.mesh.material.depthTest,true);assert.equal(g.mesh.material.depthWrite,false);g.sync([]);assert.equal(g.mesh.count,0);g.dispose();
});
