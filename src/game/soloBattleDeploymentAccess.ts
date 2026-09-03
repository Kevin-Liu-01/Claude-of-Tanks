import type { RuntimeValue } from '../runtimeTypes.ts';
import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type {
  SoloBattleDeploymentRuntime,
  SoloBattleDeploymentRuntimeOptions,
  SoloBattleDeploymentWarmResult,
} from './soloBattleDeploymentRuntime.ts';

type DeploymentModule = Pick<
  typeof import('./soloBattleDeploymentRuntime.ts'),
  'createSoloBattleDeploymentRuntime'
>;

export interface SoloBattleDeploymentAccess extends SoloBattleDeploymentRuntime {
  preload(): Promise<SoloBattleDeploymentRuntime>;
  readonly current: SoloBattleDeploymentRuntime | null;
}

interface SoloBattleDeploymentAccessOptions {
  options: () => SoloBattleDeploymentRuntimeOptions;
  load?: () => Promise<DeploymentModule>;
}

/** Exact deployment warm owner, acquired only after battle intent. */
export function createSoloBattleDeploymentAccess({
  options,
  load = () => import('./soloBattleDeploymentRuntime.ts'),
}: SoloBattleDeploymentAccessOptions): SoloBattleDeploymentAccess {
  if (typeof options !== 'function') {
    throw new TypeError('solo battle deployment access requires an options factory');
  }
  const owner = createLazyRuntimeOwner(load, (module) => (
    module.createSoloBattleDeploymentRuntime(options())
  ));

  return Object.freeze({
    preload: owner.preload,
    get current() { return owner.current; },
    async warm(camoSweep: PromiseLike<RuntimeValue> | RuntimeValue): Promise<SoloBattleDeploymentWarmResult> {
      return (await owner.preload()).warm(camoSweep);
    },
  });
}
