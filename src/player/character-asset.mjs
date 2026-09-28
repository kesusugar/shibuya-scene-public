// What a character is, so that what a character looks like can change without the game
// noticing.
//
// Two things currently claim to be a playable human: the figure baked offline by
// scripts/bake-character.mjs, which is capsules on eleven bones, and the humanoid converted
// by scripts/convert-character.mjs, which is a real skinned body on sixty-five. They disagree
// about almost everything -- vertex count, bone names, how tall they are, how fast their walk
// cycle was drawn -- so the rest of the game is not told which one it has. It is handed a
// CharacterAsset:
//
//   {id, height, scale, gait, bones, instance(), dispose()}
//
// `instance()` returns {root, clips} ready to hand to an AnimationMixer, sharing geometry and
// skeleton bind data with every other instance from the same asset. `gait` maps a clip name
// to the ground speed it was authored at, which is the number a locomotion controller needs
// and the one a clip cannot state about itself.
//
// Replacing the body later means producing this shape. It does not mean editing the player
// controller, the camera, combat, or the crowd.
import {Color,MeshStandardMaterial,ObjectLoader,Vector2} from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {GARMENT_PATTERN_GLSL} from '../life/garment-pattern.mjs';

/**
 * A citizen's five surfaces. Everything on the humanoid body is a mix of these. The patterns
 * (PLAN-LOOKS-AND-FLEET Step A) default to solid, and the player keeps that default: their red
 * top stays one findable colour in a crowd that now wears stripes.
 */
export const WARDROBE=Object.freeze({skin:0xdfb994,top:0xc94d38,bottom:0x263443,hair:0x241d19,shoe:0x191a1f,
 topPattern:0,bottomPattern:0});

const ROUGHNESS=Object.freeze({skin:.62,top:.86,bottom:.8,hair:.52,shoe:.44});

const UNIFORMS=`uniform vec3 uSkin;uniform vec3 uTop;uniform vec3 uBottom;uniform vec3 uHair;
uniform vec3 uShoe;uniform float uRough[5];uniform vec2 uPattern;
varying vec3 vGarm;
${GARMENT_PATTERN_GLSL}`;
// The bind-pose position, before skinning: a stripe is painted on the cloth, not the screen.
const GARMENT_VERTEX=`varying vec3 vGarm;
`;
// The converter writes a garment weight per vertex: red is skin, green the top, blue the
// trousers, alpha the hair, and whatever the four leave over is the shoe. The weights come
// from the skin weights themselves, so the mix is already soft wherever the skinning is.
const GARMENT=`
 float wShoe=max(0.,1.-vColor.r-vColor.g-vColor.b-vColor.a);
 diffuseColor.rgb=vColor.r*uSkin+vColor.g*garmentPattern(uTop,uPattern.x,vGarm)
  +vColor.b*garmentPattern(uBottom,uPattern.y,vGarm)+vColor.a*uHair+wShoe*uShoe;
`;
// Skin, cotton, denim, hair and a shoe do not scatter light alike, and one roughness makes all
// five look like the same plastic. The mix that picks the colour picks the roughness too.
const GARMENT_ROUGHNESS=`
 roughnessFactor=vColor.r*uRough[0]+vColor.g*uRough[1]+vColor.b*uRough[2]+vColor.a*uRough[3]
  +max(0.,1.-vColor.r-vColor.g-vColor.b-vColor.a)*uRough[4];
`;

/**
 * Dress one body.
 *
 * The colours are uniforms rather than baked vertex data so that one converted mesh can be
 * a whole street: a near-NPC pool hands each of its slots a different palette and pays for
 * one material each, not one mesh each.
 */
