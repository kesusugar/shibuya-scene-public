import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLaunchConfig} from '../src/app/launch-config.mjs';
import {staticModelKey} from '../build/static-model-key.mjs';

test('bare landing URL uses the prebuilt HIGH night presentation', () => {
  const config = parseLaunchConfig();
  assert.equal(config.tier, 'high');
  assert.equal(config.time, 'night');
  assert.equal(config.camera, 'scramble');
  assert.equal(config.explicitTime, false);
  const pack = JSON.parse(readFileSync('public/data/shibuya-static-models.json', 'utf8'));
  assert.equal(pack.key, staticModelKey(process.cwd()).key);
  for (const kind of ['signs', 'street', 'traffic', 'life']) assert.ok(pack[kind][config.tier]);
  const loader = readFileSync('src/quality/static-models.mjs', 'utf8');
  assert.match(loader, /fetch\('data\/shibuya-static-models\.json\?v='\+expectedKey\)/);
});

test('explicit tier, day, camera, QA and module controls remain available', () => {
  for (const tier of ['high', 'medium', 'low']) {
    const config = parseLaunchConfig(`?tier=${tier}&time=day&camera=qfront&skip=life`);
    assert.equal(config.tier, tier);
    assert.equal(config.time, 'day');
    assert.equal(config.explicitTime, true);
    assert.equal(config.camera, 'qfront');
    assert.deepEqual(config.skip, ['life']);
  }
  assert.equal(parseLaunchConfig('?qa=1&tier=low').tier, 'high');
});

test('preview and UI tests keep separate optimizer caches', () => {
  const preview = readFileSync('scripts/dev-local.mjs', 'utf8');
  const ui = readFileSync('tests/ui-components.test.mjs', 'utf8');
  assert.match(preview, /cacheDir:.*vite-local/);
  assert.match(ui, /cacheDir:.*vite-ui-tests/);
});

test('the HQ crowd is the default; hq=0 / hq=false remain the legacy rollback', () => {
  // Absent: the tier default, not the legacy capsule crowd.
  assert.equal(parseLaunchConfig().hqCrowd, -1);
  assert.equal(parseLaunchConfig('?tier=medium&time=day').hqCrowd, -1);
  for (const on of ['?hq', '?hq=', '?hq=1', '?hq=true']) assert.equal(parseLaunchConfig(on).hqCrowd, -1, on);
  for (const off of ['?hq=0', '?hq=false']) assert.equal(parseLaunchConfig(off).hqCrowd, 0, off);
  assert.equal(parseLaunchConfig('?hq=512').hqCrowd, 512);
  assert.equal(parseLaunchConfig('?hq=128.9').hqCrowd, 128);
  // Garbage never silently falls back to the legacy bodies.
  assert.equal(parseLaunchConfig('?hq=yes').hqCrowd, -1);
});
