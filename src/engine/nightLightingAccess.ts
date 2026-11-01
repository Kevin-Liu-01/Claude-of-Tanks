import type { Object3D, Scene, Vector3Like } from 'three';
import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type { NightLightingBudget, NightLightingRoot, NightLightingRuntime } from './nightLightingRuntime.ts';

interface NightLightingEntity {
  readonly id: string;
  readonly team?: string;
  readonly isPlayer?: boolean;
  readonly visual?: { readonly root?: Object3D | null } | null;
  readonly combat?: { readonly destroyed?: boolean; readonly auxiliary?: {readonly lights: number} } | null;
  readonly networkVisible?: boolean;
}

interface NightLightingAccessOptions {
  scene: Scene;
  getWorldRoot(): Object3D | null;
  getEntities(): Iterable<NightLightingEntity>;
  getCameraPosition(): Vector3Like;
  /** The camera's view direction: a town's lamps light the street ahead of it (nightLightingRuntime BUILDING_FOCUS_AHEAD_M). */
  getCameraForward?(): Vector3Like;
  isNight(): boolean;
  isBattlePresentation(): boolean;
  /** Strict spotting admission, not the retained visual's fade threshold. */
  isEntityVisible(entity: NightLightingEntity): boolean;
  getBudget?(): NightLightingBudget;
  /** The rest of the battle's lit set, fixed with the pool's (main.ts: the zero hemisphere and fill leave it). */
  fixLitSet?(): void;
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
        && (entity.combat?.auxiliary?.lights === 1 || (entity.combat?.auxiliary?.lights !== 0 && options.isNight()))
        && entity.networkVisible !== false && options.isEntityVisible(entity),
    };
  }
  function collectSources(): NightLightingRoot[] {
    const sources: NightLightingRoot[] = [];
    const world = options.getWorldRoot();
    if (world) sources.push({ root: world, isActive: options.isNight });
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

    const runtime = await owner.preload();
    if (disposed) { runtime.dispose(); return; }
    if (requested !== generation) return;
    // (local-fps-266, Main's ruling on the 266 ranking) the battle's lit set is decided here, once, under cover: a night
    // battle's pool lights join it, a day battle's stay out (its headlights light their lenses), the rig's zero lights
    // leave it (fixLitSet), and nothing changes it until the next prepare or the Garage's reset
    options.fixLitSet?.();
    runtime.prepare(collectSources(), true, { lightPool: options.isNight() });
    nightPrepared = true;
    // First night uniforms/light signature are warm while input is covered.
    runtime.update(options.getCameraPosition(), true, options.getCameraForward?.());
  }
  function appendEntity(entity: NightLightingEntity): void {
    if (!nightPrepared || disposed) return;
    const source = sourceFor(entity);
    if (source) owner.current?.appendRoot(source);
  }
  function update(): void {
    if (!nightPrepared || disposed) return;
    owner.current?.update(options.getCameraPosition(), options.isBattlePresentation(), options.getCameraForward?.());
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
