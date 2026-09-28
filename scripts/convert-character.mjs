// Convert the verified upstream humanoid into the single file Shibuya actually loads.
//
// The upstream packs are 20 MiB of general-purpose content: 43 animation clips, four UV
// channels, two constant vertex-colour channels, and 12 MiB of 4K superhero textures. A city
// that guards its startup time cannot ship any of that. This script keeps the clips the game
// has states for, drops every attribute nothing reads, dresses the body without a texture,
// and writes one GLB.
//
// It is also the seam the CharacterAsset abstraction sits on. The output is plain glTF with
// logical clip names ('Walk', 'Punch', 'Enter'), so replacing Quaternius with a more
// photorealistic body later means producing the same clip names on the same skeleton, not
// touching the game.
//
// Run: npm run convert:character   (after npm run fetch:character)
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// The exporter reaches for FileReader to turn its Blob into bytes, and three's FileLoader
// reports progress the same way for a data: URI as for a URL. Nothing else about either needs
// a browser, so two shims are cheaper than writing a glTF serialiser.
globalThis.FileReader??=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const UP='assets/character/upstream';
const OUT='public/data/character';
const TARGET_HEIGHT=1.76;        // FIGURE.height; the pack is authored around 1.82 m

// Logical name -> upstream clip. Everything the player state machine can ask for, and nothing
// else. 'Fall' and 'Death' are two views of one clip: the game scrubs Fall by hand while the
// body is still in the air and lets Death play out on the ground.
const CLIPS={
 Idle:'Idle_Loop', Walk:'Walk_Loop', Run:'Jog_Fwd_Loop', Sprint:'Sprint_Loop',
 Punch:'Punch_Jab', PunchCross:'Punch_Cross', Hit:'Hit_Chest', Startle:'Hit_Head',
 Guard:'Crouch_Idle_Loop', Enter:'Sitting_Enter', Exit:'Sitting_Exit', Drive:'Driving_Loop',
 Interact:'Interact', Fall:'Death01', Death:'Death01',
 // PLAN-WEAPONS W1: the weapon clips, on the same skeleton. The three aim clips are single
 // poses (0.17 s) blended by pitch; the pistol clips are two-handed, the sword clips one-handed.
 PistolIdle:'Pistol_Idle_Loop', PistolAimUp:'Pistol_Aim_Up', PistolAimNeutral:'Pistol_Aim_Neutral',
 PistolAimDown:'Pistol_Aim_Down', PistolShoot:'Pistol_Shoot', PistolReload:'Pistol_Reload',
 SwordIdle:'Sword_Idle', SwordAttack:'Sword_Attack', Roll:'Roll', CrouchWalk:'Crouch_Fwd_Loop',
 // Roadmap stage 2: a person on the ground dragging themselves along. The pack has no crawl; its
 // forward swim is the body prone, head first, the arms reaching and pulling in turn, which laid
 // on the pavement reads as a crawl (figure.mjs sets it down at the ground).
 Crawl:'Swim_Fwd_Loop'
};

// Attributes nothing samples. Quaternius ships four UV sets for engine-side material layering
// we do not do, and two vertex-colour channels that are constant across the whole mesh --
// which is what frees COLOR_0 to carry the garment mask instead.
const DROP=['uv1','uv2','uv3','color','color_1','tangent'];

// Forty of the sixty-five bones are finger joints. Keyframing them costs two thirds of every
// clip and buys nothing at the distance a third-person camera holds. The bones stay, because
// the skin is weighted to them; they just hold one pose instead of carrying tracks.
const FINGER=/(^|\.)(index|middle|pinky|ring|thumb)_/;

// Which garment covers which bone.
//
// The body arrives naked: everything that made it a superhero was in a twelve-megabyte texture
// set, and a city of citizens cannot pay that. Rather than paint clothes into a texture, each
// bone is labelled with what covers it and every vertex inherits the labels of the bones it is
// skinned to, weighted exactly as the skin is. Joints therefore blend on their own, with no
// hem to author and no UV work; SHARPNESS then pulls that blend in to something like a seam,
// because skin weights spread a shirt hem over a third of the torso if you let them.
const SKIN=0,TOP=1,BOTTOM=2,HAIRMASK=3,SHOE=4;
const REGION=[
 [/^Head$|^neck_/,SKIN],[/^lowerarm_|^hand_|^(index|middle|pinky|ring|thumb)_/,SKIN],
 [/^spine_|^clavicle_|^upperarm_/,TOP],
 [/^pelvis$|^thigh_|^calf_/,BOTTOM],
 [/^foot_|^ball_/,SHOE]
];
const SHARPNESS=6;
const regionOf=name=>{for(const [pattern,id] of REGION)if(pattern.test(name))return id;return TOP;};

