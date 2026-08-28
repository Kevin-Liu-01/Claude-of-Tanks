/**
 * offscreenWarm.ts — real scene renders for shader/texture warm-up without
 * ever presenting the warm frame on the game canvas.
 *
 * renderer.compile() does not exercise every draw-time path, so combat still
 * needs a few real renders before play. Those renders intentionally use a
 * small target to keep the fragment bill low; keeping that target offscreen
 * also guarantees a long first-use compile cannot expose its partial frame.
 */
import {
  HalfFloatType,
  Vector2,
  WebGLRenderTarget,
  type BufferGeometry,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';

interface WarmRenderable extends Object3D {
  isLOD?: boolean;
  autoUpdate?: boolean;
  update?(camera: Camera): void;
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  isInstancedMesh?: boolean;
  count?: number;
  material?: Material | Material[];
  geometry?: BufferGeometry;
}

export interface OffscreenSceneWarmer {
  (): void;
  dispose(): void;
}

export interface OffscreenWarmBatchOptions {
  scale?: number;
  maxObjects?: number;
  maxWeight?: number;
  yieldBeforeBatch?: ((index: number) => void | Promise<void>) | null;
}

/**
 * Create a reusable quarter-resolution scene warmer.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {number} [scale]
 * @returns {(() => void) & {dispose: () => void}}
 */
export function createOffscreenSceneWarmer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  scale = 0.25,
): OffscreenSceneWarmer {
  const size = new Vector2();
  let target: WebGLRenderTarget | null = null;

  const warmSceneOffscreen = function warmSceneOffscreen(): void {
    renderer.getDrawingBufferSize(size);
    const width = Math.max(8, Math.floor(size.x * scale));
    const height = Math.max(8, Math.floor(size.y * scale));

    if (!target) {
      target = new WebGLRenderTarget(width, height, {
        type: HalfFloatType,
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
  } as OffscreenSceneWarmer;

  warmSceneOffscreen.dispose = () => {
    if (target) target.dispose();
    target = null;
  };
  return warmSceneOffscreen;
}

/**
 * Upload a visible scene through bounded forward-render batches. Geometry,
 * textures, materials, lights, and shader defines are the production ones;
 * only temporary object visibility and the private target size differ.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {{scale?: number, maxObjects?: number, maxWeight?: number,
 *   yieldBeforeBatch?: ?((index: number) => Promise<void>)}} [options]
 * @returns {Promise<number[]>}
 */
export async function warmSceneOffscreenBatched(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  {
  scale = 0.0625,
  maxObjects = 24,
  maxWeight = 90_000,
  yieldBeforeBatch = null,
  }: OffscreenWarmBatchOptions = {},
): Promise<number[]> {
  const warmer = createOffscreenSceneWarmer(renderer, scene, camera, scale);
  const renderables: Array<{ object: WarmRenderable; weight: number }> = [];
  const lods: Array<{ object: WarmRenderable; autoUpdate: boolean | undefined }> = [];
  scene.traverseVisible((object) => {
    const renderable = object as WarmRenderable;
    if (renderable.isLOD) {
      try { renderable.update?.(camera); } catch (_) { /* warm the current selection */ }
      lods.push({ object: renderable, autoUpdate: renderable.autoUpdate });
      renderable.autoUpdate = false;
    }
    if (!(renderable.isMesh || renderable.isLine
      || renderable.isPoints || renderable.isSprite)) return;
    if (!renderable.layers.test(camera.layers)) return;
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    if (!materials.some((material) => material?.visible !== false)) return;
    const geometry = renderable.geometry;
    const vertices = geometry?.index?.count || geometry?.attributes?.position?.count || 1;
    const instances = renderable.isInstancedMesh ? Math.max(1, renderable.count || 0) : 1;
    renderables.push({ object: renderable, weight: vertices + instances * 16 + 2_000 });
  });
  const batches: WarmRenderable[][] = [];
  let batch: WarmRenderable[] = [];
  let weight = 0;
  for (const renderable of renderables) {
    if (batch.length && (batch.length >= maxObjects || weight + renderable.weight > maxWeight)) {
      batches.push(batch);
      batch = [];
      weight = 0;
    }
    batch.push(renderable.object);
    weight += renderable.weight;
  }
  if (batch.length) batches.push(batch);

  // Layers gate a renderable without pruning its descendants. Toggling
  // `visible` would accidentally hide a child batch whenever a renderable
  // parent (rare, but legal in Three.js) belonged to another batch.
  const layerMasks = renderables.map(({ object }) => ({ object, mask: object.layers.mask }));
  const layerMaskByObject = new Map(layerMasks.map((state) => [state.object, state.mask]));
  const timings: number[] = [];
  try {
    for (const { object } of renderables) object.layers.mask = 0;
    for (let index = 0; index < batches.length; index++) {
      if (yieldBeforeBatch) await yieldBeforeBatch(index);
      const currentBatch = batches[index]!;
      for (const object of currentBatch) {
        object.layers.mask = layerMaskByObject.get(object) ?? 0;
      }
      const startedAt = performance.now();
      warmer();
      timings.push(Math.round(performance.now() - startedAt));
      for (const object of currentBatch) object.layers.mask = 0;
    }
  } finally {
    for (const state of layerMasks) state.object.layers.mask = state.mask;
    for (const state of lods) state.object.autoUpdate = state.autoUpdate;
    warmer.dispose();
  }
  return timings;
}
