import test from 'node:test';
import assert from 'node:assert/strict';
import {watchShaderErrors} from '../src/fidelity/shader-errors.mjs';

test('shader failure reports once, retains diagnostics and restores the renderer hook', () => {
  let previousCalls = 0;
  const previous = () => previousCalls++;
  const renderer = {debug: {onShaderError: previous, checkShaderErrors: false}};
  const reports = [], logs = [];
  const dispose = watchShaderErrors(renderer, value => reports.push(value), (...args) => logs.push(args));
  const gl = {getProgramInfoLog: () => 'link failed', getShaderInfoLog: shader => shader};
  renderer.debug.onShaderError(gl, {}, 'vertex log', 'fragment log');
  renderer.debug.onShaderError(gl, {}, 'vertex log', 'fragment log');
  assert.equal(reports.length, 1);
  assert.equal(logs[0][1].fragment, 'fragment log');
  assert.equal(previousCalls, 2);
  assert.equal(renderer.debug.checkShaderErrors, true);
  dispose();
  assert.equal(renderer.debug.onShaderError, previous);
  assert.equal(renderer.debug.checkShaderErrors, false);
});

test('cleanup does not overwrite a newer diagnostic owner and supports no WebGL', () => {
  watchShaderErrors(null, () => {})();
  const renderer = {debug: {onShaderError: null, checkShaderErrors: true}};
  const dispose = watchShaderErrors(renderer, () => {});
  const newer = () => {};
  renderer.debug.onShaderError = newer;
  dispose();
  assert.equal(renderer.debug.onShaderError, newer);
});
