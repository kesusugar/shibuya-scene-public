# GTA fidelity — 改善前のベースライン

RUN 0。**コードは変更していない。** 現状を記録するだけの回。

- ブランチ `claude/gta-fidelity-upgrade`（`origin/master` = `39175bd` から作成）
- 撮影日 2026-09-20
- 撮影条件 HIGH / 1280×720 / `crowd 1978` を確認してから撮影

---

## 0. この環境で測れるもの・測れないもの

**先に明示する。この環境で性能は測れない。**

| 項目 | 状態 |
|---|---|
| WebGL | **SwiftShader（CPUソフトウェア）** |
| 実測 FPS | **0.1〜0.3** |
| 音声デバイス | なし |
| H.264 デコーダ | なし（ffmpeg は webm のみ、Chromium はプロプライエタリ非搭載） |

したがって RUN 0 が要求している

- FPS
- frame p50 / p95 / max
- 50ms超フレーム数
- 起動時間

は **この環境の数値を記録しても意味がない**ので記録しない。捏造もしない。
**これらは実機で測る必要がある。** `docs/REAL-DEVICE-QA-2026-09-20.md` がその手順。

記録できたのは以下:

| 項目 | 値 |
|---|---|
| `npm run typecheck` | 通過 |
| `npm test` | **190 pass / 0 fail** |
| draw calls（観察モード・夜） | 337〜365 |
| draw calls（プレイヤーモード） | **376 → 786** |
| crowd | **1978**（HIGH、起動から約75秒で到達） |
| scene JS | 1,159,830 B / gzip 397,289 B |
| deferred vehicles | 1,691,025 B / gzip 150,244 B |
| character pack | 233,847 B / gzip 36,602 B |
| `vehicleInInitialStaticGraph` | `false`（初期依存から除外できている） |
| console エラー | 撮影中に観測されず |

> ⚠️ **プレイヤーモードで draw calls が 376 → 786 へ倍増する。**
> 近距離リグ・HUD・車両ビジュアルが乗るため。実機 FPS への影響は未測定。

### 起動時に見つけた事実

事前生成パックには **`life.high` しか入っていない**（nodes 12,868 / eligible 10,462）。
`?tier=medium` と `?tier=low` は `pack?.life?.[tier] ?? await buildPedestrianNetworkAsync(...)`
のフォールバックに落ちるため、**低ティアほど起動が重い。**
この環境では medium/low で7分待っても `crowd 0` のままだった。HIGH は75秒。

**スマホは medium/low を選ぶ可能性が高いので、実機で確認する価値がある。**

---

## 1. 撮影したもの（16枚）

`qa/gta-upgrade/before/`

観察モード・夜: `night-scramble-high` `night-street` `night-qfront` `night-hachiko`
`night-center-gai` `night-photo`

観察モード・昼: `day-scramble-high` `day-street` `day-center-gai`

プレイヤーモード: `player-standing` `player-walking` `player-running` `player-punch`
`player-enter-vehicle` `player-in-vehicle` `vehicle-driving`

### 撮れなかった / 意味を成さなかったもの

- **`player-walking` と `player-running` は静止画として意味がない。** 0.1fps では25秒キーを
  押し続けても数フレームしか進まず、プレイヤーは (12,24) から (11,21) へ 3m ほどしか動かない。
  **歩行と走行の見分けはこの環境では撮れない。**
- **`player-punch` に被弾者が写っていない。** 攻撃が当たったかを確認できていない。
- **dense crowd close-up は別途撮っていない**（`player-standing` が実質それにあたる）。
- **carjack は試していない**（RUN 10 の対象で、現状 parked のみ）。

---

## 2. 問題の分類（計画の A〜J に沿う）

**画像から読み取れたものだけ書く。**

### A. player geometry — 中程度

`player-standing` で主人公（橙のコーンの下）は、頭・首・肩・腕・手・胴・脚・靴が識別できる。
**棒や箱ではない。** ただし面は平滑で、遠目には人形に見える。

なお `39175bd` には私の首・肩・腰の修正（`a13e20d`）は**入っていない**（`codex/prebaked-motion`
に未マージのまま）。この baseline はその修正**前**の状態。

### B. NPC geometry — 二層の差が見える

近距離リグは腕・脚・手・靴を持ち、服の色も分かれている。
**遠景の群衆は明確に別物**（繭に棒）で、`player-standing` では両者の境界が画面内で見える。

### C. locomotion — 未評価

上記のとおり、この環境では歩行/走行の差を撮れていない。**実機でないと判定できない。**

### D. foot contact — 未評価

静止フレームでは足の滑りを判定できない。`player-standing` では足は地面に乗っているように見える。

### E. combat — 未確認

`player-punch` で被弾者が写っておらず、当たったかどうか不明。

### F. hit reaction — 未確認

同上。ただし `vehicle-driving` に**血痕（赤い水たまり）**が写っており、車による轢きは機能している。

### G. vehicle entry — 部分的に確認

`player-enter-vehicle` → `player-in-vehicle` の遷移は成立した。ワープしているかは静止画では不明。

### H. vehicle visuals — **最も悪い**

`vehicle-driving` の自車は**灰色の平板な楔**。`player-standing` の左の車も白い箱に黒い箱。
窓が「穴」ではなく「塊」で、ホイールアーチもバンパーも運転手もない。
**この画面で一番足を引っ張っているのは車。**

### I. crowd behavior — 静止画では未評価

### J. lighting/rendering — 街は良い、人と車が馴染んでいない

夜の看板・濡れた路面の反射・窓明かりは説得力がある。
一方、**人物はパステルの単色で平板**、車は明度が浮いている。街と人・車が別レイヤーに見える。

---

## 3. この baseline から言えること

1. **街は完成度が高い。** RUN 12 で街を作り直す必要はない
2. **車が最悪。** 優先順位 8 番（RUN 11）に置かれているが、**画面への寄与では最上位**
3. **近距離リグと遠景群衆の境界が見える。** RUN 5 で近距離を上げるほど境界が目立つ恐れ
4. **動きの評価が一切できていない。** RUN 3・4 の受け入れ判定は**実機が必須**

---

## 4. 次

RUN 1（参照リポジトリの調査と対応表）。実装はまだ行わない。
