import {createNearCharacters} from './near-characters.mjs';
import {playerThreat,wantedFor} from './hq-awareness.mjs';
import {createHQLayer} from './hq-layer.mjs';
import {createContactShadows} from './shadows.mjs';
import {tagLimb,addGait,installGait} from './gait.mjs';
import {Group,BoxGeometry,CapsuleGeometry,SphereGeometry,ConeGeometry,CylinderGeometry,TorusGeometry,InstancedMesh,MeshStandardMaterial,Object3D,Color,DynamicDrawUsage,BufferGeometry,Float32BufferAttribute,LineSegments,LineBasicMaterial} from 'three';
import {triangleCount,merge} from '../geo/geometry.mjs';
import {buildGroundModel} from '../ground/model.mjs';
import {buildBuildingModel} from '../buildings/model.mjs';
import {buildStationModel} from '../station/model.mjs';
import {buildDetailModel} from '../station-detail/model.mjs';
import {buildStreetscapeModel} from '../streetscape/model.mjs';
import {buildPedestrianNetwork} from './network.mjs';
import {CrowdSimulation,FALL_TILT} from './simulation.mjs';
import {ARCHETYPES,POOL_SIZE,BODY_VARIANTS,HAIR_VARIANTS,ACCESSORY_TARGETS} from './config.mjs';

const BODY_COLORS=[0x343f51,0x556173,0x29374b,0xc38966,0x738d88,0xb7b9c4,0xb98193,0xa2b29b,0xdac5a5,0xd8adbf,0xc2b9dd,0xb1d7ce];
const SKIN_COLORS=[0xdfb994,0xba8868,0xeac6a7,0xc99c7e];
const HAIR_COLORS=[0x25282a,0x4e3a30,0x706051,0xaeb0ac];
// The played agent occupies slot 0, which by id would draw BODY_COLORS[0] -- the palette's
// darkest navy, and so the one outfit that disappears into a night crowd. None of the twelve
// crowd colours is saturated, so a saturated one reads instantly without looking painted on.
// This is the only thing the player changes here: the overhead marker is a player affordance
// rather than a pedestrian body part, so it lives with the player and leaves the crowd's
// thirteen geometry pools and three materials as they were.
// The played agent keeps its pool slot, because that slot is what the pedestrians' own
// neighbour avoidance sees and it is why they part around the player. It is simply not drawn
// here: arms and legs are merged into one body geometry -- what makes two thousand
// pedestrians affordable. Tagged vertices still swing in the shared crowd shader, while the
// player is drawn by src/player/figure.mjs so nearby knees, elbows and interactions can bend.
const rank=(id,salt=0)=>(id*37+salt)%POOL_SIZE;
function pickVariant(id,profiles,salt=0){let r=rank(id,salt);for(const profile of profiles){if(r<profile.count)return profile.key;r-=profile.count;}return profiles.at(-1).key;}
function transformed(g,scale,position){g.scale(...scale);g.translate(...position);return g;}
function bodyGeometry(index){
 const widths=[.88,1,.78,.94],shoulders=[.92,1.08,.82,1.02],parts=[];
 parts.push(transformed(new CapsuleGeometry(.5,.44,2,7),[widths[index],.54,.58],[0,.58,0]));
 for(const side of [-1,1]){
  parts.push(transformed(new CapsuleGeometry(.5,.55,1,5),[.19,.38,.18],[side*.2,.19,0]));
  parts.push(transformed(new CapsuleGeometry(.5,.58,1,5),[.16,.35,.16],[side*.31*shoulders[index],.55,0]));
 }
 // A neck, merged into the body rather than added as a fourteenth geometry. Without it a
 // properly sized head floats ten centimetres clear of the shoulders; the old head was big
 // enough to bury its own chin in the chest, which is what made every figure a mushroom.
 parts.push(transformed(new CylinderGeometry(1,1,1,7),[.129,.1,.222],[0,.97,0]));
 for(let i=0;i<parts.length;i++)tagLimb(parts[i],i===1||i===3?.40:i===2||i===4?.78:0,i===1?-1:i===3?1:i===2?.65:i===4?-.65:0);
 const result=merge(parts);parts.forEach(g=>g.dispose());result.computeVertexNormals();return result;
}
// Hair is a shell around the skull with the face left open, not a cap balanced on the crown.
// The old shapes covered the top quarter and left the rest bare skin, which from behind --
// which is most of the time, in a crowd walking away from you -- read as a bald dome.
//
// Sphere phi is measured from -X and runs towards +Z, so the opening is centred on phi=PI/2
// to land on the face; the figures walk towards +z in their own frame.
const FACE_GAP=1.05;                                   // radians of skull left uncovered
function hairShell(segments,thetaLength,scale,offset){
 const g=new SphereGeometry(1,segments,6,Math.PI/2+FACE_GAP/2,Math.PI*2-FACE_GAP,0,thetaLength);
 g.scale(scale[0],scale[1],scale[2]);g.translate(offset[0],offset[1],offset[2]);
 g.computeVertexNormals();return g;
}
function hairGeometry(index){
 // Long: down past the jaw at the back and sides.
 if(index===0)return hairShell(10,Math.PI*.78,[1.04,1.03,1.06],[0,.02,-.02]);
 // Short: stops around the ears.
 if(index===1)return hairShell(9,Math.PI*.58,[1.03,1.02,1.05],[0,.03,-.02]);
 // A cap, which covers the whole skull and adds a brim over the face.
 const cap=transformed(new SphereGeometry(1,9,5,0,Math.PI*2,0,Math.PI*.55),[1.05,1.04,1.06],[0,.02,0]),
  brim=transformed(new CylinderGeometry(1,1,.1,9),[.92,1,.92],[0,.42,.5]),
  result=merge([cap,brim]);cap.dispose();brim.dispose();result.computeVertexNormals();return result;
}
function suitcaseGeometry(){const box=transformed(new BoxGeometry(1,1,1),[.7,.9,.32],[0,.43,0]),handle=transformed(new TorusGeometry(.24,.055,4,8,Math.PI),[1,1,1],[0,.98,0]),result=merge([box,handle]);box.dispose();handle.dispose();return result;}

