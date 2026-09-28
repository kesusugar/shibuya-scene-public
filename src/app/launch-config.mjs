import {parseConfig} from './foundation.mjs';

// Presentation defaults live outside the geometry dependency graph so changing
// the landing view does not invalidate the expensive static model pack.
/**
 * `?hq=` -> how many pedestrians the high-fidelity crowd may draw.
 *
 * 0:    explicitly off (`hq=0` / `hq=false`): the legacy instanced bodies, kept as a rollback.
 * -1:   on, at whatever the tier allows. This is also the DEFAULT when `hq` is absent: the
 *       legacy bodies are the old-model crowd, and nobody should see them by accident.
 * n:    on, capped at n.
 *
 * A number rather than a boolean-or-number union so the config object stays simply typed;
 * the caller reads -1 as "tier default".
 */
function hqBudget(raw) {
  if (raw === null || raw === '' || raw === '1' || raw === 'true') return -1;
  if (raw === '0' || raw === 'false') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : -1;
}

export function parseLaunchConfig(search = '') {
  const params = new URLSearchParams(search);
  if (!params.has('tier')) params.set('tier', 'high');
  if (!params.has('time')) params.set('time', 'night');
  const config = parseConfig(params.toString());
  config.explicitTime = new URLSearchParams(search).has('time');
  // RUN 7B. `hq` chooses the high-fidelity crowd renderer and how many of the ~1978
  // pedestrians it may draw: absent or `hq=1` for the tier default, `hq=512` for an explicit
  // budget, `hq=0` for the legacy instanced bodies. The legacy renderer stays in place as a
  // one-parameter rollback.
  config.hqCrowd = hqBudget(new URLSearchParams(search).get('hq'));
  return config;
}
