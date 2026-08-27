interface SceneRoot {
  parent: unknown | null;
  visible: boolean;
  removeFromParent(): unknown;
}

interface SceneHost {
  add(...roots: SceneRoot[]): unknown;
}

export interface PhaseSceneResidency {
  setGarageActive(active: boolean): void;
  setWorldActive(root: SceneRoot | null, active: boolean): void;
  swapWorld(previous: SceneRoot | null, next: SceneRoot): void;
  readonly stats: {
    garageMounted: boolean;
    worldMounted: boolean;
    mounts: number;
    unmounts: number;
  };
}

export interface PhaseSceneResidencyOptions {
  scene: SceneHost;
  garageRoots: readonly SceneRoot[];
}

/**
 * Own direct scene membership for phase-exclusive presentation roots.
 *
 * `visible = false` prevents drawing, but Three's scene update and project
 * walks can still reach the hidden subtree. Garage and battlefield graphs are
 * mutually exclusive, so detach the inactive graph while retaining its exact
 * objects and GPU resources for an instant, visually identical remount.
 */
export function createPhaseSceneResidency({
  scene,
  garageRoots,
}: PhaseSceneResidencyOptions): PhaseSceneResidency {
  if (!scene || typeof scene.add !== 'function' || !garageRoots.length) {
    throw new TypeError('phase scene residency requires a scene and garage roots');
  }
  for (const root of garageRoots) {
    if (!root || typeof root.removeFromParent !== 'function') {
      throw new TypeError('phase scene residency received an invalid root');
    }
  }

  let garageMounted = garageRoots.every((root) => root.parent === scene);
  let worldMounted = false;
  let activeWorld: SceneRoot | null = null;
  const stats = { garageMounted, worldMounted, mounts: 0, unmounts: 0 };

  const mount = (root: SceneRoot): void => {
    root.visible = true;
    if (root.parent === scene) return;
    root.removeFromParent();
    scene.add(root);
    stats.mounts += 1;
  };

  const unmount = (root: SceneRoot): void => {
    root.visible = false;
    if (!root.parent) return;
    root.removeFromParent();
    stats.unmounts += 1;
  };

  const setGarageActive = (active: boolean): void => {
    for (const root of garageRoots) {
      if (active) mount(root);
      else unmount(root);
    }
    garageMounted = active;
    stats.garageMounted = active;
  };

  const setWorldActive = (root: SceneRoot | null, active: boolean): void => {
    if (root && activeWorld && root !== activeWorld) unmount(activeWorld);
    activeWorld = root;
    if (root) {
      if (active) mount(root);
      else unmount(root);
    }
    worldMounted = Boolean(root && active);
    stats.worldMounted = worldMounted;
  };

  const swapWorld = (previous: SceneRoot | null, next: SceneRoot): void => {
    if (previous && previous !== next) unmount(previous);
    activeWorld = next;
    mount(next);
    worldMounted = true;
    stats.worldMounted = true;
  };

  return { setGarageActive, setWorldActive, swapWorld, stats };
}
