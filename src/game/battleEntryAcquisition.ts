import type { RuntimeValue } from '../runtimeTypes.ts';
export type BattleEntryTask<T = RuntimeValue> = () => T | PromiseLike<T>;

export interface BattleEntryTimings {
  modulesMs?: number;
  worldMs?: number;
  connectMs?: number;
}

export interface NetworkBattleAcquisitionOptions<TModules, TWorld, TMatch> {
  loadModules: BattleEntryTask<TModules>;
  loadWorld: BattleEntryTask<TWorld>;
  connect: BattleEntryTask<TMatch>;
  publishMatch: (match: TMatch) => void;
  connectAfterWorld?: boolean;
  timings?: BattleEntryTimings;
}

export interface NetworkBattleAcquisition<TModules, TWorld, TMatch> {
  modules: TModules;
  world: TWorld;
  match: TMatch;
}

export interface BattleEntryAcquisition {
  acquireSolo(tasks: readonly BattleEntryTask[]): Promise<void>;
  acquireNetwork<TModules, TWorld, TMatch>(
    options: NetworkBattleAcquisitionOptions<TModules, TWorld, TMatch>,
  ): Promise<NetworkBattleAcquisition<TModules, TWorld, TMatch>>;
}

interface BattleEntryAcquisitionOptions {
  now?: () => number;
}

/**
 * Owns the dependency graph for work hidden by a battle-entry transition.
 * Independent solo tasks begin together. Network clients also overlap their
 * transport with module and world acquisition, while a browser authority may
 * declare its exact world dependency through `connectAfterWorld`.
 *
 * A connected match is published as soon as it exists. If another branch of
 * the barrier later rejects, the caller's normal entry-failure path can close
 * the already-published transport instead of leaking it.
 */
export function createBattleEntryAcquisition({
  now = () => performance.now(),
}: BattleEntryAcquisitionOptions = {}): BattleEntryAcquisition {
  if (typeof now !== 'function') throw new TypeError('battle entry requires a clock');

  const run = <T>(task: BattleEntryTask<T>): Promise<T> =>
    Promise.resolve().then(task);

  return {
    async acquireSolo(tasks) {
      if (!Array.isArray(tasks)) throw new TypeError('solo acquisition requires tasks');
      await Promise.all(tasks.map((task) => run(task)));
    },

    async acquireNetwork<TModules, TWorld, TMatch>({
      loadModules,
      loadWorld,
      connect,
      publishMatch,
      connectAfterWorld = false,
      timings = {},
    }: NetworkBattleAcquisitionOptions<TModules, TWorld, TMatch>) {
      if (typeof loadModules !== 'function' || typeof loadWorld !== 'function'
        || typeof connect !== 'function' || typeof publishMatch !== 'function') {
        throw new TypeError('network acquisition requires module, world, connect, and publish tasks');
      }

      const timed = async <T>(key: keyof BattleEntryTimings, task: BattleEntryTask<T>) => {
        const startedAt = now();
        const value = await run(task);
        timings[key] = Math.round(now() - startedAt);
        return value;
      };

      const modulesP = timed('modulesMs', loadModules);
      const worldP = timed('worldMs', loadWorld);
      const connectTask = () => timed('connectMs', connect).then((match) => {
        publishMatch(match);
        return match;
      });
      const matchP = connectAfterWorld ? worldP.then(connectTask) : connectTask();

      const [modules, world, match] = await Promise.all([modulesP, worldP, matchP]);
      return { modules, world, match };
    },
  };
}
