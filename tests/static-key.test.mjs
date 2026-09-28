import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {staticModelKey, geometryPackageVersions, GEOMETRY_PACKAGES, LOCK_FILE, STATIC_ROOTS} from '../build/static-model-key.mjs';

/**
 * A throwaway copy of exactly the files the key reads, so the lock can be mutated without
 * touching the working tree.
 */
function sandbox() {
 const root = mkdtempSync(join(tmpdir(), 'shibuya-key-'));
 for (const file of [...staticModelKey(process.cwd()).files, LOCK_FILE]) {
  const target = join(root, file);
  mkdirSync(dirname(target), {recursive: true});
  copyFileSync(resolve(process.cwd(), file), target);
 }
 return root;
}

const withLock = (root, mutate) => {
 const lock = JSON.parse(readFileSync(join(root, LOCK_FILE), 'utf8'));
 mutate(lock);
 writeFileSync(join(root, LOCK_FILE), JSON.stringify(lock, null, 2));
 return staticModelKey(root).key;
};

test('the baked pack on disk matches the key its inputs produce', () => {
 const pack = JSON.parse(readFileSync('public/data/shibuya-static-models.json', 'utf8'));
 assert.equal(pack.key, staticModelKey(process.cwd()).key,
  'the committed pack is stale: every clean checkout will rebuild its geometry at runtime');
});

test('the key survives a lock file rewritten by another machine', () => {
 // npm records optional platform-specific packages, so the same dependency set produces
 // different lock bytes per operating system. Hashing those bytes made a pack baked on one
 // machine unusable on every other one, which is silently expensive: the scene falls back
 // to rebuilding all of its geometry on every single load.
 const root = sandbox();
 try {
  const before = staticModelKey(root).key;
  const after = withLock(root, lock => {
   lock.packages['node_modules/@img/sharp-win32-x64'] = {version: '0.34.1', optional: true, os: ['win32']};
   lock.packages['node_modules/@rollup/rollup-win32-x64-msvc'] = {version: '4.0.0', optional: true, os: ['win32']};
   lock.lockfileVersion = 3;
  });
  assert.equal(after, before, 'a platform-specific lock entry must not discard the geometry pack');
 } finally {rmSync(root, {recursive: true, force: true});}
});

test('the key still tracks the libraries the geometry is built with', () => {
 const root = sandbox();
 try {
  const before = staticModelKey(root).key;
  for (const name of GEOMETRY_PACKAGES) {
   const after = withLock(root, lock => {lock.packages['node_modules/' + name].version = '99.0.0';});
   assert.notEqual(after, before, `upgrading ${name} must invalidate the pack`);
   // put it back for the next package
   withLock(root, lock => {lock.packages['node_modules/' + name].version =
    JSON.parse(readFileSync(resolve(process.cwd(), LOCK_FILE), 'utf8')).packages['node_modules/' + name].version;});
  }
  assert.equal(staticModelKey(root).key, before, 'restoring the versions must restore the key');
 } finally {rmSync(root, {recursive: true, force: true});}
});

test('the key covers every source file the bake reads', () => {
 const {files, packages} = staticModelKey(process.cwd());
 for (const root of STATIC_ROOTS) assert.ok(files.includes(root), `${root} is not in the key`);
 assert.ok(files.includes('public/data/shibuya-scene-data.json'), 'scene data is not in the key');
 assert.ok(!files.includes(LOCK_FILE), 'the lock file is back in the hash');
 assert.deepEqual(packages.map(p => p.split('@')[0]), GEOMETRY_PACKAGES);
 for (const spec of packages) assert.match(spec, /^[a-z@/-]+@\d+\.\d+\.\d+/);
});

test('a dependency change is still watched even though it is not hashed', () => {
 const {watch, files} = staticModelKey(process.cwd());
 assert.ok(watch.includes(LOCK_FILE), 'editing the lock would not invalidate the virtual module');
 for (const file of files) assert.ok(watch.includes(file), `${file} is hashed but not watched`);
});

test('a missing geometry package is reported, not silently ignored', () => {
 const root = sandbox();
 try {
  assert.throws(() => withLock(root, lock => {delete lock.packages['node_modules/three'];}), /three/);
 } finally {rmSync(root, {recursive: true, force: true});}
 assert.deepEqual(geometryPackageVersions(process.cwd()).map(p => p.split('@')[0]), GEOMETRY_PACKAGES);
});