// Colours the two accessory meshes lose with their constant vertex-colour channel.
const FLAT={Eyebrows:0x0a0503,Eyes:0xf2efe8};

const sha=b=>createHash('sha256').update(b).digest('hex');
const loadGLB=file=>{const b=readFileSync(file);return new Promise((res,rej)=>
 new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej));};

/** Load a .gltf + .bin pair without touching its images: inline the buffer, cut the textures. */
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

/**
 * Measure how fast each locomotion clip is authored to travel.
 *
 * The clips we ship have root motion disabled, which is what a simulation-driven character
 * wants -- the controller and the crowd own position, not the animation. But that also means a
 * clip carries no record of the speed its stride was drawn for, and playing a 5.4 m/s jog at
 * 3 m/s is what foot sliding actually is. The root-motion variant of the same library does
 * carry it, so the distance is read out of that file and shipped alongside the clips.
 */
async function measureGait(file){
 const g=await loadGLB(file),gait={};
 for(const [name,source] of Object.entries(CLIPS)){
  const clip=g.animations.find(c=>c.name===source);if(!clip)continue;
  const track=clip.tracks.find(t=>t.name==='root.position');if(!track)continue;
  const v=track.values,n=v.length/3;
  const distance=Math.hypot(v[(n-1)*3]-v[0],v[(n-1)*3+2]-v[2]);
  if(distance>.05)gait[name]=Number((distance/clip.duration).toFixed(4));
 }
 return gait;
}

/** Four skin weights as bytes, renormalised so a vertex still sums to one after rounding. */
function quantiseWeights(geometry){
 const weight=geometry.attributes.skinWeight;
 if(!weight||!(weight.array instanceof Float32Array))return;
 const bytes=new Uint8Array(weight.count*4);
 for(let i=0;i<weight.count;i++){
  const w=[0,1,2,3].map(k=>Math.round(weight.array[i*4+k]*255));
  const sum=w.reduce((a,b)=>a+b,0);
  if(sum!==255&&sum>0){let biggest=0;for(let k=1;k<4;k++)if(w[k]>w[biggest])biggest=k;w[biggest]+=255-sum;}
  for(let k=0;k<4;k++)bytes[i*4+k]=Math.max(0,Math.min(255,w[k]));
 }
 geometry.setAttribute('skinWeight',new T.BufferAttribute(bytes,4,true));
}

/**
 * Garment weights per vertex, in COLOR_0.
 *
 * Four channels for five garments: the weights sum to one, so the shoes are whatever the other
 * four leave over. `fixed` forces every vertex to one garment, which is how the hair mesh joins
 * the body mesh without needing bones of its own to say what it is.
 */
function garmentMask(geometry,bones,fixed=null){
 const index=geometry.attributes.skinIndex,weight=geometry.attributes.skinWeight;
 const mask=new Uint8Array(index.count*4);
 for(let i=0;i<index.count;i++){
  const part=[0,0,0,0,0];
  if(fixed!==null)part[fixed]=1;
  else for(let k=0;k<4;k++){
   const bone=bones[index.getComponent(i,k)];if(!bone)continue;
   part[regionOf(bone.name)]+=weight.getComponent(i,k);
  }
  // Pull the blend in. A raw skin-weight mix spreads a hem over a third of the torso; raising
  // each weight to a power and renormalising keeps the boundary where it was and narrows it,
  // without ever producing the hard staircase a nearest-bone assignment would.
  let sum=0;for(let k=0;k<5;k++){part[k]=part[k]**SHARPNESS;sum+=part[k];}
  for(let k=0;k<4;k++)mask[i*4+k]=sum>0?Math.max(0,Math.min(255,Math.round(part[k]/sum*255))):0;
 }
 geometry.setAttribute('color',new T.BufferAttribute(mask,4,true));
}

