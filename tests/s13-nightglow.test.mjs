import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {Scene,Group,Mesh,PlaneGeometry,MeshStandardMaterial} from 'three';
import {TimeState} from '../src/app/foundation.mjs';
import {DayNightSystem,installNightEmission} from '../src/environment/day-night.mjs';
import {buildNightglow} from '../src/nightglow/render.mjs';
import {NIGHT_PROFILES,ZONES} from '../src/nightglow/model.mjs';
import {createNightBloom} from '../src/nightglow/bloom.mjs';
import {area,intersection,union,difference} from '../src/ground/model.mjs';
import {multi} from '../src/buildings/model.mjs';
import {signFace} from '../src/signs/render.mjs';
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const time=new TimeState(),scene=new Scene(),env=new DayNightSystem(scene,{toneMappingExposure:1},time);env.enable();
const wet=buildNightglow(data,{time,environment:env,tier:'high'}),model=wet.model;
mkdirSync('evidence/s13',{recursive:true});
test('S13 selected wet geometry follows flat mapped surfaces, avoids markings/buildings and has no overlapping pools',()=>{
 const records=[...model.patches,...model.reflections];assert.ok(model.patches.length>=54&&model.patches.length<=72);assert.ok(model.reflections.length>=22&&model.reflections.length<=30);assert.deepEqual([...new Set(records.map(r=>r.zone))].sort(),ZONES.map(z=>z.id).sort());
 let occupied=[],overlap=0,markingOverlap=0,outside=0;
 for(const r of records)for(const p of r.pieces){const shape=multi(p.polygon),base=p.y-(r.id.startsWith('patch')?.004:.006);assert.ok(Math.abs(base)<1e-8||Math.abs(base-.15)<1e-8);const surface=model.surfaces.find(s=>Math.abs(s.y-base)<1e-8);outside+=area(difference(shape,surface.shape));markingOverlap+=area(intersection(shape,model.markings));overlap+=area(intersection(shape,occupied));occupied=union(occupied,shape);}
 assert.ok(outside<1e-6);assert.ok(markingOverlap<1e-6);assert.ok(overlap<1e-6);
 for(const m of wet.root.children){for(const a of Object.values(m.geometry.attributes))assert.ok([...a.array].every(Number.isFinite));assert.equal(m.material.depthWrite,false);assert.equal(m.material.polygonOffset,true);}
 writeFileSync('evidence/s13/geometry.json',JSON.stringify({patches:model.patches.length,reflections:model.reflections.length,zones:ZONES.map(z=>z.id),outsideArea:outside,markingOverlapArea:markingOverlap,poolOverlapArea:overlap,addedLights:0},null,2));
});
test('S13 tier changes reuse two geometry batches; DAY and environment OFF disable effects',()=>{
 const geometry=wet.root.children.map(m=>m.geometry),profiles={};time.set('night');
 for(const tier of ['high','medium','low']){wet.setTier(tier);assert.equal(wet.stats.patches,Math.min(model.patches.length,NIGHT_PROFILES[tier].patches));assert.equal(wet.stats.reflections,Math.min(model.reflections.length,NIGHT_PROFILES[tier].reflections));assert.equal(wet.stats.extraBloomDrawCalls,tier==='low'?0:2);assert.equal(wet.root.visible,true);profiles[tier]={...wet.stats};assert.deepEqual(wet.root.children.map(m=>m.geometry),geometry);}
 assert.ok(profiles.high.triangles>profiles.medium.triangles&&profiles.medium.triangles>profiles.low.triangles);time.set('day');assert.equal(wet.root.visible,false);assert.equal(env.nightglow,0);assert.equal(wet.stats.bloomStrength,0);time.set('night');env.disable();wet.refresh();assert.equal(wet.root.visible,false);env.enable();wet.refresh();assert.equal(wet.root.visible,true);writeFileSync('evidence/s13/profiles.json',JSON.stringify(profiles,null,2));time.set('day');
});
test('S13 wet asphalt and vehicle emission restore exact S12 DAY values without mesh changes',()=>{
 const root=new Group(),asphalt=new Mesh(new PlaneGeometry(),new MeshStandardMaterial({roughness:.96,metalness:0})),lamp=new Mesh(new PlaneGeometry(),new MeshStandardMaterial({emissive:0xffffff,emissiveIntensity:.25}));asphalt.name='ground-asphalt';lamp.name='traffic-taxi-rear';root.add(asphalt,lamp);scene.add(root);env.register(root);wet.setTier('high');time.set('night');assert.equal(asphalt.material.roughness,.53);assert.ok(asphalt.material.metalness>0&&asphalt.material.metalness<.1);assert.equal(lamp.material.emissiveIntensity,1.1*1.15);time.set('day');assert.equal(asphalt.material.roughness,.96);assert.equal(asphalt.material.metalness,0);assert.equal(lamp.material.emissiveIntensity,.25);assert.equal(root.children.length,2);assert.throws(()=>env.setNightglow(NaN));env.unregister(root);root.removeFromParent();for(const m of root.children){m.geometry.dispose();m.material.dispose();}
});
test('S13 Hero/commercial signs vary via vertex attribute; existing window/train shader hooks remain composable',()=>{
 const values=[];for(const [hero,region] of [[true,'scramble'],[false,'center-gai'],[false,'office']]){const g=signFace({width:2,height:1,heading:0,position:[0,2,0],normal:[0,0,1],depth:.1,hero,region},{u0:0,u1:1,v0:0,v1:1});values.push(g.attributes.s13GlowWeight.getX(0));assert.equal(g.attributes.position.count,4);g.dispose();}assert.ok(values[0]>values[1]&&values[1]>values[2]);
 for(const mode of ['sign','window','train']){const m=new MeshStandardMaterial(),hook=installNightEmission(m,mode),shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <emissivemap_fragment>'};m.onBeforeCompile(shader);assert.equal(shader.uniforms.s13Nightglow,hook.glow);assert.equal(hook.glow.value,0);if(mode==='window')assert.ok(shader.vertexShader.includes('seed<3.0'));if(mode==='train')assert.ok(shader.vertexShader.includes('s12Cab'));hook.restore();m.dispose();}
});
test('S13 bloom has bounded extra passes, reduced MED target, LOW/DAY bypass and restored render state/stats',()=>{
 let target=null,calls=0;const renderer={info:{autoReset:true,reset(){calls=0;}},getDrawingBufferSize(v){v.set(1000,600);},getRenderTarget(){return target;},setRenderTarget(t){target=t;},render(){if(this.info.autoReset)calls=0;calls++;}};
 const bloom=createNightBloom(renderer),s=new Scene();assert.equal(bloom.render(s,null,'high',true),2);assert.equal(calls,3);assert.equal(renderer.info.autoReset,true);assert.equal(target,null);assert.equal(bloom.soft.width,250);assert.equal(bloom.soft.height,150);assert.equal(bloom.extract.uniforms.threshold.value,1.1);assert.equal(bloom.render(s,null,'medium',true),2);assert.equal(bloom.soft.width,160);assert.ok(bloom.combine.uniforms.strength.value<.18);assert.equal(bloom.render(s,null,'low',true),0);assert.equal(calls,1);assert.equal(bloom.render(s,null,'high',false),0);assert.equal(calls,1);assert.ok(bloom.combine.fragmentShader.includes('texture2D(source,vUv).rgb+'));bloom.dispose();bloom.dispose();
});
test('S13 disposal restores baseline and releases pooled resources exactly once',()=>{
 time.set('night');let disposed=0;for(const m of wet.root.children){m.geometry.addEventListener('dispose',()=>disposed++);m.material.addEventListener('dispose',()=>disposed++);}wet.dispose();wet.dispose();assert.equal(disposed,4);assert.equal(env.nightglow,0);assert.equal(wet.root.children.length,0);time.set('day');env.dispose();const page=readFileSync('app/page.tsx','utf8');for(const name of ['buildPlayer','buildPolice','buildPostprocess','Reflector','UnrealBloomPass'])assert.ok(!page.includes(name));
});
