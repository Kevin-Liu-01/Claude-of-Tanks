import type { RuntimeValue } from '../runtimeTypes.ts';
import type { Material, Object3D, Scene, Texture } from 'three';
import type { ArmorOverlayTarget } from './armorAimOverlay.ts';

type VisualBudgetYield = (covered?: boolean) => Promise<void>;
type VisualPredicate<Entity extends BattleVisualEntity = BattleVisualEntity> = (
  entity: Entity
) => boolean;

interface BattleVisualRoot extends Object3D {
  userData: Record<string, RuntimeValue>;
}

interface BattleVisual {
  root?: BattleVisualRoot | null;
  syncFromState?: (state: object) => void;
  setVisible?: (visible: boolean) => void;
  prewarmBurn?: () => Object3D[] | void;
  getWreckFallbackMaterial?: () => Material | null;
}

export interface BattleVisualEntity extends ArmorOverlayTarget {
  specId: string;
  visual?: (BattleVisual & NonNullable<ArmorOverlayTarget['visual']>) | null;
  state?: ArmorOverlayTarget['state'];
}

interface StagedBake<Entity extends BattleVisualEntity> {
  ent: Entity;
  quality: string;
}

const CORE_BUILD_TIMING_FIELDS = [
  'startedAt', 'finishedAt', 'materialsStartedAt', 'materialsFinishedAt',
  'authoredStartedAt', 'authoredFinishedAt', 'bindMergeFinishedAt', 'setupMs',
] as const;
type CoreBuildTiming = Record<typeof CORE_BUILD_TIMING_FIELDS[number], number>;

interface VisualLoadTiming {
  specId: string;
  quality: string;
  startedAt: number;
  prebakeMs?: number;
  buildMs?: number;
  buildYieldMs?: number;
  buildCheckpointCount?: number;
  buildStartedAt?: number;
  buildFinishedAt?: number;
  /** Synchronous elapsed next() time, including completion/failure, not CPU time. */
  firstBuildStepMs?: number;
  maxBuildStepMs?: number;
  /** Zero-based next() index; equal maxima retain the first occurrence. */
  maxBuildStepIndex?: number;
  maxBuildStepStartedAt?: number;
  maxBuildStepFinishedAt?: number;
  /** (perf-255) The far LOD's build, under the stream's budget (TankVisual.prepareFarLod). */
  farLodMs?: number;
  coreBuildTiming?: CoreBuildTiming;
  uploadMs?: number;
  preUploadYieldMs?: number;
  textureUploadMs?: number;
  compileMs?: number;
  postCompileYieldMs?: number;
  /** The root's draw warm when its stream drew it after every build (awaitProgramLinks). */
  drawWarmMs?: number;
  totalMs?: number;
}

interface TextureUploadRenderer {
  initTexture(texture: Texture): void;
}

interface ArmorAimWarmOwner<Entity extends BattleVisualEntity> {
  prime(entity: Entity): RuntimeValue;
  /** (263) The armour paint's panels, baked under the staging budget before the programs and the far LOD are made. */
  bakePanels?(entity: Entity, pause: () => Promise<void>): Promise<void>;
  warm(): () => void;
}

interface ForwardCompileOwner {
  compile(root: Object3D): void;
}

interface BattleVisualStageReceipt {
  preUploadYieldMs: number;
  textureUploadMs: number;
  compileMs: number;
  postCompileYieldMs: number;
  totalMs: number;
}

interface BattleVisualStageOptions {
  /** Covered solo entry compiles after final camouflage and night-light setup. */
  readonly compilePrograms?: boolean;
}

