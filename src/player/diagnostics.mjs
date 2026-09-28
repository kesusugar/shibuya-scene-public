// The on-screen diagnostics panel.
//
// Built to be read and driven on a phone, because that is where the question "why will the
// car not move?" tends to get asked and where a console is not available. Three tabs, big
// enough to hit with a thumb: what the car is doing, what a controller reports, and what the
// device itself is. The drive tab also carries its own controls -- you cannot diagnose an
// input problem on a phone without some way to give input -- so the panel is a way to play
// as much as a way to look.
//
// It renders from a snapshot the app hands it each frame; it never reaches into the scene.

import {padHtml, padSnapshot} from './pad-probe.mjs';

const TABS = [['drive', '運転'], ['pad', 'パッド'], ['device', '端末']];

/**
 * Why is the car not moving? Turned into one sentence, because the numbers underneath only
 * help if you already know which of them matters.
 */
function verdict(d) {
 if (!d.playerMode) return ['dg-note', 'プレイヤーモードではありません。「プレイヤー」を押してください。'];
 if (!d.driving) {
  if (!d.hasCar) return ['dg-warn', '<b>車がまだ作られていません。</b>交通シミュレーションの読み込み待ちです。もう一度「乗る」を押すと作り直します。'];
  if (d.reach && !d.reach.inRange)
   return ['dg-warn', `<b>車まで ${Math.round(d.reach.distance)} m あります。</b>${Math.round(d.reach.range)} m 以内まで歩いてください。ボタンは範囲外では距離を表示します。`];
  return ['dg-note', '徒歩です。<b>F</b>（またはパッドA / 画面の「乗る」）で乗れます。'];
 }
 const moving = Math.abs(d.speed) > .15;
 if (moving) return ['dg-ok', `走っています（${d.speed.toFixed(1)} m/s）。`];
 if (!d.input || (Math.abs(d.input.forward) < .05 && Math.abs(d.input.strafe) < .05))
  return ['dg-warn', '<b>入力が来ていません。</b>キー・パッド・タッチのいずれも 0 です。'];
 if (d.stalled) {
  const what = d.blockedBy?.cars ? `前に車が${d.blockedBy.cars}台います` : '壁か街の設置物に当たっています';
  return ['dg-warn', `<b>前が詰まっています。</b>${what}。<b>S</b>（下の「バック」）で下がれば抜けられます。`];
 }
 if (d.damage >= 1) return ['dg-warn', '全損しています。速度は落ちますが動けるはずです。'];
 return ['dg-warn', '入力は来ていますが加速していません。これは実装側の問題の可能性があります。'];
}

const row = (k, v, live) => `<span>${k}</span><b class="${live ? 'dg-live' : ''}">${v}</b>`;

function driveHtml(d) {
 const [cls, text] = verdict(d);
 const rows = [
  row('入力 前後', d.input ? d.input.forward.toFixed(2) : '—', d.input && Math.abs(d.input.forward) > .05),
  row('入力 左右', d.input ? d.input.strafe.toFixed(2) : '—', d.input && Math.abs(d.input.strafe) > .05),
  row('速度', d.driving ? d.speed.toFixed(2) + ' m/s' : '—', Math.abs(d.speed) > .15),
  row('詰まり', d.driving ? (d.stalled ? 'はい' : 'いいえ') : '—', d.stalled),
  row('損傷', d.driving ? Math.round(d.damage * 100) + '%' : '—', d.damage > .02),
  row('車種', d.driving ? d.type : '—'),
  row('位置', `${d.x.toFixed(1)}, ${d.z.toFixed(1)}`),
  row('接触', String(d.struck ?? 0), (d.struck ?? 0) > 0),
  row('fps', d.fps == null ? '—' : d.fps.toFixed(1))
 ].join('');
 return `<p class="${cls}">${text}</p><div class="dg-rows dg-rows2">${rows}</div>`;
}

