import { Material, Object3D, type Camera, type Scene } from 'three';
import { LATE_FX_LAYER } from '../fx/layers.ts';

const defaultBeforeRender = Object3D.prototype.onBeforeRender;
const defaultAfterRender = Object3D.prototype.onAfterRender;
const defaultMaterialRender = Material.prototype.onBeforeRender;

type Renderable = Object3D & {
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  isLOD?: boolean;
  isLight?: boolean;
  autoUpdate?: boolean;
  material?: Material | Material[];
};

function canBorrowMaterial(material: Material): boolean {
  // Transmission allocates renderer-owned targets under the render-state key.
  // Keep that uncommon path's existing lifetime as well as callback identity.
  return material.onBeforeRender === defaultMaterialRender
    && !(((material as Material & { transmission?: number }).transmission ?? 0) > 0);
}

function canBorrowMaterials(material: Material | Material[]): boolean {
  if (!Array.isArray(material)) return canBorrowMaterial(material);
  for (let i = 0; i < material.length; i++) {
    if (!canBorrowMaterial(material[i])) return false;
  }
  return true;
}

function canBorrowLayerObject(object: Renderable): boolean {
  // A LOD can expose previously hidden callbacks during projectObject().
  // Shadow callbacks likewise require the exact source-scene argument.
  if (object.isLOD && object.autoUpdate) return false;
  if (object.isLight && object.castShadow) return false;
  if (!object.isMesh && !object.isLine && !object.isPoints && !object.isSprite) return true;
  return object.onBeforeRender === defaultBeforeRender && object.onAfterRender === defaultAfterRender
    && (!object.material || canBorrowMaterials(object.material));
}

function canBorrowObject(object: Renderable, camera: Camera): boolean {
  if (object.visible === false) return true;
  if (object.layers.test(camera.layers) && !canBorrowLayerObject(object)) return false;
  for (let i = 0; i < object.children.length; i++) {
    if (!canBorrowObject(object.children[i], camera)) return false;
  }
  return true;
}

/**
 * Three keys render/light state by scene identity and render-call depth. The
 * FX-only draw must not replace the world's light-count hash with zero lights.
 * This retained view inherits every live scene property and the exact graph;
 * it never reparents objects or owns geometry, materials or GPU resources.
 */
export class LateFxSceneView {
  private readonly scene: Scene;
  private readonly view: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    this.view = Object.create(scene) as Scene;
    // Pinned WebGLRenderer only reads scene fields in this path. Its one
    // mutating scene operation must keep the real root receiver and flags,
    // including standalone warming where no source matrix token is available.
    this.view.updateMatrixWorld = (force?: boolean): void => {
      if (force === undefined) scene.updateMatrixWorld();
      else scene.updateMatrixWorld(force);
    };
  }

  select(camera: Camera): Scene {
    const scene = this.scene;
    // Custom callbacks receive the exact original scene/receiver through the
    // original path. Check live visibility/layers: callback installation and
    // child insertion/removal need no invalidation cache or per-frame scratch.
    if (camera.layers.mask !== (1 << LATE_FX_LAYER) || scene.background !== null
      || scene.onBeforeRender !== defaultBeforeRender || scene.onAfterRender !== defaultAfterRender
      || (scene.overrideMaterial && !canBorrowMaterials(scene.overrideMaterial))
      || !canBorrowObject(scene, camera)) return scene;
    return this.view;
  }
}
