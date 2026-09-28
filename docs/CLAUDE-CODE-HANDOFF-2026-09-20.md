# Claude Code 引き継ぎ — Shibuya Scene / GTA Tokyo化

この文書を最初に読み、次に `AGENTS.md` と `docs/IMPLEMENTATION-STATUS.md` を読むこと。
ユーザーの最優先事項は **事前生成による起動負荷・容量の抑制、実画面で確認して改善する反復**。
既存の渋谷の街・看板・UIを保ちながら、人間と車の動き・ゲーム性を高める。
街再現の旧S0–S16と、下記のゲーム性改善7段階は別の計画。

## 受け渡すコード

- Repository: https://github.com/kesusugar/shibuya-scene
- 作業ブランチ: `codex/prebaked-motion`
- この7段階の出発点: `23e3d8f`（PR #16 merge）。最新GitHubとは未照合。
- 第6段階までのHEAD: `816fb0b`。この文書を追加した後の最終SHAは `git log -1` で確認。
- このセッションではpushしていない。GitHubだけをcloneしても以下の変更がない可能性がある。
- 移行用 `shibuya-scene-handoff.bundle` にこのブランチと到達可能な履歴を収録。node_modulesや秘密情報・環境設定は含まない。

### bundleから安全に新しい作業フォルダを作る

```powershell
git clone -b codex/prebaked-motion "<LOCAL_PATH>\shibuya-scene-handoff.bundle" shibuya-scene-handoff
cd shibuya-scene-handoff
git remote rename origin handoff-bundle
git remote add origin https://github.com/kesusugar/shibuya-scene.git
git switch -c claude/playable-validation
npm ci
npm run typecheck
npm test
```

既存チェックアウトを使う場合は未コミット変更を保護し、bundleから別ブランチへfetchして比較する。
現在のmasterをresetしたり、既存のClaude変更を上書きしない。push/mergeはユーザーの指示時のみ。

## 実装済みの内容

| 段階 | commit | 内容・主なファイル |
| --- | --- | --- |
| 1 車両運動 | `fbb0f15` | `vehicle-dynamics.mjs`：前後・横方向の慣性、速度依存操舵、ハンドブレーキ、四輪サスペンション。`bake-playable.mjs`：6車種をオフライン生成 |
| 2 人物基盤 | `1952a79` | `bake-character.mjs` / `figure.mjs`：オリジナル人物、11ボーン・6描画バッチ、歩行/走行/殴打/被弾/乗降/倒れる等の事前生成クリップ |
| 3 近距離NPC | `25156e8` | `near-characters.mjs`：HIGH32 / MEDIUM12 / LOW4体のリグプール。ジオメトリ共有・1フレーム1体ずつ追加。遠方は従来のインスタンス描画 |
| 4 危険予測 | `0054289` | `pedestrian-threat.mjs`：旋回・後退含む1.6秒予測、退避方向の歩行可否確認、10Hz/最大64候補。Startle/Guardを加え計12クリップ |
| 5 衝突応答 | `52fb245` | `vehicle-contact.mjs`：壁/車接触で法線方向に減速、接線方向に滑る、エネルギー上限付き回転、損傷連打抑制。後退/横滑りの計算修正 |
| 6 読み込み | `816fb0b` | `deferred-vehicle-visual.mjs`：詳細車両パックを必要時に読み込み。待機中は既存車両を表示。破棄・退出・読込失敗対策。人物キーの重複を事前削減 |
| 7 検証機能 | この文書と同じ最終commit | `frame-samples.mjs`：フレーム計測。QA待ちのタイムアウト・破棄処理、撮影後の画角/太陽フェーズ復元。`run-visual-qa.mjs`の記録/実行上限を強化 |

元からある機能：プレイヤー歩行、近接格闘/死亡、車両奪取、乗降遷移、ドライブ、歩行者への接触、配達UI等。
本セッションがそれらを全て新規実装したわけではない。`tests/player-experience.test.mjs` と `app/ShibuyaScene.tsx` が統合の入口。

