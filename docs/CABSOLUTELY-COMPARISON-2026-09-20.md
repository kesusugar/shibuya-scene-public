# Cabsolutely とのコード比較、および群衆の実装方針

参照リポジトリを実際に clone して読んだ結果。
`ilkerzg/cabsolutely`（MIT、`LICENSES/cabsolutely.txt` に記載済み）

**技術スタックはほぼ同じだった。** Three.js 0.179.1 + Vite + TypeScript。
`life/simulation` `life/render` というモジュール名まで一致している。
だからこそ、**設計判断の違いがそのまま比較できる。**

---

## 1. 群衆 — 正反対のアーキテクチャ

| | Cabsolutely | shibuya-scene |
|---|---|---|
| 歩行者数 | **340**（既定の上限） | **1978**（HIGH） |
| 描画方式 | **1人 = 1 SkinnedMesh + 専用 AnimationMixer** | InstancedMesh 13ジオメトリ / 3マテリアル |
| キャラクタ資産 | GLB 3体 = **3.4MB をランタイムDL** | **事前生成、外部アセット0** |
| バリエーション | 3テンプレート（commuter / local / visitor） | 11アーキタイプ × 体型4 × 髪3 × 小物5 |
| カリング | 距離155m + フラスタム | LOD + カメラ距離 |
| **接地影** | **blob shadow の InstancedMesh あり** | **なし** |
| `public/` 合計 | **176MB** | **21MB** |

内訳（Cabsolutely）: architecture 89MB / street-layout.json 29MB / materials 23MB /
terrain 13MB / ads 9.5MB / sky 5.1MB / characters 3.4MB

### 結論：向こうの群衆方式を真似してはいけない

理由は2つ。

**(1) 物理的に不可能。** 1978人を SkinnedMesh + AnimationMixer にするのは成立しない。
向こうは340人で、しかも155mでカリングして、ようやく回っている。

**(2) そもそも目的が違う。** スクランブル交差点の本質は**人の多さ**そのもの。
340人では渋谷にならない。**こちらの1978人という数字は、妥協ではなく作品の主題である。**

176MB という数字も直視すべき。このプロジェクトは起動時間を最優先に置いていて、
21MB でそれを達成している。**向こうの8倍の資産を背負う判断は、方針と正面から衝突する。**

### ただし、アーキテクチャは既にこちらの方が良い

`codex/prebaked-motion` が入れた `src/life/near-characters.mjs` は、
**近傍32体だけリグ付き + 遠景はインスタンシング**というハイブリッドになっている。

これは Cabsolutely の「全員リグ」より賢い。**足りないのはアーキテクチャではなく中身。**

---

## 2. 群衆の実装方針（提案）

### 2-1. 接地影を入れる ★最優先・向こうから学ぶ最大の技術

**現状、群衆に接地影が1つもない**（`src/life/` 全体で `shadow` のヒットがゼロ）。

人が地面に接地して見えないと、どれだけ人数がいても「浮いている板」に見える。
**これが「安っぽさ」の最大の原因である可能性が高い。**

Cabsolutely の手法は非常に安い（`life/characters.ts`）:

```
PlaneGeometry(1,1).rotateX(-π/2) を1枚
+ ShaderMaterial（中心が濃く、縁に向かって pow で減衰、a<.002 で discard）
+ InstancedMesh 1つに全員分
```

つまり**ドローコール1、テクスチャ0、ライティング計算0**。
リアルタイム影ではなく、ただの楕円グラデーション。それで十分に効く。

**この手法は 13/3 の群衆契約の外に作れる。** 血痕（`src/life/blood.mjs`）が
まさに同じ形（`CircleGeometry` 1つ + マテリアル1つの `InstancedMesh`）なので、
**あの実装をそのまま雛形にできる。**

### 2-2. 近距離リグの色数を増やす

```js
// src/life/near-characters.mjs
for(const color of [0x343f51,0x738d88,0xb98193,0xc38966])  // ← 4色しかない
```

近傍は最大32体。**32人が4色に割り振られる**ので、人混みで必ず気づく。

`src/life/config.mjs` の `ARCHETYPES` に**11アーキタイプ × 3色 = 33色が既にある**。
そこから引けば、追加コストほぼゼロで32体すべて別の色にできる。

### 2-3. 歩行速度とアニメーションの同期（足の滑り防止）

Cabsolutely の `gaitSpeed()` は賢い。**アニメーションクリップを64分割してサンプリングし、
足が接地している区間の実際の移動速度を測って**、中央値を歩幅として使う。

```
s.actions[next].timeScale = moving ? clamp(p.speed / (gait * 1.76 * p.height / t.height)) : 1
```

