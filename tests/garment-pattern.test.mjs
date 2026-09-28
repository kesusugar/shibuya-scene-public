// PLAN-LOOKS-AND-FLEET Step A: patterns on clothes, with no new crowd attribute.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,Group,ShaderLib} from 'three';
import {createHQCrowd} from '../src/life/hq-crowd.mjs';
import {appearanceOf,paletteOf,deduplicate,patternOf,styleOf,PATTERN_WEIGHTS,PALETTE} from '../src/life/appearance.mjs';
import {PATTERN,packGarment,unpackGarment,GARMENT_PATTERN_GLSL} from '../src/life/garment-pattern.mjs';
import {dressCitizen,WARDROBE} from '../src/player/character-asset.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);

/** Run a material's onBeforeCompile on three's own standard shader, as the renderer would. */
function compiled(material){
 const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,
  fragmentShader:ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader);
 return shader;
}
function nearMaterial(palette){
 const g=new BufferGeometry();
 g.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 g.setAttribute('color',new Float32BufferAttribute([0,1,0,0,0,1,0,0,0,0,1,0],4));
 const root=new Group();root.add(new Mesh(g,new MeshBasicMaterial()));
 return dressCitizen(root,palette);
}

test('a pattern is a pure function of the id, and appearanceOf carries it',()=>{
 for(let id=0;id<3000;id+=7){
  const a=appearanceOf(id),b=appearanceOf(id,1.18);
  assert.equal(a.topPattern,b.topPattern,`id ${id}: the top pattern depends on the height`);
  assert.equal(a.bottomPattern,b.bottomPattern);
  assert.deepEqual(patternOf(id),{top:a.topPattern,bottom:a.bottomPattern});
 }
 const seen=new Set();for(let id=0;id<3000;id++)seen.add(appearanceOf(id).topPattern);
 assert.ok(seen.size>=5,`only ${seen.size} top patterns in 3000 people`);
});

test('the pattern shares per life archetype are within 3% of their weights',()=>{
 const counts={};
 for(let id=0;id<200000;id++){
  const s=styleOf(id),p=patternOf(id);
  counts[s]??={n:0,top:{},bottom:{}};
  counts[s].n++;counts[s].top[p.top]=(counts[s].top[p.top]??0)+1;
  counts[s].bottom[p.bottom]=(counts[s].bottom[p.bottom]??0)+1;
 }
 for(const [style,c] of Object.entries(counts))for(const part of ['top','bottom']){
  const w=PATTERN_WEIGHTS[style][part],total=Object.values(w).reduce((a,b)=>a+b,0);
  for(const [k,v] of Object.entries(w)){
   const share=(c[part][k]??0)/c.n;
   assert.ok(Math.abs(share-v/total)<.03,`${style} ${part} pattern ${k}: ${share.toFixed(3)} vs ${(v/total).toFixed(3)}`);
  }
  for(const k of Object.keys(c[part]))assert.ok(k in w,`${style} ${part} got pattern ${k}, which it has no weight for`);
 }
});

test('office workers lean to solid and pinstripe, joggers are plain',()=>{
 assert.ok(PATTERN_WEIGHTS.office.top[PATTERN.pinstripe]>0);
 assert.equal(PATTERN_WEIGHTS.jogger.bottom[PATTERN.solid],100);
});

test('pack and unpack round-trip every palette colour with every pattern id',()=>{
 for(const hex of [...PALETTE.tops,...PALETTE.bottoms])for(let pattern=0;pattern<8;pattern++){
  const v=packGarment(hex,pattern);
  assert.ok(Number.isInteger(v)&&v>=0&&v<2**24,`${hex.toString(16)}/${pattern}: ${v} is not float-exact`);
  assert.equal(Math.fround(v),v);
  const out=unpackGarment(v);
  assert.equal(out.pattern,pattern);
  for(const s of [16,8,0]){
   const d=Math.abs(((hex>>s)&255)-((out.hex>>s)&255));
   assert.ok(d<=2,`${hex.toString(16)} channel >>${s} off by ${d}/255`);
  }
 }
});