参考に調べたCabsolutelyは https://github.com/ilkerzg/cabsolutely 、参照commit `c881e651`。
MITコード参考の記載は `LICENSES/cabsolutely.txt`。ライセンス対象外の人物・車両・テクスチャを転載していない。
人物は独自の簡略化モデルであり、Cabsolutely/GTA5相当の写実表現は未達。

## 測定済み / 未測定を混同しない

第6段階の本番ビルド測定（共通Three.js/React等を除くシーンchunk）：

- raw 2,887,409 → 1,151,266 bytes、gzip 545,580 → 393,398 bytes。
- 約60%減は **初期シーンJSのraw容量**。ゲーム全体の容量/起動秒数が60%減ったという意味ではない。
- 車両1,691,025 bytes / gzip150,244 bytesは最初の車両使用まで延期。削除したわけではない。
- 人物module 274,441 → 228,151 bytes、gzip34,812 → 34,154 bytes。
- 人物の削減前後で56,964成分を補間比較し最大差0。最終QA機能分のchunk容量は再測定できる。
- `npm run measure:playable` でmanifestの静的依存から車両が除外されていること、容量、Nodeでの組立時間を確認可能。
- 過去報告の実機15秒起動は今回のcommitの測定値として引用しない。

この環境ではChrome実行ファイルがなく、WebGLの昼夜・実機FPS・初回乗車の引っかかりは未検証。
`docs/previews/` はモデルのSVG描画または容量比較図。**ゲーム画面のスクリーンショットではない**。
第7段階は検証機能まで実装したが、実ブラウザ合格判定は未完了。7段階完了として扱わない。

## 最優先：Claude Codeで実画面を測る

Node >=22.13、ローカルChromeを使用。有料クラウドブラウザ/APIは不要。

```powershell
npm run typecheck
npm test
npm run measure:playable
npm run dev:local
```

