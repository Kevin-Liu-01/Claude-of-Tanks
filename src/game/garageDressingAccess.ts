import * as THREE from 'three';

/** The public runtime contract owned by the optional workshop set-piece. */
export interface GarageDressingRuntime {
  readonly group: THREE.Group;
  pump(): boolean;
  ensureBuilt(): void;
  isBuilt(): boolean;
  dispose(): void;
}

interface GarageDressingModule {
  createGarageDressing(
    engineCtx: unknown,
    pos: THREE.Vector3,
    existing: { group: THREE.Group; bayFill: THREE.PointLight },
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
  dispose(): void;
  readonly current: GarageDressingRuntime | null;
}

const DEFAULT_LOADERS: GarageDressingLoaders = {
  dressing: async () => await import('./garageDressing.js') as unknown as GarageDressingModule,
};

/**
 * Keep the workshop's final light signature in the first garage compile, but
 * defer its large authored set-piece module and geometry until a quiet idle
 * window. This avoids both boot transfer and a later light-count recompile.
 */
export function createGarageDressingAccess(
  engineCtx: unknown,
  pos: THREE.Vector3,
  loaders: GarageDressingLoaders = DEFAULT_LOADERS,
): GarageDressingAccess {
  const group = new THREE.Group();
  group.name = 'garage_dressing';
  group.position.copy(pos);

  const bayFill = new THREE.PointLight(0xb9c6d6, 10, 30, 1.8);
  bayFill.position.set(12.5, 6.2, 11.5);
  bayFill.castShadow = false;
  group.add(bayFill);

  let current: GarageDressingRuntime | null = null;
  let pending: Promise<GarageDressingRuntime> | null = null;

  const preload = (): Promise<GarageDressingRuntime> => {
    if (current) return Promise.resolve(current);
    if (pending) return pending;
    const request = loaders.dressing().then((module) => {
      current = module.createGarageDressing(engineCtx, pos, { group, bayFill });
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
    dispose() {
      if (current) current.dispose();
      else group.removeFromParent();
    },
    get current() { return current; },
  };
}