test('the HQ crowd writes the pattern into the packed top and bottom',()=>{
 const crowd=createHQCrowd(manifest,bin,{capacity:64,lod:'L2'});
 const id=[...Array(400).keys()].find(i=>appearanceOf(i).topPattern===PATTERN.border);
 const look=appearanceOf(id);
 const lane=manifest.archetypes.findIndex(a=>a.id===look.archetype.id);
 const i=crowd.spawn(id,look,lane,{x:0,z:0,heading:0,speed:0});
 const slot=crowd.state.slot?.[i]??0;
 const pal=crowd.lanes[lane].palAttr;
 assert.equal(unpackGarment(pal.getY(slot)).pattern,look.topPattern);
 assert.equal(unpackGarment(pal.getZ(slot)).pattern,look.bottomPattern);
});

test('the HQ crowd and the near characters draw patterns with the same GLSL function',()=>{
 const crowd=createHQCrowd(manifest,bin,{capacity:8,lod:'L2'});
 const hq=compiled(crowd.lanes[0].material);
 const near=compiled(nearMaterial({topPattern:PATTERN.check}).materials[0]);
 assert.ok(GARMENT_PATTERN_GLSL.endsWith('\n'),'an injected snippet must end in a newline (§16a)');
 assert.ok(hq.fragmentShader.includes(GARMENT_PATTERN_GLSL),'HQ crowd does not embed the shared pattern function');
 assert.ok(near.fragmentShader.includes(GARMENT_PATTERN_GLSL),'near material does not embed the shared pattern function');
 assert.ok(hq.vertexShader.includes('vGarm=position'),'HQ patterns must use the bind-pose position');
 assert.ok(near.vertexShader.includes('vGarm=position'),'near patterns must use the bind-pose position');
 for(const src of [hq.vertexShader,hq.fragmentShader,near.vertexShader,near.fragmentShader])
  for(const line of src.split('\n'))
   if(line.includes('#'))assert.match(line.trimStart(),/^(#|\/\/)/,`a preprocessor directive does not start its line: ${line}`);
});

test('the crowd body still uses at most the 16 vertex attributes WebGL guarantees',()=>{
 const crowd=createHQCrowd(manifest,bin,{capacity:8,lod:'L2'});
 const mesh=crowd.lanes[0].mesh,g=mesh.geometry;
 // instanceMatrix is a mat4: four attribute slots.
 const slots=Object.keys(g.attributes).length+4+(mesh.instanceColor?1:0);
 assert.ok(slots<=16,`${slots} vertex attribute slots`);
 assert.deepEqual(Object.keys(g.attributes).sort(),
  ['aAnim','aBlend','aClip','aPal','aPrev','aShoe','color','normal','position','skinIndex','skinWeight'],
  'Step A must not add a crowd attribute');
});

test('the near slot is recoloured with its pattern, and the player stays a plain red top',()=>{
 assert.equal(WARDROBE.topPattern,0);assert.equal(WARDROBE.bottomPattern,0);
 const id=[...Array(400).keys()].find(i=>appearanceOf(i).topPattern===PATTERN.print);
 const worn=nearMaterial({});
 const shader=compiled(worn.materials[0]);
 assert.deepEqual([shader.uniforms.uPattern.value.x,shader.uniforms.uPattern.value.y],[0,0]);
 worn.recolour(paletteOf(appearanceOf(id)));
 assert.equal(shader.uniforms.uPattern.value.x,PATTERN.print);
});

test('deduplicate may move a colour, never a pattern',()=>{
 const looks=[...Array(60).keys()].map(i=>appearanceOf(i));
 const out=deduplicate(looks);
 for(const look of looks){
  const d=out.get(look.id);
  assert.equal(d.topPattern,look.topPattern);assert.equal(d.bottomPattern,look.bottomPattern);
 }
});

test('a near slot recoloured before its first compile is drawn in the new colours',()=>{
 // Found on the device check: the pool recolours a slot before its material has compiled,
 // and the compile read the construction palette, so those people wore the default red top.
 const id=[...Array(400).keys()].find(i=>appearanceOf(i).topPattern===PATTERN.border);
 const look=appearanceOf(id);
 const worn=nearMaterial({});
 worn.recolour(paletteOf(look));
 const shader=compiled(worn.materials[0]);
 assert.equal(shader.uniforms.uTop.value.getHex(),look.top,'the top is still the construction colour');
 assert.equal(shader.uniforms.uPattern.value.x,look.topPattern);
});
