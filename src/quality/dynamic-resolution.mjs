// Dynamic resolution (GTA-FIDELITY-STATUS §9aj G3; PLAN-PERFORMANCE-AND-PAD P1).
//
// When the frame takes longer than its budget AND the time is not being spent on the CPU (the
// scene's own update and draw submission), the GPU is what is behind: fewer pixels is then the
// cheapest frame there is. The render scale comes down a step, and goes back up a half step when
// frames are comfortably inside the budget again. When the CPU is what is slow, fewer pixels would
// only blur the picture without making it faster, so it is left alone.
//
// Pure: `sample(intervalMs, cpuMs, dt)` returns true when the scale changed, and the caller sets
// the renderer's pixel ratio to its tier ratio times `scale`. Changes are spaced out
// (`every`), because each one reallocates the render targets.
export const DYNRES = Object.freeze({
 min: .6,             // never below this share of the tier's resolution
 step: .1,            // down this much at a time; up half as much
 every: 1.25,         // s between changes
 over: 1.12,          // frame interval above budget * over: too slow
 under: .82,          // frame interval below budget * under: room to spare
 gpuShare: .35,       // at least this share of the interval not on the CPU: the GPU is the limit
 smoothing: .1        // weight of each new frame in the running averages
});

/** @param {{budgetMs?:number, enabled?:boolean}} [options] budgetMs: the tier's frame time (1000 / fps cap). */
export function createDynamicResolution({budgetMs = 1000 / 60, enabled = true} = {}) {
 let scale = 1, interval = null, cpu = null, since = 0, on = enabled, changes = 0;
 return {
  get scale() {return on ? scale : 1;},
  get enabled() {return on;},
  get changes() {return changes;},
  get averages() {return {intervalMs: interval, cpuMs: cpu};},
  setBudget(ms) {budgetMs = ms; interval = cpu = null; since = 0;},
  setEnabled(v) {on = !!v; if (!on) scale = 1; interval = cpu = null; since = 0;},
  /** One frame: how long it took end to end, how much of that was CPU work, and dt (s). */
  sample(intervalMs, cpuMs, dt) {
   if (!on || !(intervalMs > 0)) return false;
   const k = DYNRES.smoothing;
   interval = interval === null ? intervalMs : interval + (intervalMs - interval) * k;
   cpu = cpu === null ? cpuMs : cpu + (cpuMs - cpu) * k;
   since += Math.max(0, dt || 0);
   if (since < DYNRES.every) return false;
   const gpuBound = (interval - cpu) >= interval * DYNRES.gpuShare;
   let next = scale;
   if (interval > budgetMs * DYNRES.over && gpuBound) next = Math.max(DYNRES.min, scale - DYNRES.step);
   else if (interval < budgetMs * DYNRES.under) next = Math.min(1, scale + DYNRES.step / 2);
   if (Math.abs(next - scale) < 1e-6) return false;
   scale = Math.round(next * 100) / 100; since = 0; changes++;
   return true;
  },
  reset() {scale = 1; interval = cpu = null; since = 0;}
 };
}
