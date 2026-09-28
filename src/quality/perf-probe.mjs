// Where a frame's time goes, on the device (PLAN-PERFORMANCE-AND-PAD P0).
//
// The cloud sessions that build this scene only have a software renderer, so every frame-rate
// decision has to come from the user's own PC. This is the instrument: `?perf=1` times each part
// of the frame -- every scene module's update, the player's update, the render -- plus the GPU's
// own time where the browser exposes a timer query, and the draw calls and triangles. `?perf=sweep`
// (perf-sweep.mjs) switches features off one at a time and records the difference.
//
// Cheap when off: nothing here runs unless the probe was created, and the scene only creates it
// under `?perf=`. The accumulation is pure and tested (tests/perf-probe.test.mjs).

export const PERF = Object.freeze({
 window: 120,          // frames kept for the rolling figures
 publishEvery: .5      // s between two overlay refreshes
});

/** Frame-time statistics over a list of milliseconds. Pure. */
export function frameStats(ms) {
 const a = ms.filter(Number.isFinite).slice().sort((x, y) => x - y);
 if (!a.length) return {frames: 0, mean: null, p50: null, p95: null, max: null, fps: null};
 const at = q => a[Math.min(a.length - 1, Math.floor(q * (a.length - 1) + .5))];
 const mean = a.reduce((s, v) => s + v, 0) / a.length;
 return {frames: a.length, mean: +mean.toFixed(2), p50: +at(.5).toFixed(2), p95: +at(.95).toFixed(2),
  max: +a[a.length - 1].toFixed(2), fps: +(1000 / mean).toFixed(1)};
}

/**
 * The probe. `now()` is the clock (performance.now in the page, injectable for the test).
 * Per frame: `frameStart()`, then any number of `begin(name)` / `end(name)` pairs, then
 * `frameEnd({drawCalls, triangles})`. Sections may repeat inside a frame; their time adds up.
 */
/** @param {{now?:()=>number, window?:number, gl?:any}} [options] */
export function createPerfProbe({now = () => performance.now(), window = PERF.window, gl = null} = {}) {
 const frames = [];                  // [{total, sections: {name: ms}, gpu, drawCalls, triangles}]
 const open = new Map();
 let current = null, started = 0, lastEnd = null;
 const gpu = createGpuTimer(gl);

 const api = {
  get gpuAvailable() {return gpu.available;},
  frameStart() {
   const t = now();
   // Wall time between two frame starts is the real frame interval (what fps is).
   current = {interval: lastEnd === null ? null : t - lastEnd, sections: {}, total: 0, gpu: null};
   lastEnd = t; started = t; open.clear();
  },
  begin(name) {if (current) open.set(name, now());},
  end(name) {
   if (!current || !open.has(name)) return;
   current.sections[name] = (current.sections[name] ?? 0) + now() - open.get(name); open.delete(name);
  },
  /** Time a function as a section. */
  time(name, fn) {api.begin(name); try {return fn();} finally {api.end(name);}},
  gpuBegin() {gpu.begin();},
  gpuEnd() {gpu.end();},
  frameEnd({drawCalls = null, triangles = null} = {}) {
   if (!current) return;
   current.total = now() - started;
   current.gpu = gpu.poll();
   current.drawCalls = drawCalls; current.triangles = triangles;
   frames.push(current); if (frames.length > window) frames.shift();
   current = null;
  },
  /** Rolling figures over the kept frames. */
  summary() {
   const names = new Set(); for (const f of frames) for (const n of Object.keys(f.sections)) names.add(n);
   const sections = {};
   for (const n of names) {
    const v = frames.map(f => f.sections[n] ?? 0);
    sections[n] = +(v.reduce((s, x) => s + x, 0) / Math.max(1, v.length)).toFixed(3);
   }
   const gpuMs = frames.map(f => f.gpu).filter(Number.isFinite);
   const last = frames[frames.length - 1] ?? {};
   return {interval: frameStats(frames.map(f => f.interval)), cpu: frameStats(frames.map(f => f.total)),
    gpu: gpuMs.length ? frameStats(gpuMs) : null, sections,
    drawCalls: last.drawCalls ?? null, triangles: last.triangles ?? null};
  },
  reset() {frames.length = 0; lastEnd = null; current = null;},
  get frames() {return frames.length;}
 };
 return api;
}

/**
 * GPU frame time through EXT_disjoint_timer_query_webgl2, when the browser exposes it. Queries
 * are read a few frames late (they are asynchronous) and dropped when the GPU was disjoint;
 * `poll()` returns a result only on the frame it arrives (null otherwise).
 * Without the extension every call is a no-op and `poll()` returns null.
 */
/** @param {any} gl */
export function createGpuTimer(gl) {
 const ext = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null;
 const pending = [];
 let active = null;
 return {
  get available() {return !!ext;},
  begin() {if (!ext || active) return; active = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, active);},
  end() {if (!ext || !active) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null;},
  poll() {
   if (!ext) return null;
   const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
   let latest = null;
   while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
    const q = pending.shift();
    const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
    gl.deleteQuery(q);
    if (!disjoint) latest = ns / 1e6;
   }
   while (pending.length > 8) gl.deleteQuery(pending.shift());
   return latest;
  }
 };
}
