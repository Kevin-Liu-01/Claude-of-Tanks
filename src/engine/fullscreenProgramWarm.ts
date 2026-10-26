/**
 * fullscreenProgramWarm.ts — (battle-spikes-253) submit a GPU simulation's full-screen pass programs with no draw.
 *
 * The world's simulations (the FFT ocean, the water ripples, the ground pressure) run their passes only on a frame that
 * advances time, and a covered entry's presentation updates the world at dt 0: their eight programs linked inside the
 * first live frame that advanced them, synchronously (nav-perf's root-u room: one 353 ms task after the reveal). Each
 * pass's material is compiled against the target it renders to (three keys a program on its output colour space), so
 * the link runs between tasks under the cover and the first live pass finds it done.
 */
import * as THREE from 'three';

/** The renderer calls a compile needs: three's own, absent on the receipts' stub renderers. */
export type FullscreenCompileRenderer = {
  compile?(scene: THREE.Object3D, camera: THREE.Camera): unknown;
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
};

export interface FullscreenPass {
  material: THREE.Material;
  target: THREE.WebGLRenderTarget | null;
}

let triangle: THREE.BufferGeometry | null = null;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

/** Compile each pass's program against its own target; returns the passes submitted (0 without a compile). */
export function compileFullscreenPrograms(renderer: FullscreenCompileRenderer | null | undefined,
  passes: readonly FullscreenPass[]): number {
  if (!renderer || typeof renderer.compile !== 'function' || !passes.length) return 0;
  // three's FullScreenQuad draws one oversized triangle; a ShaderMaterial's program does not key on the geometry
  triangle ??= new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3))
    .setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  const mesh = new THREE.Mesh(triangle);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const previous = renderer.getRenderTarget();
  let submitted = 0;
  try {
    for (const { material, target } of passes) {
      mesh.material = material;
      renderer.setRenderTarget(target);
      renderer.compile(scene, camera);
      submitted++;
    }
  } finally {
    renderer.setRenderTarget(previous);
    scene.remove(mesh);
  }
  return submitted;
}
