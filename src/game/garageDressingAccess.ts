import * as THREE from 'three';
import {
  createGarageDressing,
  type GarageDressingEngineContext,
  type GarageDressingRuntime,
} from './garageDressing.ts';

export interface GarageDressingAccess {
  readonly group: THREE.Group;
  preload(): Promise<GarageDressingRuntime>;
  pump(): Promise<boolean>;
  ensureBuilt(): Promise<void>;
  isBuilt(): boolean;
  setVariant(variantId: string): string;
  dispose(): void;
  readonly current: GarageDressingRuntime;
}

/**
 * The former asynchronous boundary loaded an invisible four-tank workshop in
 * quiet slices. Authentic scene packs supersede it, so create the zero-geometry
 * compatibility owner synchronously and truthfully report ready from frame one.
 * No idle import, fleet-family load, hidden build, or transition retry remains.
 */
export function createGarageDressingAccess(
  engineCtx: GarageDressingEngineContext,
  pos: THREE.Vector3,
  initialVariantId = '',
): GarageDressingAccess {
  const runtime = createGarageDressing(engineCtx, pos, { variantId: initialVariantId });
  return {
    group: runtime.group,
    preload: async () => runtime,
    pump: async () => false,
    async ensureBuilt() {},
    isBuilt: () => true,
    setVariant: (variantId: string) => runtime.setVariant(variantId),
    dispose: () => runtime.dispose(),
    current: runtime,
  };
}
