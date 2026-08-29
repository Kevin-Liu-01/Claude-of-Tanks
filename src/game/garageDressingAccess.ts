import * as THREE from 'three';
import type {
  GarageDressingEngineContext,
  GarageDressingExisting,
  GarageDressingRuntime,
} from './garageDressing.ts';

interface GarageDressingModule {
  createGarageDressing(
    engineCtx: GarageDressingEngineContext,
    pos: THREE.Vector3,
    existing: GarageDressingExisting,
  ): GarageDressingRuntime;
}

interface GarageDressingLoaders {
  dressing(): Promise<GarageDressingModule>;
}

export interface GarageDressingAccess {
  readonly group: THREE.Group;
  preload(): Promise<GarageDressingRuntime>;
  pump(): Promise<boolean>;
  ensureBuilt(): Promise<void>;
  isBuilt(): boolean;
  setVariant(variantId: string): string;
  dispose(): void;
  readonly current: GarageDressingRuntime | null;
}

const DEFAULT_LOADERS: GarageDressingLoaders = {
  dressing: async () => await import('./garageDressing.ts'),
};

/**
 * Keep the workshop's final light signature in the first garage compile, but
 * defer its large authored set-piece module and geometry until a quiet idle
 * window. This avoids both boot transfer and a later light-count recompile.
 */
export function createGarageDressingAccess(
  engineCtx: GarageDressingEngineContext,
  pos: THREE.Vector3,
  initialVariantOrLoaders: string | GarageDressingLoaders = '',
  explicitLoaders: GarageDressingLoaders = DEFAULT_LOADERS,
): GarageDressingAccess {
  const initialVariantId = typeof initialVariantOrLoaders === 'string'
    ? initialVariantOrLoaders : '';
  const loaders = typeof initialVariantOrLoaders === 'string'
    ? explicitLoaders : initialVariantOrLoaders;
  const group = new THREE.Group();
  group.name = 'garage_dressing';
  group.position.copy(pos);

  const bayFill = new THREE.PointLight(0xb9c6d6, 10, 30, 1.8);
  bayFill.position.set(12.5, 6.2, 11.5);
  bayFill.castShadow = false;
  group.add(bayFill);

  let current: GarageDressingRuntime | null = null;
  let pending: Promise<GarageDressingRuntime> | null = null;
  let variantId = initialVariantId;
  group.userData.garageVariantId = variantId;

  const preload = (): Promise<GarageDressingRuntime> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    const request = loaders.dressing().then((module) => {
      current = module.createGarageDressing(engineCtx, pos, { group, bayFill, variantId });
      return current;
    }).catch((error: unknown) => {
      if (pending === request) pending = null;
      throw error;
    });
    pending = request;
    return request;
  };

  return {
    group,
    preload,
    async pump() { return (await preload()).pump(); },
    async ensureBuilt() { (await preload()).ensureBuilt(); },
    isBuilt() { return current?.isBuilt() ?? false; },
    setVariant(nextVariantId: string) {
      variantId = nextVariantId;
      group.userData.garageVariantId = variantId;
      return current?.setVariant(variantId) ?? variantId;
    },
    dispose() {
      if (current) current.dispose();
      else group.removeFromParent();
    },
    get current() { return current; },
  };
}
