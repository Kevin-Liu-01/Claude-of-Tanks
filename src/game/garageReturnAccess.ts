import { createLazyRuntimeOwner } from '../app/lazyRuntimeOwner.ts';
import type {
  GarageReturnOptions,
  GarageReturnRuntime,
  GarageReturnRuntimeOptions,
  GarageReturnTrace,
} from './garageReturnRuntime.ts';

type GarageReturnModule = Pick<
  typeof import('./garageReturnRuntime.ts'),
  'createGarageReturnRuntime'
>;

export interface GarageReturnAccess extends GarageReturnRuntime {
  preload(): Promise<GarageReturnRuntime>;
  readonly current: GarageReturnRuntime | null;
}

interface GarageReturnAccessOptions<Visual> {
  options: () => GarageReturnRuntimeOptions<Visual>;
  load?: () => Promise<GarageReturnModule>;
}

/** Return/rematch transaction, retained as a stable async facade. */
export function createGarageReturnAccess<Visual = unknown>({
  options,
  load = () => import('./garageReturnRuntime.ts'),
}: GarageReturnAccessOptions<Visual>): GarageReturnAccess {
  if (typeof options !== 'function') {
    throw new TypeError('garage return access requires an options factory');
  }
  const owner = createLazyRuntimeOwner(load, (module) => (
    module.createGarageReturnRuntime(options())
  ));

  return Object.freeze({
    preload: owner.preload,
    get current() { return owner.current; },
    get transitioning() { return owner.current?.transitioning ?? false; },
    get lastTrace(): GarageReturnTrace | null { return owner.current?.lastTrace ?? null; },
    async enter(returnOptions?: GarageReturnOptions) {
      return (await owner.preload()).enter(returnOptions);
    },
    async leave() {
      return (await owner.preload()).leave();
    },
    async battleAgain() {
      return (await owner.preload()).battleAgain();
    },
  });
}