これで**キャラクタの身長が違っても足が滑らない。**

こちらは事前生成クリップ（`scripts/bake-character.mjs`）なので、**bake 時に同じ計測をして
歩幅をメタデータとして焼き込める**。ランタイムコストはゼロ。向こうより有利。

### 2-4. やらないこと

- GLTF のランタイム読み込み（方針と起動時間に衝突）
- 全員リグ化（不可能）
- 人数を減らして品質を上げる（**オーナーが明示的に禁止している**）

---

## 3. UI — 向こうのコードから学ぶべきもの

HUD 規模: Cabsolutely は 6ファイル 499行 + CSS 93行。こちらは `play-ui.mjs` 1ファイル。

### 3-1. `spring.ts` — これが「質感」の正体 ★最重要

96行の小さなバネ物理ライブラリ。

```ts
stepSpring(state, target, seconds, response = .34, damping = 1)
```

臨界減衰の解析解 + `rubberBand`。**HUDの数値が目標値へバネで追従する。**

一方こちらは `play-ui.mjs` で `textContent` を**5Hzで直接書き換えている**。
数値が飛ぶ。バーが瞬間移動する。

**「作り込まれている感」の正体は、ほぼこれ。**
速度計・体力・進捗バー・損傷をすべてバネ補間に通すだけで、体感は大きく変わる。
96行程度の自前実装で済み、依存も増えない。

### 3-2. テーマ切替がある

`document.documentElement.dataset.uiTheme` で `minimal` / `presentation` / `white` を切替。
`minimal.css`（53行）と `presentation.css`（40行）が分かれている。

さらに `liquid.ts` は WebGL のガラス質コンポジタだが、
**`minimal` / `white` テーマでは `gl` を `null` にして自動的に無効化する。**
重い演出が、軽いテーマではコストごと消える。良い設計。

### 3-3. 地面のリングマーカー（送った2枚目の画像に写っているもの）

`src/game/mission/wayfinding.ts`:

```ts
RingGeometry(2.25, 2.39, 72) + 縦棒4本（BoxGeometry）
ringMat.color = 乗客搭乗中 ? '#f1ce66' : '#b3dc89'     // 状態で色が変わる
ringMat.opacity = .59 + .08 * sin(elapsed * 3)          // ゆっくり脈打つ
```

全部**1つの `MeshBasicMaterial` を共有**。加えて、乗客が手を振りながら車へ歩いてくる。

こちらの `src/player/marker.mjs` はコーン1つで、**状態による色変化も脈動もない**。
リング + 縦棒 + 状態色 + 脈動は、**同じコストで大幅に読みやすくなる。**

### 3-4. ゲームシステムの厚み（これは設計思想の差）

向こうの `HudEconomy` が持っているもの:

```
day, remaining, duration, target, net, wallet, meterRate, status,
upgrades[], citations[]
```

アクション: `newGame / lights / setMeterRate / buyUpgrade / nextDay / map /
pause / repair / recover / horn / camera / photo / quality / panel`

**タクシー経営シミュレーション**として成立している。日ごとの目標、運賃料率の設定、
アップグレード購入、違反切符、修理、財布。

こちらの配達ミッションは**1回走って終わり**。

これは「UIの質」ではなく**ゲームデザインの density** の差。
UIを磨いても埋まらないので、別の判断が要る。

---

## 4. 優先順位

| 順位 | 項目 | 効果 | 工数 | 備考 |
|---|---|---|---|---|
| 1 | **群衆の接地影** | **大** | 小 | `blood.mjs` が雛形。契約の外に作れる |
| 2 | **HUDのバネ補間** | **大** | 小 | 96行の自前実装。依存ゼロ |
| 3 | 近距離リグの色数 | 中 | 極小 | `ARCHETYPES` から引くだけ |
| 4 | リングマーカーの改善 | 中 | 小 | 状態色 + 脈動 + 縦棒 |
| 5 | 歩幅をbakeに焼く | 中 | 中 | 向こうより有利な形で実装できる |
| 6 | テーマ切替 | 小 | 中 | UI品質プランのトークン化が前提 |

**1〜4 はすべて実機を見なくても正しさを確認できる。**

---

## 5. ライセンス

Cabsolutely は MIT で、`LICENSES/cabsolutely.txt` に全文が既に置かれている。
**手法を参考にすることは、この記載がある限り問題ない。**

このドキュメントで提案しているものは**すべて自前実装**であり、
向こうのコード・モデル・テクスチャ・アニメーションを転載するものは1つもない。
接地影もバネ補間も、**考え方を読んで自分で書く**という前提。
