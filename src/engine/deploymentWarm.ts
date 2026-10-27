import type { BufferGeometry, Object3D, Scene } from 'three';

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
  preUpload: boolean;
}

export interface DeploymentForwardWarmBatch {
  label: string;
  objects: number;
  ms: number;
  /** 'upload': the cohort's buffers uploaded with every draw count at 0, ahead of its draws (the preUpload option) */
  phase?: 'upload';
}

interface DeploymentForwardWarmOptions {
  scene: Scene;
  csmLights?: readonly ShadowLight[] | null;
  worldGroup?: Object3D | null;
  playerRoot?: Object3D | null;
  warmRender: () => void;
  now?: () => number;
  /**
   * (2026-10-26, the room-stalls lane) each cohort first renders with every draw count at 0, uploading its vertex and
   * index buffers and binding its programs without a draw, and yields that as an 'upload' batch before its draws: a
   * caller that waits for the GPU between batches (gpuCatchUp.ts) then issues each cohort's uploads to an idle GPU
   * process, never behind the first-draw pipeline builds of the draws just ahead of them in the same cohort (the room
   * A/B: a 2.9 MB bufferData waited 2.2 s inside a cohort draw). Run it after the programs' first-use drain: the pass
   * binds every program. Default off (the solo deployment's batches are unchanged).
   */
  preUpload?: boolean;
}

export interface IsolatedForwardWarmOptions {
  scene: Scene;
  root: Object3D;
  warmRender: () => void;
  cohortSize?: number;
  now?: () => number;
  /** (perf-253) Only these of the root's renderables (the late pass's warm: its layer's effects). */
  select?: ((object: Object3D) => boolean) | null;
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

/** One warm render with every cascade's shadow update off (both battle entries' covered composer warms): its shadow
 *  pass would make the first draws of every caster's depth program in one task, ahead of the shadow prime's batches. */
export function renderWithoutShadowUpdates(lights: readonly ShadowLight[], render: () => void): void {
  const states = disableShadows(lights);
  try { render(); } finally { restoreShadows(states); }
}

/** Mask a draw, never its descendants; freeze the already-selected LODs only
 * during this synchronous render. No temporary state survives a checkpoint.
 * (2026-10-24, perf-245) The cohort draws whatever the warm camera frames: its
 * frustum culling is off for this one private render. Culled to the deployment
 * camera, the rest of the map — and a staged opponent anywhere but in front —
 * met its first draw live, when a camera was thrown onto it (a Watch hop, the
 * killcam, spectating: up to 7.4 s of GPU work on a cold pipeline cache). */
function renderSelectedCohort(
  root: Object3D, selected: ReadonlySet<Object3D> | null, render: () => void, zeroDraws = false,
): void {
  const masks: Array<{ object: Object3D; mask: number }> = [];
  const lods: Array<{ object: WarmLod; autoUpdate: boolean | undefined }> = [];
  const culled: Object3D[] = [];
  // (zeroDraws: the drawn geometries' draw counts at 0 for this render — three's projectObject still uploads every
  // vertex attribute and renderBufferDirect binds the program and the index buffer, but nothing draws)
  const counts = new Map<BufferGeometry, number>();
  root.traverseVisible((object) => {
    const lod = object as WarmLod;
    if (lod.isLOD) lods.push({ object: lod, autoUpdate: lod.autoUpdate });
    if (!isRenderable(object)) return;
    if (selected && !selected.has(object)) masks.push({ object, mask: object.layers.mask });
    else {
      if (object.frustumCulled) culled.push(object);
      const geometry = (object as Object3D & { geometry?: BufferGeometry; isBatchedMesh?: boolean }).geometry;
      if (zeroDraws && geometry?.drawRange && !(object as { isBatchedMesh?: boolean }).isBatchedMesh
        && !counts.has(geometry)) counts.set(geometry, geometry.drawRange.count);
    }
  });
  try {
    for (const { object } of lods) object.autoUpdate = false;
    for (const { object } of masks) object.layers.mask = 0;
    for (const object of culled) object.frustumCulled = false;
    for (const geometry of counts.keys()) geometry.drawRange.count = 0;
    render();
  } finally {
    for (const [geometry, count] of counts) geometry.drawRange.count = count;
    for (const object of culled) object.frustumCulled = true;
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
  zeroDraws = false,
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
    renderSelectedCohort(root, visibleObjects, context.warmRender, zeroDraws);
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
      const batchLabel = renderables.length > cohortSize ? `${label}:${index / cohortSize + 1}` : label;
      if (context.preUpload) {
        yield { label: batchLabel, objects: cohort.length, phase: 'upload',
          ms: renderCohort(context, root, new Set([child]), new Set(cohort), true) };
      }
      yield {
        label: batchLabel,
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
    const batchLabel = `${root.name || root.type}:${index / cohortSize + 1}`;
    if (context.preUpload) {
      yield { label: batchLabel, objects: cohort.length, phase: 'upload', ms: renderCohort(context, root, null, new Set(cohort), true) };
    }
    yield {
      label: batchLabel,
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
  select = null,
}: IsolatedForwardWarmOptions): Generator<DeploymentForwardWarmBatch> {
  const lightRoots = sceneLightRoots(scene);
  const rootWasVisible = root.visible;
  let renderables: RenderableObject[];
  try {
    root.visible = true;
    renderables = renderablesUnder(root);
    if (select) renderables = renderables.filter(select);
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
  preUpload = false,
}: DeploymentForwardWarmOptions): Generator<DeploymentForwardWarmBatch> {
  const contentRoots = visibleContentRoots(scene, sceneLightRoots(scene));
  const context: CohortRenderContext = {
    contentRoots, now, preUpload,
    warmRender: () => renderWithoutShadowUpdates(csmLights ?? [], warmRender),
  };

  for (const root of contentRoots) {
    if (root === worldGroup && root.children.length > 0) {
      yield* warmWorldRoot(root, context);
    } else if (root === playerRoot) {
      yield* warmPlayerRoot(root, context);
    } else {
      if (context.preUpload) {
        yield { label: root.name || root.type, objects: root.children.length, phase: 'upload',
          ms: renderCohort(context, root, null, null, true) };
      }
      yield {
        label: root.name || root.type,
        objects: root.children.length,
        ms: renderCohort(context, root),
      };
    }
  }
}
