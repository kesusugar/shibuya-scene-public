# GTA OSS 統合マップ

RUN 1。**ゲームコードは変更していない。** 参照実装を実際に clone して読み、
渋谷側のどのファイルへ何を持ち込むかを決める回。

---

## 0. 取得した参照（すべて指定コミットに固定、すべて MIT）

作業ディレクトリ外の兄弟ディレクトリに置いた。**リポジトリには含まれない。**

| 参照 | 場所 | コミット | ライセンス |
|---|---|---|---|
| three-player-controller | `/home/user/shibuya-reference/three-player-controller` | `80d12e5` ✓ | MIT (屈航, 2026) |
| Sketchbook | `/home/user/shibuya-reference/Sketchbook` | `62f4b79` ✓ | MIT (swift502, 2020) |
| LEONIDA | `/home/user/ref/leonida` | `c09af18` ✓ | MIT |
| gta7 | `/home/user/ref/gta7` | `bd5ee61` ✓ | MIT |

recast-navigation-js と ecctrl は計画どおり**未取得**。

---

## 1. 対応表

### 1-1. `src/player/figure.mjs` ← three-player-controller

| | |
|---|---|
| **参照ファイル** | `src/plugins/foot-ik/internal/twoBoneIK.ts`（260行） |
| **対象関数** | `solveTwoBoneIK(leg, target, weight, options)` / `createTwoBoneIKScratch()` |
| **渋谷側** | 新規 `src/player/foot-ik.mjs` |
| **判断** | **adapt**（移植して書き直す） |
| **依存影響** | なし。`Vector3` / `Quaternion` / `MathUtils` のみ |
| **実行コスト** | 1脚あたり数十回の浮動小数演算。予算内 |
| **アセット** | 不要 |
| **リスク** | 低 |

**理由**: `solveTwoBoneIK` は upper/lower/foot のボーンとワールド座標のターゲットと weight だけを取る
**完全に独立した関数**。彼らのプレイヤーやコライダに依存していない。

---

| | |
|---|---|
| **参照ファイル** | `src/plugins/foot-ik/FootIK.ts`（**2,409行**） |
| **判断** | **reject（そのままは持ち込まない）** |

**理由**: 決定的な非互換が2つある。

1. **接地判定がメッシュへの raycast**
   ```ts
   this.raycaster.intersectObjects(this.colliderMeshes, false);
   this.colliderMeshes = this.player?.getColliderMeshes() ?? ...
   ```
   渋谷側に地面のコライダメッシュは**存在しない**。あるのは `network.ctx.height(x,z)` という
   **高さ関数**。これは raycast より**速くて単純**なので、こちらに合わせて書き直す方が良い。

2. **単位がセンチメートル**
   `maxPelvisDrop = 50` / `raycastFar = 440` / `soleHalfWidth = 7` / `swingClearance = 8`。
   渋谷側はメートル。**全定数の換算が必要**で、写すと必ず事故る。

**取るべきは概念**: 足の接地判定 → ターゲット決定 → 2骨IK → 骨盤の上下補正 → 接地足のロック。
`PREDICTION_LOCK_PROGRESS = 0.88` / `PREDICTION_RELEASE_PROGRESS = 0.25` のような
**位相のしきい値の考え方**は参考になる。

---

### 1-2. `src/player/controller.mjs` ← three-player-controller

| | |
|---|---|
| **参照ファイル** | `src/systems/CharacterMovement.ts`（436行）/ `src/systems/AnimationSystem.ts`（315行） |
| **渋谷側** | `src/player/controller.mjs` + 新規 `src/player/animation-controller.mjs` |
| **判断** | **adapt** |
| **依存影響** | なし |
| **実行コスト** | プレイヤー1体分。無視できる |
| **アセット** | 不要 |
| **リスク** | 低。ただし**受け入れ判定にこの環境では到達できない**（§3） |

---

### 1-3. `src/life/near-characters.mjs` ← LEONIDA

| | |
|---|---|
| **参照ファイル** | `src/systems/peds/brains/CivilianBrain.ts` / `src/systems/peds/PedMotion.ts` |
| **対象** | 状態 `wander/idleGroup/cower/flee/callPolice/fight/inVehicle/knockedDown/dead`<br>イベント `aimedAt/damaged/crimeSeen/heardGunshot/explosion/horn/hitByVehicle/carjacked` |
| **渋谷側** | `src/life/simulation.mjs` に `notify(p, event)` を新設 + `src/life/near-characters.mjs` |
| **判断** | **adapt（思想のみ）** |
| **依存影響** | **要注意** — 横断歩道の占有権（`signals.leavePedestrian`）を壊さないこと |
| **実行コスト** | 近距離32体のみ。遠景1946人には適用しない |
| **アセット** | 不要 |
| **リスク** | **中**。信号デッドロックを再発させ得る |