export interface BattleVisualStreamerOptions<TGame extends { tanks: BattleVisualEntity[] }> {
  game: TGame;
  scene: Scene;
  renderer: TextureUploadRenderer;
  anisotropy: number;
  ensureTankBuilders(specIds: readonly string[]): Promise<RuntimeValue>;
  nextStagedBake(
    game: TGame,
    predicate?: VisualPredicate<TGame['tanks'][number]> | null,
  ): StagedBake<TGame['tanks'][number]> | null;
  ensureStagedVisualsSteps(
    game: TGame,
    count: number,
    predicate?: VisualPredicate<TGame['tanks'][number]> | null,
  ): Generator<void | PromiseLike<unknown>, boolean, void>;
  getSpec(specId: string): RuntimeValue;
  prebakeSharedTextures(
    spec: RuntimeValue,
    anisotropy: number,
    quality: string,
    tick: () => Promise<void>,
  ): Promise<RuntimeValue>;
  armorAimOverlay: ArmorAimWarmOwner<TGame['tanks'][number]>;
  /** (265) Whether the armour overlay is on: staging bakes a vehicle's paint panels only then. Off when not given. */
  armorPanelsWanted?: () => boolean;
  forwardProgramWarm: ForwardCompileOwner;
  /**
   * Draw a staged root once offscreen with its production materials, whatever any camera frames (2026-10-24, perf-245;
   * main.ts: deploymentWarm.ts createIsolatedForwardWarmBatches). Its programs compile at staging; without a draw, the
   * GPU pipelines of a hidden opponent were made at its first sight — the mode-sheen lane's 7.4 s boss reveal.
   */
  drawWarm?: (root: Object3D) => void;
  /**
   * (battle-spikes-253) The same draw a cohort a step, for a stream's deferred draws: a step draws one cohort, and the
   * stream yields between steps. One draw of a whole tank first-bound all of its meshes' buffers in one task, and the
   * last upload waited 694 ms for the GPU process to drain the rest (nav-perf's root-v solo entry, bufferData under
   * drawWarm). A hidden opponent is attached and shown only inside each step.
   */
  drawWarmSteps?: (root: Object3D) => Iterable<unknown>;
  /**
   * Wait, between tasks, until the programs the staged roots submitted have linked (2026-10-24, transitions-249). With
   * it, a stream draws its roots once all are built: each root's links run while the next tank builds, where a draw
   * straight after its compile waited on them inside one task (5.4 s, the first ally on a 4x phone).
   */
  awaitProgramLinks?: (yieldForBudget: VisualBudgetYield) => Promise<void>;
  onVisualReady?: (entity: TGame['tanks'][number]) => void;
  recordTiming?: (timing: VisualLoadTiming) => void;
  now?: () => number;
}

export interface BattleVisualStreamer<Entity extends BattleVisualEntity = BattleVisualEntity> {
  stream(
    predicate: VisualPredicate<Entity> | null,
    yieldForBudget: VisualBudgetYield,
    onProgress?: ((fraction: number) => void) | null,
    initiallyHidden?: boolean,
  ): Promise<number>;
  stageRootTextureUploads(
    root: Object3D | null | undefined,
    yieldForBudget?: VisualBudgetYield | null,
  ): Promise<{ textures: number; totalMs: number }>;
  stageBattleVisualReveal(
    entity: Entity,
    yieldForBudget: VisualBudgetYield,
    initiallyHidden?: boolean,
    options?: BattleVisualStageOptions,
  ): Promise<BattleVisualStageReceipt>;
}

/** Preserve for-of's cached next method, result identity, and IteratorClose. */
function timedVisualBuildSteps(
  steps: Generator<void | PromiseLike<unknown>, boolean, void>,
  timing: VisualLoadTiming,
  now: () => number,
): Iterable<void | PromiseLike<unknown>> {
  const iterator: Iterator<void | PromiseLike<unknown>, boolean, void> = steps[Symbol.iterator]();
  const next = iterator.next;
  let index = 0;
  return {
    [Symbol.iterator]() {
      return {
        next() {
          const startedAt = now();
          try { return next.call(iterator); }
          finally {
            const finishedAt = now();
            const elapsed = finishedAt - startedAt;
            if (index === 0) timing.firstBuildStepMs = elapsed;
            if (timing.maxBuildStepMs === undefined || elapsed > timing.maxBuildStepMs) {
              timing.maxBuildStepMs = elapsed;
              timing.maxBuildStepIndex = index;
              timing.maxBuildStepStartedAt = startedAt;
              timing.maxBuildStepFinishedAt = finishedAt;
            }
            index++;
          }
        },
        return() {
          const close = iterator.return;
          if (close === undefined || close === null) return { done: true, value: false };
          // IteratorClose supplies no return value, even though Generator's
          // static return signature requires its declared completion type.
          return Reflect.apply(close, iterator, []) as IteratorResult<void | PromiseLike<unknown>, boolean>;
        },
      };
    },
  };
}