export function buildCrowd(data,options={}){
 const ground=options.ground??buildGroundModel(data),generic=options.generic??buildBuildingModel(data),core=options.core??buildStationModel(data,{ground,generic});
 const street=options.street?.tier==='high'?options.street:buildStreetscapeModel(data,{tier:'high',ground,generic,core});
 const detail=options.detail?.tier==='high'?options.detail:buildDetailModel(data,{tier:'high',ground,generic,core});
 const network=options.network??buildPedestrianNetwork(data,{ground,generic,core,street,detail}),sim=options.sim??new CrowdSimulation(network,options),root=new Group();root.name='r1-crowd';
 const material=new MeshStandardMaterial({color:0xffffff,roughness:.9}),headMaterial=new MeshStandardMaterial({color:0xffffff,roughness:.7}),hairMaterial=new MeshStandardMaterial({color:0xffffff,roughness:.8});
 installGait(material);
 let playerFocus=null,nearPaused=false;const nearCharacters=options.nearRigs===false?null:createNearCharacters(options.tier??'high',{ctx:network.ctx});if(nearCharacters)root.add(nearCharacters.root);
 // RUN 10: awareness is no longer a module of its own here. The one authority is the mass
 // layer's typed-array pass (src/life/hq-awareness.mjs), which is bounded by the crowd grid.
 // What used to sit on this line was the RUN 7 WIP, walking all ~1,978 pedestrians EVERY
 // FRAME to decide who had noticed the player -- the exact scan the mass architecture was
 // built to avoid, running in production the whole time.
 const perceive=options.awareness!==false;
 // RUN 7B. The high-fidelity crowd is a RENDERER, switchable, with the legacy instanced
 // bodies kept as the fallback. Nothing about the simulation changes when it is on: the HQ
 // layer reads sim.pool and returns the ids it drew, and those ids are masked out of the
 // legacy meshes below so nobody is drawn twice.
 let hq=null,hqCamera=null;
 const hqStats={enabled:false,hq:0,budget:0};
 const geometry={};for(let i=0;i<BODY_VARIANTS.length;i++)geometry[BODY_VARIANTS[i].key]=bodyGeometry(i);geometry.head=new SphereGeometry(1,10,7);for(let i=0;i<HAIR_VARIANTS.length;i++)geometry[HAIR_VARIANTS[i].key]=hairGeometry(i);
 Object.assign(geometry,{phone:new BoxGeometry(1,1,1),bag:new BoxGeometry(1,1,1),cane:new CylinderGeometry(1,1,1,6),suitcase:suitcaseGeometry(),umbrella:new ConeGeometry(1,.35,8)});
 const capacities={...Object.fromEntries(BODY_VARIANTS.map(v=>[v.key,v.count])),head:POOL_SIZE,...Object.fromEntries(HAIR_VARIANTS.map(v=>[v.key,v.count])),...ACCESSORY_TARGETS};
 const meshes={};for(const [key,g] of Object.entries(geometry)){addGait(g,capacities[key]);const m=new InstancedMesh(g,key==='head'?headMaterial:key.startsWith('hair')?hairMaterial:material,capacities[key]);m.instanceMatrix.setUsage(DynamicDrawUsage);m.frustumCulled=false;m.name='crowd-'+key;root.add(m);meshes[key]=m;}
 const obj=new Object3D(),color=new Color(),counts={},stats={geometries:Object.keys(geometry).length,materials:3,textures:0,batches:0,triangles:0,debugBatches:0,bodyCounts:{},hairCounts:{},accessories:{}};let disposed=false,reportClock=0;
 // Outside the thirteen geometries and three materials the crowd is measured by: a contact
 // shadow is not a character part, and `stats.geometries` counts the character geometry map,
 // which this deliberately stays out of.
 const shadows=createContactShadows(POOL_SIZE);root.add(shadows.mesh);
 let debug=null;if(options.debug){const lines=[];for(const e of network.edges){if(e.id%2&&!e.crossingId)continue;const a=network.nodes[e.from],b=network.nodes[e.to];if(e.points){for(let i=1;i<e.points.length;i++)lines.push(e.points[i-1][0],.2,e.points[i-1][1],e.points[i][0],.2,e.points[i][1]);}else lines.push(a.x,.2,a.z,b.x,.2,b.z);}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(lines,3));debug=new LineSegments(g,new LineBasicMaterial({color:0xf8b5d1,depthTest:false}));debug.name='r1-walkable-path-grid';root.add(debug);stats.debugBatches=1;
 }
 // A knocked-down pedestrian is thrown rather than folded. The limbs are merged into the
 // body, so there is nothing to articulate; what carries the hit is the whole figure going
 // over and tumbling. Every part swings on the arc its own height describes -- the higher a
 // part sits, the further it travels -- which reads as the body pitching forward, and past
 // the first quarter turn the tumble keeps going rather than stopping flat on the ground.
 function part(key,p,lx,y,lz,w,h,d,hex,tilt=0){
  if(p.struck!==undefined){const a=Math.min(1,p.struck/FALL_TILT)*Math.PI/2+(p.spin??0);
   lz+=y*Math.sin(a);y*=Math.cos(a);tilt+=a;}
  const heading=p.heading+(playerFocus&&p.speed<.05&&p.struck===undefined?Math.sin(p.id*2.39+sim.time*.22)*.15:0);const c=Math.cos(heading),s=Math.sin(heading);obj.position.set(p.renderX+c*lx+s*lz,p.height+y,p.renderZ-s*lx+c*lz);obj.rotation.set(tilt,heading,0);obj.scale.set(w,h,d);obj.updateMatrix();const i=counts[key]++,near=playerFocus&&p.struck===undefined&&Math.hypot(p.x-playerFocus.x,p.z-playerFocus.z)<24;geometry[key].attributes.gait.setX(i,near?Math.sin(p.travelled*4.1+p.phase)*Math.min(.6,p.speed*.3)+(p.speed<.05?Math.sin(sim.time*1.4+p.phase)*.025:0):0);geometry[key].attributes.action.setX(i,near?Math.max(p.combatAction??0,p.reactionUntil>sim.time&&['guard','startle'].includes(p.trafficReaction)?.5:0):0);meshes[key].setMatrixAt(i,obj.matrix);color.setHex(hex);meshes[key].setColorAt(i,color);}
 function hasAccessory(p,key){return rank(p.id,{phone:211,bag:433,cane:677,suitcase:929,umbrella:1217}[key])<ACCESSORY_TARGETS[key];}
 // The last frame's ownership split, kept by reference only (no copy, no allocation) so QA
 // can ask which renderer drew a given pedestrian. See `ownership()` below.
 let lastNear=null,lastDrawn=null;
 function sync(dt=0){
  // Perception first: the figures below render whatever state it leaves behind.
  if(perceive&&playerFocus)hq?.awareness(playerFocus,dt);
  // PLAN-PERFORMANCE P0: the sweep can pause the near characters to measure what they cost.
  const near=nearPaused?new Set():nearCharacters?.update(sim.pool,playerFocus,dt,sim.time)??new Set();
  // The near pool is drawn with real skeletons and is therefore EXCLUDED from the mass crowd,
  // so it has no typed-array state to read. It gets the same rule applied directly, over at
  // most eight people -- one implementation of what counts as threatening, two storages. The
  // thing RUN 10 exists to prevent is two RULES, not two places to put a number.
  if(perceive&&playerFocus)for(const id of near){
   const p=sim.pool[id]??null;
   if(!p?.active)continue;
   // No clocks here: the near pool is at most eight bodies a couple of metres from the
   // camera, and a reaction delay on them is invisible next to the cost of getting it wrong
   // when they swap in and out of the pool every second or so.
   p.awareState=wantedFor(playerThreat(playerFocus,p.x,p.z,p.heading,p.id));
  }
  // The HQ layer draws whoever it can afford, EXCLUDING anyone the near pool already has --
  // a citizen drawn twice is the failure this mask exists to prevent.
  const drawn=hq?hq.sync(sim.pool,hqCamera??playerFocus,dt,{time:sim.time,exclude:near}):null;
  const detailed=drawn?new Set([...near,...drawn]):near;lastNear=near;lastDrawn=drawn;for(const k of Object.keys(meshes))counts[k]=0;shadows.begin();for(const p of sim.pool){if(!p.active||p.controlled)continue;const def=ARCHETYPES[p.archetype],h=def.height*(.96+(p.id%5)*.02),w=def.width*(1.06+(p.id%7)*.015),walk=p.speed>.05,phase=p.animationTime*(walk?7:1)+p.phase,fidelity=p.lod==='near'?1:p.lod==='mid'?.65:.15,sway=walk?Math.sin(phase)*.035*fidelity:Math.sin(phase)*.012,bob=walk?Math.abs(Math.cos(phase))*.024*fidelity:Math.sin(phase)*.008;
   const blend=dt?Math.min(1,dt*(p.lod==='far'?10:25)):1;p.renderX+=(p.x-p.renderX)*blend;p.renderZ+=(p.z-p.renderZ)*blend;
   // A thrown body's shadow belongs to the road it is over, not to the body: `p.height`
   // follows the arc, so using it would send the shadow into the air with the person.
   const struck=p.struck!==undefined;
   shadows.add(p.renderX,struck?p.flyGround:p.height,p.renderZ,def.width,struck?p.flyHeight:0);
   const body=pickVariant(p.id,BODY_VARIANTS),hair=pickVariant(p.id,HAIR_VARIANTS,307),shirt=BODY_COLORS[p.id%BODY_COLORS.length],skin=SKIN_COLORS[p.id%SKIN_COLORS.length],hairColor=def.gray?HAIR_COLORS[3]:HAIR_COLORS[p.id%3];
   // RUN 11.0. The props below were NOT masked with the body, so every HQ or near citizen
   // carrying one still wore the legacy renderer's box phone, bag, suitcase, cane or cone
   // umbrella, sized for a capsule and tumbling on the legacy arc after a hit. Live at HIGH
   // with the HQ crowd up: 971 of them, which is what read as old blocky bodies in the crowd.
   const legacyBody=!detailed.has(p.id);
   if(legacyBody)part(body,p,0,h*.02+bob,0,w,h*.78,w*.58,shirt,sway);
   // About 26 cm across on a 1.7 m figure: roughly half the old 51 cm, and a little over
   // life-size rather than at it. Life-size was tried and is wrong here -- these bodies are
   // featureless capsules, so a correctly scaled head turns them into bowling pins. The crown
   // sits at 97% of the height with the chin just clear of the shoulders.
   if(legacyBody)part('head',p,0,h*.882+bob,0,h*.076,h*.088,h*.079,skin,sway*.5);
   if(legacyBody)part(hair,p,0,h*.882+bob,0,h*.076,h*.088,h*.079,def.hood?shirt:hairColor,sway*.5);
   if(legacyBody&&hasAccessory(p,'phone'))part('phone',p,w*.43,h*.59+bob,-w*.28,w*.15,h*.16,w*.05,0x303843);
   if(legacyBody&&hasAccessory(p,'bag'))part('bag',p,w*.55,h*.37+bob,.02,w*.36,h*.2,w*.4,p.id%2?0x9a7960:0x4e5557);
   if(legacyBody&&hasAccessory(p,'cane'))part('cane',p,w*.48,h*.19,0,w*.055,h*.38,w*.055,0x8c7354,-.16);
   if(legacyBody&&hasAccessory(p,'suitcase'))part('suitcase',p,-w*.64,h*.02,.08,w*.5,h*.38,w*.52,p.id%2?0x596579:0x6e4d45);
   if(legacyBody&&hasAccessory(p,'umbrella'))part('umbrella',p,.08,h*.99,0,.38,.62,.38,shirt);
  }
  shadows.end();
  stats.triangles=0;stats.batches=0;for(const [k,m] of Object.entries(meshes)){m.count=counts[k];if(m.count)stats.batches++;stats.triangles+=m.count*triangleCount(geometry[k]);geometry[k].attributes.gait.needsUpdate=true;geometry[k].attributes.action.needsUpdate=true;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;}
  // Reported apart from `batches` and `materials` on purpose. Those two numbers are the
  // character instancing contract that r1-crowd-density asserts; folding a decoration into
  // them would make the contract mean something else.
  stats.contactShadows={drawn:shadows.drawn,batches:shadows.drawn?1:0,geometries:1,materials:1};
  stats.nearCharacters=nearCharacters?.inspect()??null;
  stats.bodyCounts=Object.fromEntries(BODY_VARIANTS.map(v=>[v.key,counts[v.key]]));stats.hairCounts=Object.fromEntries(HAIR_VARIANTS.map(v=>[v.key,counts[v.key]]));stats.accessories=Object.fromEntries(Object.keys(ACCESSORY_TARGETS).map(k=>[k,counts[k]]));stats.instanceCounts={...counts};
  reportClock+=dt;if(reportClock>=1||!dt){reportClock=0;Object.assign(stats,network.stats,sim.snapshot(options.debug));stats.awareness=hq?.perception??null;stats.hqCrowd=hq?hq.inspect():null;}
 }
 sync();return {root,network,sim,stats,meshes,setPlayerFocus(p){playerFocus=p;},
  /**
   * Which renderer drew each active pedestrian on the last frame: 'hq', 'near' or 'legacy'.
   * QA only -- it walks the pool, so nothing calls it per frame. It exists because "that one
   * looks like an old model" is a claim about ownership, and ownership can be measured.
   */
  ownership(){const out=[];for(const p of sim.pool){if(!p.active||p.controlled)continue;
   const near=!!lastNear?.has(p.id),hqd=!!lastDrawn?.has(p.id);
   out.push({id:p.id,x:p.x,z:p.z,owner:near&&hqd?'both':near?'near':hqd?'hq':'legacy',
    heldByHQ:hq?hq.crowd.indexOf(p.id)>=0:false,
    struck:p.struck!==undefined,choreo:!!p.choreographed,driver:p.cameFromVehicle!=null});}
   return out;},
  /**
   * Turn the RUN 7B high-fidelity crowd on, with its prebuilt pack. Off by default and
   * removable at any time, so legacy remains a one-call rollback for the whole run.
   */
  enableHQCrowd(manifest,bin,options={}){
   if(hq)return hq;
   hq=createHQLayer(manifest,bin,options);
   root.add(hq.root);
   hqStats.enabled=true;hqStats.budget=options.budget??0;
   // The HQ crowd draws the nearest `budget` people the near pool does not take, so once it
   // has any budget the near pool's baked tier is only ever a worse body in the same place.
   nearCharacters?.setHQCovered(hqStats.budget>0);
   return hq;
  },
  disableHQCrowd(){if(!hq)return;hq.dispose();hq=null;hqStats.enabled=false;hqStats.hq=0;nearCharacters?.setHQCovered(false);},
  /**
   * Report a violent event to the crowd. Returns how many people reacted.
   *
   * RUN 8. Safe to call when the HQ crowd is off: the legacy renderer has no mass state to
   * change, so it reports nobody rather than throwing.
   */
  witness(event){return hq?hq.witness(event):0;},
  /** RUN 11.2: one blow on one citizen, for the HQ body's flinch and follow-up. */
  blow(event){return hq?hq.blow(event):false;},
  /** Where the HQ budget should be spent, when it is not the player. */
  setHQCamera(p){hqCamera=p;},
  setHQBudget(n){hq?.setBudget(n);hqStats.budget=n;nearCharacters?.setHQCovered(!!hq&&n>0);},
  get hqCrowd(){return hq;},
  muzzleOf(id,point,direction){return nearCharacters?.muzzleOf(id,point,direction)??false;},
  setNearPaused(v){nearPaused=!!v;if(nearCharacters)nearCharacters.root.visible=!v;},
  /** The near pool, for QA: which body and which reaction a held citizen shows. */
  get nearCharacters(){return nearCharacters;},
  // The humanoid arrives late, exactly as it does for the player. Until it does the near
  // pool runs on baked figures, so nothing waits on it.
  setNearCharacterAsset(a){nearCharacters?.setHumanAsset(a);},update(dt,camera){if(disposed)return;if(camera)sim.setCamera(camera.x,camera.z);sim.update(dt);sync(dt);},setTier(t){sim.setTier(t);nearCharacters?.setTier(t);sync();},dispose(){if(disposed)return;disposed=true;hq?.dispose();hq=null;nearCharacters?.dispose();shadows.dispose();sim.dispose();for(const m of Object.values(meshes))m.dispose();for(const g of Object.values(geometry))g.dispose();material.dispose();headMaterial.dispose();hairMaterial.dispose();debug?.geometry.dispose();debug?.material.dispose();root.removeFromParent();root.clear();}};
}
