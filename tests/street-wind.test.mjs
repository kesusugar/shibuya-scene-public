import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial,ShaderLib,UniformsUtils} from 'three';
import {installWind,advanceWind,WIND_UNIFORMS,WIND_GLSL} from '../src/streetscape/wind.mjs';

const compile=material=>{const shader={uniforms:UniformsUtils.clone(ShaderLib.standard.uniforms),vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader,null);return shader;};

test('the leaf material and its shadow depth sway through one shared wind clock',()=>{
 const leaf=new MeshStandardMaterial();const depth=installWind(leaf);
 const a=compile(leaf),b={uniforms:{},vertexShader:ShaderLib.depth.vertexShader,fragmentShader:ShaderLib.depth.fragmentShader};depth.onBeforeCompile(b);
 for(const s of [a,b]){
  assert.equal(s.uniforms.uWindTime,WIND_UNIFORMS.uWindTime,'shared, not copied');
  assert.match(s.vertexShader,/windOffset\(windWorld, windAnchor\.xz\)/);
  assert.ok(s.vertexShader.indexOf('#include <project_vertex>')>s.vertexShader.indexOf('transformed +='),'the sway is applied before projection');
 }
 advanceWind(12.5);assert.equal(WIND_UNIFORMS.uWindTime.value,12.5);
 assert.match(leaf.customProgramCacheKey(),/s124-wind/);
 // Every preprocessor line still starts a line.
 for(const line of (WIND_GLSL+a.vertexShader).split('\n'))assert.ok(!/\S.*#(define|include|ifdef|endif)\b/.test(line.replace(/\/\/.*$/,'')),line);
});

test('a previous onBeforeCompile on the material still runs',()=>{
 const leaf=new MeshStandardMaterial();let ran=0;leaf.onBeforeCompile=()=>{ran++;};
 installWind(leaf);compile(leaf);assert.equal(ran,1);
});

test('the streetscape gives every leaf mesh the matching shadow material and disposes it',()=>{
 const src=readFileSync('src/streetscape/render.mjs','utf8');
 assert.match(src,/const leafDepth=installWind\(materials\.leaf\)/);
 assert.match(src,/if\(channel==='leaf'\)mesh\.customDepthMaterial=leafDepth/);
 assert.match(src,/leafDepth\.dispose\(\)/);
});
