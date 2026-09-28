// What the browser reports for a connected controller.
//
// The driving code is written against the Standard Gamepad mapping and whether a given pad
// matches it cannot be decided from here. A Switch-style controller may arrive as
// `mapping: "standard"` with Nintendo's own A/B positions swapped relative to the indices,
// or as `mapping: ""` where the indices mean nothing in particular; third-party pads often
// carry an X-input mode that settles it either way. So rather than guess, this shows exactly
// what the browser sees -- press a button, read its index.
//
// Rendered as one tab of the diagnostics panel.

/** Chrome hands back a fresh snapshot per call, and hides pads until one is used. */
export const pads = () => {
 if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
 return [...navigator.getGamepads()].filter(Boolean);
};

const STANDARD = ['A / 下', 'B / 右', 'X / 左', 'Y / 上', 'L1', 'R1', 'L2 トリガー', 'R2 トリガー',
                  'Select / −', 'Start / +', 'L3 押し込み', 'R3 押し込み',
                  '十字 上', '十字 下', '十字 左', '十字 右', 'ホーム'];
// PLAN-PERFORMANCE-AND-PAD C1: the same index on a Switch Pro Controller (Chrome's standard
// mapping is positional, so Nintendo's A is on the right and B at the bottom).
const SWITCH = ['B（下）', 'A（右）', 'Y（左）', 'X（上）', 'L', 'R', 'ZL', 'ZR', '−', '+', 'Lスティック押し込み',
                'Rスティック押し込み', '十字 上', '十字 下', '十字 左', '十字 右', 'HOME', 'キャプチャ'];
const AXIS = {0: '左右移動', 1: '前後移動', 2: '視点 左右', 3: '視点 上下'};
// What this project binds (src/player/input-map.mjs), so a press says whether it did anything.
const BOUND = {0: '走る', 1: '装填', 2: '回避', 3: '乗る/降りる', 4: '前の武器', 5: '次の武器 / サイドブレーキ',
               6: '構える / ブレーキ', 7: '攻撃 / アクセル', 8: '地図', 9: '観察に戻る', 10: 'しゃがむ / ホーン', 12: 'サイレン'};

export function padSnapshot() {
 return pads().map(p => ({
  index: p.index, id: p.id, mapping: p.mapping, connected: p.connected,
  axes: [...p.axes].map(v => Number(v.toFixed(3))),
  buttons: [...p.buttons].map(b => ({pressed: b.pressed, value: Number(b.value.toFixed(3))}))
 }));
}

export function padHtml() {
 const list = pads();
 if (!list.length) return '<p class="dg-note">コントローラーが見つかりません。<br>接続してから<b>何かボタンを一度押して</b>ください（Chrome は使われるまでパッドを返しません）。</p>';
 const out = [];
 for (const p of list) {
  const standard = p.mapping === 'standard';
  out.push(`<h3>#${p.index} ${p.id}</h3>`);
  const nintendo = /057e|pro controller|joy-con|nintendo/i.test(p.id);
  if (nintendo) out.push(`<p class="dg-ok">Switch Pro コントローラーとして認識 · 右列が本体のボタン名</p>`);
  out.push(`<p class="${standard ? 'dg-ok' : 'dg-warn'}">mapping: <b>${p.mapping || '(空 = 非標準)'}</b><br>` +
   (standard ? 'このゲームの割り当てがそのまま使えます'
             : 'インデックスの意味が保証されません。X-input モードがあれば切り替えてください') + '</p>');
  out.push('<div class="dg-rows dg-rows2">' + [...p.axes].map((v, i) =>
   `<span>axes[${i}]${AXIS[i] ? ' · ' + AXIS[i] : ''}</span>` +
   `<b class="${Math.abs(v) > .2 ? 'dg-live' : ''}">${v.toFixed(3)}</b>`).join('') + '</div>');
  out.push('<div class="dg-rows dg-rows3">' + [...p.buttons].map((b, i) =>
   `<span>buttons[${i}]${BOUND[i] ? ' · ' + BOUND[i] : ''}</span>` +
   `<b class="${b.pressed ? 'dg-live' : ''}">${b.value.toFixed(2)}${b.pressed ? ' ●' : ''}</b>` +
   `<em>${(nintendo ? SWITCH : STANDARD)[i] ?? ''}</em>`).join('') + '</div>');
 }
 return out.join('');
}