// --- RUN 6.8: several appearance archetypes, one clip set ------------------------------
//
// RUN 6 gave the nearest citizens the player's body and they all looked like the same person
// recoloured. The fix is silhouette, not palette, and the upstream pack already has the parts:
// two base bodies and three hairstyles, all CC0, all on the same sixty-five bone naming.
//
// THE TWO BODIES DO NOT SHARE A REST POSE. Bone *names* match, which is what the old
// single-hairstyle merge checked, but the female rig is proportioned differently -- 64 of 65
// bones move, the upperarms by 7.1 cm and the clavicles by 4.6 cm. Binding her mesh to his
// skeleton would flatten her shoulders by that much. So each body keeps its own armature, and
// what is shared is the thing that actually costs: ONE set of AnimationClips. Clip tracks
// address bones by name, so the same clip array drives either rig, and a mixer binds it to
// whichever root its instance has. Four archetypes therefore cost four bodies' worth of
// geometry and ONE library of animation, not four.
//
// Hair is a separate mesh here rather than merged into the body as it was when there was only
// one hairstyle. Merging would duplicate a whole body per hairstyle; separate meshes let the
// exporter store each body once and each hairstyle once, and cost one draw call per citizen.
// qa/gta-upgrade/bindcheck.mjs is where the rest-pose numbers above come from.
const RIGS=[
 {id:'m',file:'Superhero_Male_FullBody',  body:'SuperHero_Male'},
 {id:'f',file:'Superhero_Female_FullBody',body:'Superhero_Female'}
];
const HAIRS=['Hair_Buzzed','Hair_SimpleParted','Hair_Long'];

const animations=await loadGLB(`${UP}/ual1/UAL1_Standard.glb`);
const gait=await measureGait(`${UP}/ual1/UAL1_Standard_RM.glb`);

// Hair geometry is prepared once and shared by both rigs. A BufferGeometry can back two
// SkinnedMeshes with different skeletons: the skin indices are bone *positions*, and the bone
// order is identical even where the rest pose is not. Hair is weighted to the head and neck,
// which is where the two rigs agree.
const hairGeometry=new Map();
for(const name of HAIRS){
 const g=await loadPair(`${UP}/ubc/Hairstyles/${name}`);
 const found=[];g.scene.traverse(o=>{if(o.isSkinnedMesh)found.push(o);});
 if(found.length!==1)throw new Error(`hairstyle ${name}: expected one mesh, found ${found.length}`);
 const geometry=found[0].geometry;
 for(const attribute of DROP)if(geometry.attributes[attribute])geometry.deleteAttribute(attribute);
 quantiseWeights(geometry);
 garmentMask(geometry,found[0].skeleton.bones,HAIRMASK);
 hairGeometry.set(name,geometry);
}

const root=new T.Group();root.name='citizen';
const rigs=[];                       // {id, group, skeleton, height, meshes, fingers}
let vertices=0,triangles=0,dropped=0,masked=0,hairVertices=0;