別のPowerShellで起動（Chromeの実際のインストール先に合わせる）：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:TEMP\shibuya-qa-profile" "http://127.0.0.1:5174/?qa=1&startupTiming=1&tier=high&time=day"
npm run qa:capture -- --url http://127.0.0.1:5174/ --cdp-port 9222 --output qa/latest --timeout-ms 300000
```

Chromeを前面に保つ。最初はdevで動作確認、起動時間/FPSの合格判定はHMR停止後の本番ビルドでも再実施。
`npm run build` 後、現在の環境で動く本番サーバを使いURLを変更する。dev値とproduction値を混ぜない。

保存内容：9枚のPNG（overview、street、QFRONT、scramble-high、Center-gaiの昼夜）、metrics.json、renderer.json、gl.json、startup.json、build.json、stage.json、playableLoading.json、console.json、run.json。
QFRONTは現状nightのみ。Hachiko/109はまだ専用撮影に含まれない。
`?startupTiming=1` がないとstartupはnull、buildはunavailable。gl.jsonはGLバージョンのみで、GPU詳細はrenderer.json。
各画角で120フレームの平均FPS、フレームp50/p95/max、50ms超フレーム数、CPU処理p95を記録。
これはGPU時間計測ではない。hiddenタブを除外し、15秒の描画待ち上限、全体5分上限。
run.jsonに実行時間・CDPコマンド数・有料クラウド呼び出し数（0）。失敗時にsuccessを捏造しない。
`?qa=1` はHIGH固定。MEDIUM/LOWは通常URLで別途検証する。

次の実機チェック：

1. コールド/ウォーム起動各3回、同一viewport/DPR/画角でREADY時間を比較。バージョン・GPUを記録。
2. プレイヤーに切替え、歩行/ダッシュ/パンチ/被弾/倒れる/復帰を昼夜で録画。
3. 初回車両乗車、乗降中の方向/ドア位置、車種切替、ハンドブレーキ、逆走、壁へ斜め衝突、信号待ち車への接触。
4. 初回詳細モデル読込中に車が消えないこと、退出しても遅れて復活しないことを確認。
5. 群衆の退避/ガード/横断信号、近距離NPCの出入り、Tier切替時の表示とメモリ回収。
6. 街の夜間看板の白飛び・人物の暗さ・車の足元の沈み・影・カメラ遮蔽をスクショ比較して修正。
7. 起動/フレーム悪化をデータで特定し、1項目修正→同条件再測定。密度/品質を無断で大幅削減しない。

## その次に実装できる箇所（優先順）

### A. 人物・乗降の見た目

独自モデルの肩/肘/膝・手足・顔・衣服のシルエット改善。ドアへ手を伸ばす、腰を落とす、足を入れる動きを既存Enter/Exitクリップとvehicle-transitionへ反映。
`bake-character.mjs` を変更して `npm run bake:character`、全アクションの変形/ブレンドと近距離プールを確認。
外部モデルを使うならコードライセンスとアセット利用条件を別々に確認。既存の事前生成・共有バッファ方式を維持。

### B. 本当の車両間衝突

現状はプレイヤー側だけの接触応答。他車はkinematicで、押し飛ばし/相互運動量/停車車両の押し出しはない。
まず駐車車両に限定した接触速度・減衰・安全位置確認を設計。その後AI走行車と経路制御の共存を設計する。
AI車を直接ずらすだけでは次tickで経路へ戻る。signal permit所有権・横断者の安全・空間grid更新を壊さない。
凹形状角で引っかかる、初期重なりからの押し出し未対応、完全な連続衝突判定/横転/空中挙動なし。

### C. 初回乗車の読み込み

6車種が一括downloadされる。実機でhitchを測り、必要なら車種別パック・選択モデルだけのimportに分割。
キャッシュ上限とdisposeを設ける。無制限のモデル複製/全モデルGPU事前アップロードは避ける。
人物パックは初期静的依存に残っている。ネットワーク/解析/GPUのどれが律速かを測ってから分割。

### D. 交通・群衆の長時間統合

既存statusに残るcrosswalk-boundary contactsとscramble traffic resumeの歴史的監査未解決項目。
`npm run test:legacy` には意図的に古いstage仕様を固定したテストがある。失敗を分類し、全通しのために現実装を退化させない。
市街地の大幅拡張・警察/手配度/ミッション追加は、上記の運動と性能が安定した後に別段階で設計。

## 変更時のゲートと守ること

- `npm run typecheck` と `npm test`。局所のloading/collision/animationテストを先に実施。
- 新しいジオメトリ/クリップはscriptsで事前生成しgeneratedへ保存。初期化時の高負荷生成へ戻さない。
- CITY static packのハッシュ対象ファイルを軽率に変更しない。必要なら正式にbakeし検証。
- mesh/materialの共有、Tier上限、disposeと非同期キャンセル、交通信号の所有権を維持。
- スクショ・実測なしに「GTA相当」「FPS達成」「実機合格」と書かない。
- 各変更で問題→修正→測定結果→残件をdocsに残す。ユーザーは段階末尾に残件数と次の実装内容を求めている。

## Claude Codeへ最初に渡す指示

「AGENTS.mdとこの引き継ぎ文書を読み、bundleの最新ブランチを基準に再開してください。
まず第7段階の実Chrome検証を完了し、スクショ・console・起動/フレーム計測から問題を修正してください。
事前生成と軽量起動を最優先とし、検証できない項目は未確認と明示してください。
その後はA（人物/乗降）→B（車両相互衝突）を小さな段階で実装し、毎回確認→修正を繰り返してください。
既存の渋谷の街・広告・UIを不用意に変えず、無断push/mergeや有料クラウド呼び出しはしないでください。」

## この受け渡し時点の検証結果

- 型チェック・本番ビルド・全current suite 186件成功。
- 最終のフレーム計測/QA関連7件成功。
- 実Chrome接続先のない環境で1秒上限の失敗経路を確認：timeout、elapsed 1001ms、CDP 0、有料クラウド0。
- 実画面のスクショは今回も取得できていない。昼夜の見た目や実機FPSは未確認。
