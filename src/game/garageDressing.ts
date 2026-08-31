// src/game/garageDressing.ts — retired legacy workshop compatibility owner.
//
// Garage environments are now complete, map-authentic scene packs owned by
// ui/garageArchitecture.ts. Keep this tiny runtime boundary while callers and
// capture tooling migrate, but never stream the former four-tank workshop: it
// was invisible in every environment and still cost hundreds of milliseconds,
// four fleet builders, hundreds of thousands of triangles, and a second set of
// textures during otherwise-idle Garage frames.
import * as THREE from 'three';
import { getGarageVariant } from './garageVariants.ts';

export interface GarageDressingEngineContext {
  readonly anisotropy?: number;
  readonly renderer?: THREE.WebGLRenderer;
  readonly scene?: THREE.Scene;
  readonly camera?: THREE.Camera;
  setupShadowMaterial?(material: THREE.Material): void;
}

/** @deprecated Authentic Garage packs do not create secondary fleet visuals. */
export interface GarageWorkshopFleet {
  createVisual?(specId: string, options?: Readonly<Record<string, unknown>>): unknown;
}

export interface GarageDressingExisting {
  readonly group?: THREE.Group;
  readonly bayFill?: THREE.PointLight;
  readonly variantId?: string;
  readonly workshopFleet?: GarageWorkshopFleet;
}

export interface GarageDressingRuntime {
  readonly group: THREE.Group;
  pump(): boolean;
  ensureBuilt(): void;
  isBuilt(): boolean;
  setVariant(variantId: string): string;
  dispose(): void;
}

function stampRetiredWorkshopState(group: THREE.Group, variantId: string): string {
  const variant = getGarageVariant(variantId);
  group.userData.garageVariantId = variant.id;
  group.userData.garageMapId = variant.mapId;
  group.userData.workshopSceneMode = 'authentic-scene-pack';
  group.userData.workshopPartSource = 'retired';
  group.userData.workshopModelMode = 'none';
  group.userData.workshopTriangleCount = 0;
  group.userData.activeWorkshopTriangleCount = 0;
  group.userData.optimizedWorkshopTriangleCount = 0;
  group.userData.optimizedWorkshopTriangleParity = true;
  group.userData.workshopExhibitCount = 0;
  group.userData.sharedMaintenanceBayCount = 0;
  group.userData.sharedMaintenanceBayIds = [];
  group.userData.buildTimings = [];
  group.userData.verdantOriginalVisible = false;
  group.userData.verdantOriginalTriangleCount = 0;
  group.userData.verdantOriginalExhibitCount = 0;
  group.userData.verdantOriginalExhibitIds = [];
  group.userData.verdantOriginalSetPieces = [];
  group.userData.retiredLegacyWorkshop = true;
  return variant.id;
}

/**
 * Preserve the old runtime surface without creating any hidden scene content.
 * The soft bay fill remains because it contributes to the selected hero tank;
 * authentic terrain, structures, props and trees belong to the active scene
 * pack and are disposed through that pack's bounded cache.
 */
export function createGarageDressing(
  _engineCtx: GarageDressingEngineContext,
  pos: THREE.Vector3,
  existing: GarageDressingExisting = {},
): GarageDressingRuntime {
  const group = existing.group || new THREE.Group();
  group.name = 'garage_dressing';
  group.userData.perfOwner = 'garage/workshop-retired';
  group.position.copy(pos);

  if (!existing.bayFill) {
    const bayFill = new THREE.PointLight(0xb9c6d6, 10, 30, 1.8);
    bayFill.position.set(12.5, 6.2, 11.5);
    bayFill.castShadow = false;
    group.add(bayFill);
  }

  let variantId = stampRetiredWorkshopState(group, existing.variantId || '');
  return {
    group,
    pump: () => false,
    ensureBuilt() {},
    isBuilt: () => true,
    setVariant(nextVariantId: string) {
      variantId = stampRetiredWorkshopState(group, nextVariantId);
      return variantId;
    },
    dispose() {
      group.removeFromParent();
      group.clear();
    },
  };
}