function recordCurrentCoreBuildTiming(root: BattleVisualRoot | null | undefined, timing: VisualLoadTiming): void {
  const candidate = root?.userData.coreBuildTiming;
  if (!candidate || typeof candidate !== 'object') return;
  const copy: Partial<CoreBuildTiming> = {};
  for (const field of CORE_BUILD_TIMING_FIELDS) {
    const value: RuntimeValue = Reflect.get(candidate, field);
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    copy[field] = value;
  }
  const receipt = copy as CoreBuildTiming;
  // A pooled visual may retain an earlier build receipt. Never attribute
  // that older core construction to this streamer's current iterator call.
  if (timing.buildStartedAt === undefined || timing.buildFinishedAt === undefined
      || receipt.startedAt < timing.buildStartedAt || receipt.finishedAt > timing.buildFinishedAt
      || receipt.finishedAt < receipt.startedAt) return;
  timing.coreBuildTiming = receipt;
}

/**
 * Owns the bounded construction/upload/compile/reveal pipeline for streamed
 * battle actors. It keeps hidden opponents detached until spotting while
 * compiling the exact production shader and material graph ahead of rollout.
 */
export function createBattleVisualStreamer<TGame extends { tanks: BattleVisualEntity[] }>({
  game,
  scene,
  renderer,
  anisotropy,
  ensureTankBuilders,
  nextStagedBake,
  ensureStagedVisualsSteps,
  getSpec,
  prebakeSharedTextures,
  armorAimOverlay,
  armorPanelsWanted = () => false,
  forwardProgramWarm,
  drawWarm,
  drawWarmSteps,
  awaitProgramLinks,
  onVisualReady,
  recordTiming = () => {},
  now = () => performance.now(),
}: BattleVisualStreamerOptions<TGame>): BattleVisualStreamer<TGame['tanks'][number]> {
  type Entity = TGame['tanks'][number];
  const stageRootTextureUploads = async (
    root: Object3D | null | undefined,
    yieldForBudget: VisualBudgetYield | null = null,
  ): Promise<{ textures: number; totalMs: number }> => {
    if (!root) return { textures: 0, totalMs: 0 };
    const startedAt = now();
    const textures = new Set<Texture>();
    root.traverse((object) => {
      const candidate = object as Object3D & { material?: Material | Material[] };
      const materials = Array.isArray(candidate.material)
        ? candidate.material : (candidate.material ? [candidate.material] : []);
      for (const material of materials) {
        for (const key of Object.keys(material)) {
          const value = Reflect.get(material, key) as RuntimeValue;
          if ((value as Texture | undefined)?.isTexture) textures.add(value as Texture);
        }
      }
    });
    for (const texture of textures) {
      try { renderer.initTexture(texture); } catch { /* first render fallback */ }
      if (yieldForBudget) await yieldForBudget();
    }
    return { textures: textures.size, totalMs: Math.round(now() - startedAt) };
  };

  /**
   * A root's draw warm, run later by its stream (after the links): a hidden opponent is attached and shown only inside
   * this one task, so no frame can present it; one the battle's spotting has attached meanwhile draws as it stands.
   */
  const laterDraw = (
    warmDraw: (root: Object3D) => void,
    visual: NonNullable<Entity['visual']>,
    home: Object3D,
    initiallyHidden: boolean,
  ) => async (yieldForBudget: VisualBudgetYield): Promise<number> => {
    const root = visual.root!;
    let drawnMs = 0;
    // one synchronous step with a hidden opponent attached and shown (re-checked each step: spotting may attach it)
    const borrowAround = (run: () => boolean): boolean => {
      const drawAt = now();
      const borrowed = initiallyHidden && !root.parent;
      if (borrowed) { home.add(root); visual.setVisible?.(true); }
      try { return run(); } catch { return true; /* first render fallback */ }
      finally {
        if (borrowed) { visual.setVisible?.(false); root.removeFromParent(); }
        drawnMs += now() - drawAt;
      }
    };
    if (!drawWarmSteps) {
      borrowAround(() => { warmDraw(root); return true; });
      return Math.round(drawnMs);
    }
    let steps: Iterator<unknown> | null = null;
    while (!borrowAround(() => !!(steps ??= drawWarmSteps(root)[Symbol.iterator]()).next().done)) await yieldForBudget();
    return Math.round(drawnMs);
  };

  /**
   * Stage a built root: textures, programs, and its draw warm. `deferDraw` returns the draw (and, for a hidden opponent,
   * a moment's re-attachment around it) as `draw` for the caller to run once its links are in; the root is already in
   * its final state (a hidden opponent detached) when this returns.
   */
  const stageRoot = async (
    entity: Entity,
    yieldForBudget: VisualBudgetYield,
    initiallyHidden: boolean,
    options: BattleVisualStageOptions,
    deferDraw: boolean,
  ): Promise<{ receipt: BattleVisualStageReceipt; draw: ((yieldForBudget: VisualBudgetYield) => Promise<number>) | null }> => {
    const visual = entity.visual;
    const root = visual?.root;
    const emptyReceipt: BattleVisualStageReceipt = {
      preUploadYieldMs: 0,
      textureUploadMs: 0,
      compileMs: 0,
      postCompileYieldMs: 0,
      totalMs: 0,
    };
    if (!root || root.userData.loadStaged) return { receipt: emptyReceipt, draw: null };
    const stageAt = now();
    const parent = root.parent;
    if (parent) parent.remove(root);
    let mark = now();
    await yieldForBudget(true);
    const preUploadYieldMs = Math.round(now() - mark);
    const textureUpload = await stageRootTextureUploads(root, yieldForBudget);
    root.userData.loadStaged = true;
    const home = parent || scene;
    home.add(root);
    if (entity.state && visual.syncFromState) visual.syncFromState(entity.state);
    visual.setVisible?.(true);
    onVisualReady?.(entity);
    const compileAt = now();
    visual.prewarmBurn?.();
    armorAimOverlay.prime(entity);
    // (265) its panels only while the overlay is on: a battle with it off never pays for them (it bakes in the frames'
    // share once switched on)
    if (armorAimOverlay.bakePanels && armorPanelsWanted()) await armorAimOverlay.bakePanels(entity, () => yieldForBudget(true));
    const restoreArmorWarmVisibility = armorAimOverlay.warm();
    try {
      if (options.compilePrograms !== false) forwardProgramWarm.compile(root);
    } catch { /* first render fallback */ }
    finally { restoreArmorWarmVisibility(); }
    // (perf-245) and draws once while it is attached, before a hidden opponent detaches: its pipelines are made here,
    // within the staging budget, not on the frame it is first seen
    const warmDraw = options.compilePrograms !== false && drawWarm ? drawWarm : null;
    const draw = warmDraw && deferDraw ? laterDraw(warmDraw, visual, home, initiallyHidden) : null;
    if (warmDraw && !deferDraw) {
      try { warmDraw(root); } catch { /* first render fallback */ }
    }
    const compileMs = options.compilePrograms === false ? 0 : Math.round(now() - compileAt);
    root.userData.loadCompileMs = compileMs;
    if (initiallyHidden) {
      visual.setVisible?.(false);
      root.removeFromParent();
      root.userData.battleVisibilityDetached = true;
    }
    mark = now();
    await yieldForBudget(true);
    const receipt: BattleVisualStageReceipt = {
      preUploadYieldMs,
      textureUploadMs: textureUpload.totalMs,
      compileMs,
      postCompileYieldMs: Math.round(now() - mark),
      totalMs: Math.round(now() - stageAt),
    };
    root.userData.loadStageReceipt = receipt;
    return { receipt, draw };
  };

  const stageBattleVisualReveal = async (
    entity: Entity,
    yieldForBudget: VisualBudgetYield,
    initiallyHidden = false,
    options: BattleVisualStageOptions = {},
  ): Promise<BattleVisualStageReceipt> => (await stageRoot(entity, yieldForBudget, initiallyHidden, options, false)).receipt;

  const stream = async (
    predicate: VisualPredicate<Entity> | null,
    yieldForBudget: VisualBudgetYield,
    onProgress: ((fraction: number) => void) | null = null,
    initiallyHidden = false,
  ): Promise<number> => {
    const pending = game.tanks.filter((entity) =>
      !entity.visual && (!predicate || predicate(entity)));
    const total = pending.length;
    await ensureTankBuilders(pending.map((entity) => entity.specId));
    let built = 0;
    const deferDraws = !!awaitProgramLinks && !!drawWarm;
    const draws: Array<{ draw: (yieldForBudget: VisualBudgetYield) => Promise<number>; timing: VisualLoadTiming }> = [];
    for (;;) {
      const next = nextStagedBake(game, predicate);
      if (!next) {
        if (draws.length && awaitProgramLinks) {
          await awaitProgramLinks(yieldForBudget);
          for (const { draw, timing } of draws) {
            timing.drawWarmMs = await draw(yieldForBudget);
            await yieldForBudget();
          }
        }
        return built;
      }
      const timing: VisualLoadTiming = {
        specId: next.ent.specId,
        quality: next.quality,
        startedAt: Math.round(now()),
      };
      recordTiming(timing);
      let mark = now();
      try {
        await prebakeSharedTextures(
          getSpec(next.ent.specId),
          anisotropy,
          next.quality,
          () => yieldForBudget(),
        );
      } catch { /* visual construction remains the fallback */ }
      timing.prebakeMs = Math.round(now() - mark);
      // Recheck the caller's lifetime after a failed prebake before starting a
      // fallback build. The generator keeps unfinished tank graphs private.
      await yieldForBudget(true);
      mark = now();
      timing.buildStartedAt = mark;
      let buildYieldMs = 0;
      let buildCheckpointCount = 0;
      try {
        const steps = ensureStagedVisualsSteps(game, 1, predicate);
        for (const step of timedVisualBuildSteps(steps, timing, now)) {
          const yieldAt = now();
          // a decoration planned in the decor worker (stage 2b) is awaited, never polled
          if (step) await step;
          else await yieldForBudget();
          buildYieldMs += now() - yieldAt;
          buildCheckpointCount++;
        }
      } finally { timing.buildFinishedAt = now(); }
      timing.buildMs = Math.round(Math.max(0, now() - mark - buildYieldMs));
      timing.buildYieldMs = Math.round(buildYieldMs);
      timing.buildCheckpointCount = buildCheckpointCount;
      recordCurrentCoreBuildTiming(next.ent.visual?.root, timing);
      mark = now();
      const { receipt: stageReceipt, draw } = await stageRoot(next.ent, yieldForBudget, initiallyHidden, {}, deferDraws);
      if (draw) draws.push({ draw, timing });
      timing.uploadMs = Math.round(now() - mark);
      timing.preUploadYieldMs = stageReceipt.preUploadYieldMs;
      timing.textureUploadMs = stageReceipt.textureUploadMs;
      timing.compileMs = stageReceipt.compileMs;
      timing.postCompileYieldMs = stageReceipt.postCompileYieldMs;
      // (perf-255) its far LOD now, under this budget, rather than in the first battle frame it stands that far
      const visual = next.ent.visual as { prepareFarLod?(): boolean } | null | undefined;
      if (visual?.prepareFarLod) {
        await yieldForBudget();
        mark = now();
        if (visual.prepareFarLod()) timing.farLodMs = Math.round(now() - mark);
      }
      timing.totalMs = Math.round(now() - timing.startedAt);
      built += 1;
      onProgress?.(built / Math.max(1, total));
      await yieldForBudget();
    }
  };

  return { stream, stageRootTextureUploads, stageBattleVisualReveal };
}
