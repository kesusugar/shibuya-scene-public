// The ?perf= panel (PLAN-PERFORMANCE-AND-PAD P0): the rolling figures from perf-probe.mjs, the
// sweep's progress, and when it finishes, the table of what each feature costs with a button to
// save the JSON (and a copy button, for pasting into a chat).

const ms = v => Number.isFinite(v) ? v.toFixed(1) : '—';

/** @param {{onSweep?:null|(()=>void)}} [options] */
export function createPerfOverlay({onSweep = null} = {}) {
 if (typeof document === 'undefined') return {update() {}, results() {}, save() {}, dispose() {}};
 const root = document.createElement('section');
 root.className = 'perf-overlay';
 root.setAttribute('aria-label', 'パフォーマンス計測');
 root.innerHTML = `<header><b>計測 ?perf</b><button type="button" class="perf-sweep">自動計測（約2分）</button></header>
  <pre class="perf-now">…</pre><div class="perf-result"><pre>自動計測の結果はここに出ます。終わると JSON が自動で保存されます。</pre>
  <button type="button" class="perf-save" disabled>JSON を保存</button><button type="button" class="perf-copy" disabled>コピー</button></div>`;
 document.body.appendChild(root);
 const now = root.querySelector('.perf-now'), result = root.querySelector('.perf-result');
 let payload = null;
 root.querySelector('.perf-sweep').onclick = () => onSweep?.();
 const save = () => {
  if (!payload) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 1)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = `shibuya-perf-${Date.now()}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
 };
 root.querySelector('.perf-save').onclick = save;
 root.querySelector('.perf-copy').onclick = () => {if (payload) navigator.clipboard?.writeText(JSON.stringify(payload)).catch(() => {});};
 return {
  /** The rolling summary, the sweep's progress (or null), and context lines. */
  update(summary, {sweep = null, context = {}} = {}) {
   const top = Object.entries(summary.sections).sort((a, b) => b[1] - a[1]).slice(0, 12);
   now.textContent = [
    `fps ${summary.interval.fps ?? '—'}  frame ${ms(summary.interval.mean)} ms (p95 ${ms(summary.interval.p95)})`,
    `CPU ${ms(summary.cpu.mean)} ms  GPU ${summary.gpu ? ms(summary.gpu.mean) + ' ms' : '（取得不可）'}`,
    `draw ${summary.drawCalls ?? '—'}  tri ${summary.triangles ? (summary.triangles / 1e6).toFixed(2) + ' M' : '—'}`,
    ...Object.entries(context).map(([k, v]) => `${k} ${v}`),
    '— CPU 内訳 (ms/frame) —',
    ...top.map(([n, v]) => `${n.padEnd(22)} ${v.toFixed(2)}`),
    ...(sweep ? [`自動計測: ${sweep.index + 1}/${sweep.total} ${sweep.step ?? ''} (${sweep.phase})`] : [])
   ].join('\n');
  },
  /** The sweep's result: the costs table, and the JSON to save. */
  results(data) {
   payload = data;
   result.querySelector('.perf-save').disabled = false; result.querySelector('.perf-copy').disabled = false;
   result.querySelector('pre').textContent = ['機能を切ったときに減った時間（大きいほど重い）',
    ...data.costs.map(c => `${c.feature.padEnd(12)} ${c.savesMs === null ? '—' : (c.savesMs >= 0 ? '-' : '+') + Math.abs(c.savesMs).toFixed(1) + ' ms'}  → ${c.fps ?? '—'} fps`)].join('\n');
  },
  /** Save the JSON now (the sweep calls this when it finishes, so nothing has to be pressed). */
  save,
  dispose() {root.remove();}
 };
}
