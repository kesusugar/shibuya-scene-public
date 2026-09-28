// RUN 6.8 prerequisite: what variation does the CURRENT citizen asset actually contain?
// Read-only. No implementation.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};
const b=readFileSync('public/data/character/citizen.glb');
const g=await new Promise((r,j)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));
const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
console.log('glb bytes          :',b.length);
console.log('clips              :',g.animations.map(a=>a.name).join(', '));
const meshes=[],bones=new Set(),mats=new Set();
g.scene.traverse(o=>{
 if(o.isSkinnedMesh||o.isMesh){
  const tris=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  meshes.push({name:o.name,skinned:!!o.isSkinnedMesh,tris,
   verts:o.geometry.attributes.position.count,
   attrs:Object.keys(o.geometry.attributes).join('+'),
   morphs:o.morphTargetDictionary?Object.keys(o.morphTargetDictionary):[],
   visible:o.visible,material:o.material?.name||o.material?.type});
  if(o.material)mats.add(o.material.name||o.material.type);
 }
 if(o.isBone)bones.add(o.name);
});
console.log('bones              :',bones.size);
console.log('materials          :',[...mats].join(', '));
console.log('meshes             :',meshes.length);
for(const m of meshes)console.log('   ',JSON.stringify(m));
const morphs=meshes.filter(m=>m.morphs.length);
console.log('morph targets      :',morphs.length?JSON.stringify(morphs.map(m=>[m.name,m.morphs])):'NONE');
console.log('hidden/optional    :',meshes.filter(m=>!m.visible).map(m=>m.name).join(', ')||'NONE');
const hairish=meshes.filter(m=>/hair|head|hat|cap|acc|bag|glass/i.test(m.name));
console.log('hair/head/acc parts:',hairish.length?hairish.map(m=>m.name).join(', '):'NONE');
console.log('report keys        :',Object.keys(report).join(', '));
console.log('report.body        :',JSON.stringify(report.body).slice(0,400));

// --- RUN 6.8 feasibility: do the other CC0 bodies/hairstyles share the 65-bone skeleton? ---
// Textures are stripped exactly as scripts/convert-character.mjs does; node cannot resolve
// the external images and the pipeline does not ship them anyway.
const UP='assets/character/upstream';
function loadPair(base){
 const json=JSON.parse(readFileSync(base+'.gltf','utf8'));
 const bin=readFileSync(base+'.bin');
 json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
 delete json.images;delete json.textures;delete json.samplers;
 for(const m of json.materials??[]){
  delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;
  const p=m.pbrMetallicRoughness;if(p){delete p.baseColorTexture;delete p.metallicRoughnessTexture;}
 }
 return new Promise((res,rej)=>new GLTFLoader().parse(JSON.stringify(json),'',res,rej));
}
const boneNames=scene=>{let out=null;scene.traverse(o=>{if(o.isSkinnedMesh&&!out)
 out=o.skeleton.bones.map(b=>b.name);});return out??[];};
const baseline=boneNames((await loadPair(`${UP}/ubc/BaseCharacters/Superhero_Male_FullBody`)).scene);
console.log('\n--- RUN 6.8 feasibility ---');
console.log('reference skeleton :',baseline.length,'bones (Superhero_Male_FullBody)');
for(const rel of ['ubc/BaseCharacters/Superhero_Female_FullBody',
                  'ubc/Hairstyles/Hair_Buzzed','ubc/Hairstyles/Hair_Long',
                  'ubc/Hairstyles/Hair_SimpleParted']){
 try{
  const g=await loadPair(`${UP}/${rel}`);
  const names=boneNames(g.scene);
  let tris=0,count=0,height=0;
  g.scene.traverse(o=>{if(o.isSkinnedMesh){count++;
   tris+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
   o.geometry.computeBoundingBox();height=Math.max(height,o.geometry.boundingBox.max.z);}});
  const same=names.join(',')===baseline.join(',');
  console.log(`${rel.split('/').pop().padEnd(30)} bones=${String(names.length).padStart(3)} `
   +`meshes=${count} tris=${String(Math.round(tris)).padStart(6)} sameSkeleton=${same?'YES':'NO '}`
   +` bboxZ=${height.toFixed(3)}`);
 }catch(e){console.log(`${rel.split('/').pop().padEnd(30)} UNREADABLE: ${String(e).slice(0,70)}`);}
}
