import type { Object3D, Scene } from 'three';

interface ShadowState {
  autoUpdate: boolean;
  needsUpdate: boolean;
}

interface ShadowLight {
  shadow?: ShadowState | null;
}

interface RenderableObject extends Object3D {
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
}

export interface DeploymentForwardWarmBatch {
  label: string;
  objects: number;
  ms: number;
}

export interface DeploymentForwardWarmOptions {
  scene: Scene;
  csmLights?: readonly ShadowLight[] | null;
  worldGroup?: Object3D | null;
  playerRoot?: Object3D | null;
  warmRender: () => void;
  now?: () => number;
}

export interface IsolatedForwardWarmOptions {
  scene: Scene;
  root: Object3D;
  warmRender: () => void;
  cohortSize?: number;
  now?: () => number;
}

function isRenderable(object: Object3D): object is RenderableObject {
  const candidate = object as RenderableObject;
  return !!(candidate.isMesh || candidate.isLine || candidate.isPoints || candidate.isSprite);
}

function ownsLight(root: Object3D): boolean {
  let result = false;
  root.traverse((object) => {
    if ((object as Object3D & { isLight?: boolean }).isLight) result = true;
  });
  return result;
}

/**
 * First-bind one renderable cohort at a time while retaining the production
 * light set. Hiding light roots creates an unlit cache key and defeats the
 * warm; hiding only sibling content keeps the private raster inexpensive.
 */
export function* createIsolatedForwardWarmBatches({
  scene,
  root,
  warmRender,
  cohortSize = 4,
  now = () => performance.now(),
}: IsolatedForwardWarmOptions): Generator<DeploymentForwardWarmBatch> {
  const renderables: RenderableObject[] = [];
  const lightRoots = new Set(scene.children.filter(ownsLight));
  const rootWasVisible = root.visible;
  root.visible = true;
  root.traverseVisible((object) => {
    if (isRenderable(object)) renderables.push(object);
  });
  root.visible = rootWasVisible;
  if (!renderables.length) return;

  const size = Math.max(1, Math.floor(cohortSize));
  for (let index = 0; index < renderables.length; index += size) {
    const cohort = new Set(renderables.slice(index, index + size));
    const hiddenObjects: Object3D[] = [];
    const hiddenRoots: Object3D[] = [];
    for (const object of renderables) {
      if (cohort.has(object) || object.visible === false) continue;
      object.visible = false;
      hiddenObjects.push(object);
    }
    for (const child of scene.children) {
      if (child === root || child.visible === false || lightRoots.has(child)) continue;
      child.visible = false;
      hiddenRoots.push(child);
    }
    const startedAt = now();
    root.visible = true;
    try {
      warmRender();
    } finally {
      root.visible = rootWasVisible;
      for (const object of hiddenObjects) object.visible = true;
      for (const child of hiddenRoots) child.visible = true;
    }
    yield {
      label: root.name || root.type,
      objects: cohort.size,
      ms: Math.round(now() - startedAt),
    };
  }
}

/**
 * Isolate small visible scene cohorts for private first-bind renders.
 *
 * The generator changes visibility only while `warmRender` executes and
 * restores every flag and CSM update latch before yielding. No warm state can
 * leak into a painted frame, including when a renderer call throws.
 */
export function* createDeploymentForwardWarmBatches({
  scene,
  csmLights = [],
  worldGroup = null,
  playerRoot = null,
  warmRender,
  now = () => performance.now(),
}: DeploymentForwardWarmOptions): Generator<DeploymentForwardWarmBatch> {
  const shadowState: Array<{
    shadow: ShadowState;
    autoUpdate: boolean;
    needsUpdate: boolean;
  }> = [];
  for (const light of csmLights ?? []) {
    if (!light.shadow) continue;
    shadowState.push({
      shadow: light.shadow,
      autoUpdate: light.shadow.autoUpdate,
      needsUpdate: light.shadow.needsUpdate,
    });
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = false;
  }

  const lightRoots = new Set<Object3D>();
  for (const candidate of scene.children) {
    let ownsLight = false;
    candidate.traverse((object) => {
      if ((object as Object3D & { isLight?: boolean }).isLight) ownsLight = true;
    });
    if (ownsLight) lightRoots.add(candidate);
  }
  const contentRoots = scene.children.filter((candidate) =>
    candidate.visible !== false
      && !(candidate as Object3D & { isCamera?: boolean }).isCamera
      && !lightRoots.has(candidate));

  const renderablesUnder = (root: Object3D): RenderableObject[] => {
    const objects: RenderableObject[] = [];
    root.traverseVisible((object) => {
      if (isRenderable(object)) objects.push(object);
    });
    return objects;
  };

  const renderCohort = (
    root: Object3D,
    visibleChildren: ReadonlySet<Object3D> | null = null,
    visibleObjects: ReadonlySet<Object3D> | null = null,
  ): number => {
    const hidden: Object3D[] = [];
    const hide = (object: Object3D): void => {
      if (object.visible === false) return;
      object.visible = false;
      hidden.push(object);
    };
    for (const candidate of contentRoots) {
      if (candidate !== root) hide(candidate);
    }
    if (visibleChildren) {
      for (const child of root.children) {
        if (!visibleChildren.has(child)) hide(child);
      }
    }
    if (visibleObjects) {
      for (const object of renderablesUnder(root)) {
        if (!visibleObjects.has(object)) hide(object);
      }
    }
    const startedAt = now();
    try {
      warmRender();
    } catch {
      // The complete covered scene render remains the compatibility fallback.
    } finally {
      for (const object of hidden) object.visible = true;
    }
    return Math.round(now() - startedAt);
  };

  try {
    for (const root of contentRoots) {
      if (root === worldGroup && root.children.length > 1) {
        for (const child of root.children) {
          if (child.visible === false) continue;
          const label = `world:${child.name || child.type}`;
          const renderables = renderablesUnder(child);
          const cohortSize = child.name === 'props' ? 4 : Math.max(1, renderables.length);
          for (let index = 0; index < renderables.length; index += cohortSize) {
            const cohort = renderables.slice(index, index + cohortSize);
            yield {
              label: renderables.length > cohortSize
                ? `${label}:${index / cohortSize + 1}` : label,
              objects: cohort.length,
              ms: renderCohort(root, new Set([child]), new Set(cohort)),
            };
          }
        }
      } else if (root === playerRoot) {
        const renderables = renderablesUnder(root);
        const cohortSize = 3;
        for (let index = 0; index < renderables.length; index += cohortSize) {
          const cohort = renderables.slice(index, index + cohortSize);
          yield {
            label: `${root.name || root.type}:${index / cohortSize + 1}`,
            objects: cohort.length,
            ms: renderCohort(root, null, new Set(cohort)),
          };
        }
      } else {
        yield {
          label: root.name || root.type,
          objects: root.children.length,
          ms: renderCohort(root),
        };
      }
    }
  } finally {
    for (const state of shadowState) {
      state.shadow.autoUpdate = state.autoUpdate;
      state.shadow.needsUpdate = state.needsUpdate;
    }
  }
}
