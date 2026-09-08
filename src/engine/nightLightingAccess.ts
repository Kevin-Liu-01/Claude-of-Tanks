import type { Object3D, Scene, Vector3Like } from 'three';
import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type { NightLightingBudget, NightLightingRoot, NightLightingRuntime } from './nightLightingRuntime.ts';

export interface NightLightingEntity {
  readonly id: string;
  readonly team?: string;
  readonly isPlayer?: boolean;
  readonly visual?: { readonly root?: Object3D | null } | null;
  readonly combat?: { readonly destroyed?: boolean } | null;
  readonly networkVisible?: boolean;
}

export interface NightLightingAccessOptions {
  scene: Scene;
  getWorldRoot(): Object3D | null;
  getEntities(): Iterable<NightLightingEntity>;
  getCameraPosition(): Vector3Like;
  isNight(): boolean;
  isBattlePresentation(): boolean;
  /** Strict spotting admission, not the retained visual's fade threshold. */
  isEntityVisible(entity: NightLightingEntity): boolean;
  getBudget?(): NightLightingBudget;
}

type NightModule = Pick<typeof import('./nightLightingRuntime.ts'), 'createNightLightingRuntime'>;

/** Lazy only until explicit covered night intent. A stale import must not
 * repaint Garage; late actor construction calls appendEntity explicitly.
 * Frame updates visit the already registered records, never the scene graph.
 */
export function createNightLightingAccess(
  options: NightLightingAccessOptions,
  load: () => Promise<NightModule> = () => import('./nightLightingRuntime.ts'),
) {
  const owner = createLazyRuntimeOwner(load, module => module.createNightLightingRuntime(options.scene, options.getBudget?.()));
  let generation = 0, nightPrepared = false, disposed = false;

  function sourceFor(entity: NightLightingEntity): NightLightingRoot | null {
    const root = entity.visual?.root;
    if (!root) return null;
    return {
      root, priority: entity.isPlayer ? 1 : 0,
      isActive: () => entity.visual?.root === root && !!entity.combat && !entity.combat.destroyed
        && entity.networkVisible !== false && options.isEntityVisible(entity),
    };
  }
  function collectSources(): NightLightingRoot[] {
    const sources: NightLightingRoot[] = [];
    const world = options.getWorldRoot();
    if (world) sources.push({ root: world });
    for (const entity of options.getEntities()) {
      const source = sourceFor(entity);
      if (source) sources.push(source);
    }
    return sources;
  }
  async function prepare(): Promise<void> {
    if (disposed) throw new Error('Night lighting access is disposed');
    const requested = ++generation;
    nightPrepared = false;
    owner.current?.reset();
    if (!options.isNight()) return;
    const runtime = await owner.preload();
    if (disposed) { runtime.dispose(); return; }
    if (requested !== generation || !options.isNight()) return;
    runtime.prepare(collectSources(), true);
    nightPrepared = true;
    // First night uniforms/light signature are warm while input is covered.
    runtime.update(options.getCameraPosition());
  }
  function appendEntity(entity: NightLightingEntity): void {
    if (!nightPrepared || disposed || !options.isNight()) return;
    const source = sourceFor(entity);
    if (source) owner.current?.appendRoot(source);
  }
  function update(): void {
    if (!nightPrepared || disposed) return;
    owner.current?.update(options.getCameraPosition(), options.isNight() && options.isBattlePresentation());
  }
  function reset(): void {
    generation++; nightPrepared = false; owner.current?.reset();
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true; reset(); owner.current?.dispose();
  }
  return { get current(): NightLightingRuntime | null { return owner.current; }, prepare, appendEntity, update, reset, dispose };
}
