import type { RuntimeValue } from '../runtimeTypes.ts';
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

interface GarageReturnAccess extends GarageReturnRuntime {
  preload(): Promise<GarageReturnRuntime>;
  readonly current: GarageReturnRuntime | null;
}

interface GarageReturnAccessOptions<Visual> {
  options: () => GarageReturnRuntimeOptions<Visual>;
  load?: () => Promise<GarageReturnModule>;
}

/** Return/rematch transaction, retained as a stable async facade. */
export function createGarageReturnAccess<Visual = RuntimeValue>({
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
    get operation() { return owner.current?.operation ?? null; },
    // (2026-11-02 audit F3) a pristine Garage has had no return: idle, nothing suppressed, nothing to wait for
    get state() { return owner.current?.state ?? 'idle'; },
    get framesSuppressed() { return owner.current?.framesSuppressed ?? false; },
    get owesGarage() { return owner.current?.owesGarage ?? false; },
    get failure() { return owner.current?.failure ?? null; },
    whenSettled() { return owner.current?.whenSettled() ?? null; },
    get lastTrace(): GarageReturnTrace | null { return owner.current?.lastTrace ?? null; },
    get awaitingHandoff() { return owner.current?.awaitingHandoff ?? false; },
    async enter(returnOptions?: GarageReturnOptions) {
      return (await owner.preload()).enter(returnOptions);
    },
    recoverAfterContextRestore(isCurrent: () => boolean) {
      // Pristine Garage recovery has no interrupted return and must stay lazy.
      return owner.current?.recoverAfterContextRestore(isCurrent) ?? Promise.resolve(false);
    },
    async leave() {
      return (await owner.preload()).leave();
    },
    async battleAgain(trigger?: () => boolean) {
      return (await owner.preload()).battleAgain(trigger);
    },
    async prepare() {
      return (await owner.preload()).prepare();
    },
  });
}
