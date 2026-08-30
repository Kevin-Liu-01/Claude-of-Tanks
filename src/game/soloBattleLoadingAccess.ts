import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type {
  SoloBattleLoadingRuntime,
  SoloBattleLoadingRuntimeOptions,
  SoloBattleLoadingStartOptions,
} from './soloBattleLoadingRuntime.ts';

type LoadingModule = Pick<
  typeof import('./soloBattleLoadingRuntime.ts'),
  'createSoloBattleLoadingRuntime'
>;

export interface SoloBattleLoadingAccess extends SoloBattleLoadingRuntime {
  preload(): Promise<SoloBattleLoadingRuntime>;
  readonly current: SoloBattleLoadingRuntime | null;
}

interface SoloBattleLoadingAccessOptions {
  options: () => SoloBattleLoadingRuntimeOptions;
  load?: () => Promise<LoadingModule>;
}

/** Battle-only loading transaction; absent from the Garage boot graph. */
export function createSoloBattleLoadingAccess({
  options,
  load = () => import('./soloBattleLoadingRuntime.ts'),
}: SoloBattleLoadingAccessOptions): SoloBattleLoadingAccess {
  if (typeof options !== 'function') {
    throw new TypeError('solo battle loading access requires an options factory');
  }
  const owner = createLazyRuntimeOwner(load, (module) => (
    module.createSoloBattleLoadingRuntime(options())
  ));

  return Object.freeze({
    preload: owner.preload,
    get current() { return owner.current; },
    async begin(specId: string, mapId?: string | null, startOptions?: SoloBattleLoadingStartOptions) {
      return (await owner.preload()).begin(specId, mapId, startOptions);
    },
  });
}