for(const rig of RIGS){
 const source=await loadPair(`${UP}/ubc/BaseCharacters/${rig.file}`);
 const meshes=[];
 source.scene.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
 if(!meshes.length)throw new Error(`${rig.file} has no skinned mesh`);
 const skeleton=meshes[0].skeleton;

 // Every rig must carry the same bone names, or one clip set cannot drive both.
 const names=skeleton.bones.map(b=>b.name).join(',');
 if(rigs.length&&names!==rigs[0].names)
  throw new Error(`${rig.file} does not share the bone naming of ${RIGS[0].file}`);

 const group=new T.Group();group.name=`rig_${rig.id}`;
 // glTF rewrites node names -- it strips punctuation and suffixes duplicates, so the second
 // rig's meshes come back as `hairHair_Long_1`. userData survives as `extras` untouched, so
 // that is what the runtime matches on.
 group.userData.rig=rig.id;
 let top=skeleton.bones[0];while(top.parent&&top.parent!==source.scene)top=top.parent;
 group.add(top);

 for(const mesh of meshes){
  for(const attribute of DROP)if(mesh.geometry.attributes[attribute]){
   mesh.geometry.deleteAttribute(attribute);dropped++;}
  quantiseWeights(mesh.geometry);
  const isBody=mesh.name===rig.body;
  if(isBody){
   garmentMask(mesh.geometry,skeleton.bones);
   masked+=mesh.geometry.attributes.position.count;
   mesh.name='body';
  }
  mesh.material=new T.MeshStandardMaterial({
   name:isBody?'citizen':mesh.material.name,
   color:FLAT[mesh.name]??0xffffff,roughness:.78,metalness:0,vertexColors:isBody
  });
  mesh.frustumCulled=false;group.add(mesh);
  vertices+=mesh.geometry.attributes.position.count;
  triangles+=(mesh.geometry.index?mesh.geometry.index.count:mesh.geometry.attributes.position.count)/3;
 }

 // Each hairstyle, bound to this rig. The instance keeps one and drops the rest, so a citizen
 // still draws a body, two flat accessory meshes and exactly one head of hair.
 for(const name of HAIRS){
  const geometry=hairGeometry.get(name);
  const piece=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial({
   name:'citizen',color:0xffffff,roughness:.78,metalness:0,vertexColors:true}));
  piece.name=`hair_${name}`;
  piece.userData.hair=name;
  piece.frustumCulled=false;
  group.add(piece);
  piece.bind(skeleton,new T.Matrix4());
  if(rig===RIGS[0])hairVertices+=geometry.attributes.position.count;
 }

 root.add(group);
 group.updateMatrixWorld(true);
 const box=new T.Box3();
 // Measure the body only: Hair_Long reaches below the chin and the accessory meshes sit
 // inside the head, so the silhouette that defines "how tall is this person" is the body.
 box.setFromObject(group.getObjectByName('body'));
 rigs.push({...rig,names,group,skeleton,height:box.max.y-box.min.y,meshes});
}

// The clips are authored against the first rig, and its skeleton is the one the finger-relax
// pass and the gait measurement below refer to.
const skeleton=rigs[0].skeleton;
const height=rigs[0].height;
const meshes=rigs[0].meshes;

root.updateMatrixWorld(true);

// Left at the bind pose the hands are flat, splayed and obviously a T-pose. Idle's first frame
// is a relaxed hand, so bake that into the rest transform and let every clip inherit it.
// Every rig needs it, not just the first: they are separate armatures.
const idle=animations.animations.find(c=>c.name===CLIPS.Idle);
const fingers=new Map();
for(const entry of rigs){
 const bones=new Map();
 for(const bone of entry.skeleton.bones)if(FINGER.test('.'+bone.name))bones.set(bone.name,bone);
 for(const track of idle?.tracks??[]){
  const cut=track.name.lastIndexOf('.');
  const bone=bones.get(track.name.slice(0,cut));if(!bone)continue;
  if(track.name.slice(cut+1)==='quaternion')bone.quaternion.fromArray(track.values,0);
  else if(track.name.slice(cut+1)==='position')bone.position.fromArray(track.values,0);
 }
 entry.skeleton.bones[0].updateMatrixWorld(true);
 if(entry===rigs[0])for(const [name,bone] of bones)fingers.set(name,bone);
}