export function dressCitizen(root,palette={}){
 const colours={...WARDROBE,...palette};
 const materials=[];
 root.traverse(object=>{
  if(!object.isMesh)return;
  object.frustumCulled=false;
  if(!object.geometry.attributes.color)return;   // eyes and eyebrows stay flat
  const source=object.material;
  const material=new MeshStandardMaterial({name:source.name,color:0xffffff,metalness:0,
   roughness:ROUGHNESS.top,vertexColors:true});
  material.userData.palette={...colours};
  material.onBeforeCompile=shader=>{
   // The palette as it is NOW, not as it was at construction: the near pool recolours a slot
   // as soon as it is handed out, often before its first frame compiles this material, and
   // reading the construction palette here gave every such person the default red top.
   const worn=material.userData.palette;
   shader.uniforms.uSkin={value:new Color(worn.skin)};
   shader.uniforms.uTop={value:new Color(worn.top)};
   shader.uniforms.uBottom={value:new Color(worn.bottom)};
   shader.uniforms.uHair={value:new Color(worn.hair)};
   shader.uniforms.uShoe={value:new Color(worn.shoe)};
   shader.uniforms.uRough={value:[ROUGHNESS.skin,ROUGHNESS.top,ROUGHNESS.bottom,ROUGHNESS.hair,ROUGHNESS.shoe]};
   shader.uniforms.uPattern={value:new Vector2(worn.topPattern??0,worn.bottomPattern??0)};
   shader.vertexShader=GARMENT_VERTEX+shader.vertexShader
    .replace('#include <begin_vertex>','#include <begin_vertex>\n vGarm=position;');
   shader.fragmentShader=UNIFORMS+shader.fragmentShader
    // color_fragment has just multiplied the mask into diffuseColor; replace it outright.
    .replace('#include <color_fragment>','#include <color_fragment>'+GARMENT)
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>'+GARMENT_ROUGHNESS);
   material.userData.shader=shader;
  };
  // Every citizen compiles the same program; only the uniforms differ.
  material.customProgramCacheKey=()=>'citizen-garment';
  object.material=material;materials.push(material);
 });
 return {
  materials,
  /** Recolour in place, without recompiling: a pooled slot changes who it is between uses. */
  recolour(next){
   const merged={...colours,...next};
   for(const material of materials){
    material.userData.palette=merged;
    const shader=material.userData.shader;if(!shader)continue;
    shader.uniforms.uSkin.value.set(merged.skin);shader.uniforms.uTop.value.set(merged.top);
    shader.uniforms.uBottom.value.set(merged.bottom);shader.uniforms.uHair.value.set(merged.hair);
    shader.uniforms.uShoe.value.set(merged.shoe);
    shader.uniforms.uPattern.value.set(merged.topPattern??0,merged.bottomPattern??0);
   }
  }
 };
}

