import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshStandardMaterial,Object3D,PerspectiveCamera,Scene,ShaderLib,UniformsUtils} from 'three';
import {createRoadReflection,ROAD_REFLECTION,ROAD_REFLECTION_UNIFORMS} from '../src/nightglow/road-reflection.mjs';
import {installNightEmission} from '../src/environment/day-night.mjs';

function fakeRenderer(){
 const log={renders:0,sampledWhileDrawing:0,hiddenSeen:[]};
 let target=null;
 const r={shadowMap:{autoUpdate:true},xr:{enabled:false},
  getDrawingBufferSize(v){v.set(1600,900);return v;},getRenderTarget(){return target;},setRenderTarget(t){target=t;},clear(){},
  render(scene,camera){log.renders++;
   if(ROAD_REFLECTION_UNIFORMS.s13Reflection.value===target?.texture&&target)log.sampledWhileDrawing++;
   log.hiddenSeen.push(scene.children.map(o=>o.visible));
   log.camera=camera;}};
 return {r,log};
}
function world(){
 const scene=new Scene(),ground=new Object3D(),crowd=new Object3D(),city=new Object3D();
 scene.add(ground,crowd,city);
 const camera=new PerspectiveCamera(55,16/9,.1,900);camera.position.set(10,2.4,18);camera.lookAt(-15,8,-32);camera.updateMatrixWorld();
 return {scene,ground,crowd,city,camera};
}

test('off by default: the road looks exactly as before until a night mirror is active',()=>{
 const {r,log}=fakeRenderer(),{scene,camera,ground,crowd}=world();
 const m=createRoadReflection(r);
 for(let i=0;i<10;i++)m.update(scene,camera,{active:false,hide:[ground,crowd],time:i/60});
 assert.equal(log.renders,0);
 assert.equal(ROAD_REFLECTION_UNIFORMS.s13ReflectStrength.value,0);
 assert.equal(ROAD_REFLECTION_UNIFORMS.s13Reflection.value,null);
 m.dispose();
});

test('active: fades in, renders every other frame at half size, hides what it must and restores it',()=>{
 const {r,log}=fakeRenderer(),{scene,camera,ground,crowd,city}=world();
 const m=createRoadReflection(r);
 const frames=40;
 for(let i=0;i<frames;i++)m.update(scene,camera,{active:true,hide:[ground,crowd],time:i/60});
 assert.ok(Math.abs(log.renders-frames/ROAD_REFLECTION.interval)<=1,`${log.renders} mirror renders in ${frames} frames`);
 assert.equal(m.stats.width,Math.min(ROAD_REFLECTION.maxWidth,1600*ROAD_REFLECTION.scale));
 for(const seen of log.hiddenSeen)assert.deepEqual(seen,[false,false,true],'ground and crowd hidden, city drawn');
 assert.ok(ground.visible&&crowd.visible&&city.visible,'visibility restored after every mirror render');
 assert.equal(log.sampledWhileDrawing,0,'the mirror was bound while being drawn into (WebGL feedback loop)');
 assert.ok(ROAD_REFLECTION_UNIFORMS.s13ReflectStrength.value>0);
 assert.equal(ROAD_REFLECTION_UNIFORMS.s13Reflection.value,m.target.texture);
 // The mirror camera is below the plane, looking up at the city.
 assert.ok(log.camera.position.y<0,'mirror camera below the road');
 assert.ok(Math.abs(log.camera.position.y-(2*ROAD_REFLECTION.height-camera.position.y))<1e-6);
 m.enabled=false;for(let i=0;i<60;i++)m.update(scene,camera,{active:true,hide:[ground,crowd],time:(frames+i)/60});
 assert.equal(ROAD_REFLECTION_UNIFORMS.s13ReflectStrength.value,0,'disabled fades to nothing');
 m.dispose();
 assert.equal(ROAD_REFLECTION_UNIFORMS.s13Reflection.value,null);
});

test('a machine already below 25 fps renders the mirror half as often',()=>{
 const {r,log}=fakeRenderer(),{scene,camera,ground,crowd}=world();
 const m=createRoadReflection(r);
 for(let i=0;i<400;i++)m.update(scene,camera,{active:true,hide:[ground,crowd],time:i/12});   // 12 fps
 assert.equal(m.stats.interval,ROAD_REFLECTION.slowInterval);
 const before=log.renders;for(let i=400;i<480;i++)m.update(scene,camera,{active:true,hide:[ground,crowd],time:i/12});
 assert.ok(Math.abs(log.renders-before-80/ROAD_REFLECTION.slowInterval)<=1,`${log.renders-before} renders in 80 slow frames`);
 m.dispose();
});

test('only the asphalt night patch samples the mirror, through the shared uniforms',()=>{
 const shaderFor=mode=>{const material=new MeshStandardMaterial();installNightEmission(material,mode);
  const shader={uniforms:UniformsUtils.clone(ShaderLib.standard.uniforms),vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader);return shader;};
 const road=shaderFor('groundPoolRoad');
 assert.match(road.fragmentShader,/roadMirror\(q,/);
 assert.match(road.fragmentShader,/uniform sampler2D s13Reflection/);
 assert.equal(road.uniforms.s13Reflection,ROAD_REFLECTION_UNIFORMS.s13Reflection,'shared, not copied');
 assert.equal(road.uniforms.s13ReflectStrength,ROAD_REFLECTION_UNIFORMS.s13ReflectStrength);
 // Every preprocessor line still starts a line: a snippet without a trailing newline glued
 // `}#define STANDARD` together and the asphalt failed to compile in the browser.
 for(const line of road.fragmentShader.split('\n'))assert.ok(!/\S.*#(define|include|ifdef|endif)\b/.test(line.replace(/\/\/.*$/,'')),line);
 // The varying the mirror reads is declared before it is used.
 assert.ok(road.fragmentShader.indexOf('varying vec3 s161Position')<road.fragmentShader.indexOf('vec3 roadMirror('));
 for(const mode of ['groundPoolWalk','groundPool','wall','window']){
  const s=shaderFor(mode);assert.doesNotMatch(s.fragmentShader,/roadMirror/,mode);assert.equal(s.uniforms.s13Reflection,undefined,mode);
 }
});
