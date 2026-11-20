// Shared scene-colour grab for refraction and heat distortion.
//
// Transparent effects that bend what is behind them (rift membranes, heat
// haze) call grab(renderer) from their mesh's onBeforeRender. The first caller
// in a frame copies the main canvas (opaque pass plus any transparents already
// drawn) into one FramebufferTexture; later callers in the same frame reuse it.
// Nothing is copied when no consumer is visible, when rendering into a render
// target (shadow maps, portraits) or when the caller's quality disables it, so
// the cost is one framebuffer copy per frame only while a consumer is on screen.
//
// Consumers read the uniforms: uScene (sampler2D), uRes (drawing-buffer size)
// and uSceneOn (1 once a copy exists this frame, else 0 -> use a fallback).

const grabbers = new WeakMap();

export function sceneColor(T, renderer) {
  let g = grabbers.get(renderer);
  if (!g) { g = createGrabber(T); grabbers.set(renderer, g); }
  return g;
}

/** Uniforms for a renderer-less context (node tests, previews): always fallback. */
export function sceneColorUniforms(T) {
  return createGrabber(T).uniforms;
}

function createGrabber(T) {
  const blank = new T.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const uniforms = { uScene: { value: blank }, uRes: { value: new T.Vector2(1, 1) }, uSceneOn: { value: 0 } };
  const size = new T.Vector2();
  let tex = null, frame = -1, failed = false;
  const stats = { copies: 0, failed: false };
  function grab(renderer) {
    if (failed || !renderer?.copyFramebufferToTexture) { uniforms.uSceneOn.value = 0; return false; }
    if (renderer.getRenderTarget() !== null) return uniforms.uSceneOn.value === 1;
    const f = renderer.info.render.frame;
    if (f === frame) return uniforms.uSceneOn.value === 1;
    frame = f;
    renderer.getDrawingBufferSize(size);
    if (!tex || tex.image.width !== size.x || tex.image.height !== size.y) {
      tex?.dispose();
      tex = new T.FramebufferTexture(size.x, size.y);
      tex.minFilter = T.LinearFilter;
      tex.magFilter = T.LinearFilter;
      uniforms.uRes.value.set(size.x, size.y);
    }
    try {
      renderer.copyFramebufferToTexture(tex);
      uniforms.uScene.value = tex;
      uniforms.uSceneOn.value = 1;
      stats.copies++;
      return true;
    } catch (err) {
      failed = stats.failed = true;
      uniforms.uScene.value = blank;
      uniforms.uSceneOn.value = 0;
      console.warn('[vfx] scene colour grab unavailable; refraction falls back:', err?.message || err);
      return false;
    }
  }
  /** Consumers that are hidden this frame call release() so a stale copy is not sampled. */
  function release() { uniforms.uSceneOn.value = 0; }
  function dispose() { tex?.dispose(); blank.dispose(); tex = null; }
  return { uniforms, grab, release, dispose, stats };
}