/** Shared plumbing: the providers differ only in where their scene, clips and clothes come from. */
function asset({id,template,clips,gait,gaitDetail,height,scale,dress,bones,legBones=null,
                variants=null,pick=null}){
 let disposed=false;
 return {
  id,height,scale,gait:Object.freeze({...gait}),gaitDetail:gaitDetail??null,bones,legBones,
  /**
   * The appearance archetypes this asset can wear, or null if it has exactly one look.
   *
   * RUN 6.8. An asset may carry several bodies on several armatures; `instance` is told which
   * one to build, and everything downstream -- mixer, clips, foot IK, the pool -- is unchanged,
   * because every archetype has the same bone names and shares the same clip objects.
   */
  variants:variants?Object.freeze(variants.map(v=>Object.freeze({...v}))):null,
  get template(){return template;},
  instance(palette,variant){
   if(disposed)throw new Error(`character asset ${id} is disposed`);
   // `pick` returns the subtree for this archetype and the scale that subtree needs. Cloning
   // the subtree rather than the whole template is what keeps an instance at one body and one
   // skeleton however many archetypes the asset holds.
   const chosen=pick?pick(template,variant):null;
   const root=clone(chosen?.node??template);
   chosen?.prepare?.(root);
   // Locals, not the asset's own scale and height: an archetype's rig has its own natural
   // height, and writing that back onto the asset would make the next instance inherit it.
   const unit=chosen?.scale??scale,natural=chosen?.height??height;
   // A horizontal factor, applied to the two world axes the body is broad across. Bones are
   // untouched, so skinning, the foot IK joint chain and every clip are unaffected; the
   // person is simply wider or narrower. Kept small on purpose -- see APPEARANCE.width.
   let broad=Number.isFinite(variant?.width)?variant.width:1,worn=unit;
   const wear=k=>{worn=k;root.scale.set(k*broad,k,k*broad);};
   wear(unit);
   const clothes=dress(root,palette);
   // SkeletonUtils.clone rebinds onto a fresh Skeleton, and a Skeleton owns a data texture of
   // bone matrices. Geometry and the template's own skeleton belong to the asset and outlive
   // this instance; the clone's skeleton does not, and releasing a pooled citizen without
   // releasing it leaks one texture per body per swap.
   //
   // SkeletonUtils.clone gives every SkinnedMesh its own Skeleton, even though they were all
   // bound to one in the template and the clone shares a single set of Bone objects between
   // them. Each of those Skeletons allocates a bone matrix texture, so a citizen was paying
   // for three of them and, once RUN 6.8 split the hair into its own mesh, would have paid for
   // four. They are collapsed back onto one: the bones are the same objects and the bone
   // inverses came from the same source, so the extra Skeletons are duplicates of each other
   // in everything but identity. Each mesh keeps its own bind matrix.
   const meshes=[];
   root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});
   const skeletons=new Set();
   if(meshes.length){
    const shared=meshes[0].skeleton;
    for(const mesh of meshes.slice(1)){
     const spare=mesh.skeleton;
     mesh.bind(shared,mesh.bindMatrix);
     if(spare!==shared)spare.dispose();
    }
    skeletons.add(shared);
   }
   return {root,clips,
    recolour:clothes.recolour,
    /**
     * How broad this body is, as a factor on the two horizontal axes.
     *
     * Settable rather than fixed at construction so one pooled slot can be a narrow person and
     * later a broad one without rebuilding a skeleton and a mixer. Bones are never touched, so
     * skinning, the foot IK chain and every clip are indifferent to it.
     */
    setBuild(width){if(Number.isFinite(width)&&width>0){broad=width;wear(worn);}},
    /** Wear a different height without losing this archetype's own units-to-metres factor. */
    setHeight(metres){wear(unit*metres/natural);},
    dispose(){clothes.dispose();skeletons.forEach(s=>s.dispose());root.removeFromParent();root.clear();}};
  },
  dispose(){
   if(disposed)return;disposed=true;
   const geometries=new Set(),materials=new Set(),skeletons=new Set();
   template.traverse(o=>{
    if(o.isMesh){geometries.add(o.geometry);for(const m of [].concat(o.material))materials.add(m);}
    if(o.isSkinnedMesh)skeletons.add(o.skeleton);});
   geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());
  }
 };
}

/**
 * The offline-baked original: eleven bones, twelve clips, no network, no waiting.
 *
 * This is what the first frame gets, every time. It costs nothing to construct because its
 * buffers were authored at build time, and it is the fallback if the humanoid never arrives.
 */
export function bakedCitizen(pack){
 const template=new ObjectLoader().parse(pack.scene);
 // One material per colour in the baked figure, and only the shirt varies. Cloning it per
 // instance is what the near-NPC pool has always done to tell one pedestrian from another.
 const dress=(root,palette)=>{
  const shirt=root.getObjectByName('HeroMaterial0');
  if(!shirt)return {recolour(){},dispose(){}};
  const material=shirt.material.clone();shirt.material=material;
  const apply=next=>{if(next?.top!==undefined)material.color.setHex(next.top);};
  apply(palette);
  return {recolour:apply,dispose(){material.dispose();}};
 };
 return asset({id:'baked',template,clips:template.animations,gait:pack.gait,
  height:1.76,scale:1,dress,bones:{head:'Head'}});
}

/**
 * The converted humanoid. `report` is public/data/character/citizen.json, written by the
 * converter, which is where the measured gait and the height-to-scale factor live -- neither
 * is recoverable from the GLB itself.
 */
