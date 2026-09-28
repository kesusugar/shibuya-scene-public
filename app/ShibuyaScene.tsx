"use client";
import { useEffect, useRef, useState } from 'react';
import {RenderFidelity} from '../src/fidelity/look.mjs';
import {watchShaderErrors} from '../src/fidelity/shader-errors.mjs';
import {createShaderWarmup} from '../src/quality/warmup.mjs';
import {buildConstruction} from '../src/construction/render.mjs';
import {FrameGate,renderRatio,createBuildQueue,deferredLatest} from '../src/quality/runtime.mjs';
import {loadWetScene} from '../src/nightglow/load.mjs';
import {buildNightglow} from '../src/nightglow/render.mjs';
import {SolarCycle} from '../src/environment/solar.mjs';
import {DayNightSystem} from '../src/environment/day-night.mjs';
import {buildTrains} from '../src/trains/render.mjs';
import {buildCrowd} from '../src/life/render.mjs';
import {createHQRequester} from '../src/app/hq-request.mjs';
import {buildPedestrianNetworkAsync} from '../src/life/network.mjs';
import {buildTraffic} from '../src/traffic/render.mjs';
import {createSeatedDrivers} from '../src/traffic/drivers.mjs';
import {isOccupied,canCarjack,alertDriver,beginExtraction,throwDriverOut,abortCarjack} from '../src/player/carjack.mjs';
import {buildStreetscapeAsync as buildStreetscape} from '../src/streetscape/render.mjs';
import {buildSignageAsync as buildSignage} from '../src/signs/render.mjs';
import S1Data from './S1Data';
import GyroSettings from './GyroSettings';
import {buildStationDetailsAsync as buildStationDetails} from '../src/station-detail/render.mjs';
import {buildStationAsync as buildStation} from '../src/station/render.mjs';
import {buildHeroScene} from '../src/heroes/render.mjs';
import {buildingLifecycle as baseBuildingLifecycle} from '../src/buildings/lifecycle.mjs';
import {buildBuildingsAsync} from '../src/buildings/render.mjs';
import {buildGround} from '../src/ground/render.mjs';
import {loadStaticModels} from '../src/quality/static-models.mjs';
import {loadSceneData,summarize} from '../src/data/normalize.mjs';
import {buildDataDebug} from '../src/data/debug.mjs';
import { Switch } from '@/components/ui/switch';
import { CAMERAS, MODULES, PROFILES, TimeState, ModuleSystem } from '../src/app/foundation.mjs';
import {parseLaunchConfig} from '../src/app/launch-config.mjs';
import {QA_CAPTURES,publicCameraName,canvasToPng,createQAPack,downloadBlob} from '../src/qa/capture.mjs';
import {createStartupTiming,formatStartupDuration} from '../src/quality/startup-timing.mjs';
import {createFollowCamera} from '../src/player/camera.mjs';
import {createFrameSamples,waitForRenderedFrames} from '../src/qa/frame-samples.mjs';
import {createDeferredVehicleVisual as createVehicleVisual} from '../src/player/deferred-vehicle-visual.mjs';
import {createVehicleEffects} from '../src/player/effects.mjs';
import {createPlayUI} from '../src/player/play-ui.mjs';
import {yieldToPlayer,settleNearbyWaiters} from '../src/player/crowd-interaction.mjs';
import {PLAYER,createPlayer,playerCamera} from '../src/player/controller.mjs';
import {createPlayerMarker,MARKER} from '../src/player/marker.mjs';
import {createPlayerFigure} from '../src/player/figure.mjs';
import {createDeferredCharacter} from '../src/player/deferred-character.mjs';
import {createContactShadows} from '../src/life/shadows.mjs';
import {CAR,createPlayerVehicle,vehicleCamera} from '../src/player/vehicle.mjs';
import {createPlayerAudio} from '../src/player/audio.mjs';
import {createSoundBank} from '../src/audio/bank.mjs';
import {createSoundscape} from '../src/audio/soundscape.mjs';
import {createPoliceDirector} from '../src/police/director.mjs';
import {upgradeGroundTextures} from '../src/ground/pbr.mjs';
import {advanceWind} from '../src/streetscape/wind.mjs';
import {createRoadReflection,ROAD_REFLECTION,ROAD_REFLECTION_UNIFORMS} from '../src/nightglow/road-reflection.mjs';
import {createDiagnostics} from '../src/player/diagnostics.mjs';
import {createTouchControls,wantsTouch} from '../src/player/touch-controls.mjs';
import {createBloodMarks} from '../src/life/blood.mjs';
import {createCrowdVoices,prioritise} from '../src/player/voices.mjs';
import {createMeleeCombat} from '../src/player/combat.mjs';
import {createArsenal} from '../src/player/arsenal.mjs';
import {createWeaponWheel,WHEEL} from '../src/player/weapon-wheel.mjs';
import {createStreetReactions} from '../src/life/street-reactions.mjs';
import {createOnlookers} from '../src/life/onlookers.mjs';
import {createAftermath} from '../src/life/aftermath.mjs';
import {populationFor} from '../src/life/population.mjs';
import {createMissionBoard} from '../src/game/missions.mjs';
import {createWallet} from '../src/game/economy.mjs';
import {createSave} from '../src/game/save.mjs';
import {SHOP,buy as shopBuy,shopDoor} from '../src/game/shop.mjs';
import {setRagdollWorld} from '../src/player/ragdoll.mjs';
import {createHelicopterMesh} from '../src/police/helicopter.mjs';
import {createHitStop} from '../src/player/hit-stop.mjs';
import {createDynamicResolution} from '../src/quality/dynamic-resolution.mjs';
import {createGunfire} from '../src/audio/gunfire.mjs';
import {controlHints} from '../src/player/input-map.mjs';
import {lineOfSight,peopleAlong,castShot} from '../src/player/ballistics.mjs';
import {WEAPONS} from '../src/player/weapons.mjs';
import {BLOOM_KICK,PIPELINE_OFF} from '../src/fidelity/pipeline.mjs';
import {createPerfProbe} from '../src/quality/perf-probe.mjs';
import {createPerfSweep,sweepSteps} from '../src/quality/perf-sweep.mjs';
import {createPerfOverlay} from '../src/quality/perf-overlay.mjs';
import {ARCHETYPES as CROWD_ARCHETYPES} from '../src/life/config.mjs';
import {createFeedbackBus} from '../src/app/feedback-bus.mjs';
import {createVehicleTransition} from '../src/player/vehicle-transition.mjs';
import {boxOverlap} from '../src/traffic/path.mjs';
import {VEHICLES} from '../src/traffic/config.mjs';
import {bikeLean} from '../src/traffic/motorbike-shape.mjs';
import {createRadio,stationFor} from '../src/audio/radio.mjs';
// Stage 6: where the motorbikes are parked, from where the player first appears (m).
const BIKE_SPOTS=[[-8,6],[60,-45],[-70,-30]];
import {BODY} from '../src/player/body-states.mjs';
import {shot as carShot,wearOf} from '../src/player/car-damage.mjs';
export default function Home(){
 const [presentation,setPresentation]=useState(true);
 const reactRenderCount=useRef(0);reactRenderCount.current++;
 const mount=useRef<HTMLDivElement>(null);const engine=useRef<any>(null);
 const [s5TimingVisible,setS5TimingVisible]=useState(false),[s5TimingResult,setS5TimingResult]=useState<any>(null),[s5TimingCopied,setS5TimingCopied]=useState(false);
 const [dataReport,setDataReport]=useState<any>(null);const [groundReport,setGroundReport]=useState<any>(null);const [buildingsReport,setBuildingsReport]=useState<any>(null);const [heroReport,setHeroReport]=useState<any>(null);const [stationReport,setStationReport]=useState<any>(null);const [detailReport,setDetailReport]=useState<any>(null);
 const [constructionReport,setConstructionReport]=useState<any>(null);
 const [nightglowReport,setNightglowReport]=useState<any>(null);
 const [environmentReport,setEnvironmentReport]=useState<any>(null);
 const [trainReport,setTrainReport]=useState<any>(null);
 const [lifeReport,setLifeReport]=useState<any>(null);
 const [trafficReport,setTrafficReport]=useState<any>(null);
 const [streetReport,setStreetReport]=useState<any>(null);
 const [signReport,setSignReport]=useState<any>(null);
 const [mode,setMode]=useState<'observe'|'player'>('observe'),[isDriving,setDriving]=useState(false),[struckCount,setStruckCount]=useState(0),[carDamage,setCarDamage]=useState(0),[playerHit,setPlayerHit]=useState<string|null>(null);
 const [camera,setCamera]=useState('scramble'),[tier,setTier]=useState('high'),[time,setTime]=useState('night'),[modules,setModules]=useState<any[]>([]),[stats,setStats]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let disposed=false;let cleanup=()=>{},appLifecycleStart=performance.now();
 (async()=>{const THREE=await import('three');const {OrbitControls}=await import('three/addons/controls/OrbitControls.js');if(disposed||!mount.current)return;
 const params=new URLSearchParams(location.search),config=parseLaunchConfig(location.search),s5TimingEnabled=params.get('s5Timing')==='1',startupTimingEnabled=params.get('startupTiming')==='1',diagEnabled=params.get('pad')==='1'||params.get('diag')==='1',touchEnabled=params.get('touch')==='1'||wantsTouch(),diagTab=params.get('pad')==='1'?'pad':'drive',scene=new THREE.Scene();setS5TimingVisible(s5TimingEnabled);scene.background=new THREE.Color('#111923');
 let timingTier=config.tier,startup:any=null,startupTrace:any=null;
 setTier(config.tier);setTime(config.time);setCamera(config.camera);
 const groups:any={};for(const name of ['world','dynamic','overlay']){groups[name]=new THREE.Group();groups[name].name=name;scene.add(groups[name]);}
 const canvas=document.createElement('canvas');const context=canvas.getContext('webgl2',{antialias:false,powerPreference:'high-performance'});const renderer=context?new THREE.WebGLRenderer({canvas,context,antialias:false,powerPreference:'high-performance'}):null;if(renderer){renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;}else{setError('この検証環境ではWebGL 2を利用できません。描画・FPSは未検証です。');}mount.current.appendChild(canvas);
 const stopShaderErrors=watchShaderErrors(renderer,setError);
 const stageMetrics=(result:any)=>{const info=renderer?.info,stageStats=result?.stats??result??{};return {triangles:info?.render.triangles??null,drawCalls:info?.render.calls??null,objectCount:null,instancedMeshCount:stageStats.instancedBatches??null,totalInstances:stageStats.instances??null,crowdCount:stageStats.total??null,movingVehicleCount:stageStats.moving??null,parkedVehicleCount:stageStats.parked??null,trainCount:stageStats.sets??null};};
 let startupPanel:HTMLElement|null=null,renderStartupPanel=()=>{};if(startupTimingEnabled){startup=createStartupTiming({initialTier:timingTier,buildIdentity:{gitCommit:(import.meta as any).env.VITE_GIT_COMMIT_SHA??'unavailable',buildTimestamp:(import.meta as any).env.VITE_BUILD_TIMESTAMP??'unavailable',deploymentIdentifier:location.host||'local',appVersion:(import.meta as any).env.VITE_APP_VERSION??null},browser:{userAgent:navigator.userAgent,devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},webgl:context?'WebGL2':null,visibilityState:document.visibilityState,hasFocus:document.hasFocus(),hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemory:(navigator as any).deviceMemory??null},metrics:stageMetrics});startupTrace=startup.trace;startup.milestone('appLifecycleStartMs',appLifecycleStart);startup.milestone('rendererReadyMs');(window as any).__SHIBUYA_STARTUP_TIMING__=startupTrace;startupPanel=document.createElement('section');startupPanel.className='startup-timing';startupPanel.setAttribute('aria-live','polite');document.body.appendChild(startupPanel);const lifecycle=(event:Event)=>startup.browserEvent(event.type);for(const type of ['visibilitychange','focus','blur','pagehide','pageshow'])window.addEventListener(type,lifecycle);(startupTrace as any)._removeLifecycle=()=>{for(const type of ['visibilitychange','focus','blur','pagehide','pageshow'])window.removeEventListener(type,lifecycle);};renderStartupPanel=()=>{if(!startupPanel)return;const trace=startupTrace,clock=(v:any)=>formatStartupDuration(v),section=(title:string,rows:any[])=>{const wrap=document.createElement('section'),h=document.createElement('h3'),dl=document.createElement('dl');h.textContent=title;for(const [label,value] of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value??'N/A');row.append(dt,dd);dl.append(row);}wrap.append(h,dl);return wrap;};startupPanel.replaceChildren();const heading=document.createElement('h2');heading.textContent='Startup Timing Report';startupPanel.append(heading,section('BUILD',[['commit',trace.buildIdentity.gitCommit],['build',trace.buildIdentity.buildTimestamp],['tier',`${trace.tier.initial} → ${trace.tier.final}`],['browser',trace.browser.userAgent]]),section('TOTAL',[['Navigation → Scene Build Complete',clock(trace.totals.navigationToSceneCompleteMs)],['Navigation → Interactive Ready',clock(trace.totals.navigationToInteractiveReadyMs)]]),section('MILESTONES',Object.entries(trace.milestones).filter(([key])=>key!=='navigationStartMs').map(([key,value])=>[key,clock(value)])));const table=document.createElement('div');table.className='startup-table';for(const values of [['stage','wall','compute','wait'],...trace.stages.map((record:any)=>[record.label,clock(record.wallDurationMs),clock(record.computeMs),clock((record.cooperativeWaitMs??0)+(record.externalWaitMs??0))])]){const row=document.createElement('div');row.className='startup-row';if(values[0]==='stage')row.classList.add('startup-head');for(const value of values){const cell=document.createElement('span');cell.textContent=String(value);row.append(cell);}table.append(row);}const stageTitle=document.createElement('h3');stageTitle.textContent='STAGES · actual execution order';startupPanel.append(stageTitle,table);for(const [title,sorter] of [['TOP BOTTLENECKS',(r:any)=>r.wallDurationMs??0],['TOP COMPUTE',(r:any)=>r.computeMs??0],['TOP WAIT',(r:any)=>(r.cooperativeWaitMs??0)+(r.externalWaitMs??0)]] as [string,(r:any)=>number][]){const records=[...trace.stages].filter((r:any)=>r.endMs!==null).sort((a:any,b:any)=>sorter(b)-sorter(a)).slice(0,5);startupPanel.append(section(title,records.map((r:any)=>[r.label,clock(sorter(r))])));}if(trace.rebuilds.length)startupPanel.append(section('REBUILDS',trace.rebuilds.map((r:any)=>[`${r.name} #${r.occurrence}`,r.invocationReason])));startupPanel.append(section('APPEARANCE',trace.appearanceEvents.map((event:any)=>[event.name,clock(event.atMs)])));const copy=document.createElement('button');copy.textContent='Copy JSON';copy.addEventListener('click',async()=>{await navigator.clipboard.writeText(JSON.stringify(trace,null,2));copy.textContent='Copied';window.setTimeout(()=>copy.textContent='Copy JSON',1500);});startupPanel.append(copy);};renderStartupPanel();}
 const appendStartupBoundaryDetails=()=>{if(!startupPanel||!startupTrace?.ready)return;const title=document.createElement('h3');title.textContent='STAGE BOUNDARIES';const list=document.createElement('dl');list.className='startup-boundaries';for(const record of startupTrace.stages){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=record.label;dd.textContent=`start ${formatStartupDuration(record.startMs)} · end ${formatStartupDuration(record.endMs)} · external ${formatStartupDuration(record.externalWaitMs)} · unclassified ${formatStartupDuration(record.unclassifiedMs)}`;row.append(dt,dd);list.append(row);}startupPanel.append(title,list);};
 const beginStage=(key:string,name:string,options:any={})=>startup?.beginStage(key,name,options)??{timing:null};
 const endStage=(record:any,result:any,error?:unknown)=>startup?.endStage(record,result,error===undefined,error)??record;
 const measureStage=(key:string,name:string,run:()=>any,options:any={})=>startup?startup.measure(key,name,run,options):run();
 const view=new THREE.PerspectiveCamera(50,1,.1,2000),controls=new OrbitControls(view,canvas);controls.enableDamping=false;controls.enabled=!config.qa;controls.minDistance=1;
 // The scene is a 500 m square: buildings are clipped at +/-250 m and the ground plane is
 // laid out to match. At the old 1200 m the viewer could pull back four times further than
 // the city is wide and watch it shrink to an island floating in empty sky. 300 m shows
 // about 280 m of ground, so the city still overfills the frame, and it clears the
 // overview preset's own 280 m orbit, which a tighter limit would have snapped inward.
 controls.maxDistance=300;
 // Only the kerb is double-sided; the asphalt, pavement and ground plane are not, so from
 // below the ground simply disappears and the crowd is left standing in the void. Stop the
 // orbit just short of level rather than fixing the far side of every ground material.
 controls.maxPolarAngle=Math.PI/2-.02;
 // Panning has no bounds of its own, so the target can be dragged off the modelled area
 // entirely, taking the camera with it. Hold it inside the built extent and at or above the
 // pavement; the eye floor keeps a level orbit from sinking under the kerb.
 // A pan moves the camera and the target by the same delta, so pulling the target back on
 // its own would pin the target while the camera kept walking: the viewer ends up outside
 // the modelled square looking back at the city as a slab with nothing under it. Correct
 // both by the same amount instead, which stops the pan without turning the view.
 const VIEW_LIMIT=180,VIEW_CEILING=60,EYE_FLOOR=1.6;
 // The player is created once the crowd network is up, since it walks on that context.
 let player:any=null,playerMarker:any=null,carMarker:any=null,playerFigure:any=null,playerShadow:any=null,deferredCharacter:any=null,playerCar:any=null,playerAudio:any=null,crowdVoices:any=null,touchPad:any=null,blood:any=null,driving=false,playerMode=false;const followPose:any={x:0,y:0,z:0,tx:0,ty:0,tz:0};const playerBox={x:0,z:0,heading:0};
 // RUN 12.1: recorded audio. The scramble chirp sits on the crossing's landmark point (渋谷駅前, public/data landmarks.scramble).
 let soundBank:any=null,soundscape:any=null,police:any=null,arrestedPending=false,arsenal:any=null,gunfire:any=null;
 // PLAN-POLICE W2: the koban at the station, where officers come from and the arrested wake up.
 const KOBAN={x:48.5,z:20.4};
 const policeFrustum=new THREE.Frustum(),policeMatrix=new THREE.Matrix4(),policePoint=new THREE.Vector3();
 const inView=(x:number,z:number)=>policeFrustum.containsPoint(policePoint.set(x,1.5,z))&&Math.hypot(x-view.position.x,z-view.position.z)<260;const earFacing=new THREE.Vector3(),SCRAMBLE_EAR={x:6.54,z:1.99};
 let heliMesh:any=null;const weaponWheel=createWeaponWheel(),streetReactions=createStreetReactions(),onlookers=createOnlookers(),aftermath=createAftermath(),ragdollCars:any[]=[];let frameShotAt:any=null,lastGunshotAt=-Infinity;
 // Roadmap stage 5: the wallet, the save slot, the mission board and the shop's door.
 const saveSlot=createSave(),loaded=saveSlot.load(),wallet=createWallet(loaded?{money:loaded.money}:undefined);
 const progress:any={completed:{...(loaded?.completed??{})},best:{...(loaded?.best??{})}};let savedArmor=loaded?.armor??0;
 let board:any=null,door:any=null,wasAlive=true;
 const persist=()=>saveSlot.save({money:wallet.money,armor:player?.state?.armor??savedArmor,completed:progress.completed,best:progress.best});
 const missionWorld=()=>({player:player?.state,driving,car:playerCar?.state,traffic:trafficEntry.hooks.current?.sim,crowd:lifeEntry.hooks.current?.sim,
  wanted:police?.wanted?.snapshot?.()??{stars:0},hits:frameHits,
  raiseWanted:(n:number)=>{const sim=lifeEntry.hooks.current?.sim;police?.wanted.crime(n>=2?'shooting':'weaponSeen',{x:player.state.x,z:player.state.z,t:sim?.time??0,seenByOfficer:true});}});let seatedDrivers:any=null;
 // ?perf=: a named section of the frame (the probe's sums), or just the call when not measuring.
 const timed=<T,>(name:string,f:()=>T):T=>perfProbe?perfProbe.time(name,f):f();let qaView:any=null;let radio:any=null,radioSlot:any=null;let riderLean=0;const rider:any={x:0,y:0,z:0,heading:0,speed:0,alive:true,attackTime:0,riding:true,riderLean:0};let seatedHidden=false;let transitionSeated=false;let carjackSide=-1,carjackStage:string|null=null,lastCarjack:any=null;let vehicleVisual:any=null,vehicleEffects:any=null,playUI:any=null,localCrowdClock=0,frameHits=0,combatDeathReported=false;const followCamera=createFollowCamera(),feedback=createFeedbackBus(),melee=createMeleeCombat({
  // PLAN-WEAPONS W1: the katana's cut goes through the same swing clock as a punch.
  weapon:()=>arsenal?.current??'fists',
  // RUN 8: a punch is an event the crowd can see. The HQ layer bounds it by its own spatial
  // grid, so this costs the cells around the fight and not the population.
  onWitness:(event:any)=>lifeEntry.hooks.current?.witness?.(event)??0,
  // RUN 11.2: the victim's own flinch and answer, on whichever body draws them.
  onBlow:(event:any)=>lifeEntry.hooks.current?.blow?.(event),
  // RUN 11.3: swings, hits and pain, for audio and the camera.
  onEvent:(kind:string,e:any)=>{feedback.emit(kind,lifeEntry.hooks.current?.sim?.time??0,e);}
 }),vehicleTransition=createVehicleTransition();
 const playerSize={width:PLAYER.radius*2,length:PLAYER.radius*2};const PLAYER_WEAPONS=['pistol','katana','smg'];const PLAYER_HEIGHT=1.76;
 // Getting in and out begins with the player's parked car, but a stopped traffic slot can
 // later become the controlled one. The slot is reused so traffic still sees its body.
 /**
  * Build the car if it does not exist yet. It is created with the player, but only if the
  * traffic simulation happened to be up at that moment; on a slow connection it is not, and
  * without retrying, the car is never created at all and the button reads 車がない for the
  * rest of the session. Called from the walking frame as well as from the button, so it
  * heals itself rather than waiting to be pressed.
  */
 const ensureCar=()=>{
  if(playerCar||!player)return playerCar;
  const sim=trafficEntry.hooks.current?.sim,ctx=lifeEntry.hooks.current?.network?.ctx;
  if(!sim||!ctx)return null;
  playerCar=createPlayerVehicle(sim,ctx);
  if(!playerCar.spawn(player.state.x,player.state.z))console.warn('[Player] no room to park the car');
  // Stage 6: motorbikes stand parked round the map -- one close to where the player starts.
  for(const [x,z] of BIKE_SPOTS)playerCar.parkNear('motorbike',player.state.x+x,player.state.z+z);
  (window as any).__SHIBUYA_CAR__=playerCar;
  return playerCar;
 };
 // Stage 6: the car radio. Each car keeps the station it was left on (`slot.radio`).
 const tuneRadio=(d:number)=>{if(!driving||!radio)return;radio.step(d);if(playerCar?.state.slot)playerCar.state.slot.radio=radio.station;};
 const toggleDrive=()=>{
  if(!player||!player.state.alive||vehicleTransition.active)return;
  if(!ensureCar())return;
  if(driving){
   // The safe-doorstep rule is unchanged and deliberate: with no pavement beside the car
   // there is nowhere legal to put a body, so the request is refused and the player stays in.
   const spot=playerCar.doorstep();if(!spot)return;
   const door=playerCar.doorPose(playerCar.state.slot,spot[0],spot[1]);if(!door)return;
   const a=playerCar.anchors(playerCar.state.slot,door.side);
   driving=false;playerAudio?.silence();playerCar.state.speed=0;playerCar.state.doorSide=door.side;playerCar.state.doorPhase=0;playerCar.sync();
   // Exit starts IN THE SEAT, not at the door. Starting at the door is what made getting out
   // a teleport followed by a slide.
   player.transitionTo(a.seat.x,a.seat.z,playerCar.state.heading,0);
   playerFigure?.update(player.state,0);groundPlayerShadow();
   vehicleTransition.begin('exit',{
    seat:{x:a.seat.x,z:a.seat.z,heading:playerCar.state.heading},
    exit:{x:spot[0],z:spot[1],heading:door.heading}},playerCar.state.slot);
   setDriving(false);touchPad?.setDriving(false);return;}
  const entry=playerCar.nearestEntry(player.state.x,player.state.z);
  if(!entry||!entry.inRange)return;                                           // too far from any door
  const door=playerCar.doorPose(entry.slot,player.state.x,player.state.z);if(!door)return;
  // An OCCUPIED car is a different interaction from an empty one. This is the branch the old
  // code did not have: every car was empty, so every entry was the same, and taking one from
  // somebody was `takeOver` at the button press.
  const traffic=trafficEntry.hooks.current?.sim;
  const occupied=isOccupied(traffic,entry.slot);
  if(occupied&&!canCarjack(traffic,entry.slot))return;      // moving: not at this speed
  // RESERVE, not take over. The car is frozen so traffic cannot pull away mid-sequence and
  // its door can swing, but `active` stays false, so it cannot be driven and nothing is
  // struck by it. Control transfers when the body reaches the seat -- see the frame loop.
  if(entry.slot&&entry.slot!==playerCar.state.slot)playerCar.reserve(entry.slot);
  playerCar.state.doorSide=door.side;playerCar.state.doorPhase=0;
  const a=playerCar.anchors(entry.slot,door.side);
  carjackSide=door.side;carjackStage=null;
  vehicleTransition.begin(occupied?'carjack':'enter',{
   start:{x:player.state.x,z:player.state.z,heading:player.state.bodyHeading??player.state.heading},
   entry:{x:door.x,z:door.z,heading:door.heading},
   seat:{x:a.seat.x,z:a.seat.z,heading:entry.slot.heading}},entry.slot);
 };
 const attack=(o?:any)=>{if(!(playerMode&&!driving&&!vehicleTransition.active&&player?.state.alive))return;
  // PLAN-WEAPONS W2: with the pistol out the attack button is the trigger; on a phone (no pointer
  // lock, no mouse to aim with) it locks on (R16).
  // Item 3: the pad's ZR (`o.pad`) fires a gun only with ZL held.
  if(arsenal?.trigger({touch:touchEnabled&&document.pointerLockElement!==canvas,pad:!!o?.pad}))return;
  melee.request();};
 // PLAN-WEAPONS W2: the collision world a bullet sees, read through the live hooks every call.
 const lockReticle=new THREE.Vector3(),weaponMuzzle=new THREE.Vector3(),weaponBarrel=new THREE.Vector3(),viewDirection=new THREE.Vector3();
 const weaponWorld:any={
  solid:(x:number,z:number)=>!!lifeEntry.hooks.current?.network?.ctx?.solid?.(x,z,.05),
  ground:(x:number,z:number)=>lifeEntry.hooks.current?.network?.ctx?.height?.(x,z)??0,
  get cars(){return (trafficEntry.hooks.current?.sim?.pool??[]).filter((v:any)=>v.active);},
  dimsOf:(v:any)=>(VEHICLES as any)[v.type]??null,
  // Stage 6: a round into a car dents it, or cracks or takes out the pane it came through.
  shootCar:(car:any,pt:any,dir:any)=>{const d=(VEHICLES as any)[car.type];if(!d)return null;const r=carShot(wearOf(car),car,d,pt,dir);
   if(r.glass)playerAudio?.glass?.(r.glass==='shatter'?1:.45);return r;},
  people:(from:any,dir:any,range:number,wide=false)=>{const sim=lifeEntry.hooks.current?.sim;if(!sim)return [];
   if(!wide)return peopleAlong(sim.grid,from,dir,range);
   const out:any[]=[];for(const p of sim.pool)if(p.active&&Math.hypot(p.x-from.x,p.z-from.z)<=range)out.push(p);return out;},
  bodyOf:(p:any)=>({y:p.height??0,height:(CROWD_ARCHETYPES as any)[p.archetype]?.height??1.76}),
  // Children are never combat targets in this game (combat.mjs `eligible`); a bullet is not stopped by one either.
  skip:(p:any)=>!p.active||p.controlled||p.struck!==undefined||p.combatDead||p.archetype==='kid',
  clear:(a:any,p:any)=>lineOfSight(weaponWorld.solid,a,p),
  get crowd(){return lifeEntry.hooks.current?.sim??null;},
  wound:(p:any,hit:any)=>melee.wound(lifeEntry.hooks.current?.sim,player,p,hit),
  bleed:(pt:any,dir:any)=>{const sim=lifeEntry.hooks.current?.sim;sim?.splashes?.push({x:pt.x,y:weaponWorld.ground(pt.x,pt.z),z:pt.z,dx:dir.x*2,dz:dir.z*2,scale:.55,life:.4});},
  muzzle:(figure:any)=>figure?.weapons?.muzzle(weaponMuzzle,weaponBarrel)?{x:weaponMuzzle.x,y:weaponMuzzle.y,z:weaponMuzzle.z}:null};
 // PLAN-WEAPONS W1: 1/2/3, the wheel and the pad's weapon button. Not mid-swing, not in a car.
 const weaponBusy=()=>melee.phase!=='idle'||!!vehicleTransition.active||!player?.state.alive;
 // Stage 1: the weapon wheel -- time slows while it is open (see the frame), and letting go draws the pick.
 const onWheel=(kind:string,x=0,y=0)=>{
  if(kind==='open'){if(!playerMode||driving||weaponBusy()){return;}weaponWheel.show(arsenal?.current??'fists');arsenal?.hold(false);}
  else if(kind==='move')weaponWheel.move(x,y);
  else if(kind==='point')weaponWheel.point(x,y);
  else if(kind==='close'){const id=weaponWheel.close();if(id&&id!==arsenal?.current)selectWeapon(WHEEL.order.indexOf(id)+1);}
  playUI?.setWheel?.(weaponWheel.open,weaponWheel.highlighted,arsenal?.snapshot()??null);
 };
 const selectWeapon=(n:number)=>{if(playerMode&&arsenal?.select(n,{busy:weaponBusy(),driving}))touchPad?.setWeapon(arsenal.current);};
 const cycleWeapon=(d:number)=>{if(playerMode&&arsenal?.cycle(d,{busy:weaponBusy(),driving}))touchPad?.setWeapon(arsenal.current);};
 const crowdSlot=()=>lifeEntry.hooks.current?.sim?.pool?.[0]??null;
 // Writing the reserved agent before the crowd updates puts the player in the same
 // neighbour grid the pedestrians avoid each other through, so they part around them, and
 // the instanced renderer draws the player in the same pass at no extra draw call.
 const syncCrowdSlot=(dt:number)=>{const a=crowdSlot();if(!a||!player)return;if(!a.controlled)lifeEntry.hooks.current?.sim?.leave(a);if(driving){a.active=false;return;}a.active=true;
  a.controlled=true;a.active=true;a.archetype=PLAYER.archetype;a.mode='player';a.state='walking';
  a.x=player.state.x;a.z=player.state.z;a.heading=player.state.heading;a.speed=player.state.speed;
  a.lod='near';a.animationTime=(a.animationTime??0)+dt;a.height=player.state.y;};
 const releaseCrowdSlot=()=>{const a=crowdSlot();if(!a)return;a.controlled=false;a.active=false;a.mode='ambient';};
 let aimCamera=0,healthLast=100,hintKey='';
 const applyPlayerCamera=(dt:number)=>{const ctx=lifeEntry.hooks.current?.network?.ctx??null;// RUN 9: once the body is IN the car, frame the car, not the body. Following the player
  // through the doorway put the eye a few metres behind a point that is inside the vehicle,
  // so the camera sat on the roof and the whole entry was shot from inside the bodywork.
  // `seated` arrives before `driving` does -- control transfers at the end of the sequence,
  // and the camera has to move at the start of the seat, not after the door shuts.
  const inCar=(driving||transitionSeated)&&playerCar;
  const state=inCar?playerCar.state:player.state;aimCamera+=(((!inCar&&player.state.aim>0)?1:0)-aimCamera)*(1-Math.exp(-10*dt));// §9ah: an automatic's recoil lifts the view with the muzzle (its `recoil.camera` share of the climb); it settles with the recoil.
  const kick=!inCar&&arsenal?arsenal.recoil*(arsenal.weapon?.recoil?.camera??0):0;
  const desired=inCar?vehicleCamera(state,followPose,ctx):playerCamera(kick?{...state,pitch:state.pitch+kick}:state,followPose,ctx,aimCamera);const c:any={...followCamera.update(desired,{x:state.x,y:state.y+(driving?CAR.eye:PLAYER.eye),z:state.z},ctx,dt,driving?'drive':'walk')};
  // QA stills: a camera placed round the player (or the car) by the capture script, in place of the follow camera.
  if(qaView){const h=state.heading+(qaView.yaw??0),d=qaView.dist??3,ty=state.y+(qaView.target??1.2);c.x=state.x-Math.sin(h)*d;c.z=state.z-Math.cos(h)*d;c.y=state.y+(qaView.height??1.6);c.tx=state.x;c.ty=ty;c.tz=state.z;}
  if(shake>.002){const t=performance.now()/1000;
   // Two frequencies that do not divide into each other, so it reads as a knock rather than
   // a hum, and it only moves the eye -- the look-at point stays put or the view swims.
   c.x+=Math.sin(t*37)*shake*SHAKE_SCALE*SHAKE_THROW;c.y+=Math.sin(t*53)*shake*SHAKE_SCALE*SHAKE_THROW*.6;c.z+=Math.cos(t*43)*shake*SHAKE_SCALE*SHAKE_THROW;}
  const targetFov=driving?61+Math.min(10,Math.abs(state.speed)*.7):50-(50-(arsenal?.weapon?.aimFov??PLAYER.aimFov))*aimCamera;const nextFov=view.fov+(targetFov-view.fov)*(1-Math.exp(-3*dt));if(Math.abs(nextFov-view.fov)>.01){view.fov=nextFov;view.updateProjectionMatrix();}
  view.position.set(c.x,c.y,c.z);view.lookAt(c.tx,c.ty,c.tz);
  controls.target.set(c.tx,c.ty,c.tz);};
 // A vehicle box over the player is a knock-down. The traffic simulation's own overlap test
 // is reused, so the player is measured against cars exactly as cars are against each other.
 const checkRunOver=()=>{const sim=trafficEntry.hooks.current?.sim;if(!sim||!player.state.alive)return;
  playerBox.x=player.state.x;playerBox.z=player.state.z;playerBox.heading=player.state.heading;
  for(const v of sim.pool){if(!v.active||v.parked)continue;
   // Step E: a quarter of the health and a throw, not a death, unless it was the last quarter.
   if(boxOverlap(playerBox,playerSize,v,(VEHICLES as any)[v.type],0)){if(player.knockDown(v)){if(!player.state.alive)setPlayerHit(v.type);else{feedback.emit('vehicle_impact',lifeEntry.hooks.current?.sim?.time??0,{x:player.state.x,z:player.state.z,intensity:.8});shake=Math.min(1,shake+.35);}}break;}}
  };
 /** One soft patch under the player, sized from the body like every other pedestrian's. */
 const groundPlayerShadow=()=>{
  if(!playerShadow)return;
  playerShadow.begin();
  if(playerMode&&!driving&&player?.state)
   playerShadow.add(player.state.x,player.state.y,player.state.z,PLAYER.radius*1.35,
    player.state.alive?0:Math.max(0,1-(player.state.runOver??0)));
  playerShadow.end();
 };
 const clampView=()=>{const t=controls.target;
  const x=Math.min(VIEW_LIMIT,Math.max(-VIEW_LIMIT,t.x)),z=Math.min(VIEW_LIMIT,Math.max(-VIEW_LIMIT,t.z)),y=Math.min(VIEW_CEILING,Math.max(0,t.y));
  view.position.x+=x-t.x;view.position.y+=y-t.y;view.position.z+=z-t.z;t.set(x,y,z);
  if(view.position.y<EYE_FLOOR)view.position.y=EYE_FLOOR;};
 const queueSchedule=startupTimingEnabled?(run:()=>void,meta:any=undefined)=>{const waitStart=performance.now();requestAnimationFrame(()=>{const rafAt=performance.now();startup.queue({type:'rendererFrameWait',startMs:waitStart,endMs:rafAt,durationMs:rafAt-waitStart,meta});setTimeout(()=>{const timeoutAt=performance.now();startup.queue({type:'schedulerYield',startMs:rafAt,endMs:timeoutAt,durationMs:timeoutAt-rafAt,meta});run();},0);});}:undefined;
 const shaderWarmup=renderer?createShaderWarmup(renderer):null;
 const buildQueue=createBuildQueue(queueSchedule, startupTimingEnabled?(event:any)=>startup.queue(event):null);const buildingLifecycle=(options:any)=>{const loads=new Map(),key=options.timingKey,name=options.timingName,appearance=options.appearance;return baseBuildingLifecycle({...options,schedule:buildQueue.enqueue,onLoadStart(token:number){const load=startup?.loadStart(key);loads.set(token,load);return load;},onLoadEnd(load:any,ok:boolean,error:any){startup?.loadEnd(load,ok,error);},onBuildStart(token:number){const timing:any={computeMs:0,cooperativeWaitMs:0,yieldCount:0};const record=beginStage(key,name,{timing});(record as any)._token=token;return record;},onAdded(result:any){if(appearance)startup?.appearance(appearance,key);if(shaderWarmup&&result?.root){try{shaderWarmup.warm(result.root,view);}catch(e){console.warn('[Shader warm-up]',key,String(e));}}},onBuildEnd(record:any,result:any,ok:boolean,error:any){endStage(record,result,ok?undefined:error);renderStartupPanel();},queueMeta(){return {key,name};}});};
 const clock=new TimeState(config.time);const dayNight=new DayNightSystem(scene,renderer,clock);const fidelity=new RenderFidelity(scene,renderer,view,clock,dayNight,{tier:config.tier});const roadReflection=renderer?createRoadReflection(renderer):null;
 // RUN 12.5: on a touch device the mirror (a second scene render) starts off; ?mirror=1 forces it on, ?mirror=0 off.
 if(roadReflection)roadReflection.enabled=params.get('mirror')==='1'||(params.get('mirror')!=='0'&&!(typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches));const registerSceneRoot=(root:any)=>{dayNight.register(root);fidelity.register(root);};buildQueue.enqueue(()=>measureStage('fidelity','Render Fidelity Prepare',()=>fidelity.prepare()),{key:'fidelity',name:'Render Fidelity Prepare'}).catch(e=>{console.error('[S16.3 Fidelity]',e);setError('HIGH描画の準備に失敗しました。MEDIUMを選択してください。');});const system=new ModuleSystem(config,{scene,groups,renderer,camera:view,time:clock});
 for(const id of MODULES)system.register(id,id==='debug'?{build(){const grid=new THREE.GridHelper(500,50,0x50768a,0x243342);grid.name='inspection-grid';groups.overlay.add(grid);const axes=new THREE.AxesHelper(30);groups.overlay.add(axes);},dispose(){for(const child of [...groups.overlay.children]){child.geometry?.dispose();for(const m of Array.isArray(child.material)?child.material:[child.material])m?.dispose();groups.overlay.remove(child);}}}:{});
 system.register('heroes');system.register('stationDetail');const environmentEntry=system.entries.get('environment');environmentEntry.hooks={build(){measureStage('environment','S12 Environment',()=>dayNight.enable());},dispose(){dayNight.disable();}};system.start();
 // S1 data owns diagnostic lines in world; S0 overlay lifecycle is unchanged.
 let dataDebug:any=null;let ground:any=null;let groundGeneration=0;let dataGeneration=0;const dataAbort=new AbortController();
 const dataEntry=system.entries.get('data');dataEntry.enabled=false;
 dataEntry.hooks={build(){const generation=++dataGeneration,timing:any={computeMs:0,cooperativeWaitMs:0,externalWaitMs:0},record=beginStage('data','S1 Data',{timing}),loadToken=startup?.loadStart('data'),loadStarted=performance.now();loadSceneData(undefined,{signal:dataAbort.signal}).then(data=>{timing.externalWaitMs+=performance.now()-loadStarted;startup?.loadEnd(loadToken,true);if(disposed||generation!==dataGeneration||!dataEntry.enabled){endStage(record,null,'stale');return;}const computeStarted=performance.now();setDataReport(summarize(data));dataDebug=buildDataDebug(data);groups.world.add(dataDebug.root);dataDebug.root.visible=!system.entries.get('ground').enabled;dataEntry.status='ready';setModules(system.snapshot());timing.computeMs+=performance.now()-computeStarted;endStage(record,dataDebug);startup?.milestone('dataLoadCompleteMs');renderStartupPanel();}).catch(e=>{timing.externalWaitMs+=performance.now()-loadStarted;startup?.loadEnd(loadToken,false,e);endStage(record,null,e);if(disposed||dataAbort.signal.aborted||generation!==dataGeneration)return;dataEntry.status='failed';dataEntry.error=String(e);setDataReport({error:String(e)});setModules(system.snapshot());});},dispose(){dataGeneration++;dataDebug?.dispose();dataDebug=null;setDataReport(null);}};
 system.setEnabled('data',(config.only===null||config.only.includes('data'))&&!config.skip.includes('data'));
 // RUN 12.3: photographed CC0 road and pavement, swapped onto the ground's own materials once
 // the city stands. Off the startup path, never awaited, skipped on LOW; a failure keeps the
 // procedural surfaces.
 const requestGroundPbr=(built:any,generation:number)=>{if(params.get('pbr')==='0')return;   // ?pbr=0: the procedural ground, for A/B
  const run=()=>{if(disposed||generation!==groundGeneration||ground!==built)return;
  const base=((import.meta as any).env?.BASE_URL??'/')+'textures/ground/',loader=new THREE.TextureLoader();
  upgradeGroundTextures(built.root,{tier:currentTier,base,THREE,load:(url:string)=>loader.loadAsync(url),fetchJson:(url:string)=>fetch(url).then(r=>{if(!r.ok)throw new Error('ground textures '+r.status);return r.json();})})
   .then((r:any)=>{if(r.applied.length)console.info('[S12.3 Ground PBR]',r.applied);}).catch((e:any)=>console.warn('[S12.3 Ground PBR] unavailable, keeping procedural ground',String(e)));};
  const idle=(window as any).requestIdleCallback;if(idle)idle(run,{timeout:4000});else setTimeout(run,1500);};
 const groundEntry=system.entries.get('ground');groundEntry.enabled=false;
 groundEntry.hooks={build(){const generation=++groundGeneration;setGroundReport({status:'building'});if(dataDebug)dataDebug.root.visible=false;loadSceneData(undefined,{signal:dataAbort.signal}).then(data=>buildQueue.enqueue(async()=>{if(disposed||generation!==groundGeneration||!groundEntry.enabled)return;const timing:any={computeMs:0,cooperativeWaitMs:0},record=beginStage('ground','S2 Ground',{timing}),started=performance.now();try{const pack=await loadStaticModels();if(disposed||generation!==groundGeneration)return;ground=buildGround(data,{model:pack?.ground});timing.computeMs+=performance.now()-started;groups.world.add(ground.root);registerSceneRoot(ground.root);startup?.appearance('firstGroundVisible','ground');setGroundReport(ground.stats);console.info('[S2 Ground]',ground.stats);groundEntry.status='ready';requestGroundPbr(ground,generation);setModules(system.snapshot());endStage(record,ground);renderStartupPanel();}catch(e){timing.computeMs+=performance.now()-started;endStage(record,null,e);throw e;}},{key:'ground',name:'S2 Ground'})).catch(e=>{if(disposed||generation!==groundGeneration||dataAbort.signal.aborted)return;groundEntry.status='failed';groundEntry.error=String(e);setGroundReport({error:String(e)});console.error('[S2 Ground]',e);setModules(system.snapshot());});},dispose(){groundGeneration++;ground?.dispose();ground=null;setGroundReport(null);if(dataDebug)dataDebug.root.visible=true;}};
 system.setEnabled('ground',(config.only===null||config.only.includes('ground'))&&!config.skip.includes('ground'));
 let buildingsTier=config.tier;const buildingsEntry=system.entries.get('buildings');buildingsEntry.enabled=false;
 buildingsEntry.hooks=buildingLifecycle({timingKey:'buildings',timingName:'S3 Generic Buildings',appearance:'firstBuildingVisible',parent:groups.world,build:async(data:any,record:any)=>buildBuildingsAsync(data,{model:(await loadStaticModels())?.generic,tier:buildingsTier,stageTiming:record?.timing}),onReport:setBuildingsReport,onReady(result:any){registerSceneRoot(result.root);buildingsEntry.status='ready';console.info('[S3 Generic Buildings]',result.stats);setModules(system.snapshot());},onError(e:any){buildingsEntry.status='failed';buildingsEntry.error=String(e);console.error('[S3 Generic Buildings]',e);setModules(system.snapshot());}});
 system.setEnabled('buildings',(config.only===null||config.only.includes('buildings'))&&!config.skip.includes('buildings'));
 const heroEntry=system.entries.get('heroes');heroEntry.enabled=false;
 heroEntry.hooks=buildingLifecycle({timingKey:'heroes',timingName:'S4 Hero Landmarks',appearance:'firstHeroVisible',parent:groups.world,build:(data:any,record:any)=>{const started=performance.now(),result=buildHeroScene(data);if(record?.timing)record.timing.computeMs+=performance.now()-started;return result;},onReport:setHeroReport,onReady(result:any){registerSceneRoot(result.root);heroEntry.status='ready';console.info('[S4 Hero Landmarks]',result.stats);setModules(system.snapshot());},onError(e:any){heroEntry.status='failed';heroEntry.error=String(e);console.error('[S4 Hero Landmarks]',e);setModules(system.snapshot());}});
 system.setEnabled('heroes',(config.only===null||config.only.includes('heroes'))&&!config.skip.includes('heroes'));
 let stationTimingTrace:any=null;const finishStationTiming=()=>{const trace=stationTimingTrace;if(!trace?.summary)return;trace.lifecycleEnd=performance.now();trace.modulesAtEnd=system.snapshot();trace.reactRenders=reactRenderCount.current-trace.reactRenderStart;const duplicated=Math.max(0,(trace.stepsCreated??trace.consumerStart)-trace.consumerStart),renderCompute=(trace.renderEnd??0)-(trace.renderStart??0),stationCompute=trace.summary.compute.total+renderCompute,wall=trace.lifecycleEnd-trace.lifecycleStart,knownWithoutOther=duplicated+stationCompute+trace.summary.rafWait.total+trace.summary.timeoutWait.total,other=wall-knownWithoutOther;trace.breakdown={wallMs:wall,actualComputeMs:stationCompute,duplicatedS2S3Ms:duplicated,totalComputeMs:duplicated+stationCompute,rafWaitMs:trace.summary.rafWait.total,setTimeoutWaitMs:trace.summary.timeoutWait.total,otherGapMs:other,yieldOtherGapMs:trace.summary.otherGap.total,preBuildAndLifecycleGapMs:other-trace.summary.otherGap.total};trace.active=false;(window as any).__S5_TIMING__=trace;document.documentElement.dataset.s5Timing=JSON.stringify(trace);setS5TimingResult(trace);console.info('[S5 Timing Summary]',trace.breakdown);};
 const stationEntry=system.entries.get('station');stationEntry.enabled=false;
 stationEntry.hooks=buildingLifecycle({timingKey:'station',timingName:'S5 Station Core',appearance:'firstStationVisible',parent:groups.world,build:async(data:any,record:any)=>{const pack=await loadStaticModels();if(stationTimingTrace){stationTimingTrace.buildStart=performance.now();stationTimingTrace.modulesAtBuild=system.snapshot();stationTimingTrace.fidelityPreparedAtBuild=!!fidelity.pipeline;}return buildStation(data,{model:pack?.station,ground:ground?.model,generic:buildingsEntry.hooks.current?.model,...(stationTimingTrace?{timingTrace:stationTimingTrace}:{}),stageTiming:record?.timing});},onReport(report:any){if(s5TimingEnabled&&report?.status==='building'){stationTimingTrace={tier:buildingsTier,lifecycleStart:performance.now(),reactRenderStart:reactRenderCount.current,frames:[],resizes:[],longTasks:[],gc:[],active:true};document.documentElement.dataset.s5Timing='building';}setStationReport(report);},onReady(result:any){registerSceneRoot(result.root);stationEntry.status='ready';finishStationTiming();console.info('[S5 Station Core]',result.stats);setModules(system.snapshot());},onError(e:any){stationEntry.status='failed';stationEntry.error=String(e);if(stationTimingTrace){stationTimingTrace.error=String(e);finishStationTiming();}console.error('[S5 Station Core]',e);setModules(system.snapshot());}});
 system.setEnabled('station',(config.only===null||config.only.includes('station'))&&!config.skip.includes('station'));
 let detailTier=config.tier;
 const detailEntry=system.entries.get('stationDetail');detailEntry.enabled=false;
 detailEntry.hooks=buildingLifecycle({timingKey:'stationDetail',timingName:'S6 Station Detail',parent:groups.world,build:async(data:any,record:any)=>buildStationDetails(data,{model:(await loadStaticModels())?.detail?.[detailTier],ground:ground?.model,generic:buildingsEntry.hooks.current?.model,core:stationEntry.hooks.current?.model,tier:detailTier,debug:config.debug,stageTiming:record?.timing}),onReport:setDetailReport,onReady(result:any){registerSceneRoot(result.root);detailEntry.status='ready';console.info('[S6 Station Detail]',result.stats);setModules(system.snapshot());},onError(e:any){detailEntry.status='failed';detailEntry.error=String(e);console.error('[S6 Station Detail]',e);setModules(system.snapshot());}});
 system.setEnabled('stationDetail',(config.only===null||config.only.includes('stationDetail'))&&!config.skip.includes('stationDetail'));
 let signTier=config.tier;
 const signsEntry=system.entries.get('signs');signsEntry.enabled=false;
 signsEntry.hooks=buildingLifecycle({timingKey:'signs',timingName:'S7 Signage',appearance:'firstSignVisible',parent:groups.world,build:async(data:any,record:any)=>buildSignage(data,{model:(await loadStaticModels())?.signs?.[signTier],referenceMatch:true,fidelity:true,tier:signTier,generic:buildingsEntry.hooks.current?.model,ground:ground?.model,heroes:heroEntry.hooks.current?.heroes,core:stationEntry.hooks.current?.model,debug:config.debug,maxTextureSize:renderer?.capabilities.maxTextureSize??4096,stageTiming:record?.timing}),onReport:setSignReport,onReady(result:any){registerSceneRoot(result.root);signsEntry.status='ready';console.info('[S7 Signage]',result.stats);setModules(system.snapshot());},onError(e:any){signsEntry.status='failed';signsEntry.error=String(e);console.error('[S7 Signage]',e);setModules(system.snapshot());}});
 system.setEnabled('signs',(config.only===null||config.only.includes('signs'))&&!config.skip.includes('signs'));
 let streetTier=config.tier;
 const streetEntry=system.entries.get('streetscape');streetEntry.enabled=false;
 streetEntry.hooks=buildingLifecycle({timingKey:'streetscape',timingName:'S8 Streetscape',appearance:'firstStreetPropVisible',parent:groups.world,build:async(data:any,record:any)=>buildStreetscape(data,{model:signsEntry.hooks.current?.model?.tier==='high'?(await loadStaticModels())?.street?.[streetTier]:undefined,tier:streetTier,stationDetail:(await loadStaticModels())?.detail?.[streetTier]??detailEntry.hooks.current?.model,generic:buildingsEntry.hooks.current?.model,ground:ground?.model,core:stationEntry.hooks.current?.model,signs:signsEntry.hooks.current?.model?.tier==='high'?signsEntry.hooks.current.model:undefined,debug:config.debug,stageTiming:record?.timing}),onReport:setStreetReport,onReady(result:any){registerSceneRoot(result.root);streetEntry.status='ready';console.info('[S8 Streetscape]',result.stats);setModules(system.snapshot());},onError(e:any){streetEntry.status='failed';streetEntry.error=String(e);console.error('[S8 Streetscape]',e);setModules(system.snapshot());}});
 system.setEnabled('streetscape',(config.only===null||config.only.includes('streetscape'))&&!config.skip.includes('streetscape'));
 const trafficEntry=system.entries.get('traffic');trafficEntry.enabled=false;
 trafficEntry.hooks=buildingLifecycle({timingKey:'traffic',timingName:'S9 Traffic / Vehicles',appearance:'firstVehicleVisible',parent:groups.dynamic,build:async(data:any,record:any)=>{const pack=await loadStaticModels(),started=performance.now(),result=buildTraffic(data,{graph:pack?.traffic?.[currentTrafficTier],heroStart:currentTrafficTier==='high',tier:currentTrafficTier,ground:ground?.model??pack?.ground,generic:buildingsEntry.hooks.current?.model,core:stationEntry.hooks.current?.model,street:streetEntry.hooks.current?.model,debug:config.debug});if(record?.timing)record.timing.computeMs+=performance.now()-started;return result;},onReport:setTrafficReport,onReady(result:any){registerSceneRoot(result.root);if(currentTrafficTier==='high')result.sim.signals.time=88;startup?.appearance('trafficBuildComplete','traffic');trafficEntry.status='ready';console.info('[S9 Traffic]',result.stats);setModules(system.snapshot());},onError(e:any){trafficEntry.status='failed';console.error('[S9 Traffic]',e);setModules(system.snapshot());}});
 let currentTrafficTier=config.tier,trafficReportClock=0;
 trafficEntry.hooks.update=(dt:number)=>{const result=trafficEntry.hooks.current;if(!result)return;result.update(dt);trafficReportClock+=dt;if(trafficReportClock>=1){trafficReportClock=0;setTrafficReport({...result.stats});}};
 system.setEnabled('traffic',(config.only===null||config.only.includes('traffic'))&&!config.skip.includes('traffic'));
 const lifeEntry=system.entries.get('life');lifeEntry.enabled=false;
 let lifeReportClock=0;
 lifeEntry.hooks=buildingLifecycle({timingKey:'life',timingName:'R1 / S10 Crowd / Life',appearance:'firstPersonVisible',parent:groups.dynamic,build:async(data:any,record:any)=>{const pack=await loadStaticModels(),network=pack?.life?.[currentTrafficTier]??await buildPedestrianNetworkAsync(data,{ground:ground?.model,generic:buildingsEntry.hooks.current?.model,core:stationEntry.hooks.current?.model,detail:detailEntry.hooks.current?.model,street:streetEntry.hooks.current?.model},record?.timing);const started=performance.now(),result=buildCrowd(data,{network,choreography:true,heroStart:currentTrafficTier==='high',tier:currentTrafficTier,traffic:trafficEntry.hooks.current?.sim,ground:ground?.model,generic:buildingsEntry.hooks.current?.model,core:stationEntry.hooks.current?.model,detail:detailEntry.hooks.current?.model,street:streetEntry.hooks.current?.model,debug:config.debug});if(record?.timing)record.timing.computeMs+=performance.now()-started;return result;},onReport:setLifeReport,onReady(result:any){registerSceneRoot(result.root);startup?.appearance('crowdBuildComplete','life');
  // A rebuilt crowd has a fresh near pool; hand it the humanoid the page already loaded, or it
  // draws baked figures until the next asset event, which for a loaded asset never comes.
  if(deferredCharacter?.asset)result.setNearCharacterAsset?.(deferredCharacter.asset);
  if(playerMode)exitPlayer();player=null;playUI?.dispose();playUI=null;lifeEntry.status='ready';console.info('[R1 Crowd Density]',result.stats);setModules(system.snapshot());},onError(e:any){lifeEntry.status='failed';console.error('[R1 Crowd Density]',e);setModules(system.snapshot());}});
 lifeEntry.hooks.update=(dt:number)=>{const result=lifeEntry.hooks.current;if(!result)return;result.setHQCamera?.(playerMode&&player?player.state:view.position);requestHQCrowd();result.update(dt,playerMode&&player?{x:player.state.x,z:player.state.z}:view.position);lifeReportClock+=dt;if(lifeReportClock>=1){lifeReportClock=0;setLifeReport({...result.stats});}};
 // RUN 7B. When `?hq=` asks for the high-fidelity crowd, its prebuilt pack is fetched and
 // handed to the crowd renderer AFTER the city is standing, exactly as the humanoid character
 // is: nothing about the scene waits on it, and a session that never loads it keeps the
 // legacy instanced bodies. Nothing is baked here -- the pack comes from npm run bake:crowd-hq.
 // RUN 7B, reworked in claude/crowd-realism. The HQ crowd is the default (`?hq=0` is the legacy
 // rollback). Its prebuilt pack is fetched once, AFTER the city is standing, and every crowd the
 // life module builds gets its own layer: a single page-wide "already asked" flag left a rebuilt
 // crowd on the legacy bodies for good. See src/app/hq-request.mjs.
 const hqRequester=createHQRequester({
  load:()=>{const base=(import.meta as any).env?.BASE_URL??'/';return Promise.all([
   fetch(`${base}data/crowd/hq-crowd.json`).then(r=>{if(!r.ok)throw new Error(`hq manifest ${r.status}`);return r.json();}),
   fetch(`${base}data/crowd/hq-crowd.bin`).then(r=>{if(!r.ok)throw new Error(`hq pack ${r.status}`);return r.arrayBuffer();})]);},
  current:()=>lifeEntry.hooks.current,
  // A pedestrian the reaction system has thrown must stop being walked along a route by the
  // simulation, or the two fight over the same body. `leave` is the simulation's own path
  // out of a crossing, which is what keeps the signal group released.
  options:(hooks:any)=>({
   onDisown:(id:number)=>{const p=hooks.sim?.pool?.[id];if(p&&p.active){hooks.sim.leave(p);p.reactionOwned=true;}},
   onReclaim:(id:number)=>{const p=hooks.sim?.pool?.[id];if(p)p.reactionOwned=false;}}),
  onEnabled:(hooks:any,layer:any,budget:number,[manifest,bin]:any)=>{
   hooks.setHQCamera(playerMode&&player?player.state:view.position);
   console.info('[HQ crowd] enabled',{budget,archetypes:manifest.archetypes.length,
    bytes:bin.byteLength,lods:layer?.crowd?.inspect?.().lods});},
  onError:(e:any)=>console.warn('[HQ crowd] unavailable, staying on the legacy crowd',String(e))});
 const requestHQCrowd=()=>hqRequester.ensure(lifeEntry.hooks.current,{asked:(config as any).hqCrowd,tier:currentTier});
 system.setEnabled('life',(config.only===null||config.only.includes('life'))&&!config.skip.includes('life'));
 const trainsEntry=system.entries.get('trains');trainsEntry.enabled=false;let trainReportClock=0;
 trainsEntry.hooks=buildingLifecycle({timingKey:'trains',timingName:'S11 Trains',appearance:'firstTrainVisible',parent:groups.dynamic,build:(data:any,record:any)=>{const started=performance.now(),result=buildTrains(data,{tier:currentTrafficTier,core:stationEntry.hooks.current?.model,debug:config.debug});if(record?.timing)record.timing.computeMs+=performance.now()-started;return result;},onReport:setTrainReport,onReady(result:any){registerSceneRoot(result.root);trainsEntry.status='ready';console.info('[S11 Trains]',result.stats);setModules(system.snapshot());},onError(e:any){trainsEntry.status='failed';console.error('[S11 Trains]',e);setModules(system.snapshot());}});
 trainsEntry.hooks.update=(dt:number)=>{const result=trainsEntry.hooks.current;if(!result)return;result.update(dt);trainReportClock+=dt;if(trainReportClock>=1){trainReportClock=0;setTrainReport({...result.stats});}};
 system.setEnabled('trains',(config.only===null||config.only.includes('trains'))&&!config.skip.includes('trains'));
 const nightglowEntry=system.entries.get('nightglow');nightglowEntry.enabled=false;
 nightglowEntry.hooks=buildingLifecycle({timingKey:'nightglow',timingName:'S13 Nightglow',parent:groups.world,load:loadWetScene,build:({data,model}:any,record:any)=>{const started=performance.now(),result=buildNightglow(data,{model,ground:ground?.model,time:clock,environment:dayNight,renderer,tier:currentTrafficTier});if(record?.timing)record.timing.computeMs+=performance.now()-started;return result;},onReport:setNightglowReport,onReady(result:any){result.setPostprocess(system.entries.get('postprocess').enabled);if(startupTimingEnabled&&!startupTrace.stages.some((r:any)=>r.key==='postprocess'))measureStage('postprocess','S14 Postprocess Activation',()=>result);nightglowEntry.status='ready';console.info('[S13 Nightglow]',result.stats);setModules(system.snapshot());},onError(e:any){nightglowEntry.status='failed';console.error('[S13 Nightglow]',e);setModules(system.snapshot());}});
 system.setEnabled('nightglow',(config.only===null||config.only.includes('nightglow'))&&!config.skip.includes('nightglow'));
 const constructionEntry=system.entries.get('construction');constructionEntry.enabled=false;
 constructionEntry.hooks=buildingLifecycle({timingKey:'construction',timingName:'S15 Construction',parent:groups.world,build:(data:any,record:any)=>{const started=performance.now(),result=buildConstruction(data,{generic:buildingsEntry.hooks.current?.model,time:clock,tier:currentTrafficTier});if(record?.timing)record.timing.computeMs+=performance.now()-started;return result;},onReport:setConstructionReport,onReady(result:any){constructionEntry.status='ready';console.info('[S15 Construction]',result.stats);setModules(system.snapshot());},onError(e:any){constructionEntry.status='failed';console.error('[S15 Construction]',e);setModules(system.snapshot());}});
 system.setEnabled('construction',(config.only===null||config.only.includes('construction'))&&!config.skip.includes('construction'));
 const postEntry=system.entries.get('postprocess');postEntry.hooks={build(){nightglowEntry.hooks.current?.setPostprocess(true);},dispose(){nightglowEntry.hooks.current?.setPostprocess(false);}};if(postEntry.enabled)postEntry.status='ready';
 const solar=new SolarCycle(scene,dayNight,fidelity,clock);
 const unsub=clock.subscribe((v:any)=>{system.timeChanged(v);setTime(v.value);setEnvironmentReport(dayNight.snapshot());});
 // §9aj G3: dynamic resolution holds the frame budget when the GPU is the limit (?dynres=0 turns it off).
 const dynRes=createDynamicResolution({budgetMs:1000/(PROFILES[config.tier]?.fps??60),enabled:params.get('dynres')!=='0'});let dynLast:number|null=null;
 let currentTier=config.tier,currentCamera=config.camera;const resize=()=>{if(!mount.current)return;const started=performance.now(),w=mount.current.clientWidth,h=mount.current.clientHeight;const profile=PROFILES[currentTier];renderer?.setPixelRatio(renderRatio(currentTier,devicePixelRatio)*dynRes.scale);renderer?.setSize(Math.max(1,w),Math.max(1,h));view.aspect=Math.max(1,w)/Math.max(1,h);view.updateProjectionMatrix();if(stationTimingTrace?.active)stationTimingTrace.resizes.push({start:started,duration:performance.now()-started,w,h});};
 const preset=(id:string,applyTime=true)=>{if(playerMode&&id!==currentCamera)exitPlayer();const c=CAMERAS.find((v:any)=>v.id===id)!;view.position.fromArray(id==='center-gai'?[-19,4.8,-24]:c.position);controls.target.fromArray(id==='center-gai'?[-61,9,-61]:c.target);controls.update();currentCamera=id;setCamera(id);if(applyTime&&c.time)clock.set(c.time);};preset(config.camera,!config.explicitTime);
 const enterPlayer=()=>{const ctx=lifeEntry.hooks.current?.network?.ctx;
  if(!ctx){console.warn('[Player] the crowd network is not ready yet');return false;}
  // The crowd's people are bodies to the player (src/player/crowd-contact.mjs); read through the
  // hook each frame, so a crowd rebuilt by a tier change is picked up and a missing one is none.
  // A bump (Step C) is a flinch on the HQ body and a look round at the player, a small knock and
  // (at a run) a thud through the feedback bus, and -- for the 30% who take it badly -- the same
  // fight a punch starts. Never damage.
  player??=createPlayer(ctx,{bodies:()=>lifeEntry.hooks.current?.sim??null,onBump:(p:any,b:any)=>{
   const sim=lifeEntry.hooks.current?.sim;if(!sim)return;
   lifeEntry.hooks.current?.blow?.({victim:p.id,blow:{hold:b.hold,fatal:false},response:b.strong?'backoff':'look',from:player?.state});
   feedback.emit('player_bump',sim.time,{x:p.x,z:p.z,intensity:b.strong?1:.35,id:p.id});
   if(b.fight&&player&&(police?.allowBumpFight(sim)??true))melee.provoke(sim,p,player);}});
  if(!player.place()){console.warn('[Player] no standable ground at the start point');return false;}
  if(!playerMarker){playerMarker=createPlayerMarker();groups.dynamic.add(playerMarker.mesh);}
  if(!carMarker){carMarker=createPlayerMarker(MARKER.car);groups.dynamic.add(carMarker.mesh);}
  if(!playerFigure){playerFigure=createPlayerFigure(undefined,undefined,{ctx,weapons:PLAYER_WEAPONS});groups.dynamic.add(playerFigure.root);}
  // The crowd's own contact shadows skip the controlled slot, so the player was the one person
  // in the city standing on nothing. Same module, same single draw call, one instance.
  if(!playerShadow){playerShadow=createContactShadows(1);groups.dynamic.add(playerShadow.mesh);}
  // The baked figure is already on screen; the humanoid is asked for now and swapped in if and
  // when it lands. Asking here rather than at startup keeps it out of the first paint entirely
  // -- somebody who only ever looks at the city never pays for a body.
  if(!deferredCharacter){deferredCharacter=createDeferredCharacter();(window as any).__SHIBUYA_CHARACTER__=deferredCharacter;}
  deferredCharacter.request();
  deferredCharacter.onReady((asset:any)=>{
   if(!playerFigure||playerFigure.asset===asset)return;
   // The same asset the player just took also upgrades the nearest NPCs, so the crowd beside
   // the player stops being a different order of fidelity from the player.
   lifeEntry.hooks.current?.setNearCharacterAsset?.(asset);
   const next=createPlayerFigure(asset,undefined,{ctx:lifeEntry.hooks.current?.network?.ctx??null,weapons:PLAYER_WEAPONS});
   groups.dynamic.add(next.root);
   next.update(player.state,0);
   playerFigure.dispose();playerFigure=next;
   if(config.qa&&(window as any).__SHIBUYA_FIGURE__)(window as any).__SHIBUYA_FIGURE__=next;
   if(!playerMode||driving)next.hide();
  });
  if(!vehicleVisual){vehicleVisual=createVehicleVisual();groups.dynamic.add(vehicleVisual.root);
   // The player's car was never registered, which is why it alone had no headlights at dusk and
   // cast nothing: day-night ramps emissives by mesh name and look.mjs records shadow casting,
   // and both walk a root once, when they are handed it. This root is empty until the deferred
   // pack lands, so registration waits for it.
   vehicleVisual.onReady((root:any)=>registerSceneRoot(root));}
  if(!vehicleEffects){vehicleEffects=createVehicleEffects();groups.dynamic.add(vehicleEffects.root);}
  if(!playUI)playUI=createPlayUI(lifeEntry.hooks.current.network,groups.dynamic,{onExit:()=>exitPlayer(),onDrive:()=>toggleDrive(),
   onMission:(id:string)=>{board??=createMissionBoard(lifeEntry.hooks.current.network);playUI?.setMission(board.start(id,missionWorld()));},
   onCancelMission:()=>{board?.cancel(missionWorld());playUI?.setMission(board?.snapshot());},
   onBuy:(id:string)=>{const r:any=shopBuy(wallet,id,{health:player.state.health,armor:player.state.armor,hasCar:!!playerCar?.state?.active,carDamage:playerCar?.state?.damage});
    if(r.ok){if(r.apply.health!==undefined)player.state.health=r.apply.health;if(r.apply.armor!==undefined)player.state.armor=r.apply.armor;if(r.apply.carDamage!==undefined&&playerCar?.state){playerCar.state.damage=0;if(playerCar.state.slot)playerCar.state.slot.wear=null;}persist();}
    playUI?.setShop(true,r.ok?`${r.item.name}を買った`:r.reason);},
   onSave:()=>{playUI?.setShop(true,persist()?'セーブしました':'この環境ではセーブできません');}});
  // Stage 5: the shop's door on the pavement nearest its anchor, and the saved vest back on.
  door??=shopDoor(lifeEntry.hooks.current.network.ctx);playUI.setShopDoor?.(door);
  if(savedArmor>0){player.state.armor=savedArmor;savedArmor=0;}
  playUI.show();followCamera.reset();setPresentation(true);
  // Entering player mode is a click, which is the gesture a browser wants before it will
  // start an AudioContext. If it refuses, audio stays off and nothing else changes.
  if(!blood){blood=createBloodMarks();groups.dynamic.add(blood.mesh);(window as any).__SHIBUYA_BLOOD__=blood;}
  if(!playerAudio)playerAudio=createPlayerAudio();
  if(!radio)radio=createRadio({context:()=>playerAudio?.context??null});
  playerAudio.resume();
  // RUN 12.1: recorded CC0 clips on the same unlocked context. Loaded now, off the startup
  // path, and never waited on: until they decode, every sound falls back to its synthesis.
  if(!soundBank){soundBank=createSoundBank(()=>playerAudio?.context??null,{base:((import.meta as any).env?.BASE_URL??'/')+'audio/'});
   soundscape=createSoundscape(soundBank,{scramble:SCRAMBLE_EAR});}
  // PLAN-POLICE W1/W3: the wanted level, the patrol cars' sirens and lamps.
  // PLAN-WEAPONS: fists, pistol and katana; the gunfire and the katana's clank on the same bus.
  if(!arsenal){arsenal=createArsenal({
   // W2: every shot is heard (recorded CC0 gunshot + the street's slapback), knocks the camera a
   // little and blooms its frame; the HQ crowd sees it through the bounded witness pass.
   onShot:(shot:any)=>{gunfire?.shot(shot.from.x,shot.from.y,shot.from.z,shot.heading,{kind:shot.weapon==='smg'?'smg':'pistol',hit:shot.hit});
    soundBank?.duck?.(.5,1.4);shake=Math.min(SHAKE_PUNCH_MAX,shake+SHAKE_SHOT);player?.rumble?.('shot');
    // Stage 1: a round that found a person marks the crosshair (a kill marks it red).
    if(shot.kind==='person')playUI?.hitMarker?.(shot.outcome==='killed');
    frameShotAt={x:shot.from.x,z:shot.from.z};lastGunshotAt=lifeEntry.hooks.current?.sim?.time??0;},
   onLand:(x:number,y:number,z:number,kind:string)=>gunfire?.tink(x,y,z,kind),
   onWitness:(event:any)=>lifeEntry.hooks.current?.witness?.(event)??0});
   groups.dynamic.add(arsenal.effects.root);}
  if(!gunfire)gunfire=createGunfire(()=>playerAudio?.context??null,()=>soundBank,{solid:(x:number,z:number)=>!!lifeEntry.hooks.current?.network?.ctx?.solid?.(x,z,.1)});
  if(!police)police=createPoliceDirector({getAudioContext:()=>playerAudio?.context??null,getAudioBus:()=>soundBank?.bus??null,koban:KOBAN});
  // Roadmap stage 3: the police helicopter and its searchlight (drawn from the director's state).
  if(!heliMesh){heliMesh=createHelicopterMesh();groups.dynamic.add(heliMesh.root);}
  void soundBank.load();
  // The crowd shares the car's context rather than opening its own: browsers only unlock
  // what a gesture created, and this click is the only gesture there is.
  if(!crowdVoices){crowdVoices=createCrowdVoices(()=>playerAudio?.context??null,{samples:soundBank});(window as any).__SHIBUYA_VOICES__=crowdVoices;}
  // On a touch device these are the controls, not an extra: there is no keyboard to fall
  // back to. They feed the same axes the keys and the pad feed.
  if(touchEnabled&&!touchPad)touchPad=createTouchControls({
   onAxes:(axes:any)=>player?.setTouch(axes),onAttack:()=>attack(),onAttackHold:(on:boolean)=>arsenal?.hold(on&&!driving),onWeapon:()=>cycleWeapon(1),onWheel:(kind:string,x:number,y:number)=>onWheel(kind,x,y),
   onDrive:()=>toggleDrive(),onExit:()=>exitPlayer(),onRadio:(d:number)=>tuneRadio(d)});
  touchPad?.setDriving(false);touchPad?.show();
  const sim=trafficEntry.hooks.current?.sim;
  if(sim&&!playerCar)ensureCar();
  playerMode=true;combatDeathReported=false;controls.enabled=false;player.attach(canvas,{onExit:()=>exitPlayer(),onDrive:()=>toggleDrive(),onAttack:(o:any)=>attack(o),onAttackHold:(on:boolean,o:any)=>arsenal?.hold(on&&!driving,o),
   onLockFlick:(d:string)=>arsenal?.lockFlick(d),onLockGyro:(y:number,p:number)=>arsenal?.lockGyro(y,p),locked:()=>!!arsenal?.lock,onWeapon:(n:number)=>selectWeapon(n),onWeaponCycle:(d:number)=>cycleWeapon(d),onAim:(on:boolean,o:any)=>arsenal?.aim(on&&!driving,o),onWheel:(kind:string,x:number,y:number)=>onWheel(kind,x,y),onReload:()=>{if(!driving)arsenal?.reload();},onRoll:()=>{if(playerMode&&!driving&&!vehicleTransition.active&&melee.phase==='idle')player?.roll();},
   // C1-C4: the pad's own buttons for the siren (d-pad up), the horn alone (left stick in a car) and the map (−).
   driving:()=>driving,onRadio:(d:number)=>tuneRadio(d),onSiren:()=>{if(driving&&playerCar)police?.toggleSiren(playerCar);},onHornOnly:()=>{if(driving&&playerCar)soundscape?.horn(playerCar.state.x,playerCar.state.z);},onMap:()=>playUI?.toggleMap?.(),onCrouch:()=>{if(playerMode&&!driving&&!vehicleTransition.active)player?.crouch();},onHorn:()=>{if(driving&&playerCar&&!police?.toggleSiren(playerCar))soundscape?.horn(playerCar.state.x,playerCar.state.z);}});setPlayerHit(null);setMode('player');
  (window as any).__SHIBUYA_PLAYER__=player;(window as any).__SHIBUYA_CAR__=playerCar;
  // Foot IK is invisible from outside: a solver that never ran and a solver that ran and
  // declined to move anything look identical on screen. Under ?qa=1 the figure and the
  // surface it queries are reachable, so a check can tell those two apart.
  if(config.qa){(window as any).__SHIBUYA_FEEDBACK__=feedback;(window as any).__SHIBUYA_AUDIO__=playerAudio;(window as any).__SHIBUYA_SOUNDS__={bank:soundBank,scape:soundscape};(window as any).__SHIBUYA_MELEE__=melee;(window as any).__SHIBUYA_ARSENAL__=arsenal;(window as any).__SHIBUYA_CONTACT__=player.contact.stats;(window as any).__SHIBUYA_FIGURE__=playerFigure;(window as any).__SHIBUYA_CTX__=ctx;(window as any).__SHIBUYA_LIFE__=lifeEntry.hooks.current;(window as any).__SHIBUYA_TRAFFIC__=trafficEntry.hooks.current;}
  return true;};
 const exitPlayer=()=>{if(!playerMode)return;radio?.silence();radioSlot=null;weaponWheel.cancel();streetReactions.reset(lifeEntry.hooks.current?.sim?.pool??[]);soundscape?.silence();playUI?.hide();vehicleVisual?.hide();vehicleEffects?.hide();lifeEntry.hooks.current?.setPlayerFocus(null);followCamera.reset();melee.reset();arsenal?.reset();touchPad?.setWeapon('fists');
  // An abandoned carjack must not leave a driver half out of a car, a door hanging open, or a
  // slot frozen out of traffic for the rest of the session.
  {const was=vehicleTransition.cancel();
   if(was?.kind==='carjack'&&was.slot){abortCarjack(trafficEntry.hooks.current?.sim,was.slot);was.slot.doorPhase=0;}
   if(was&&!was.seated)playerCar?.unreserve();}
  playerMode=false;driving=false;setDriving(false);playerCar?.release();playerCar=null;carMarker?.hide();playerAudio?.silence();touchPad?.hide();player?.detach();playerMarker?.hide();playerFigure?.hide();playerShadow?.begin();playerShadow?.end();releaseCrowdSlot();delete (window as any).__SHIBUYA_PLAYER__;delete (window as any).__SHIBUYA_CONTACT__;delete (window as any).__SHIBUYA_CAR__;delete (window as any).__SHIBUYA_FIGURE__;delete (window as any).__SHIBUYA_CTX__;delete (window as any).__SHIBUYA_LIFE__;delete (window as any).__SHIBUYA_TRAFFIC__;
  view.fov=50;view.updateProjectionMatrix();controls.enabled=!config.qa;setPlayerHit(null);setMode('observe');preset(currentCamera,false);};
 resize();setTier(currentTier);setTime(clock.value);setModules(system.snapshot());
 const observer=new ResizeObserver(resize);observer.observe(mount.current);
 // PLAN-PERFORMANCE P0: ?perf=1 shows where a frame's time goes; ?perf=sweep also switches each
 // feature off in turn and records the difference; ?off=a,b keeps features off for a manual A/B.
 const perfMode=params.get('perf');const perfOff=new Set<string>();let perfProbe:any=null,perfOverlay:any=null,perfSweep:any=null,perfClock=0,perfLast:number|null=null,perfReadyFrames=0,perfSaved:any={};const perfApplied:any={};
 const perfModules:any={crowd:'life',traffic:'traffic',trains:'trains',signs:'signs',streetscape:'streetscape',nightglow:'nightglow',buildings:'buildings'};
 const applyPerfOff=(off:Set<string>)=>{perfOff.clear();for(const f of off)perfOff.add(f);
  if(renderer)renderer.shadowMap.autoUpdate=!off.has('shadow');
  PIPELINE_OFF.ao=off.has('gtao');PIPELINE_OFF.bloom=off.has('bloom');PIPELINE_OFF.smaa=off.has('smaa');
  if(roadReflection){if(off.has('mirror')){if(perfSaved.mirror===undefined)perfSaved.mirror=roadReflection.enabled;roadReflection.enabled=false;}else if(perfSaved.mirror!==undefined){roadReflection.enabled=perfSaved.mirror;delete perfSaved.mirror;}}
  const life=lifeEntry.hooks.current;
  if(life?.setHQBudget){if(off.has('hqcrowd')){if(perfSaved.hq===undefined)perfSaved.hq=life.stats?.hqCrowd?.budget??null;life.setHQBudget(0);}else if(perfSaved.hq!==undefined){if(perfSaved.hq!==null)life.setHQBudget(perfSaved.hq);delete perfSaved.hq;}}
  life?.setNearPaused?.(off.has('nearchars'));
  const paused=new Set<string>();
  for(const [feature,id] of Object.entries(perfModules) as [string,string][]){const cur:any=system.entries.get(id)?.hooks.current;const obj=cur?.root??cur?.group??(cur?.isObject3D?cur:null);
   const on=off.has(feature);if(on)paused.add(id);if(obj)obj.visible=!on;perfApplied[feature]={paused:true,hidden:!!obj};}
  (system as any).paused=paused;};
 // The probe and its panel, from ?perf= or from the 「パフォーマンス計測」 button (no URL needed).
 let perfWanted=false;
 const ensurePerf=()=>{if(perfProbe||!renderer)return !!perfProbe;perfProbe=createPerfProbe({gl:renderer.getContext()});(system as any).probe=perfProbe;perfOverlay=createPerfOverlay({onSweep:startPerfSweep});(window as any).__SHIBUYA_PERF__=perfProbe;
  const off=new Set((params.get('off')??'').split(',').filter(Boolean));if(off.size)applyPerfOff(off);return true;};
 const startPerfSweep=()=>{if(!perfProbe||perfSweep?.running)return;// ?sweep=a,b limits the features and ?sweepFrames=n the frames per step (a short headless run).
  const only=(params.get('sweep')??'').split(',').filter(Boolean),frames=Number(params.get('sweepFrames'));
  perfSweep=createPerfSweep({probe:perfProbe,apply:applyPerfOff,steps:only.length?sweepSteps(only):sweepSteps(),...(frames>0?{minFrames:frames,settle:0,measure:0}:{}),
  onDone:(r:any)=>{const payload={generated:new Date().toISOString(),url:location.search,tier:currentTier,time:clock.value,camera:publicCameraName(currentCamera),mode:playerMode?'player':'observe',
   viewport:[canvas.width,canvas.height],dpr:renderer?.getPixelRatio()??null,gpuTimer:perfProbe.gpuAvailable,userAgent:navigator.userAgent,
   renderer:(()=>{try{const gl:any=renderer?.getContext(),d=gl?.getExtension('WEBGL_debug_renderer_info');return d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):null;}catch{return null;}})(),
   applied:perfApplied,...r};(window as any).__SHIBUYA_PERF_RESULT__=payload;perfOverlay?.results(payload);perfOverlay?.save?.();console.info('[Perf sweep]',payload);}});perfSweep.begin();};
 const frameGate=new FrameGate(config.tier),drawingSize=new THREE.Vector2();let frames=0,last=performance.now(),raf=0,renderedFrames=0,readyFrames=0,latestFps:number|null=null,qaBusyNow=false;
 let timingObserver:any=null;if(s5TimingEnabled&&typeof PerformanceObserver!=='undefined'){const types=(PerformanceObserver as any).supportedEntryTypes??[];const observed=['longtask','gc'].filter(type=>types.includes(type));if(observed.length){timingObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries()){const trace=stationTimingTrace;if(trace?.active)(entry.entryType==='gc'?trace.gc:trace.longTasks).push({start:entry.startTime,duration:entry.duration,name:entry.name});}});timingObserver.observe({entryTypes:observed});}}
 const renderScene=()=>{const completeBeforeRender=startupBuildComplete();
  advanceWind(performance.now()/1000);   // RUN 12.4: street-tree wind
  // RUN 12.2: the wet road's mirror, HIGH and night only, rendered before the frame that samples it.
  const glow=nightglowEntry.hooks.current;
  roadReflection?.update(scene,view,{active:currentTier==='high'&&!!glow?.stats.active,time:performance.now()/1000,
   hide:[ground?.root,lifeEntry.hooks.current?.root,glow?.root,blood?.mesh]});
  glow?.setMirror?.(ROAD_REFLECTION_UNIFORMS.s13ReflectStrength.value/ROAD_REFLECTION.strength);if(perfOff.has('render'))return;if(!fidelity.render(system.entries.get('postprocess').enabled&&!perfOff.has('post'),!!nightglowEntry.hooks.current?.stats.active)){if(nightglowEntry.hooks.current)nightglowEntry.hooks.current.render(scene,view);else renderer?.render(scene,view);}if(startup&&renderer){const renderedAt=performance.now();startup.milestone('firstRendererFrameMs',renderedAt);const appeared=new Set(startupTrace.appearanceEvents.map((event:any)=>event.name));if(appeared.has('firstGroundVisible')&&appeared.has('firstBuildingVisible')&&appeared.has('firstHeroVisible'))startup.milestone('firstSceneFrameMs',renderedAt);if(completeBeforeRender){startup.milestone('finalSceneFrameMs',renderedAt);startup.milestone('interactiveReadyMs',renderedAt);finalizeStartupTiming();}}};
 const requiredStages=['data','ground','buildings','heroes','station','stationDetail','signs','streetscape','traffic','life','trains','construction','environment','nightglow','postprocess'];
 const requiredTimingStages=[...requiredStages,'fidelity'];
 const prerequisitesReady=()=>!!renderer&&!renderer.getContext().isContextLost()&&currentTier==='high'&&dayNight.active&&!!fidelity.pipeline&&requiredStages.every(id=>system.entries.get(id)?.status==='ready')&&!!ground&&['buildings','heroes','station','stationDetail','signs','streetscape','traffic','life','trains','construction','nightglow'].every(id=>!!system.entries.get(id)?.hooks.current)&&buildQueue.snapshot().queueLength===0&&!buildQueue.snapshot().activeBuildName;
 const startupBuildComplete=()=>{if(!startup||startupTrace.milestones.sceneBuildCompleteMs!==null)return startupTrace?.milestones.sceneBuildCompleteMs!==null;const latest=new Map<string,any>();for(const record of startupTrace.stages)if(record.endMs!==null)latest.set(record.key,record);const queue=buildQueue.snapshot();const complete=prerequisitesReady()&&startup.openStageCount===0&&queue.queueLength===0&&!queue.activeBuildName&&requiredTimingStages.every(key=>latest.get(key)?.completedSuccessfully);if(complete){startup.completeScene();renderStartupPanel();}return complete;};
 const finalizeStartupTiming=()=>{if(!startup||startupTrace.ready)return;startup.finalize();renderStartupPanel();appendStartupBoundaryDetails();console.info('[Startup Timing Report]',startupTrace);};
 const metricsFor=()=>{const info=renderer?.info,pipeline=fidelity.pipeline,trafficNow=trafficEntry.hooks.current?.stats,trainsNow=trainsEntry.hooks.current;renderer?.getDrawingBufferSize(drawingSize);return {roadReflection:roadReflection?{...roadReflection.stats}:null,tier:currentTier,time:clock.value,camera:publicCameraName(currentCamera),fps:latestFps,dpr:renderer?.getPixelRatio()??null,renderScale:PROFILES[currentTier]?.scale??null,framebufferWidth:renderer?drawingSize.x:null,framebufferHeight:renderer?drawingSize.y:null,triangles:info?.render.triangles??null,drawCalls:info?.render.calls??null,geometries:info?.memory.geometries??null,textures:info?.memory.textures??null,crowdCount:lifeEntry.hooks.current?.stats.total??null,nearCharacters:lifeEntry.hooks.current?.stats.nearCharacters??null,hqCrowd:lifeEntry.hooks.current?.stats.hqCrowd??null,melee:playerMode?melee.snapshot():null,weapons:playerMode?arsenal?.snapshot()??null:null,seatedDrivers:seatedDrivers?.inspect()??null,transition:vehicleTransition.active?{kind:vehicleTransition.kind,stage:vehicleTransition.stage}:null,lastCarjack:lastCarjack?{driverId:lastCarjack.driverId,seed:lastCarjack.seed,vehicle:lastCarjack.vehicle,thrown:!!lastCarjack.thrown,pedestrian:lastCarjack.pedestrian?.id??null,reason:lastCarjack.reason??null}:null,occupancy:trafficEntry.hooks.current?.sim?.occupancy?.inspect()??null,movingVehicles:trafficNow?.moving??null,parkedVehicles:trafficNow?.parked??null,bicycles:null,trainCars:trainsNow?Object.values(trainsNow.meshes as Record<string,any>).reduce((n:number,m:any)=>n+(m.count??0),0):null,activePointLights:fidelity.lights.filter((l:any)=>l.visible&&l.intensity>0).length,activeSpotLights:fidelity.spots.filter((l:any)=>l.visible&&l.intensity>0).length,shadowMapSize:dayNight.key.shadow.mapSize.x||null,exposure:renderer?.toneMappingExposure??null,environmentIntensity:scene.environment?scene.environmentIntensity:null,gtaoEnabled:!!pipeline&&pipeline.ao.enabled!==false,bloomEnabled:!!pipeline&&pipeline.bloom.enabled!==false,bloomStrength:pipeline?.bloom.strength??null,bloomThreshold:pipeline?.bloom.threshold??null,smaaEnabled:!!pipeline&&pipeline.smaa.enabled!==false};};
 const frameSamples=createFrameSamples();
 const waitFrames=(count:number)=>waitForRenderedFrames({count,getFrame:()=>renderedFrames,isDisposed:()=>disposed});
 const samplePerformance=async(count=120)=>{frameSamples.begin(count);await waitFrames(count+1);const result=frameSamples.snapshot();if(!result.complete)throw new Error('Incomplete frame sample; keep the tab visible');return result;};
 const capture=async({download=true}:{download?:boolean}={})=>{const api=(window as any).__SHIBUYA_QA__;if(!api?.ready)throw new Error('Shibuya QA is not ready');if(qaBusyNow)throw new Error('Shibuya QA capture is already running');qaBusyNow=true;const restore={camera:currentCamera,time:solar.phase};try{const initial=metricsFor(),captures=[];for(const item of QA_CAPTURES){preset(item.camera,false);solar.select(item.time,false);await waitFrames(3);const frameTiming=await samplePerformance();renderScene();const blob=await canvasToPng(canvas);captures.push({...item,camera:publicCameraName(item.camera),metrics:{...metricsFor(),frameTiming,playableLoading:vehicleVisual?.inspect?.()??{status:"idle",requests:0}},blob});}const metrics={...initial,captures:captures.map(({blob,...item})=>item)};const pack=await createQAPack(captures,metrics);if(download)downloadBlob(pack.zip,'shibuya-qa-pack.zip');return Object.freeze({files:pack.files.map((file:{name:string})=>file.name),metrics,zip:pack.zip,captures:Object.freeze(captures.map(c=>Object.freeze({file:c.file,blob:c.blob})))});}finally{if(!disposed){preset(restore.camera,false);solar.select(restore.time,false);}qaBusyNow=false;}};
 let qaApi:any=null;if(config.qa){qaApi=Object.freeze({get ready(){return qaReadyRef;},get tier(){return currentTier;},get time(){return clock.value;},get camera(){return publicCameraName(currentCamera);},get metrics(){return Object.freeze(metricsFor());},get playableLoading(){return vehicleVisual?.inspect?.()??{status:"idle",requests:0};},capture,
  // Headless stills: a software renderer takes seconds a frame and the game advances one clamped
  // step per frame, so a capture turns drawing off to let the game run, and on again for a still.
  render(on:boolean){if(on)perfOff.delete("render");else perfOff.add("render");return !perfOff.has("render");},
  get frames(){return renderedFrames;},
  // {dist, height, yaw (from the player's heading), target (height looked at)} or null for the follow camera.
  view(v:any){qaView=v?{...v}:null;return !!qaView;}});(window as any).__SHIBUYA_QA__=qaApi;(window as any).__SHIBUYA_MIRROR__=roadReflection;}
 // ?diag=1 (or ?pad=1, which opens straight on the controller tab) -- a panel that can be
 // read and driven with a thumb, because "why will the car not move?" gets asked on a phone
 // where there is no console. Its own controls feed the same axes the keys and the pad do,
 // so an input problem can be told apart from a blocked car without a keyboard.
 let diag:any=null;
 if(diagEnabled){
  const blockedBy=()=>{const sim=trafficEntry.hooks.current?.sim;if(!sim||!playerCar?.state.active)return null;
   const c=playerCar.state,s=Math.sin(c.heading),k=Math.cos(c.heading);
   const nx=c.x+s*(playerCar.def.length/2+1.2),nz=c.z+k*(playerCar.def.length/2+1.2);
   let cars=0;for(const v of sim.pool){if(!v.active||v===c.slot)continue;if(Math.hypot(v.x-nx,v.z-nz)<4)cars++;}
   return {cars};};
  diag=createDiagnostics({tab:diagTab,
   source:()=>{const c=playerCar?.state;
    return {playerMode,driving,fps:latestFps,struck:struckCountRef,
     input:player?player.input():null,
     speed:c?.speed??0,stalled:!!c?.stalled,damage:c?.damage??0,type:c?.type??'—',
     x:c&&driving?c.x:(player?.state.x??0),z:c&&driving?c.z:(player?.state.z??0),
     blockedBy:c?.stalled?blockedBy():null,reach:playerReach,hasCar:!!playerCar};},
   onKey:(what:string)=>{if(what==='drive')toggleDrive();else exitPlayer();}});
  (window as any).__SHIBUYA_DIAG__=diag;
 }
 let qaButton:HTMLButtonElement|null=null;if(config.qa){qaButton=document.createElement('button');qaButton.className='qa-capture';qaButton.type='button';qaButton.disabled=true;qaButton.textContent='Preparing QA…';qaButton.addEventListener('click',async()=>{if(!qaButton)return;qaButton.disabled=true;qaButton.textContent='Generating QA Pack…';try{await capture();}catch(e){console.error('[Visual QA Capture]',e);setError(String(e));}finally{if(qaButton){qaButton.disabled=!qaReadyRef;qaButton.textContent=qaReadyRef?'Generate QA Pack':'Preparing QA…';}}});document.body.appendChild(qaButton);}
 const qaButtonTimer=config.qa?window.setInterval(()=>{if(!qaButton||qaBusyNow)return;qaButton.disabled=!qaReadyRef;qaButton.textContent=qaReadyRef?'Generate QA Pack':'Preparing QA…';},250):0;
 let carSpeedLast=0,damageLast=0,struckCountRef=0,meleeHitsLast=0,playerReach:any=null;
 // Impact feedback. The shake decays rather than being keyframed, so repeated hits stack
 // into a rattle instead of restarting a canned wobble.
 // RUN 11.4: a person is not a wall. Per-person shake used to be multiplied by how many were hit
 // in the frame, so a crowd pinned the camera at full shake (0.42 m of throw). Now one bounded
 // knock per frame of contact, and a smaller, sharper one for a landed punch.
 const SHAKE_SHOT=.06,SHAKE_BUMP=.05,SHAKE_PER_HIT=.12,SHAKE_PERSON_MAX=.45,SHAKE_PUNCH=.07,SHAKE_PUNCH_MAX=.25,SHAKE_FALL=2.6,SHAKE_THROW=.42;
 // RUN 12.5: the OS "reduce motion" setting quarters every camera knock; ?shake=0 removes it.
 const SHAKE_SCALE=params.get('shake')==='0'?0:(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches?.25:1);
 let shake=0,lastAccidentWitness=-Infinity;const hitStop=createHitStop();
 // RUN 11.3/11.4: everything the feedback bus delivers, turned into sound and a camera knock.
 // Voices go through the simulation's own queue, so its per-person cooldown and the voices'
 // concurrency cap and priorities apply to them like any other shout.
 feedback.on((e:any)=>{
  const sim=lifeEntry.hooks.current?.sim,who=e.id!=null?sim?.pool?.[e.id]:null;
  switch(e.kind){
   case 'punch_swing':if(!soundscape?.event(e,who))playerAudio?.swing(e.intensity);break;
   case 'punch_hit':if(who&&!who.officer)streetReactions.provoke(who,'hurt');if(!soundscape?.event(e,who))playerAudio?.punchHit(e.intensity);shake=Math.min(SHAKE_PUNCH_MAX,shake+SHAKE_PUNCH*(.6+.4*e.intensity));break;
   // PLAN-WEAPONS W1: the katana. A cut lands like a heavy blow; steel on a wall clanks and sparks.
   case 'blade_hit':if(who)streetReactions.provoke(who,'hurt');player?.rumble?.('cut');if(!soundscape?.event({...e,kind:'punch_hit'},who))playerAudio?.punchHit(1);shake=Math.min(SHAKE_PUNCH_MAX,shake+SHAKE_PUNCH*1.2);
    // §9ai: the cut catches (hit-stop), bleeds where the blade met them, and sounds like a cut.
    hitStop.hit('katana');playUI?.hitMarker?.(false);
    {const y=(who?.height??0)+(who?.hitZone==='head'?1.6:who?.hitZone==='legs'?.6:1.2);
     arsenal?.effects.blood(e.x,y,e.z,{dir:{x:who?.hitX??0,y:-.2,z:who?.hitZ??1},count:26,spread:.5});gunfire?.slice(e.x,y,e.z,1);}
    break;
   // §9ai: a round into a body: it catches, and thumps (the blood is drawn by the arsenal at the hit point).
   case 'bullet_hit':if(who)streetReactions.provoke(who,'hurt');hitStop.hit(arsenal?.current==='smg'?'smg':'pistol');gunfire?.flesh(e.x,1.2+(who?.height??0),e.z,arsenal?.current==='smg'?.7:1);break;
   // Stage 1: a death -- the kill marker, and blood spreading under where the body comes to lie.
   case 'npc_killed':playUI?.hitMarker?.(true);
    {const gx=e.x+(e.dirX??0)*.45,gz=e.z+(e.dirZ??0)*.45,h=lifeEntry.hooks.current?.network?.ctx?.height?.(gx,gz)??0;arsenal?.marks.pool(gx,h,gz);}break;
   case 'blade_clank':arsenal?.event(e);gunfire?.clank(e.x,1.2,e.z);shake=Math.min(SHAKE_PUNCH_MAX,shake+SHAKE_PUNCH);break;
   case 'player_bump':soundscape?.event(e,who);shake=Math.min(SHAKE_PUNCH_MAX,shake+SHAKE_BUMP*e.intensity);break;
   case 'vehicle_impact':if(!soundscape?.event(e,who))playerAudio?.bodyImpact(e.intensity);break;
   case 'vehicle_runover':if(!soundscape?.event(e,who))playerAudio?.runover(e.intensity);break;
   case 'pain_voice':if(who)sim.say(who,'pain',e.intensity);break;
   case 'crowd_gasp':if(who)sim.say(who,'gasp',.6);break;
   case 'panic_voice':if(who)sim.say(who,'alert',Math.max(.6,e.intensity));break;
   // pedestrian_scream: the simulation already screams on a strike; the event is for listeners
   // that want to know, not a second voice.
  }
 });
 let lastPlayTick=performance.now();let wheelTime=1;let qaReadyRef=false;const frame=(now:number)=>{if(disposed)return;const gateDt=frameGate.step(now);if(gateDt===null){raf=requestAnimationFrame(frame);return;}
 // Stage 1: the world slows while the weapon wheel is open.
 wheelTime+=((weaponWheel.open?WHEEL.slow:1)-wheelTime)*Math.min(1,gateDt*12);const dt=gateDt*wheelTime;
 // Roadmap stage 4: how many people are out follows the time of day.
 lifeEntry.hooks.current?.sim?.setPopulation?.(populationFor(clock.value));const frameStart=performance.now(),updateStart=frameStart;const playElapsed=document.hidden?0:Math.max(0,(now-lastPlayTick)/1000);lastPlayTick=now;frameHits=0;{const s=lifeEntry.hooks.current?.sim;if(s)s.postUpdate=null;}
 if((perfMode||perfWanted)&&!perfProbe&&renderer)ensurePerf();
 perfProbe?.frameStart();perfProbe?.begin('player');if(playerMode&&player)player.updateInput(dt);if(playerMode&&player){view.getWorldDirection(viewDirection);timed('s1-arsenal',()=>arsenal?.frame(dt,{player,figure:playerFigure,driving:driving||!!vehicleTransition.active,world:weaponWorld,
  camera:{position:view.position,direction:viewDirection},touch:touchEnabled&&document.pointerLockElement!==canvas,pad:player.lastDevice==='pad',time:lifeEntry.hooks.current?.sim?.time??0}));
  // Item 3: a pad's hard lock keeps the target in view -- the camera turns onto them.
  {const l=arsenal?.lock;if(l){const s=player.state;const dh=Math.atan2(l.x-s.x,l.z-s.z)-s.heading;s.heading+=Math.atan2(Math.sin(dh),Math.cos(dh))*Math.min(1,dt*10);}}
  BLOOM_KICK.value=arsenal?.effects.kick??0;}else BLOOM_KICK.value=0;if(playerMode&&player){
  if(vehicleTransition.active){const pose=vehicleTransition.update(dt);if(pose){
    // The DOOR comes from the stage, not from the overall phase. `sin(phase * PI)` opened the
    // panel as the player started walking and had it shut again by the time they sat down,
    // which is the wrong shape for a door however smooth it is.
    if(playerCar?.state)playerCar.state.doorPhase=pose.doorPhase;
    player.state.vehicleKind=pose.kind;player.transitionTo(pose.x,pose.z,pose.heading,pose.phase);
    // The carjack's consequences hang off stage CHANGES, so a long frame that crosses two
    // stages still fires both in order rather than skipping the one in the middle.
    if(pose.kind==='carjack'&&pose.stage!==carjackStage){
     const slot=pose.slot,traffic=trafficEntry.hooks.current?.sim,crowd=lifeEntry.hooks.current?.sim;
     const from=carjackStage;carjackStage=pose.stage;
     const order=['ALIGN','DOOR_OPEN','GRAB','PULL','THROW','ENTRY','SEAT','DOOR_CLOSE'];
     const wasAt=from?order.indexOf(from):-1;
     for(let step=wasAt+1;step<=order.indexOf(pose.stage);step++){
      const name=order[step];
      if(name==='GRAB')alertDriver(traffic,slot);
      else if(name==='PULL')beginExtraction(traffic,slot);
      else if(name==='THROW'){
       // No scream is raised here on purpose: `crowd.strike` already says one, through the
       // simulation's own voice path. The call that used to be here passed a pedestrian where
       // `say` wanted a kind, and threw inside the frame loop every time a driver was pulled
       // out -- which took the rest of that frame with it, so the player never reached the seat.
       lastCarjack=throwDriverOut(traffic,crowd,slot,carjackSide);police?.carjack(slot,traffic);
      }
     }
    }
    // The body is drawn on foot right up until it is in the seat, and the car draws it after.
    // The old sequence hid the player only at the very end, so a figure stood in the doorway
    // while the door shut through it.
    transitionSeated=pose.kind!=='exit'&&pose.seated;
    if(pose.kind!=='exit'&&pose.seated){if(!seatedHidden){seatedHidden=true;playerFigure?.hide();playerShadow?.begin();playerShadow?.end();carMarker?.hide();}}
    else {seatedHidden=false;playerFigure?.update(player.state,dt);groundPlayerShadow();}
    if(pose.done&&pose.kind!=='exit'){
     // CONTROL TRANSFERS HERE, at the end, with the door shut and the body in the seat --
     // not at the button press. `commit` asks the occupancy model whether the seat is free
     // and refuses if it is not, so a car whose driver is still in it cannot be driven away.
     seatedHidden=false;transitionSeated=false;
     if(playerCar.commit()){driving=true;player.state.vehiclePhase=0;playerCar.state.doorPhase=0;
      playerFigure?.hide();playerShadow?.begin();playerShadow?.end();carMarker?.hide();
      setDriving(true);touchPad?.setDriving(true);struckCountRef=0;setStruckCount(0);}
     else {playerCar.unreserve();playerFigure?.update(player.state,dt);groundPlayerShadow();}
    }
    else if(pose.done){transitionSeated=false;player.state.vehiclePhase=0;if(playerCar?.state)playerCar.state.doorPhase=0;
     // The seat is empty the moment the body is standing on the pavement. The car is still
     // the player's -- it is still drawn as theirs and still offered back as 'own' -- but a
     // car nobody is sitting in must not report an occupant.
     if(pose.kind==='exit')playerCar?.vacateSeat();}}}
  else if(driving&&playerCar){const drive=player.input();playerCar.step(dt,drive);const c=playerCar.state;player.rideTo(c.x,c.z,c.heading);playerMarker?.update(c,dt,playerCar.def.height);
   const crowdSim=lifeEntry.hooks.current?.sim;playerCar.alertPedestrians(crowdSim);
   // claude/crowd-realism: the people in front of the car really get out of its way (sim.flee).
   crowdSim?.vehicleThreat?.(playerCar.state,playerCar.def);lifeEntry.hooks.current?.hqCrowd?.vehicle(playerCar.state,dt);
   const struck=playerCar.strikePedestrians(crowdSim);
   frameHits=struck;
   // RUN 11.3/11.4: what this step's contacts mean to the rest of the street.
   {const imps=playerCar.impacts,now=crowdSim?.time??0;let top:any=null;
    for(const e of imps){feedback.emit(e.kind==='runover'?'vehicle_runover':'vehicle_impact',now,{x:e.x,z:e.z,intensity:Math.min(1,e.closing/12),id:e.id});
     if(e.kind!=='runover'&&(!top||e.closing>top.closing))top=e;}
    if(top){vehicleEffects?.dust?.(top.x,c.y??0,top.z,Math.min(1,top.closing/12));
     if(top.kind!=='push'){feedback.emit('pedestrian_scream',now,{x:top.x,z:top.z,intensity:1,id:top.id});
      // Witnesses to an accident: bounded to one pass every quarter second however many go over
      // the bonnet, because each pass rebuilds the crowd grid.
      if(now-lastAccidentWitness>=.25){lastAccidentWitness=now;
       const n=lifeEntry.hooks.current?.witness?.({x:top.x,z:top.z,severity:Math.min(1,.55+top.closing/15),radius:16,kind:'vehicle'})??0;
       // ...and the ones nearest it actually scatter, rather than only looking scared.
       crowdSim?.panic?.(top.x,top.z,{radius:9,severity:Math.min(1,.55+top.closing/15)});
       if(n>=3){const near=crowdSim?.pool?.find((p:any)=>p.active&&p.id!==top.id&&p.struck===undefined&&Math.hypot(p.x-top.x,p.z-top.z)<8);
        if(near)feedback.emit('crowd_gasp',now,{x:near.x,z:near.z,intensity:.7,id:near.id});}}}}}
   if(struck){struckCountRef+=struck;setStruckCount(n=>n+struck);
    // A hit you can feel: the road is marked, the camera is shoved, and the car loses a
    // little of what it was carrying. All three scale with how fast it was taken.
    const force=Math.min(1,Math.abs(c.speed)/playerCar.def.speed);
    if(shake<SHAKE_PERSON_MAX)shake=Math.min(SHAKE_PERSON_MAX,shake+SHAKE_PER_HIT*(.4+force));
    // RUN 11.1: the car's speed loss is per contact now, inside strikePedestrians, where each
    // body's closing speed and the car's mass are known. A flat bleed here on top of it
    // counted every frame with a hit twice.
   }
   // The crowd queues a mark where a body is caught and another where it stops sliding;
   // draining it here keeps the simulation free of anything that draws.
   // An impact is a step that lost its speed: compare before and after rather than having
   // the vehicle call back into the app.
   if(carSpeedLast>1&&Math.abs(c.speed)<carSpeedLast*.3){if(!soundscape?.crash(c.x,c.z,carSpeedLast/Math.max(1,playerCar.def.speed)*1.6))playerAudio?.impact(carSpeedLast,playerCar.def.speed);vehicleEffects?.impact(c);shake=Math.min(1,shake+.2);player?.rumble?.('crash',Math.min(1,carSpeedLast/12));}
   carSpeedLast=Math.abs(c.speed);
   playerAudio?.engine(c.speed,playerCar.def.speed,Math.max(0,drive.forward),c.damage,playerCar.def.engine);
   if(playerCar.state.damage!==damageLast){damageLast=playerCar.state.damage;setCarDamage(damageLast);}
   // Stage 6: a pane gone in the crash -- the glass, and its sound.
   if(c.glassEvent){const g=c.glassEvent;c.glassEvent=null;playerAudio?.glass?.(g.kind==='shatter'?1:.45);
    if(g.kind==='shatter')arsenal?.effects?.glass?.(c.x+Math.sin(c.heading)*1.2,(c.y??0)+1.1,c.z+Math.cos(c.heading)*1.2,{dir:{x:Math.sin(c.heading),y:.3,z:Math.cos(c.heading)},count:36});}
   // Stage 6: on two wheels the rider is on show, astride the bike and leaning with it...
   if(playerCar.def.twoWheel&&playerFigure){riderLean+=(bikeLean(c.speed,c.yawRate)-riderLean)*(1-Math.exp(-6*dt));
    const [,ry,rz]=BODY.ride.root,lx=-ry*Math.sin(riderLean),ly=ry*Math.cos(riderLean),sh=Math.sin(c.heading),ch=Math.cos(c.heading);
    Object.assign(rider,{x:c.x+lx*ch+rz*sh,y:(c.y??0)+ly,z:c.z-lx*sh+rz*ch,heading:c.heading,riderLean,weapon:player.state.weapon});
    playerFigure.update(rider,dt);}
   // ...and a hard enough hit throws them off it.
   // A rider shot dead falls off too (the police's rounds reach a rider: director.mjs).
   if(playerCar.def.twoWheel&&player.state.alive===false&&!c.thrownOff)c.thrownOff={speed:0,heading:c.course??c.heading,nx:0,nz:0};
   if(c.thrownOff){const t=c.thrownOff;c.thrownOff=null;driving=false;playerAudio?.silence();playerCar.state.speed=0;playerCar.sync();playerCar.vacateSeat();setDriving(false);touchPad?.setDriving(false);riderLean=0;
    const fx=Math.sin(t.heading),fz=Math.cos(t.heading);player.place(c.x-fz*.9,c.z+fx*.9,t.heading);
    if(player.state.alive!==false)player.knockDown({x:c.x,z:c.z,heading:t.heading,speed:Math.max(t.speed,8),type:'motorbike'});
    if(!player.state.alive&&!combatDeathReported){combatDeathReported=true;setPlayerHit(player.state.hitBy??'motorbike');}
    playerFigure?.update(player.state,0);groundPlayerShadow();}}
  else{player.step(dt);playerCar?.keepOwn?.(dt,player.state.x,player.state.z);{const s=lifeEntry.hooks.current?.sim;if(s)s.postUpdate=(d:number)=>player.settleCrowd(d);}if(player.state.alive)combatDeathReported=false;yieldToPlayer(lifeEntry.hooks.current?.sim,player.state,player.contact.nearby);// §9ai H1: the player's swing and body run on the hit-stopped clock; the world does not.
  const hitDt=hitStop.scale(dt);const combat=timed('melee',()=>melee.update(hitDt,lifeEntry.hooks.current?.sim,player));if(combat.hits>meleeHitsLast){meleeHitsLast=combat.hits;}timed('figure',()=>playerFigure?.update(player.state,hitDt));groundPlayerShadow();
   if(!player.state.alive&&!combatDeathReported){combatDeathReported=true;setPlayerHit(player.state.hitBy??'fight');}
   playerMarker?.update(player.state,dt,PLAYER_HEIGHT);
   // Nothing on screen said where the car was: the orange cone is over the player, so a
   // distance with no direction is not much help. The car gets a cone of its own, in its own
   // colour, for as long as the player is out of it.
   ensureCar();
   if(playerCar?.state.active)carMarker?.update(playerCar.state,dt,playerCar.def.height);
   else carMarker?.hide();
   const entry=playerCar?.nearestEntry(player.state.x,player.state.z)??null;
   touchPad?.setReach(entry);
   // Only the numbers: the entry carries the whole vehicle slot, and the panel's Copy JSON
   // would otherwise hand back a few hundred lines of lane bookkeeping.
   playerReach=entry?{distance:entry.distance,range:entry.range,inRange:entry.inRange,kind:entry.kind}:null;}
  // Stage 6: the radio plays while the player is in a car, on that car's station.
  if(radio){const slot=driving?playerCar?.state.slot:null;if(slot&&slot!==radioSlot){radio.tune(stationFor(slot));slot.radio=radio.station;}radioSlot=slot;
   timed('s6-radio',()=>radio.update(dt,{on:!!slot}));if(slot)playUI?.setRadio(radio.nowPlaying(),dt);else playUI?.hideRadio?.();}
  syncCrowdSlot(dt);timed('s6-vehicle-visual',()=>vehicleVisual?.update(playerCar?.state,dt));vehicleEffects?.setLight?.(clock.value==='night'?.3:clock.value==='dusk'?.6:1);vehicleEffects?.update(dt,playerCar?.state);lifeEntry.hooks.current?.setPlayerFocus(player.state);
  localCrowdClock+=dt;if(localCrowdClock>=.1){settleNearbyWaiters(lifeEntry.hooks.current?.sim,player.state,localCrowdClock);localCrowdClock=0;}
 }blood?.update(dt);perfProbe?.end('player');if(!qaBusyNow)system.update(dt);perfProbe?.begin('player-late');
 if(playerMode&&player){const crowdSim=lifeEntry.hooks.current?.sim;const queue=crowdSim?.splashes;if(queue?.length){for(const q of queue)blood?.splash(q.x,q.y,q.z,q.dx,q.dz,q.scale,q.life);queue.length=0;}
  feedback.drain();
  const said=crowdSim?.voices;if(said?.length){const ear={x:view.position.x,z:view.position.z,fx:Math.sin(player.state.heading),fz:Math.cos(player.state.heading)};for(const v of prioritise(said,ear))crowdVoices?.say(v.kind,v.id,v.x,v.z,ear,v.urgency);said.length=0;}
  if(soundscape){view.getWorldDirection(earFacing);const flat=Math.hypot(earFacing.x,earFacing.z)||1;
   soundscape.update(dt,{ear:{x:view.position.x,y:view.position.y,z:view.position.z,fx:earFacing.x/flat,fz:earFacing.z/flat},
    player:driving?null:player.state,car:driving?playerCar?.state:null,people:crowdSim?.pool,cars:trafficEntry.hooks.current?.sim?.pool,
    pedestrianGreen:crowdSim?.signals?.phase?.()[0]==='PEDESTRIAN'});}
  timed('hud',()=>playUI?.update(playElapsed,player.state,playerCar?.state,driving,playerReach,frameHits));
  // Roadmap stage 5: the mission board, the pay, the shop at its door, the bill for dying or arrest.
  if(board){const pay=timed('s5-missions',()=>board.tick(playElapsed,missionWorld()));const snap=board.snapshot();playUI?.setMission(snap);
   if(pay>0){wallet.earn(pay,snap.id);progress.completed[snap.id]=(progress.completed[snap.id]??0)+1;progress.best[snap.id]=Math.max(progress.best[snap.id]??0,pay);persist();}}
  if(wasAlive&&player.state.alive===false){wallet.penalty(player.state.hitBy==='arrested'||player.state.hitBy==='police'?'arrest':'death');persist();}wasAlive=player.state.alive!==false;
  playUI?.setMoney?.(wallet.money,player.state.armor??0);
  if(door)playUI?.setShop?.(!driving&&player.state.alive!==false&&Math.hypot(player.state.x-door.x,player.state.z-door.z)<=SHOP.reach);
  // Roadmap ④: a pad's hard lock puts the reticle on the person, where the round goes -- not at the
  // middle of the screen, which the shoulder camera keeps off them.
  let reticleAt:any=null;{const l=arsenal?.lock;if(l&&!driving){const v=lockReticle.set(l.x,l.y,l.z).project(view);
   if(v.z<1&&Math.abs(v.x)<=1&&Math.abs(v.y)<=1){const r=canvas.getBoundingClientRect();reticleAt={x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};}}}
  if(arsenal)playUI?.setWeapon(arsenal.snapshot(),{aiming:player.state.aim>0&&!driving,locked:player.state.aimLock!=null,spread:arsenal.spread,at:reticleAt,threat:(arsenal?.lock?.tier??2)<2});
  // C4: losing health shakes the pad; C1: the HUD's hints follow the pad in use.
  if((player.state.health??100)<healthLast)player.rumble?.('hurt');healthLast=player.state.health??100;
  {const profile=player.lastDevice==='pad'?player.padProfile:'keyboard',key=profile+(driving?':car':':foot');if(key!==hintKey){hintKey=key;playUI?.setControls?.(controlHints(profile,driving));}}
  // A round fired at the player -- an officer's revolver, or (stage 2) an armed civilian's handgun: the
  // flash, the streak and where it went, the shot with the street's echo; a hit bleeds and knocks the view.
  const enemyShot=(e:any)=>{if(e.kind!=='warn'&&e.kind!=='shot')return;lastGunshotAt=lifeEntry.hooks.current?.sim?.time??0;
    // The flash from the drawn revolver's own muzzle when a near body draws the officer; the
    // director's estimate (in front of the chest) otherwise.
    if(lifeEntry.hooks.current?.muzzleOf?.(e.officer.id,weaponMuzzle,weaponBarrel)){const lift=e.to.y-e.from.y;e.from={x:weaponMuzzle.x,y:weaponMuzzle.y,z:weaponMuzzle.z};if(e.kind==='warn')e.to={x:e.from.x,y:e.from.y+lift,z:e.from.z};}
    const dx=e.to.x-e.from.x,dy=e.to.y-e.from.y,dz=e.to.z-e.from.z,l=Math.hypot(dx,dy,dz)||1,dir={x:dx/l,y:dy/l,z:dz/l};
    arsenal?.effects.muzzle(e.from.x,e.from.y,e.from.z,dir);
    let end=e.to;
    // Roadmap ②: a round into the player's car strikes it where the line meets it -- a dent, a crack or
    // a pane gone (stage 6) -- and, into the cabin, the driver bleeds.
    if(e.kind==='shot'&&e.car){const r=castShot({from:e.from,dir,range:WEAPONS.revolver.range,solid:weaponWorld.solid,ground:weaponWorld.ground,cars:weaponWorld.cars,dimsOf:weaponWorld.dimsOf});
     if(r.kind==='car'){end=r.point;const g=weaponWorld.shootCar(r.target,r.point,r.dir);
      if(g?.kind==='glass')arsenal?.effects.glass?.(end.x,end.y,end.z,{dir:r.dir,count:g.glass==='shatter'?40:8});else arsenal?.effects.burst(end.x,end.y,end.z,{count:12,nx:-dir.x,nz:-dir.z});}}
    if(e.kind==='shot'&&!e.hit){const r=castShot({from:e.from,dir,range:WEAPONS.revolver.range,solid:weaponWorld.solid,ground:weaponWorld.ground,cars:weaponWorld.cars,dimsOf:weaponWorld.dimsOf});
     end=r.point;if(r.kind!=='none')arsenal?.effects.burst(end.x,end.y,end.z,{count:8,nx:-dir.x,nz:-dir.z});}
    if(e.kind==='shot')arsenal?.effects.tracer(e.from,end);
    gunfire?.shot(e.from.x,e.from.y,e.from.z,Math.atan2(dir.x,dir.z),{kind:'revolver',hit:e.kind==='shot'&&!e.hit?{kind:'wall',point:end}:null});
    if(e.hit&&(!driving||playerCar?.def?.twoWheel||e.cabin)){if(e.civilian)player.hurt?.(e.damage,'fight');weaponWorld.bleed({x:player.state.x,y:0,z:player.state.z},dir);shake=Math.min(SHAKE_PUNCH_MAX,shake+SHAKE_PUNCH*1.4);}};
  // Roadmap stage 2 (street-reactions.mjs): hands up at gunpoint, and the armed few shooting back.
  {const crowdNow=lifeEntry.hooks.current?.sim;
   for(const e of timed('s2-reactions',()=>streetReactions.update(dt,{crowd:crowdNow,me:{x:player.state.x,y:player.state.y,z:player.state.z,alive:player.state.alive!==false,dodging:!!player.state.dodging},
    aimedId:driving?null:arsenal?.aimedAt??null,shotAt:frameShotAt,solid:weaponWorld.solid})))enemyShot(e);
   frameShotAt=null;
   // What a falling body can strike besides the ground: the walls, and the cars near the player.
   ragdollCars.length=0;for(const v of (trafficEntry.hooks.current?.sim?.pool??[])){if(!v.active||Math.abs(v.x-player.state.x)>40||Math.abs(v.z-player.state.z)>40)continue;const d=(VEHICLES as any)[v.type];if(d)ragdollCars.push({x:v.x,z:v.z,y:v.y??0,heading:v.heading,width:d.width,length:d.length,height:d.height});}
   setRagdollWorld({solid:weaponWorld.solid,cars:ragdollCars});
   // Roadmap stage 4: once it is quiet, people stop to film or call it in; with no chase on, an
   // ambulance and a patrol car come for the dead and the blood is washed away.
   timed('s4-onlookers',()=>onlookers.update(crowdNow,{lastGunshotAt}));
   timed('s4-aftermath',()=>aftermath.update(dt,{traffic:trafficEntry.hooks.current?.sim,crowd:crowdNow,stars:police?.wanted?.state?.stars??0,marks:arsenal?.marks}));}
  if(police){policeFrustum.setFromProjectionMatrix(policeMatrix.multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse));
   const w=timed('s3-police',()=>police.frame(dt,{player:player.state,car:playerCar,driving,melee:melee.snapshot(),weapons:arsenal?.snapshot()??null,solid:weaponWorld.solid,traffic:trafficEntry.hooks.current?.sim,crowd:crowdSim,listener:{x:view.position.x,z:view.position.z,vx:0,vz:0},visible:inView,hurt:(n:number,src:string,o:any)=>{if(!driving||playerCar?.def?.twoWheel||o?.cabin)player.hurt?.(n,src);},
    night:clock.value==='night'||clock.value==='dusk',ground:weaponWorld.ground}));
   timed('s3-heli',()=>heliMesh?.update(w.heli??{active:false},{night:clock.value==='night'||clock.value==='dusk'}));
   playUI?.setWanted(w,dt);(window as any).__SHIBUYA_POLICE__=police;
   // PLAN-WEAPONS W3: an officer's revolver -- the flash, the round's streak and where it went, the
   // recorded revolver shot with the street's echo. A hit on the player bleeds and knocks the view.
   for(const e of w.gunfire??[])enemyShot(e);
   // W2: 逮捕. Out of the car at once, frozen, and the game-over dialog with its own message;
   // 「もう一度」 wakes the player at the koban with the stars cleared.
   if(w.arrested&&!arrestedPending){arrestedPending=true;
    if(driving&&playerCar){driving=false;playerAudio?.silence();playerCar.state.speed=0;playerCar.vacateSeat();setDriving(false);touchPad?.setDriving(false);
     player.place(playerCar.state.x+2.2,playerCar.state.z,player.state.heading);playerFigure?.update(player.state,0);}
    player.state.alive=false;player.state.hitBy='arrested';combatDeathReported=true;setPlayerHit('arrested');}}
 }
 perfProbe?.end('player-late');perfProbe?.begin('drivers');
 const trafficNowForDrivers=trafficEntry.hooks.current;
 if(trafficNowForDrivers?.sim?.occupancy){
  if(!seatedDrivers){seatedDrivers=createSeatedDrivers();groups.dynamic.add(seatedDrivers.root);}
  // Focus on what is being LOOKED AT, not on where the camera is. The scramble preset sits
  // sixty metres back and above the crossing, so ranking cars by distance from the camera
  // body put every cabin outside the radius and drew nobody at all.
  seatedDrivers.update(trafficNowForDrivers.sim,
   playerMode&&player?player.state:controls.target);
 }else seatedDrivers?.hide();
 perfProbe?.end('drivers');perfProbe?.begin('camera');solar.update(dt);if(playerMode&&player){shake=Math.max(0,shake-SHAKE_FALL*dt*Math.max(.35,shake));applyPlayerCamera(dt);if(!driving&&!vehicleTransition.active)checkRunOver();}else clampView();perfProbe?.end('camera');const updateEnd=performance.now();perfProbe?.begin('render');perfProbe?.gpuBegin();renderScene();perfProbe?.gpuEnd();perfProbe?.end('render');const renderEnd=performance.now();
  // §9aj G3: feed the frame to the dynamic resolution; never during a measurement sweep.
  {const interval=dynLast===null?0:now-dynLast;dynLast=now;if(!perfSweep?.running&&dynRes.sample(interval,renderEnd-frameStart,dt)&&renderer)renderer.setPixelRatio(renderRatio(currentTier,devicePixelRatio)*dynRes.scale);}
 if(perfProbe){perfProbe.frameEnd({drawCalls:renderer?.info.render.calls??null,triangles:renderer?.info.render.triangles??null});
  const wall=perfLast===null?0:(now-perfLast)/1000;perfLast=now;
  if(perfMode==='sweep'&&!perfSweep){perfReadyFrames=prerequisitesReady()||!!lifeEntry.hooks.current?perfReadyFrames+1:0;if(perfReadyFrames>=30)startPerfSweep();}
  perfSweep?.update(wall);perfClock+=wall;
  if(perfClock>=.5){perfClock=0;perfOverlay?.update(perfProbe.summary(),{sweep:perfSweep?.running?{...perfSweep.progress,step:perfSweep.step}:null,
   context:{tier:currentTier,res:dynRes.enabled?`${Math.round(dynRes.scale*100)}%`:'fixed',mode:playerMode?'player':'observe',off:[...perfOff].join(',')||'—',crowd:lifeEntry.hooks.current?.stats.total??'—'}});}}if(config.qa)frameSamples.record(now,renderEnd-frameStart,!document.hidden);if(startupTrace&&!startupTrace.firstMeaningfulFrameMs&&renderer&&renderer.info.render.calls>0&&renderer.info.render.triangles>0){startupTrace.firstMeaningfulFrameMs=renderEnd;startupTrace.events.push({name:'first meaningful 3D frame',atMs:renderEnd,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls});}if(stationTimingTrace?.active)stationTimingTrace.frames.push({start:frameStart,updateMs:updateEnd-updateStart,renderMs:renderEnd-updateEnd,totalMs:renderEnd-frameStart,trafficActive:!!trafficEntry.hooks.current,lifeActive:!!lifeEntry.hooks.current});frames++;renderedFrames++;if(config.qa||startupTimingEnabled){if(prerequisitesReady())readyFrames++;else readyFrames=0;qaReadyRef=readyFrames>=3;if(startupTimingEnabled&&qaReadyRef)finalizeStartupTiming();}if(now-last>=500){const info=renderer?.info,fidelityStats=fidelity.snapshot();latestFps=renderer?Number((frames*1000/(now-last)).toFixed(1)):null;setNightglowReport(nightglowEntry.hooks.current?{...nightglowEntry.hooks.current.stats}:null);setEnvironmentReport(dayNight.snapshot());setStats({fps:latestFps,triangles:info?.render.triangles??null,drawCalls:info?.render.calls??null,geometries:info?.memory.geometries??null,textures:info?.memory.textures??null,...fidelityStats,tier:currentTier,dprCap:PROFILES[currentTier].dpr,currentDpr:renderer?.getPixelRatio()??null,frameCap:PROFILES[currentTier].fps,cranes:constructionEntry.hooks.current?.stats.cranes??0,constructionZones:constructionEntry.hooks.current?.stats.zones??0,bloom:currentTier==='high'?fidelityStats.bloom:nightglowEntry.hooks.current?.stats.bloomStrength??0,wetActive:nightglowEntry.hooks.current?.stats.active?nightglowEntry.hooks.current.stats.patches:0,reflectionsActive:nightglowEntry.hooks.current?.stats.active?nightglowEntry.hooks.current.stats.reflections:0,crowd:lifeEntry.hooks.current?.stats.total??0,trafficMoving:trafficEntry.hooks.current?.stats.moving??0,trafficParked:trafficEntry.hooks.current?.stats.parked??0,trains:trainsEntry.hooks.current?.stats.sets??0,signs:signsEntry.hooks.current?.stats.signCount??0,heapMB:(performance as any).memory?Number(((performance as any).memory.usedJSHeapSize/1048576).toFixed(1)):null,width:renderer?canvas.width:null,height:renderer?canvas.height:null});frames=0;last=now;}raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);
 // RUN 12.5: a hidden tab stops drawing, and now stops sounding: the recorded beds loop, so
 // without this the street kept playing in a background tab. Resumed only if it was running.
 let audioWasRunning=false;
 const visibility=()=>{lastPlayTick=performance.now();const ctx=playerAudio?.context;if(!ctx)return;
  if(document.hidden){audioWasRunning=ctx.state==='running';if(audioWasRunning)ctx.suspend?.().catch(()=>{});}
  else if(audioWasRunning&&playerMode){ctx.resume?.().catch(()=>{});audioWasRunning=false;}};document.addEventListener('visibilitychange',visibility);
 const lost=(event:Event)=>{event.preventDefault();soundscape?.silence();playerAudio?.silence();playerAudio?.context?.suspend?.().catch(()=>{});setError('WebGL context lost — reload to retry.');};canvas.addEventListener('webglcontextlost',lost);
 const decorationTier=deferredLatest((v:string)=>{if(streetTier!==v){streetTier=v;if(streetEntry.enabled){system.setEnabled('streetscape',false);system.setEnabled('streetscape',true);}}if(signTier!==v){signTier=v;if(signsEntry.enabled){system.setEnabled('signs',false);system.setEnabled('signs',true);}}if(detailTier!==v){detailTier=v;if(detailEntry.enabled){system.setEnabled('stationDetail',false);system.setEnabled('stationDetail',true);}}});
 engine.current={perf:()=>{perfWanted=true;setPresentation(true);// measure the full view the game is played in, not the inspection layout
 if(ensurePerf())startPerfSweep();else setTimeout(()=>{if(ensurePerf())startPerfSweep();},500);},preset,drive:()=>toggleDrive(),player:()=>{if(playerMode)exitPlayer();else enterPlayer();},respawn:()=>{melee.reset();arsenal?.reset();touchPad?.setWeapon('fists');const arrested=arrestedPending;arrestedPending=false;player?.revive();if(arrested&&player)player.place(KOBAN.x+1.5,KOBAN.z+1.5,0);police?.clear('respawn');combatDeathReported=false;setPlayerHit(null);},tier:(v:string)=>{const previousTier=currentTier;startup?.tierChange(previousTier,v,'tier-control');for(const id of ['fidelity','streetscape','signs','stationDetail'])startup?.setReason(id,'tier-change');currentTier=v;currentTrafficTier=v;buildingsTier=v;timingTier=v;frameGate.setTier(v);dynRes.setBudget(1000/(PROFILES[v]?.fps??60));fidelity.setTier(v);buildQueue.enqueue(()=>measureStage('fidelity','Render Fidelity Prepare',()=>fidelity.prepare()),{key:'fidelity',name:'Render Fidelity Prepare'}).catch(e=>{console.error('[S16.3 Fidelity]',e);setError('HIGH描画の準備に失敗しました。MEDIUMを選択してください。');});buildingsEntry.hooks.current?.setTier(v);setBuildingsReport(buildingsEntry.hooks.current?{...buildingsEntry.hooks.current.stats}:null);trafficEntry.hooks.current?.setTier(v);lifeEntry.hooks.current?.setTier(v);trainsEntry.hooks.current?.setTier(v);nightglowEntry.hooks.current?.setTier(v);constructionEntry.hooks.current?.setTier(v);setConstructionReport(constructionEntry.hooks.current?{...constructionEntry.hooks.current.stats}:null);resize();setTier(v);decorationTier.set(v);},time:(v:string)=>{solar.select(v);setTime(v);},toggle:(id:string,v:boolean)=>{if(playerMode&&['traffic','life','ground'].includes(id))exitPlayer();startup?.setReason(id,'manual-rebuild');const rebuildLife=id==='traffic'&&lifeEntry.enabled;if(rebuildLife){startup?.setReason('life','dependency-rebuild');system.setEnabled('life',false);}system.setEnabled(id,v);if(id==='environment'){nightglowEntry.hooks.current?.refresh();fidelity.refresh();}if(rebuildLife)system.setEnabled('life',true);setModules(system.snapshot());},capture};
 cleanup=()=>{heliMesh?.dispose();heliMesh=null;perfSweep?.cancel();perfOverlay?.dispose();if((window as any).__SHIBUYA_PERF__===perfProbe)delete (window as any).__SHIBUYA_PERF__;arsenal?.dispose();arsenal=null;police?.dispose(trafficEntry.hooks.current?.sim,lifeEntry.hooks.current?.sim);police=null;if((window as any).__SHIBUYA_POLICE__)delete (window as any).__SHIBUYA_POLICE__;roadReflection?.dispose();document.removeEventListener('visibilitychange',visibility);seatedDrivers?.dispose();seatedDrivers=null;playUI?.dispose();vehicleVisual?.dispose();vehicleEffects?.dispose();player?.detach();carMarker?.dispose();playerAudio?.dispose();crowdVoices?.dispose();if((window as any).__SHIBUYA_VOICES__===crowdVoices)delete (window as any).__SHIBUYA_VOICES__;touchPad?.dispose();blood?.dispose();if((window as any).__SHIBUYA_BLOOD__===blood)delete (window as any).__SHIBUYA_BLOOD__;diag?.dispose();if((window as any).__SHIBUYA_DIAG__===diag)delete (window as any).__SHIBUYA_DIAG__;playerMarker?.dispose();playerFigure?.dispose();playerShadow?.dispose();deferredCharacter?.dispose();if((window as any).__SHIBUYA_CHARACTER__===deferredCharacter)delete (window as any).__SHIBUYA_CHARACTER__;cancelAnimationFrame(raf);shaderWarmup?.dispose();stopShaderErrors();timingObserver?.disconnect();startupTrace?._removeLifecycle?.();if(qaButtonTimer)window.clearInterval(qaButtonTimer);decorationTier.dispose();buildQueue.dispose();observer.disconnect();unsub();dataAbort.abort();solar.dispose();fidelity.dispose();dayNight.dispose();system.dispose();controls.dispose();canvas.removeEventListener('webglcontextlost',lost);renderer?.dispose();canvas.remove();qaButton?.remove();startupPanel?.remove();if((window as any).__SHIBUYA_QA__===qaApi)delete (window as any).__SHIBUYA_QA__;if((window as any).__SHIBUYA_STARTUP_TIMING__===startupTrace)delete (window as any).__SHIBUYA_STARTUP_TIMING__;engine.current=null;};
 })().catch(e=>{if(!disposed)setError(String(e));});return()=>{disposed=true;cleanup();};},[]);
 const timingMs=(value:number)=>`${(value/1000).toFixed(3)} s`;
 const copyS5Timing=async()=>{if(!s5TimingResult)return;await navigator.clipboard.writeText(JSON.stringify(s5TimingResult,null,2));setS5TimingCopied(true);window.setTimeout(()=>setS5TimingCopied(false),1500);};
 return <main className={(presentation?"presentation":"inspection")+(mode==="player"?" playing":"")}><header><div><span className="eyebrow">SCRAMBLE CROSSING / INTERACTIVE 3D</span><h1>SHIBUYA <span>Scramble</span></h1></div><button aria-expanded={!presentation} onClick={()=>setPresentation(v=>!v)}>{presentation?"詳細設定":"シーンに戻る"}</button></header>{presentation&&<nav className="quick-views" aria-label="Scene views">{CAMERAS.filter((c:any)=>c.id!=='station'&&c.id!=='overview').map((c:any)=><button key={c.id} aria-pressed={camera===c.id} onClick={()=>engine.current?.preset(c.id)}>{c.label.replace(/CAM-0[1-8] /,'')}</button>)}<button aria-pressed={mode==="player"} onClick={()=>engine.current?.player()}>{mode==="player"?"観察に戻る":"プレイヤー"}</button><select aria-label="Quality" value={tier} onChange={e=>engine.current?.tier(e.target.value)}>{Object.keys(PROFILES).map(v=><option key={v} value={v}>{v.toUpperCase()}</option>)}</select></nav>}{mode==="player"&&<p className="player-hint">{isDriving?<>WASD で運転 ・ <kbd>S</kbd> でブレーキ／バック ・ <kbd>F</kbd> で降りる ・ <kbd>H</kbd> でクラクション ・ <kbd>Esc</kbd> で観察に戻る{struckCount>0&&<> ・ <b>接触 {struckCount}</b></>}{carDamage>.02&&<> ・ <b>損傷 {Math.round(carDamage*100)}%</b></>}</>:<>WASD で移動 ・ Shift で走る ・ <kbd>E</kbd> / クリックで攻撃 ・ <kbd>F</kbd> で乗る ・ <kbd>Esc</kbd> で観察に戻る</>}</p>}{mode==="player"&&playerHit&&<div className="game-over" role="dialog" aria-modal="true" aria-labelledby="game-over-title"><div className="game-over-panel"><strong id="game-over-title">{playerHit==="arrested"?"逮捕":"ゲームオーバー"}</strong><span>{playerHit==="arrested"?"警察に捕まりました。交番から再開します":playerHit==="fight"?"喧嘩で倒れました":playerHit==="police"?"警官に取り押さえられました":"車に轢かれました（"+playerHit+"）"}</span><button autoFocus onClick={()=>engine.current?.respawn()}>もう一度</button></div></div>}<div className="solar-controls" aria-label="時間帯">{[['dawn','🌅','明け方'],['day','☀️','昼'],['dusk','🌇','夕方'],['night','🌃','夜']].map(([id,icon,label])=><button key={id} title={label} aria-label={label} aria-pressed={time===id} onClick={()=>engine.current?.time(id)}>{icon}</button>)}</div><div className="workspace"><aside><h2>Fixed cameras</h2><div className="cameras">{CAMERAS.map((c:any)=><button key={c.id} aria-pressed={camera===c.id} onClick={()=>engine.current?.preset(c.id)}>{c.label}</button>)}</div><h2>Performance profile</h2><div className="segmented">{Object.keys(PROFILES).map(v=><button key={v} aria-pressed={tier===v} onClick={()=>engine.current?.tier(v)}>{v.toUpperCase()}</button>)}</div><button type="button" className="perf-start" onClick={()=>engine.current?.perf()}>パフォーマンス計測（約2分）</button><p className="note">押すと画面右に計測パネルが出て自動で測ります。終わると JSON が保存されます。タブを前面に出したまま操作しないでください。</p><GyroSettings/><h2>Time state</h2><div className="segmented">{['dawn','day','dusk','night'].map(v=><button key={v} aria-pressed={time===v} onClick={()=>engine.current?.time(v)}>{v.toUpperCase()}</button>)}</div><p className="note">昼夜の照明・発光を切り替えます。</p><h2>Modules</h2><div className="modules">{modules.map(m=><label key={m.id}><span>{m.id}<small>{m.status}</small></span><Switch checked={m.enabled} onCheckedChange={v=>engine.current?.toggle(m.id,v)} aria-label={m.id}/></label>)}</div></aside><section className="viewport"><div ref={mount} className="canvas"/><div className="view-label"><strong>{CAMERAS.find((c:any)=>c.id===camera)?.label}</strong><span>X east · Y up · −Z north / metres</span></div><div className="empty-label">ドラッグで視点を操作<span>ドラッグ：周回 / 右ドラッグ：移動 / ホイール：拡大</span></div>{error&&<div role="alert">{error}</div>}<div className="stats" aria-label="Performance stats">{stats?Object.entries(stats).filter(([k])=>!presentation||['fps','drawCalls','crowd','tier'].includes(k)).map(([k,v])=><div key={k}><span>{k}</span><b>{v===null?'N/A':String(v)}</b></div>):'Renderer starting…'}</div>{s5TimingVisible&&<section className="s5-timing" aria-live="polite"><h2>S5 Timing Result</h2>{s5TimingResult?<><dl><div><dt>total</dt><dd>{timingMs(s5TimingResult.breakdown.wallMs)}</dd></div><div><dt>actual compute</dt><dd>{timingMs(s5TimingResult.breakdown.actualComputeMs)}</dd></div><div><dt>duplicated S2/S3</dt><dd>{timingMs(s5TimingResult.breakdown.duplicatedS2S3Ms)}</dd></div><div><dt>rAF wait</dt><dd>{timingMs(s5TimingResult.breakdown.rafWaitMs)}</dd></div><div><dt>setTimeout wait</dt><dd>{timingMs(s5TimingResult.breakdown.setTimeoutWaitMs)}</dd></div><div><dt>other gap</dt><dd>{timingMs(s5TimingResult.breakdown.otherGapMs)}</dd></div><div><dt>yield count</dt><dd>{s5TimingResult.summary.yieldCount}</dd></div><div><dt>rAF avg</dt><dd>{s5TimingResult.summary.rafWait.average.toFixed(1)} ms</dd></div><div><dt>rAF median</dt><dd>{s5TimingResult.summary.rafWait.median.toFixed(1)} ms</dd></div><div><dt>rAF p95</dt><dd>{s5TimingResult.summary.rafWait.p95.toFixed(1)} ms</dd></div><div><dt>rAF max</dt><dd>{s5TimingResult.summary.rafWait.max.toFixed(1)} ms</dd></div></dl><button onClick={copyS5Timing}>{s5TimingCopied?'Copied':'Copy JSON'}</button></>:<p>Measuring S5…</p>}</section>}</section></div>{!presentation&&<><footer>world / dynamic / overlay <span>Reference Match</span></footer><section aria-label="Ground build statistics" style={{padding:24}}><h2>RUN S2 · Ground build</h2><pre style={{whiteSpace:'pre-wrap'}}>{groundReport?JSON.stringify(groundReport,null,2):'Ground disabled'}</pre></section><section aria-label="Buildings build statistics" style={{padding:24}}><h2>RUN S3 · Generic Buildings</h2><pre style={{whiteSpace:'pre-wrap'}}>{buildingsReport?JSON.stringify(buildingsReport,null,2):'Buildings disabled'}</pre></section><section aria-label="Hero build statistics" style={{padding:24}}><h2>RUN S4 · Hero Landmarks</h2><pre style={{whiteSpace:'pre-wrap'}}>{heroReport?JSON.stringify(heroReport,null,2):'Heroes disabled'}</pre></section><section aria-label="Station build statistics" style={{padding:24}}><h2>RUN S5 · Station Core</h2><pre style={{whiteSpace:'pre-wrap'}}>{stationReport?JSON.stringify(stationReport,null,2):'Station disabled'}</pre></section><section aria-label="Station detail statistics" style={{padding:24}}><h2>RUN S6 · Station Detail</h2><pre style={{whiteSpace:'pre-wrap'}}>{detailReport?JSON.stringify(detailReport,null,2):'Station detail disabled'}</pre></section><section aria-label="Signage statistics" style={{padding:24}}><h2>RUN S7 · Signage</h2><pre style={{whiteSpace:'pre-wrap'}}>{signReport?JSON.stringify(signReport,null,2):'Signs disabled'}</pre></section><section aria-label="Streetscape statistics" style={{padding:24}}><h2>RUN S8 · Streetscape</h2><pre style={{whiteSpace:'pre-wrap'}}>{streetReport?JSON.stringify(streetReport,null,2):'Streetscape disabled'}</pre></section><section aria-label="Traffic statistics" style={{padding:24}}><h2>RUN S9 · Traffic</h2><pre style={{whiteSpace:'pre-wrap'}}>{trafficReport?JSON.stringify(trafficReport,null,2):'Traffic disabled'}</pre></section><section aria-label="Crowd statistics" style={{padding:24}}><h2>PHASE R1 · Crowd Density / Instanced Crowd</h2><pre style={{whiteSpace:'pre-wrap'}}>{lifeReport?JSON.stringify(lifeReport,null,2):'Life disabled'}</pre></section><section aria-label="Train statistics" style={{padding:24}}><h2>RUN S11 · Background Trains</h2><pre style={{whiteSpace:'pre-wrap'}}>{trainReport?JSON.stringify(trainReport,null,2):'Trains disabled'}</pre></section><section aria-label="Environment statistics" style={{padding:24}}><h2>RUN S12 · Day / Night</h2><pre style={{whiteSpace:'pre-wrap'}}>{environmentReport?JSON.stringify(environmentReport,null,2):'Environment starting'}</pre></section><section aria-label="Nightglow statistics" style={{padding:24}}><h2>RUN S13 · Wet Night</h2><pre style={{whiteSpace:'pre-wrap'}}>{nightglowReport?JSON.stringify(nightglowReport,null,2):'Nightglow disabled'}</pre></section><section aria-label="Construction statistics" style={{padding:24}}><h2>RUN S15 · Construction / Cranes</h2><pre style={{whiteSpace:'pre-wrap'}}>{constructionReport?JSON.stringify(constructionReport,null,2):'Construction disabled'}</pre></section><S1Data report={dataReport} enabled={modules.some(m=>m.id==='data'&&m.enabled)}/></>}</main>;
}
