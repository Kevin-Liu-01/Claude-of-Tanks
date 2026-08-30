import type { Material, Object3D, Scene, Texture } from 'three';
import type { ArmorOverlayTarget } from './armorAimOverlay.ts';

export type VisualBudgetYield = (covered?: boolean) => Promise<void>;
export type VisualPredicate<Entity extends BattleVisualEntity = BattleVisualEntity> = (
  entity: Entity
) => boolean;

interface BattleVisualRoot extends Object3D {
  userData: Record<string, unknown>;
}

interface BattleVisual {
  root?: BattleVisualRoot | null;
  syncFromState?: (state: unknown) => void;
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

interface VisualLoadTiming {
  specId: string;
  quality: string;
  startedAt: number;
  prebakeMs?: number;
  buildMs?: number;
  uploadMs?: number;
  preUploadYieldMs?: number;
  textureUploadMs?: number;
  compileMs?: number;
  postCompileYieldMs?: number;
  totalMs?: number;
}

interface TextureUploadRenderer {
  initTexture(texture: Texture): void;
}

interface ArmorAimWarmOwner<Entity extends BattleVisualEntity> {
  prime(entity: Entity): unknown;
  warm(): () => void;
}

interface ForwardCompileOwner {
  compile(root: Object3D): void;
}

export interface BattleVisualStageReceipt {
  preUploadYieldMs: number;
  textureUploadMs: number;
  compileMs: number;
  postCompileYieldMs: number;
  totalMs: number;
}

export interface BattleVisualStreamerOptions<TGame extends { tanks: BattleVisualEntity[] }> {
  game: TGame;
  scene: Scene;
  renderer: TextureUploadRenderer;
  anisotropy: number;
  ensureTankBuilders(specIds: readonly string[]): Promise<unknown>;
  nextStagedBake(
    game: TGame,
    predicate?: VisualPredicate<TGame['tanks'][number]> | null,
  ): StagedBake<TGame['tanks'][number]> | null;
  ensureStagedVisuals(
    game: TGame,
    count: number,
    predicate?: VisualPredicate<TGame['tanks'][number]> | null,
  ): unknown;
  getSpec(specId: string): unknown;
  prebakeSharedTextures(
    spec: unknown,
    anisotropy: number,
    quality: string,
    tick: () => Promise<void>,
  ): Promise<unknown>;
  armorAimOverlay: ArmorAimWarmOwner<TGame['tanks'][number]>;
  forwardProgramWarm: ForwardCompileOwner;
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
  ): Promise<BattleVisualStageReceipt>;
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
  ensureStagedVisuals,
  getSpec,
  prebakeSharedTextures,
  armorAimOverlay,
  forwardProgramWarm,
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
          const value = Reflect.get(material, key) as unknown;
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

  const stageBattleVisualReveal = async (
    entity: Entity,
    yieldForBudget: VisualBudgetYield,
    initiallyHidden = false,
  ): Promise<BattleVisualStageReceipt> => {
    const visual = entity.visual;
    const root = visual?.root;
    const emptyReceipt: BattleVisualStageReceipt = {
      preUploadYieldMs: 0,
      textureUploadMs: 0,
      compileMs: 0,
      postCompileYieldMs: 0,
      totalMs: 0,
    };
    if (!root || root.userData.loadStaged) return emptyReceipt;
    const stageAt = now();
    const parent = root.parent;
    if (parent) parent.remove(root);
    let mark = now();
    await yieldForBudget(true);
    const preUploadYieldMs = Math.round(now() - mark);
    const textureUpload = await stageRootTextureUploads(root, yieldForBudget);
    root.userData.loadStaged = true;
    (parent || scene).add(root);
    if (entity.state && visual.syncFromState) visual.syncFromState(entity.state);
    visual.setVisible?.(true);
    const compileAt = now();
    visual.prewarmBurn?.();
    armorAimOverlay.prime(entity);
    const restoreArmorWarmVisibility = armorAimOverlay.warm();
    try { forwardProgramWarm.compile(root); } catch { /* first render fallback */ }
    finally { restoreArmorWarmVisibility(); }
    const compileMs = Math.round(now() - compileAt);
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
    return receipt;
  };

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
    for (;;) {
      const next = nextStagedBake(game, predicate);
      if (!next) return built;
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
      mark = now();
      ensureStagedVisuals(game, 1, predicate);
      timing.buildMs = Math.round(now() - mark);
      mark = now();
      const stageReceipt = await stageBattleVisualReveal(
        next.ent,
        yieldForBudget,
        initiallyHidden,
      );
      timing.uploadMs = Math.round(now() - mark);
      timing.preUploadYieldMs = stageReceipt.preUploadYieldMs;
      timing.textureUploadMs = stageReceipt.textureUploadMs;
      timing.compileMs = stageReceipt.compileMs;
      timing.postCompileYieldMs = stageReceipt.postCompileYieldMs;
      timing.totalMs = Math.round(now() - timing.startedAt);
      built += 1;
      onProgress?.(built / Math.max(1, total));
      await yieldForBudget();
    }
  };

  return { stream, stageRootTextureUploads, stageBattleVisualReveal };
}