const clips=[];
let tracksKept=0,tracksCut=0;
for(const [name,source] of Object.entries(CLIPS)){
 const found=animations.animations.find(c=>c.name===source);
 if(!found){console.warn(`missing upstream clip ${source} for ${name}`);continue;}
 const clip=found.clone();clip.name=name;
 const before=clip.tracks.length;
 // Scale is a constant one throughout this library and is a third of the track count.
 clip.tracks=clip.tracks.filter(t=>!t.name.endsWith('.scale')&&!FINGER.test(t.name));
 tracksCut+=before-clip.tracks.length;tracksKept+=clip.tracks.length;
 clip.optimize();
 clips.push(clip);
}
// ---- PHASE A -- the hybrid Run -------------------------------------------------------
//
// If the derived hybrid clip is present, it replaces the Quaternius Run. It is a normal
// AnimationClip by the time it reaches this point and by the time it reaches the game: the
// composition of CMU legs with a Quaternius upper body happened offline, in
// scripts/cmu/hybrid.mjs, and nothing at runtime samples two sources or knows there were ever
// two. See assets/character/hybrid-run.json for the provenance of each half.
//
// Absent, the build falls back to the upstream Run without comment, so a checkout that does
// not carry the derived clip still produces a working character.
let hybridRun=null;
try{
 hybridRun=JSON.parse(readFileSync('assets/character/hybrid-run.json','utf8'));
}catch{}
if(hybridRun){
 const index=clips.findIndex(c=>c.name==='Run');
 if(index<0)console.warn('no Run clip to replace');
 else{
  const tracks=[];
  for(const [bone,values] of Object.entries(hybridRun.tracks))
   tracks.push(new T.QuaternionKeyframeTrack(`${bone}.quaternion`,hybridRun.times,values));
  tracks.push(new T.VectorKeyframeTrack('pelvis.position',hybridRun.times,hybridRun.rootPos));
  const replacement=new T.AnimationClip('Run',hybridRun.gait.duration,tracks);
  replacement.optimize();
  clips[index]=replacement;
  // The stride the blend drives its period from has to be the one this clip actually has,
  // not the upstream Jog's. Getting this wrong is the difference between matched feet and
  // the foot sliding RUN 4 existed to remove.
  gait.Run=hybridRun.gait.speed;
  hybridRun.applied={tracks:replacement.tracks.length,duration:replacement.duration};
  console.log(`Run replaced by the hybrid: ${replacement.duration.toFixed(3)} s, `+
   `${replacement.tracks.length} tracks, native ${gait.Run} m/s`);
 }
}

// ---- The two-handed weapons (GTA-FIDELITY-STATUS §9af-§9ah) ---------------------------------
//
// CMU captures, retargeted and put on the weapon offline by scripts/cmu/weapon-clip.mjs, in
// assets/character/cmu-weapons/. Like the hybrid Run they are ordinary clips by the time they
// get here. The katana's two replace the one-handed Quaternius pair under the SAME names, so the
// game's katana (the hit test, the hold on a wall, the stance) plays them without a rename:
//   SwordAttack <- katana-cut (02_07's overhead cut, both hands on the handle)
//   SwordIdle   <- katana-guard (02_07's two-handed guard)
// and the submachine gun's are new:
//   SmgLow <- the first key of rifle-raise (the low ready: butt in the shoulder, muzzle down)
//   SmgAim <- rifle-shouldered (the shouldered aim, looped)
// Each is only used if its file is present; absent, the Quaternius clip stays.
const CMU_WEAPONS=[
 {name:'SwordAttack',file:'katana-cut'},{name:'SwordIdle',file:'katana-guard'},
 {name:'SmgLow',file:'rifle-raise',firstKey:true},{name:'SmgAim',file:'rifle-shouldered'}
];
const cmuWeapons=[];
for(const {name,file,firstKey} of CMU_WEAPONS){
 let data=null;try{data=JSON.parse(readFileSync(`assets/character/cmu-weapons/${file}.json`,'utf8'));}catch{}
 if(!data){console.warn(`no ${file}.json: ${name} stays as it was`);continue;}
 // A held pose is two identical keys a frame apart, which a looping action holds still.
 const times=firstKey?[0,1/30]:data.times;
 const pick=(values,width)=>firstKey?[...values.slice(0,width),...values.slice(0,width)]:values;
 const tracks=[];
 for(const [bone,values] of Object.entries(data.tracks))
  tracks.push(new T.QuaternionKeyframeTrack(`${bone}.quaternion`,times,pick(values,4)));
 tracks.push(new T.VectorKeyframeTrack('pelvis.position',times,pick(data.rootPos,3)));
 const clip=new T.AnimationClip(name,firstKey?1/30:data.duration,tracks);clip.optimize();
 const index=clips.findIndex(c=>c.name===name);
 if(index>=0)clips[index]=clip;else clips.push(clip);
 // The upstream clip's measured travel belongs to the upstream clip; these are played in place.
 delete gait[name];
 cmuWeapons.push({name,file,trial:data.source.trial,from:data.source.from,to:data.source.to,
  amcSha256:data.source.amcSha256,seconds:+clip.duration.toFixed(3),tracks:clip.tracks.length});
}
if(cmuWeapons.length)console.log(`CMU weapon clips: ${cmuWeapons.map(c=>`${c.name} (${c.trial})`).join(', ')}`);

