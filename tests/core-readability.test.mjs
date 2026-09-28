import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshStandardMaterial,ShaderLib} from 'three';
import {CAMERAS} from '../src/app/foundation.mjs';
import {installNightEmission} from '../src/environment/day-night.mjs';

test('street preset clears the former curb crowd position without changing other cameras',()=>{
 const c=CAMERAS.find(c=>c.id==='street');
 assert.deepEqual(c.position,[12,2.4,18]);
 assert.deepEqual(c.target,[-15,8,-32]);
 assert.deepEqual(CAMERAS.find(c=>c.id==='scramble').position,[52,48,60]);
});
test('facade daylight response and bounded night pavement pools retain shader lifecycle',()=>{
 for(const mode of ['wall','groundPool']){
  const m=new MeshStandardMaterial(),original=m.onBeforeCompile,hook=installNightEmission(m,mode);
  const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
  m.onBeforeCompile(shader);
  assert.equal(shader.uniforms.s12Night,hook.uniform);
  assert.ok(shader.fragmentShader.includes(mode==='wall'?'vec3(0.68,0.70,0.72)':'length(q-c)/16.0'));
  hook.restore();assert.equal(m.onBeforeCompile,original);m.dispose();
 }
});
