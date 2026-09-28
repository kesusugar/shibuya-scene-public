import {MISSIONS} from '../game/missions.mjs';
import {SHOP} from '../game/shop.mjs';
import {yen} from '../game/economy.mjs';
import {createPlayerMarker} from './marker.mjs';
import {WHEEL} from './weapon-wheel.mjs';

// Canvas minimap uses the existing road/walk network; no extra renderer or map download.
// Roadmap stage 5: the mission panel is a board (the scene runs the missions, game/missions.mjs);
// money in the dashboard; the shop's counter and the save when standing at its door.
/** Stage 6: seconds the radio's station and song stay on screen after they change. */
export const RADIO_BANNER=4;

export function createPlayUI(network,parent,{onExit,onDrive,onMission,onCancelMission,onBuy,onSave}={}){
 const marker=createPlayerMarker(0x68e7b4);parent.add(marker.mesh);let snap={status:'idle'};
 const root=document.createElement('section');root.className='play-hud';root.setAttribute('aria-label','プレイ情報');
 root.innerHTML=`<div class="play-top"><div class="play-brand">SHIBUYA <span>FREE ROAM · Tab メニュー</span></div><button class="play-exit" type="button">観察に戻る</button></div>
 <div class="play-mission"><strong class="play-mission-name">ミッション</strong><p class="play-task">受けるミッションを選んでください。</p><div class="play-mission-list">${MISSIONS.map(m=>`<button type="button" data-mission="${m.id}" title="${m.name}：${m.brief}">${m.short}<small>${yen(m.reward)}</small></button>`).join('')}</div><div class="play-task-row"><span class="play-timer"></span><button class="play-cancel" type="button" hidden>中止</button></div><progress class="play-progress" max="1" value="0" aria-label="進行" hidden></progress></div>
 <div class="play-shop" role="dialog" aria-label="コンビニ" hidden><strong>コンビニ</strong><div class="play-shop-items">${SHOP.items.map(i=>`<button type="button" data-item="${i.id}"><b>${i.name}</b><small>${i.note}</small><span>${yen(i.price)}</span></button>`).join('')}</div><p class="play-shop-msg"></p><button class="play-save" type="button">セーブする</button></div>
 <div class="play-map"><canvas width="320" height="320" aria-label="周辺地図・北が上"></canvas><span>N · 北 / 緑：目的地 / 青：車</span></div>
 <div class="play-dashboard"><div><div class="play-wanted" role="img" aria-label="手配度 0" data-stars="0" data-flash="false"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div><b class="play-speed">徒歩</b><div class="play-health" role="meter" aria-label="体力" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" data-level="ok"><span>体力</span><span class="play-health-bar"><i></i></span><b class="play-health-value">100</b></div><b class="play-money" aria-label="所持金">¥0</b><small class="play-armor" hidden></small><small class="play-weapon" data-weapon="fists">素手</small><small class="play-hint">E/クリック 攻撃 · 1/2/3/4 武器 · 右ボタン 構える · R 装填 · Q 回避 · C しゃがむ</small><small class="play-damage"></small></div><button class="play-drive" type="button">車を探す</button></div>`;
 root.insertAdjacentHTML('beforeend','<div class="play-wanted-banner" role="status" aria-live="polite" hidden></div>');
 // Stage 6: the radio -- the station and what is on, for a few seconds after tuning or a new song.
 root.insertAdjacentHTML('beforeend','<div class="play-radio" role="status" aria-live="polite" hidden><b class="play-radio-station"></b><span class="play-radio-song"></span></div>');
 // PLAN-WEAPONS W2: the crosshair, only while a gun is up. The aim is the centre of the view.
 root.insertAdjacentHTML('beforeend','<div class="play-crosshair" aria-hidden="true" hidden><i></i></div>');
 // Stage 1: the hit marker over the crosshair, the ammunition panel, and the weapon wheel.
 root.insertAdjacentHTML('beforeend','<div class="play-hitmarker" aria-hidden="true" data-kind="hit"><i></i><i></i><i></i><i></i></div>');
 root.insertAdjacentHTML('beforeend','<div class="play-ammo" role="status" aria-label="残弾" hidden><small class="play-ammo-name"></small><div><b class="play-ammo-rounds"></b><span class="play-ammo-mag"></span></div><span class="play-ammo-bar"><i></i></span></div>');
 root.insertAdjacentHTML('beforeend',`<div class="play-wheel" role="dialog" aria-label="武器を選ぶ" hidden><div class="play-wheel-ring">${WHEEL.order.map((id,i)=>`<div class="play-wheel-slot" data-slot="${id}" style="--a:${i*360/WHEEL.order.length}deg"><b></b><small></small></div>`).join('')}<div class="play-wheel-centre"><b></b><small></small></div></div></div>`);
 document.body.appendChild(root);
 const query=s=>root.querySelector(s),canvas=query('canvas'),c=canvas.getContext('2d'),task=query('.play-task'),timer=query('.play-timer'),cancel=query('.play-cancel'),missionName=query('.play-mission-name'),missionList=query('.play-mission-list'),money=query('.play-money'),armorLabel=query('.play-armor'),shop=query('.play-shop'),shopMsg=query('.play-shop-msg'),progress=query('.play-progress'),speed=query('.play-speed'),health=query('.play-health'),healthBar=query('.play-health-bar i'),healthValue=query('.play-health-value'),damage=query('.play-damage'),drive=query('.play-drive'),wanted=query('.play-wanted'),stars=[...root.querySelectorAll('.play-wanted i')],banner=query('.play-wanted-banner'),weaponLabel=query('.play-weapon'),crosshair=query('.play-crosshair'),hitmarker=query('.play-hitmarker'),ammo=query('.play-ammo'),ammoName=query('.play-ammo-name'),ammoRounds=query('.play-ammo-rounds'),ammoMag=query('.play-ammo-mag'),ammoBar=query('.play-ammo-bar i'),wheelBox=query('.play-wheel'),wheelSlots=[...root.querySelectorAll('.play-wheel-slot')],wheelCentre=query('.play-wheel-centre');
 let bannerFor=0,bannerSeq=0,lastWanted=null,shopAt=null,radioFor=0,radioKey='';
 const radioBox=root.querySelector('.play-radio'),radioStation=root.querySelector('.play-radio-station'),radioSong=root.querySelector('.play-radio-song');
 let current=null,visible=false,clock=0,disposed=false;
 query('.play-exit').onclick=()=>onExit?.();drive.onclick=()=>onDrive?.();
 for(const b of missionList.querySelectorAll('button'))b.onclick=()=>{if(current&&current.alive!==false){onMission?.(b.dataset.mission);document.exitPointerLock?.();clock=1;}};
 cancel.onclick=()=>{onCancelMission?.();clock=1;};
 for(const b of shop.querySelectorAll('[data-item]'))b.onclick=()=>{onBuy?.(b.dataset.item);};
 query('.play-save').onclick=()=>onSave?.();
 // Build once, draw at 5 Hz. The full network is not traversed each rendered frame.
 const map=document.createElement('canvas');map.width=800;map.height=800;const m=map.getContext('2d'),scale=800/500;
 if(m){m.fillStyle='#0c1821';m.fillRect(0,0,800,800);m.strokeStyle='#354d5b';m.lineWidth=2;
  m.beginPath();for(const e of network.edges){const points=e.points??[[network.nodes[e.from].x,network.nodes[e.from].z],[network.nodes[e.to].x,network.nodes[e.to].z]];points.forEach((p,i)=>m[i?'lineTo':'moveTo']((p[0]+250)*scale,(p[1]+250)*scale));}m.stroke();}
 function draw(position,car,target){if(!c)return;const extent=90,k=320/(extent*2);c.fillStyle='#0c1821';c.fillRect(0,0,320,320);c.drawImage(map,(position.x-extent+250)*scale,(position.z-extent+250)*scale,extent*2*scale,extent*2*scale,0,0,320,320);
  const dot=(p,color,r)=>{if(!p)return;const x=Math.max(8,Math.min(312,160+(p.x-position.x)*k)),y=Math.max(8,Math.min(312,160+(p.z-position.z)*k));c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
  // Roadmap stage 3: while the police search, their circle round where they last saw the player
  // (red and blue in turn, as the stars flash); the helicopter as a white cross, its light a ring.
  const w=lastWanted;
  if(w?.stars&&w.flashing&&w.lastSeen&&w.searchRadius){const cx=160+(w.lastSeen.x-position.x)*k,cy=160+(w.lastSeen.z-position.z)*k,r=w.searchRadius*k;
   const blue=Math.floor(performance.now()/500)%2;c.save();c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fillStyle=blue?'rgba(80,140,255,.18)':'rgba(255,70,70,.18)';c.fill();
   c.lineWidth=2;c.strokeStyle=blue?'rgba(120,170,255,.8)':'rgba(255,110,110,.8)';c.stroke();c.restore();}
  const h=w?.heli;
  if(h?.active){const hx=160+(h.x-position.x)*k,hy=160+(h.z-position.z)*k;
   if(h.light&&!h.leaving){c.beginPath();c.arc(160+(h.light.x-position.x)*k,160+(h.light.z-position.z)*k,Math.max(3,7*k),0,Math.PI*2);c.strokeStyle='rgba(255,242,208,.9)';c.lineWidth=1.5;c.stroke();}
   if(hx>-8&&hx<328&&hy>-8&&hy<328){c.strokeStyle='#fff';c.lineWidth=3;c.beginPath();c.moveTo(hx-7,hy-7);c.lineTo(hx+7,hy+7);c.moveTo(hx+7,hy-7);c.lineTo(hx-7,hy+7);c.stroke();}}
  if(shopAt)dot(shopAt,'#ffd23f',5);
  if(car?.active)dot(car,'#70d7ff',6);if(target)dot(target,'#68e7b4',8);
  c.save();c.translate(160,160);c.rotate(-position.heading);c.fillStyle='#fff';c.beginPath();c.moveTo(0,10);c.lineTo(-7,-7);c.lineTo(7,-7);c.closePath();c.fill();c.restore();
 }
 /**
  * PLAN-POLICE W4: five stars beside the health bar, solid while the police can see the player
  * and flashing while they search; a short banner the first time each level is reached.
  */
 function setWanted(w,dt=0){
  if(disposed||!w)return;
  lastWanted=w;
  const n=w.stars|0;
  wanted.dataset.stars=String(n);wanted.dataset.flash=String(!!w.flashing);
  wanted.setAttribute('aria-label',`手配度 ${n}${w.flashing?'（捜索中）':''}`);
  stars.forEach((s,i)=>{s.dataset.on=String(i<n);});
  if(w.roseSeq&&w.roseSeq!==bannerSeq){bannerSeq=w.roseSeq;banner.textContent=`手配度 ☆${w.rose||n}`;banner.hidden=false;bannerFor=2.5;}
  if(bannerFor>0){bannerFor-=dt;if(bannerFor<=0)banner.hidden=true;}
 }
 /** PLAN-WEAPONS: the weapon out, the magazine, and the crosshair (on a person when locked). */
 const NAMES={fists:'素手',pistol:'ピストル',katana:'日本刀',smg:'サブマシンガン'};
 const GUN=new Set(['pistol','smg']);
 let lastAmmo='';
 function setWeapon(w,{aiming=false,locked=false,spread=0,at=null,threat=false}={}){
  if(disposed||!w)return;
  // Roadmap ④: the reticle on the locked person (`at`, page px), or back in the middle.
  crosshair.style.left=at?`${Math.round(at.x)}px`:'';crosshair.style.top=at?`${Math.round(at.y)}px`:'';
  crosshair.dataset.threat=String(!!(at&&threat));
  hitmarker.style.left=crosshair.style.left;hitmarker.style.top=crosshair.style.top;
  weaponLabel.dataset.weapon=w.current;
  weaponLabel.textContent=NAMES[w.current]??w.current;
  crosshair.hidden=!(aiming&&GUN.has(w.current));crosshair.dataset.locked=String(!!locked);
  // §9ah: the automatic's crosshair opens with its spread.
  crosshair.style.setProperty('--spread',String(Math.round(Math.min(1,spread/.06)*100)/100));
  // Stage 1: the rounds in the magazine, large, and the reload as a bar filling back up.
  const gun=GUN.has(w.current),key=gun?`${w.current}:${w.rounds}:${w.magazine}:${w.reloading?Math.round((w.reloadProgress??0)*20):'-'}`:'none';
  if(key===lastAmmo)return;lastAmmo=key;
  ammo.hidden=!gun;if(!gun)return;
  ammo.dataset.weapon=w.current;ammo.dataset.low=String(!w.reloading&&w.rounds<=Math.ceil(w.magazine/4));ammo.dataset.reloading=String(!!w.reloading);
  ammoName.textContent=NAMES[w.current];ammoRounds.textContent=w.reloading?'装填中':String(w.rounds);ammoMag.textContent=w.reloading?'':`/ ${w.magazine}`;
  ammoBar.style.width=`${Math.round((w.reloading?(w.reloadProgress??0):w.rounds/w.magazine)*100)}%`;
  ammo.setAttribute('aria-label',w.reloading?`${NAMES[w.current]} 装填中`:`${NAMES[w.current]} 残弾 ${w.rounds}/${w.magazine}`);
 }
 /** Stage 1: a round or a cut landed (`kill`: it put them down). A short X over the crosshair. */
 let markerTimer=0;
 function hitMarker(kill=false){
  if(disposed)return;
  hitmarker.dataset.kind=kill?'kill':'hit';
  hitmarker.classList.remove('on');void hitmarker.offsetWidth;hitmarker.classList.add('on');
  clearTimeout(markerTimer);markerTimer=setTimeout(()=>hitmarker.classList.remove('on'),kill?420:240);
 }
 /** Stage 1: the weapon wheel -- open with each weapon's rounds, the highlighted one lit. */
 function setWheel(open,highlighted=null,snapshot=null){
  if(disposed)return;
  wheelBox.hidden=!open;if(!open)return;
  for(const slot of wheelSlots){const id=slot.dataset.slot;
   slot.dataset.on=String(id===highlighted);slot.querySelector('b').textContent=NAMES[id]??id;
   slot.querySelector('small').textContent=GUN.has(id)&&snapshot?.ammo?`${snapshot.ammo[id]} 発`:id==='fists'?'':'近接';}
  wheelCentre.querySelector('b').textContent=highlighted?NAMES[highlighted]:'';
  wheelCentre.querySelector('small').textContent=highlighted&&GUN.has(highlighted)&&snapshot?.ammo?`残弾 ${snapshot.ammo[highlighted]}`:'';
 }
 /** C1: the controls line follows the device in use (keyboard, or the pad's own button names). */
 const hint=query('.play-hint'),mapBox=query('.play-map');
 function setControls(text){if(!disposed&&hint)hint.textContent=text;}
 /** C2: − on the pad shows or hides the map. */
 function toggleMap(){if(!disposed&&mapBox)mapBox.hidden=!mapBox.hidden;}
 return {/** Stage 5: the shop's door, a yellow dot on the map. */
  setShopDoor(p){shopAt=p?{x:p.x,z:p.z}:null;},
  setMission(value){snap=value??{status:'idle'};clock=1;},
  /** Stage 5: the wallet and the vest. */
  setMoney(n,armor=0){if(disposed)return;money.textContent=yen(n);armorLabel.hidden=!(armor>0);armorLabel.textContent=`ベスト ${Math.round(armor)}`;},
  /** Stage 5: the shop's counter, open while standing at its door; `message` after a purchase. */
  setShop(open,message=null){if(disposed)return;if(shop.hidden===!open&&message===null)return;shop.hidden=!open;if(message!==null)shopMsg.textContent=message;else if(!open)shopMsg.textContent='';},
  /**
   * Stage 6: what the radio is playing (radio.nowPlaying(), or null for off). Shown when it
   * changes -- a new station, a new song -- for a few seconds, like a car's head unit.
   */
  setRadio(now,dt=0){if(disposed)return;
   const key=now?`${now.station}|${now.title??''}`:'off';
   if(key!==radioKey){radioKey=key;radioFor=RADIO_BANNER;
    radioStation.textContent=now?`📻 ${now.freq} ${now.station}`:'📻 ラジオ オフ';
    radioSong.textContent=now?(now.title?`${now.title} — ${now.artist}`:now.genre):'';radioBox.hidden=false;}
   if(radioFor>0){radioFor-=dt;if(radioFor<=0)radioBox.hidden=true;}},
  hideRadio(){radioKey='';radioFor=0;if(radioBox)radioBox.hidden=true;},
  setWanted,setWeapon,hitMarker,setWheel,setControls,toggleMap,show(){visible=true;root.hidden=false;clock=1;},hide(){visible=false;root.hidden=true;wheelBox.hidden=true;shop.hidden=true;marker.hide();},
  update(dt,position,car,driving,entry,hits=0){if(disposed||!visible)return;current=position;void hits;const s=snap;
   if(s.target)marker.update({x:s.target.x,z:s.target.z,y:network.ctx.height(s.target.x,s.target.z)},dt,2.4);else marker.hide();
   clock+=dt;if(clock<.2)return;clock=0;draw(position,car,s.target);
   speed.textContent=driving?`${Math.round(Math.abs(car?.speed??0)*3.6)} km/h`:position.speed>2.5?'走行中':'徒歩';
   {const hp=Math.max(0,Math.min(100,Math.round(position.health??100)));
    // Four blows either way (combat.mjs), so the bar reads in quarters: green, amber at half,
    // red on the last quarter.
    healthBar.style.width=hp+'%';healthValue.textContent=String(hp);health.setAttribute('aria-valuenow',String(hp));
    health.dataset.level=hp>50?'ok':hp>25?'low':'critical';}
   damage.textContent=car?.active?`損傷 ${Math.round((car.damage??0)*100)}%`:'';
   drive.textContent=driving?'降りる · F':entry?.inRange?(entry.kind==='steal'?'奪う · F':'乗る · F'):entry?`車まで ${Math.ceil(entry.distance)}m`:'車を探す';drive.disabled=position.alive===false||(!driving&&!entry?.inRange);
   const running=s.status==='running';
   cancel.hidden=!running;missionList.hidden=running;progress.hidden=!running;progress.value=s.progress??0;
   for(const b of missionList.querySelectorAll('button'))b.disabled=position.alive===false;
   missionName.textContent=s.name??'ミッション';
   timer.textContent=running&&s.remaining?`${Math.floor(Math.ceil(s.remaining)/60)}:${String(Math.ceil(s.remaining)%60).padStart(2,'0')}${s.text?' · '+s.text:''}`:'';
   if(running)task.textContent=s.target?`${s.target.label??'目的地'} · ${Math.round(Math.hypot(position.x-s.target.x,position.z-s.target.z))}m`:(MISSIONS.find(m=>m.id===s.id)?.brief??'');
   else if(s.status==='complete')task.textContent=`成功！ ${s.reason} · 報酬 ${yen(s.reward)}`;
   else if(s.status==='failed')task.textContent=`失敗：${s.reason}。もう一度選べます。`;
   else if(s.status==='unavailable')task.textContent=`${s.reason}。別の場所でお試しください。`;
   else task.textContent='受けるミッションを選んでください。';
  },dispose(){if(disposed)return;disposed=true;marker.dispose();root.remove();canvas.width=0;map.width=0;}};
}
