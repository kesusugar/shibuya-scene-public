// A failed shader can silently expose the ground beneath a missing mesh.
// Keep the diagnostic out of the render loop and report once per renderer.
export function watchShaderErrors(renderer, report, log = console.error) {
  if (!renderer) return () => {};
  const debug = renderer.debug;
  const previous = debug.onShaderError;
  const previousCheck = debug.checkShaderErrors;
  let reported = false;
  const handler = (gl, program, vertex, fragment) => {
    if (!reported) {
      reported = true;
      log('[Shibuya shader compilation failed]', {
        program: gl.getProgramInfoLog(program),
        vertex: gl.getShaderInfoLog(vertex),
        fragment: gl.getShaderInfoLog(fragment),
      });
      report('描画シェーダーのコンパイルに失敗しました。一部の道路・建物が表示されていない可能性があります。');
    }
    previous?.(gl, program, vertex, fragment);
  };
  debug.checkShaderErrors = true;
  debug.onShaderError = handler;
  return () => {
    if (debug.onShaderError !== handler) return;
    debug.onShaderError = previous;
    debug.checkShaderErrors = previousCheck;
  };
}