**最大の収穫は「状態」と「イベント」の分離**。こちらは `scatter()` という入口が1本しかなく、
「なぜ散ったか」が残らない。`splashes` / `voices` キューと**同じ思想の逆向き**を1本足すだけで済む。

`src/data/peds.ts:37` の **`fightChance`（アーキタイプごとの殴り返し確率、ギャングは1.0）** は
`src/life/config.mjs` の `ARCHETYPES` に1フィールド足すだけで入る。

---

### 1-4. `src/player/combat.mjs` ← LEONIDA

| | |
|---|---|
| **参照ファイル** | `src/systems/weapons/Melee.ts`（**106行**） |
| **対象** | 3発コンボ / `comboReset` / 3発目のみ ragdoll / `fovKick(combo===3?3:1.5)` |
| **渋谷側** | `src/player/combat.mjs`（現状53行） |
| **判断** | **adapt** |
| **依存影響** | 小 |
| **実行コスト** | 無視できる |
| **アセット** | 不要 |
| **リスク** | 低 |

**現状の確認（計画の前提は正しい）**: `combat.mjs` の `update()` は `pending` が立った
**同じフレームで** `choose()` → `engage()` → `combatHealth -= playerDamage` → `kill()` まで走る。
`player.startAttack?.()` はアニメを始めるだけで、**ダメージは振り始めに入っている。**

ただし**NPCの反撃は既に存在する**（`hostiles` ループ、`combatNext` クールダウン、`player.hurt`）。
計画が「これから作る」としている部分の一部は既にある。

---

### 1-5. `src/player/vehicle-transition.mjs` ← Sketchbook

| | |
|---|---|
| **参照ファイル** | `character_states/vehicles/EnteringVehicle.ts`（118行）/ `ExitingVehicle.ts`（84行）/ `OpenVehicleDoor.ts`（96行） |
| **渋谷側** | `src/player/vehicle-transition.mjs` → 新規 `vehicle-interaction.mjs` / `vehicle-anchors.mjs` |
| **判断** | **adapt** |
| **依存影響** | 中。`app/ShibuyaScene.tsx` の遷移処理に触る |
| **実行コスト** | 無視できる |
| **アセット** | **乗降アニメが要る**（現状 Enter/Exit の2本のみ） |
| **リスク** | 中 |

**持ち込むべき3点**:

1. **キャラを車に親子化する**
   ```ts
   (this.seat.vehicle as THREE.Object3D).attach(this.character);
   ```
   こちらはワールド座標で補間しているだけなので、**遷移中に車が動くと体が置き去りになる。**

2. **補間係数をバネで駆動**
   ```ts
   this.factorSimulator = new SpringSimulator(60, 10, 0.5);
   this.factorSimulator.target = 1;
   ```
   こちらは `smooth=t*t*(3-2*t)` の固定イージング。

3. **入る側を判定して左右のアニメを出し分ける**
   ```ts
   const side = Utils.detectRelativeSide(entryPoint, seat.seatPointObject);
   this.playAnimation(this.animData[side], 0.1);
   ```
   こちらは左右の区別がない。

**アンカーが `entryPoint`（ドア外）と `seatPointObject`（座席）に分かれている**のも重要。
こちらは `doorstep()` が降車位置を探すだけで、乗車側のアンカーがない。

---

### 1-6. `src/player/vehicle.mjs` / `vehicle-visual.mjs` ← Sketchbook

| | |
|---|---|
| **参照ファイル** | `src/ts/vehicles/VehicleSeat.ts`（76行）/ `VehicleDoor.ts`（158行） |
| **渋谷側** | `src/player/vehicle-anchors.mjs`（新規） |
| **判断** | **adapt（データ構造のみ）** |
| **リスク** | 低 |

Sketchbook は座席とドアを**シーングラフ上のオブジェクト**として持つ（モデルに埋め込まれた空オブジェクト）。
こちらは車をコードで生成しているので、**同じ役割を定数で持てばよい**。モデル読み込みは不要。

---

### 1-7. traffic / crowd 統合 ← gta7 と LEONIDA

| | |
|---|---|
| **参照** | gta7 `src/systems/Vehicles.ts`（750行）、LEONIDA `src/systems/vehicles/PlayerControl.ts` |
| **渋谷側** | `src/traffic/simulation.mjs` + `src/player/vehicle.mjs` |
| **判断** | **adapt** |
| **依存影響** | **大**。信号占有権と車線に触る |
| **リスク** | **高** |

**LEONIDA から取るべき2点**:

1. **`PendingEnter` による中断可能な乗車**
   ```ts
   const far = player.position.distanceTo(v.position) > I.cancelDistance + v.length/2;  // 5m
   if (!v.isAlive || far) { this.pending = null; return; }
   ```
   こちらの `vehicle-transition.mjs` は `begin()` したら**必ず完走する**。

