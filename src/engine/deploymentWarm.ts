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

interface WarmLod extends Object3D {
  isLOD?: boolean;
  autoUpdate?: boolean;
}

interface SavedShadowState {
  shadow: ShadowState;
  autoUpdate: boolean;
  needsUpdate: boolean;
}

interface CohortRenderContext {
  contentRoots: readonly Object3D[];
  warmRender: () => void;
  now: () => number;
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

function sceneLightRoots(scene: Scene): Set<Object3D> {
  return new Set(scene.children.filter(ownsLight));
}

function visibleContentRoots(scene: Scene, lightRoots: ReadonlySet<Object3D>): Object3D[] {
  return scene.children.filter((candidate) =>
    candidate.visible !== false
      && !(candidate as Object3D & { isCamera?: boolean }).isCamera
      && !lightRoots.has(candidate));
}

function renderablesUnder(root: Object3D): RenderableObject[] {
  const objects: RenderableObject[] = [];
  root.traverseVisible((object) => {
    if (isRenderable(object)) objects.push(object);
  });
  return objects;
}

function disableShadows(lights: readonly ShadowLight[]): SavedShadowState[] {
  const states: SavedShadowState[] = [];
  for (const light of lights) {
    if (!light.shadow) continue;
    states.push({
      shadow: light.shadow,
      autoUpdate: light.shadow.autoUpdate,
      needsUpdate: light.shadow.needsUpdate,
    });
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = false;
  }
  return states;
}

function restoreShadows(states: readonly SavedShadowState[]): void {
  for (const state of states) {
    state.shadow.autoUpdate = state.autoUpdate;
    state.shadow.needsUpdate = state.needsUpdate;
  }
}

function renderWithoutShadowUpdates(lights: readonly ShadowLight[], render: () => void): void {
  const states = disableShadows(lights);
  try { render(); } finally { restoreShadows(states); }
}

/** Mask a draw, never its descendants; freeze the already-selected LODs only
 * during this synchronous render. No temporary state survives a checkpoint. */
function renderSelectedCohort(
  root: Object3D, selected: ReadonlySet<Object3D> | null, render: () => void,
): void {
  const masks: Array<{ object: Object3D; mask: number }> = [];
  const lods: Array<{ object: WarmLod; autoUpdate: boolean | undefined }> = [];
  root.traverseVisible((object) => {
    const lod = object as WarmLod;
    if (lod.isLOD) lods.push({ object: lod, autoUpdate: lod.autoUpdate });
    if (selected && isRenderable(object) && !selected.has(object)) {
      masks.push({ object, mask: object.layers.mask });
    }
  });
  try {
    for (const { object } of lods) object.autoUpdate = false;
    for (const { object } of masks) object.layers.mask = 0;
    render();
  } finally {
    for (const state of masks) state.object.layers.mask = state.mask;
    for (const state of lods) state.object.autoUpdate = state.autoUpdate;
  }
}

function hideVisible(object: Object3D, hidden: Object3D[]): void {
  if (object.visible === false) return;
  object.visible = false;
  hidden.push(object);
}

function renderCohort(
  context: CohortRenderContext,
  root: Object3D,
  visibleChildren: ReadonlySet<Object3D> | null = null,
  visibleObjects: ReadonlySet<Object3D> | null = null,
): number {
  const hidden: Object3D[] = [];
  for (const candidate of context.contentRoots) {
    if (candidate !== root) hideVisible(candidate, hidden);
  }
  if (visibleChildren) {
    for (const child of root.children) {
      if (!visibleChildren.has(child)) hideVisible(child, hidden);
    }
  }
  const startedAt = context.now();
  try {
    renderSelectedCohort(root, visibleObjects, context.warmRender);
  } catch {
    // The complete covered scene render remains the compatibility fallback.
  } finally {
    for (const object of hidden) object.visible = true;
  }
  return Math.round(context.now() - startedAt);
}

function* warmWorldRoot(
  root: Object3D,
  context: CohortRenderContext,
): Generator<DeploymentForwardWarmBatch, void, void> {
  for (const child of root.children) {
    if (child.visible === false) continue;
    const label = `world:${child.name || child.type}`;
    const renderables = renderablesUnder(child);
    const bounded = child.name === 'props' || child.name === 'terrain' || child.name === 'vegetation';
    const cohortSize = bounded ? 4 : Math.max(1, renderables.length);
    for (let index = 0; index < renderables.length; index += cohortSize) {
      const cohort = renderables.slice(index, index + cohortSize);
      yield {
        label: renderables.length > cohortSize ? `${label}:${index / cohortSize + 1}` : label,
        objects: cohort.length,
        ms: renderCohort(context, root, new Set([child]), new Set(cohort)),
      };
    }
  }
}

function* warmPlayerRoot(
  root: Object3D,
  context: CohortRenderContext,
): Generator<DeploymentForwardWarmBatch, void, void> {
  const renderables = renderablesUnder(root);
  const cohortSize = 3;
  for (let index = 0; index < renderables.length; index += cohortSize) {
    const cohort = renderables.slice(index, index + cohortSize);
    yield {
      label: `${root.name || root.type}:${index / cohortSize + 1}`,
      objects: cohort.length,
      ms: renderCohort(context, root, null, new Set(cohort)),
    };
  }
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
  const lightRoots = sceneLightRoots(scene);
  const rootWasVisible = root.visible;
  let renderables: RenderableObject[];
  try {
    root.visible = true;
    renderables = renderablesUnder(root);
  } finally { root.visible = rootWasVisible; }
  if (!renderables.length) return;

  const size = Math.max(1, Math.floor(cohortSize));
  for (let index = 0; index < renderables.length; index += size) {
    const cohort = new Set(renderables.slice(index, index + size));
    const hiddenRoots: Object3D[] = [];
    for (const child of scene.children) {
      if (child === root || child.visible === false || lightRoots.has(child)) continue;
      child.visible = false;
      hiddenRoots.push(child);
    }
    const startedAt = now();
    root.visible = true;
    try {
      renderSelectedCohort(root, cohort, warmRender);
    } finally {
      root.visible = rootWasVisible;
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
  const contentRoots = visibleContentRoots(scene, sceneLightRoots(scene));
  const context: CohortRenderContext = {
    contentRoots, now,
    warmRender: () => renderWithoutShadowUpdates(csmLights ?? [], warmRender),
  };

  for (const root of contentRoots) {
    if (root === worldGroup && root.children.length > 0) {
      yield* warmWorldRoot(root, context);
    } else if (root === playerRoot) {
      yield* warmPlayerRoot(root, context);
    } else {
      yield {
        label: root.name || root.type,
        objects: root.children.length,
        ms: renderCohort(context, root),
      };
    }
  }
}