function deviceHtml() {
 const n = typeof navigator === 'undefined' ? {} : navigator;
 const rows = [
  row('画面', `${innerWidth}×${innerHeight} @${devicePixelRatio}`),
  row('タッチ点数', String(n.maxTouchPoints ?? 0)),
  row('コア数', String(n.hardwareConcurrency ?? '—')),
  row('メモリGB', String(n.deviceMemory ?? '—')),
  row('Gamepad API', n.getGamepads ? 'あり' : 'なし'),
  row('AudioContext', (globalThis.AudioContext ?? globalThis.webkitAudioContext) ? 'あり' : 'なし')
 ].join('');
 return `<div class="dg-rows dg-rows2">${rows}</div><p class="dg-note">${n.userAgent ?? ''}</p>`;
}

/**
 * `source` is called each frame for the current state, and `onKey` with 'drive' or 'exit'
 * for the get-in and leave buttons. Movement is not here: on a touch device the real
 * controls own it, and on a desktop the keyboard does.
 *
 * @param {{source?:()=>any, onKey?:(what:string)=>void, tab?:string}} [options]
 */
export function createDiagnostics({source, onKey, tab = 'drive'} = {}) {
 if (typeof document === 'undefined') return {dispose() {}};
 const root = document.createElement('section');
 root.className = 'dg';
 root.innerHTML =
  `<header class="dg-head">
     <strong>診断</strong>
     <nav class="dg-tabs">${TABS.map(([id, label]) =>
       `<button type="button" data-tab="${id}" class="${id === tab ? 'on' : ''}">${label}</button>`).join('')}</nav>
     <button type="button" class="dg-fold" aria-label="折りたたむ">▾</button>
   </header>
   <div class="dg-body"></div>
   <div class="dg-pad">
     <div class="dg-acts">
       <button type="button" data-key="drive">乗る / 降りる</button>
       <button type="button" data-key="exit">観察に戻る</button>
       <button type="button" class="dg-copy">Copy JSON</button>
     </div>
   </div>`;
 document.body.appendChild(root);

 const body = root.querySelector('.dg-body');
 let current = tab, folded = false, raf = 0, disposed = false, latest = null;

 for (const b of root.querySelectorAll('[data-key]')) {
  b.addEventListener('click', e => {e.preventDefault(); onKey?.(b.dataset.key);});
 }
 for (const b of root.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
   current = b.dataset.tab;
   for (const other of root.querySelectorAll('[data-tab]')) other.classList.toggle('on', other === b);
   root.classList.toggle('dg-driving', current === 'drive');
  });
 }
 root.querySelector('.dg-fold').addEventListener('click', () => {
  folded = !folded; root.classList.toggle('dg-folded', folded);
  root.querySelector('.dg-fold').textContent = folded ? '▴' : '▾';
 });
 root.querySelector('.dg-copy').addEventListener('click', async e => {
  e.preventDefault();
  const btn = e.currentTarget;
  try {
   await navigator.clipboard.writeText(JSON.stringify({drive: latest, pads: padSnapshot(),
    ua: navigator.userAgent, screen: [innerWidth, innerHeight, devicePixelRatio]}, null, 2));
   btn.textContent = 'コピーしました';
  } catch {btn.textContent = 'コピー失敗';}
  setTimeout(() => {btn.textContent = 'Copy JSON';}, 1600);
 });
 root.classList.toggle('dg-driving', current === 'drive');

 const render = () => {
  latest = source?.() ?? null;
  if (!folded) {
   body.innerHTML = current === 'pad' ? padHtml() : current === 'device' ? deviceHtml()
                  : driveHtml(latest ?? {x: 0, z: 0, speed: 0, damage: 0});
  }
  raf = requestAnimationFrame(render);
 };
 raf = requestAnimationFrame(render);

 return {
  get snapshot() {return latest;},
  dispose() {
   if (disposed) return; disposed = true;
   cancelAnimationFrame(raf); root.remove();
  }
 };
}
