// The automatic A/B for P0 (PLAN-PERFORMANCE-AND-PAD). One URL on the device, `?perf=sweep`,
// and the scene measures itself: a baseline, then each feature switched off in turn, then the
// baseline again (so drift over the run shows), each held for `settle` seconds before `measure`
// seconds are recorded. The difference against the baseline is what that feature costs.
//
// Pure sequencing: the scene supplies `apply(offSet)` (switch features), the probe, and calls
// `update(dt)` once a frame with wall-clock seconds.

/** The features the sweep switches off, one per step. The scene knows how to apply each. */
export const SWEEP_FEATURES = Object.freeze([
 'shadow', 'gtao', 'bloom', 'smaa', 'post', 'mirror',
 'crowd', 'hqcrowd', 'nearchars', 'traffic', 'trains', 'signs', 'streetscape', 'nightglow', 'buildings',
 'render'
]);

/** The steps of a sweep: baseline, one per feature, baseline. */
export function sweepSteps(features = SWEEP_FEATURES) {
 return [{id: 'baseline', off: []}, ...features.map(f => ({id: 'off:' + f, off: [f]})), {id: 'baseline-again', off: []}];
}

/**
 * Each step's cost against the mean of the two baselines, in milliseconds of frame interval
 * (positive: the feature costs that much). Pure.
 */
export function sweepCosts(results) {
 const base = results.filter(r => r.id.startsWith('baseline')).map(r => r.summary?.interval?.mean).filter(Number.isFinite);
 const b = base.length ? base.reduce((s, v) => s + v, 0) / base.length : null;
 return results.filter(r => r.id.startsWith('off:')).map(r => {
  const m = r.summary?.interval?.mean;
  return {feature: r.id.slice(4), frameMs: m ?? null, savesMs: b !== null && Number.isFinite(m) ? +(b - m).toFixed(2) : null,
   fps: r.summary?.interval?.fps ?? null};
 }).sort((x, y) => (y.savesMs ?? -Infinity) - (x.savesMs ?? -Infinity));
}

/**
 * @param {{probe:any, apply:(off:Set<string>)=>void, steps?:any[], settle?:number, measure?:number, minFrames?:number, onDone?:null|((result:any)=>void)}} options
 */
export function createPerfSweep({probe, apply, steps = sweepSteps(), settle = 1.5, measure = 4, minFrames = 20, onDone = null} = {}) {
 let index = -1, phase = 'idle', clock = 0;
 const results = [];
 const start = i => {index = i; phase = 'settle'; clock = 0; apply(new Set(steps[i].off));};
 const api = {
  get running() {return phase !== 'idle' && phase !== 'done';},
  get done() {return phase === 'done';},
  get step() {return index >= 0 && index < steps.length ? steps[index].id : null;},
  get progress() {return {index: Math.max(0, index), total: steps.length, phase};},
  results,
  begin() {results.length = 0; start(0);},
  update(dt) {
   if (!api.running) return;
   clock += Math.max(0, dt);
   if (phase === 'settle' && clock >= settle) {phase = 'measure'; clock = 0; probe.reset();}
   else if (phase === 'measure' && clock >= measure && probe.frames >= minFrames) {
    results.push({id: steps[index].id, off: steps[index].off, seconds: +clock.toFixed(2), summary: probe.summary()});
    if (index + 1 < steps.length) start(index + 1);
    else {phase = 'done'; apply(new Set()); onDone?.({results, costs: sweepCosts(results)});}
   }
  },
  cancel() {if (api.running) {phase = 'done'; apply(new Set());}}
 };
 return api;
}
