/**
 * offscreenWarm.js — real scene renders for shader/texture warm-up without
 * ever presenting the warm frame on the game canvas.
 *
 * renderer.compile() does not exercise every draw-time path, so combat still
 * needs a few real renders before play. Those renders intentionally use a
 * small target to keep the fragment bill low; keeping that target offscreen
 * also guarantees a long first-use compile cannot expose its partial frame.
 */
import * as THREE from 'three';

/**
 * Create a reusable quarter-resolution scene warmer.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {number} [scale]
 * @returns {() => void}
 */
export function createOffscreenSceneWarmer(renderer, scene, camera, scale = 0.25) {
  const size = new THREE.Vector2();
  let target = null;

  return function warmSceneOffscreen() {
    renderer.getDrawingBufferSize(size);
    const width = Math.max(8, Math.floor(size.x * scale));
    const height = Math.max(8, Math.floor(size.y * scale));

    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType,
        depthBuffer: true,
        stencilBuffer: false,
      });
      target.texture.name = 'CombatWarm.color';
    } else if (target.width !== width || target.height !== height) {
      target.setSize(width, height);
    }
    target.viewport.set(0, 0, width, height);
    target.scissor.set(0, 0, width, height);
    target.scissorTest = false;

    const priorTarget = renderer.getRenderTarget();
    const priorFace = renderer.getActiveCubeFace ? renderer.getActiveCubeFace() : 0;
    const priorMip = renderer.getActiveMipmapLevel ? renderer.getActiveMipmapLevel() : 0;
    try {
      // WebGLRenderer takes viewport/scissor directly from the render target.
      // Do not call renderer.setViewport here: that mutates the default
      // framebuffer viewport and recreates the first-battle quarter-frame bug.
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(priorTarget, priorFace, priorMip);
    }
  };
}