root.animations=clips;

const report={
 generated:new Date().toISOString().slice(0,10),
 source:'Quaternius Universal Base Characters [Standard] + Universal Animation Library [Standard], CC0-1.0',
 body:{meshes:meshes.length,vertices,triangles,attributesDropped:dropped,
  // Counted by walking the scene, which is how anything reading the file sees it. Hair
  // geometry is shared between the rigs -- stored once, drawn by two meshes -- so counting
  // geometries instead would under-report what a traversal finds.
  garmentMaskVertices:(()=>{let n=0;root.traverse(o=>{
   if(o.isMesh&&o.geometry.attributes.color)n+=o.geometry.attributes.color.count;});return n;})(),
  hairVertices,hairstyle:HAIRS[1],
  bones:skeleton.bones.length,animatedBones:skeleton.bones.length-fingers.size,
  height:Number(height.toFixed(4)),scaleToGame:Number((TARGET_HEIGHT/height).toFixed(5))},
 // RUN 6.8. Every rig is scaled to the same game height from its OWN measured height, so a
 // body that is naturally shorter does not arrive short -- the proportion difference is in
 // the bones, which is where it belongs, not in the overall size.
 rigs:rigs.map(r=>({id:r.id,source:r.file,body:r.body,
  height:Number(r.height.toFixed(4)),
  scaleToGame:Number((TARGET_HEIGHT/r.height).toFixed(5)),
  bones:r.skeleton.bones.length})),
 hairstyles:HAIRS.map(name=>({name,
  vertices:hairGeometry.get(name).attributes.position.count,
  triangles:(hairGeometry.get(name).index?.count
   ??hairGeometry.get(name).attributes.position.count)/3})),
 clips:clips.map(c=>({name:c.name,
  upstream:c.name==='Run'&&hybridRun?.applied?'hybrid (CMU 16_45 legs + Quaternius upper)'
   :cmuWeapons.find(w=>w.name===c.name)?`CMU ${cmuWeapons.find(w=>w.name===c.name).trial} (scripts/cmu/weapon-clip.mjs)`:CLIPS[c.name],
  seconds:Number(c.duration.toFixed(3)),tracks:c.tracks.length})),
 gait,
 ...(hybridRun?.applied?{hybridRun:{
  stride:hybridRun.gait.stride,speed:hybridRun.gait.speed,
  lowerBody:hybridRun.provenance.lowerBody.source,
  upperBody:hybridRun.provenance.upperBody.source,
  boundary:hybridRun.provenance.boundary.bone}}:{}),
 // The acknowledgment CMU asks for, carried with the clips that use its data.
 ...(cmuWeapons.length?{cmuWeapons:{clips:cmuWeapons,acknowledgment:'The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.'}}:{})
};

mkdirSync(OUT,{recursive:true});
const glb=await new Promise((res,rej)=>new GLTFExporter().parse(root,res,rej,
 {binary:true,animations:clips,includeCustomExtensions:false}));
const bytes=Buffer.from(glb);
writeFileSync(`${OUT}/citizen.glb`,bytes);
report.output={file:'public/data/character/citizen.glb',bytes:bytes.length,sha256:sha(bytes)};
writeFileSync(`${OUT}/citizen.json`,JSON.stringify(report,null,1)+'\n');

console.log(`citizen.glb  ${(bytes.length/1024).toFixed(1)} KiB`);
console.log(`  ${rigs.length} rigs x ${HAIRS.length} hairstyles, ${vertices} vertices, ${triangles} triangles, ${report.body.bones} bones each`);
for(const r of report.rigs)console.log(`    rig ${r.id}: ${r.source} ${r.height.toFixed(3)} m -> scale ${r.scaleToGame}`);
console.log(`  ${clips.length} clips: ${clips.map(c=>c.name).join(' ')}`);
console.log(`  height ${height.toFixed(3)} m -> scale ${report.body.scaleToGame}`);
console.log(`  gait ${JSON.stringify(gait)}`);
console.log(`  garment mask on ${masked+hairVertices} vertices (hair kept separate: ${hairVertices} across ${HAIRS.length} styles)`);
console.log(`  tracks ${tracksKept} kept, ${tracksCut} cut (${fingers.size} finger bones held at a relaxed pose)`);