2. **走行中の車の運転手は「仮想」**
   `src/entities/Vehicle.ts:85` — *spawned as a real ped on carjack/panic*。
   1000台に1000人を持たせない設計で、**こちらの1978人固定プールと同じ発想**。

**gta7 からは HUD の層順**: `TouchControls.ts:62` が `z-index:5` で HUD の**下**、
`:103` がアクションボタンを **2列グリッド**（コメント: *a tall column pushed the top button off the top edge*）。
こちらは `.tc` が `z-index:1150` で `.play-hud` の 35 の**上**にあり、実機で潰れている。

---

## 2. ライセンス上の扱い

**現時点でコードは1行も転記していない。** 読んで設計を理解しただけ。

今後の方針:

- **逐語的に写した場合** → `LICENSES/` に当該 MIT 全文を追加し、ファイル冒頭に出典コミットを明記
- **思想だけ参考にして書き直した場合** → 本ドキュメントの記載をもって記録とする

GTA5 / Rockstar / 流出コード / 抽出アセットは**一切使用しない**。

---

## 3. 自己レビュー — RUN 2〜14 の計画に対する変更提案

計画どおり、**変更すべき点が見つかった場合のみ理由を明記**する。6点ある。

### 提案1 ★重要 — RUN 2 は「高品質キャラの出所」が未決のまま着手できない

RUN 2 は「load high fidelity character」を要求するが、**そのモデルがどこから来るのかが計画に無い。**
GTA資産は禁止、と書かれているだけ。選択肢は2つで、**これは所有者の判断**:

- **(a) 自前生成を磨き続ける** — 外部アセット0を維持。容量増0。ただし上限は低い
- **(b) Quaternius Universal Animation Library（CC0）を近距離枠にだけ入れる** — 近接戦闘コンボ含む
  130本以上、glTF、**CC0なので公開リポジトリへの commit が方針と衝突しない**

**RUN 2 に入る前に決めていただきたい。** 決まらないまま着手すると作り直しになる。

### 提案2 — RUN 11（車の見た目）を RUN 2 の直後へ繰り上げ

**RUN 0 のスクショで、画面上いちばん足を引っ張っているのは車**（`vehicle-driving` の自車は灰色の平板）。
そして**手法は既に確定している**（RoundedBox + 窓の穴 + ホイールアーチ + 手続き的運転手、
外部アセット不要、検証済みレンダリングあり）。優先度8番に置くのは、画面への寄与と合っていない。

### 提案3 — RUN 4 は `FootIK.ts` ではなく `twoBoneIK.ts` のみを移植対象にする

理由は §1-1。メッシュ raycast と cm 単位という2つの非互換がある。
**こちらの高さ関数の方が速い**ので、劣化ではなく適応。

### 提案4 — RUN 8 の物理エンジンを明示する必要がある

計画は ragdoll を要求するが、エンジンを指定していない。Rapier を入れると
**WASM が起動経路に乗り**、このプロジェクトの最優先方針（起動時間）と衝突する。

**推奨**: 新規依存を入れず、既存の `simulation.mjs` の `fly()`（弾道・回転・接地・スライド）を
関節数体に拡張する自前実装。既に「飛んで転がる」は動いている。

### 提案5 — RUN 3 / RUN 4 の受け入れ判定は、この環境では下せない

計画は各RUNで「実Chrome確認 → screenshot → 自己レビュー」を要求するが、
**この環境は SwiftShader で 0.1〜0.3fps**。RUN 0 で実測した:

> 25秒キーを押し続けてもプレイヤーは (12,24) → (11,21) の3mしか動かない

したがって「足滑り」「歩行開始のsnap」「180度回転の瞬間回転」「Idle/Walk/Run間のpop」は
**静止画では判定不能**。

**提案**: RUN 3 / RUN 4 は「実装 + 数値検証 + 静止画」までをこの環境で行い、
**受け入れ判定は実機に持ち越す**。計画の「1 RUN で問題が残っている状態で次へ進まない」に
形式的には反するが、**この環境で判定したふりをするより正直**だと考える。

### 提案6 — RUN 0 で見つかった既存の不具合を RUN 13 より前に扱う

事前生成パックに **`life.high` しか無い**ため、`medium`/`low` はランタイム生成に落ちる。
**低ティアほど起動が重い。** スマホは低ティアを選ぶので、実害の可能性がある。
性能回（RUN 13）を待たず、**実機で確認する価値がある**。

---

## 4. 変更しない点

以下は計画どおりで良いと判断した。

- 二層構造（遠景インスタンシング / 近距離リグ）の維持
- 全2000人の SkinnedMesh 化・AnimationMixer 化・IK 化の禁止
- 近距離リグ枠 HIGH 32 / MEDIUM 12 / LOW 4 の維持
- IK 予算 HIGH: player + 8、MEDIUM: player + 4、LOW: player のみ
- RUN の順序（提案2を除く）
- 警察 / 手配度 / ミッション / 銃器を範囲外とすること
