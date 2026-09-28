import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('build entrypoint is cross-platform, local and bounded',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
 const runner=readFileSync(new URL('../scripts/build-verified.mjs',import.meta.url),'utf8');
 assert.equal(pkg.scripts.build,'node scripts/build-verified.mjs');
 assert.match(runner,/node_modules','vinext','dist','cli\.js/);
 assert.match(runner,/SITES_BUILD_TIMEOUT_MS/);
 assert.match(runner,/child\.kill\('SIGTERM'\)/);
 assert.doesNotMatch(pkg.scripts.build,/\bbash\b|\bwsl\b/);
});
