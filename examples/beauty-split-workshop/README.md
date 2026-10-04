# beauty_split_2 攻撃チェーン演習（社内セキュリティ勉強会用）

> 対象サイト: https://kesusugar.github.io/beauty_split_2/index.html （所有者: kesusugar 本人）
> 本番リポジトリ（shibuya-scene-public）の勉強会用教材です。攻撃はすべて 127.0.0.1 宛のみで、外部通信はありません。

## 解析結果サマリ

| ページ | 観測されたこと | 脆弱性の有無 |
|---|---|---|
| index.html | GTM（GTM-KGHL6W5R）・商品3点・カートボタン。クリックで `localStorage['lumiere_cart']` に保存後 `cart.html` へ遷移 | 保存データは静的な `data-*` 属性由来 |
| cart.html | `localStorage` を `JSON.parse` → **`item.product_name` / `item.content_id` をエスケープせず `innerHTML` へ** | **DOM XSS（ストアド型）** |
| checkout.html | 同じシンク＋氏名・住所・メール・電話・**カード番号/有効期限/CVV** を入力するフォーム（送信先なし・ページ遷移のみ） | **同上の XSS** ＋ 実運用時は PCI データを静的ページで扱うリスク |
| thanks.html | 同じシンクで注文内容表示 | **同上の XSS** |
| レスポンスヘッダ | CSP なし・`X-Frame-Options` なし（クリックジャッキング可能）・`X-Content-Type-Options` なし | 補助的対策の欠如 |

### 最重要ポイント: GitHub Pages は「1ユーザー = 1オリジン」

`kesusugar.github.io` 上のすべてのリポジトリ（beauty_split_2 も shibuya-scene-public も）は
**同一オリジン**です。つまり:

- `localStorage` は**共有**
- どこかのページで1回 XSS が成功すると、そのオリジン上の**別リポジトリのページも攻撃できる**
- 本リポジトリ（shibuya-scene-public）の attack-simulation が読む `shibuya.save` も同じ空間にある

「一つのアプリだけ安全にしても、オリジンを共有していれば全体の安全ではない」という
オリジン境界の教訓をそのまま体感できます。

## 攻撃チェーン（実際に動く・自分のサイトへの攻撃）

```
[XSS 1回目] どこかのページでペイロード実行（反射型 or コンソール）
     │  localStorage['lumiere_cart'] を「毒されたカート」に書き換え
     │  （product_name に <img onerror=…> を仕込んだ商品データ）
     ▼
[永続化] 利用者が実際に商品を追加しない限り、毒は残り続ける
     ▼
[XSS 2回目] 利用者が beauty_split_2/cart.html を開く
     │  未エスケープの innerHTML で img onerror が発火
     ▼
[フィッシング] 「セッションの有効期限が切れています」偽フォーム
     │  カード名義・番号・有効期限・CVV を入力させ
     ▼
[送信] ローカル収集サーバ（127.0.0.1:9999/collect）へビーコン
        attack-server.mjs の /panel で回収データを確認できる
```

### 実施手順

```bash
# 端末1: 収集サーバ
node examples/security-workshop/attack-server.mjs

# 端末2: ペイロード生成（自己検証つき）
node examples/beauty-split-workshop/build-payload.mjs
```

表示される **演習A（コンソール貼り付け）** か **演習B（?q= URL・マージ後のみ有効）** を実行し、
`https://kesusugar.github.io/beauty_split_2/cart.html` を開きます。偽フォームが出るので
入力して `/panel` で回収を確認します。

- `?q=` による毒入れは本リポジトリの attack-simulation シンクが必要です
  （`claude/security-workshop` ブランチのローカル dev またはマージ後）
- 終わったらコンソールで `localStorage.removeItem('lumiere_cart')` で毒を除去

## 対策（このサイトの場合）

| 脆弱性 | 対策 |
|---|---|
| innerHTML への未エスケープ差し込み | `textContent` を使うか、要素を作って `createElement`/`append` する。または値を HTML エスケープしてから入れる |
| localStorage を信じる | 保存データも「信頼できない入力」。描画前にバリデーション（`product_name` は文字列として安全化、長さ制限） |
| オリジン共有 | 特別な理由がなければプロジェクトごとにカスタムドメイン（または 1ユーザー1オリジンの構成を認識して設計） |
| ヘッダ不在 | GitHub Pages では設定できないため、CSP が必要なページは静的に `<meta http-equiv>` か CDN 側で付与。GTM を使うなら `script-src` に注意 |
| 将来 DB を繋ぐとき | この状態でアカウント機能・決済 API を足すと「XSS でセッション奪取 → API 経由で DB にアクセス」が直結する。SQL はパラメータ結合、認可はサーバ側で必ず再確認 |

## このサイトに「社内データベース」が繋がったら（シナリオ）

今は静的サイトなので DB はないものの、便宜的に「checkout フォームの送信先に社内 API があったら」を想定すると:

1. **攻撃者は XSS を1回成功させるだけで、その後は常に利用者のブラウザ内で動ける**
2. checkout フォームの入力値を盗み見る（フィッシング不要の最短ルート）
3. セッション Cookie が `HttpOnly` でも、**XSS から「ユーザーとしての API 呼び出し」ができる**ため、DB に直接繋がなくてもデータを読める
4. もし API に SQLi があれば、そこから直接 DB へ（前回のシナリオ表 #1）

「入口の XSS → 認証済み API → DB」という現代の標準的な攻撃経路になります。