export function humanoidCitizen(gltf,report,base=WARDROBE){
 const template=gltf.scene;
 const dress=(root,palette)=>{
  const worn=dressCitizen(root,{...base,...palette});
  return {recolour:worn.recolour,dispose(){worn.materials.forEach(m=>m.dispose());}};
 };

 // RUN 6.8. A converted file may carry several rigs, each with every hairstyle attached. An
 // archetype names one rig and one hairstyle; building it means cloning that rig's subtree and
 // dropping the hair it is not wearing, which leaves a body, two flat accessory meshes and one
 // head of hair. A file from before RUN 6.8 has no `rigs` and no `rig:` groups, so `variants`
 // is null and `pick` returns nothing -- the whole template is cloned exactly as it was.
 const rigs=report.rigs??null;
 const hairstyles=(report.hairstyles??[]).map(h=>h.name);

 // glTF requires unique node names within a file, so exporting two armatures that use the
 // same sixty-five bone names gives the second one `pelvis_1`, `root_1`, `thigh_l_1` and so
 // on. An AnimationMixer resolves a track like `pelvis.quaternion` by NAME, and foot IK looks
 // its joint chain up by name too, so the second rig would silently animate nothing.
 //
 // The names are put back. It is safe because a name only has to be unique within the tree it
 // is resolved against, and an instance clones exactly one rig: two bodies with a bone called
 // `pelvis` never share a tree. Skinning is unaffected either way -- a Skeleton binds by index.
 // Renaming by index rather than by stripping a suffix is deliberate: `spine_01` and
 // `index_01_l` already end in digits and underscores, so a pattern would be guesswork,
 // whereas the bone ORDER is identical across rigs and that is checked when the file is built.
 if(rigs&&rigs.length>1){
  const armature=id=>{let found=null;
   template.traverse(o=>{if(!found&&o.userData?.rig===id)found=o;});return found;};
  const bonesOf=node=>{const out=[];node?.traverse(o=>{if(o.isBone)out.push(o);});return out;};
  const reference=bonesOf(armature(rigs[0].id)).map(b=>b.name);
  for(const rig of rigs.slice(1)){
   const bones=bonesOf(armature(rig.id));
   if(bones.length!==reference.length){
    console.warn(`[character] rig ${rig.id} has ${bones.length} bones against `+
     `${reference.length}; leaving its names alone`);
    continue;
   }
   for(let i=0;i<bones.length;i++)bones[i].name=reference[i];
  }
 }
 const variants=rigs&&hairstyles.length
  ?rigs.flatMap(rig=>hairstyles.map(hair=>({rig:rig.id,hair,
    id:`${rig.id}:${hair}`,body:rig.body,
    height:rig.height,scale:rig.scaleToGame})))
  :null;
 // What an instance gets when nobody names an archetype -- the player, and anything written
 // before RUN 6.8. It is the body and hairstyle the single-look file used to ship, so the
 // player's appearance is unchanged by this run rather than quietly reassigned to whichever
 // variant happened to be enumerated first.
 const fallback=variants?(variants.find(v=>v.rig===rigs[0].id&&v.hair===report.body?.hairstyle)
  ??variants[0]):null;
 const pick=variants?(root,variant)=>{
  const wanted=variant&&variants.find(v=>v.id===variant.id||v.id===variant);
  const chosen=wanted??fallback;
  // Matched on userData, not on name: glTF strips punctuation from node names and suffixes
  // duplicates, so the second rig's hair arrives as `hairHair_Long_1`. `extras` survives.
  let node=null;
  root.traverse(o=>{if(!node&&o.userData?.rig===chosen.rig)node=o;});
  if(!node)throw new Error(`character asset has no rig ${chosen.rig}`);
  // The template keeps every hairstyle for the next instance, so the unwanted ones are
  // removed from the CLONE. `prepare` runs after the caller clones, which is why this returns
  // the template subtree rather than a copy of it -- cloning here and again there would build
  // every body twice.
  return {node,scale:chosen.scale,height:chosen.height,
   prepare(copy){
    const shed=[];
    copy.traverse(o=>{const hair=o.userData?.hair;if(hair&&hair!==chosen.hair)shed.push(o);});
    for(const o of shed)o.removeFromParent();
   }};
 }:null;

 return asset({id:'humanoid',template,clips:gltf.animations,gait:report.gait,variants,pick,
  // Measured stride and foot-contact timing, from scripts/analyse-gait.mjs. The blend needs
  // both: stride sets how long a cycle takes, contact keeps two clips from disagreeing about
  // which foot is down.
  gaitDetail:report.gaitDetail??null,
  height:report.body.height*report.body.scaleToGame,scale:report.body.scaleToGame,
  dress,bones:{head:'Head'},
  // The joints foot IK needs. Named here rather than guessed, so an asset that does not have
  // them simply goes without rather than half-solving something.
  legBones:{pelvis:'pelvis',left:['thigh_l','calf_l','foot_l'],right:['thigh_r','calf_r','foot_r']}});
}
