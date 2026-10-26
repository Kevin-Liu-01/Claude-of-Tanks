import type { BufferGeometry } from 'three';

type TankBuildStage = string | {
  label: string;
  resources: readonly BufferGeometry[];
};
export type TankProfileBuild = Generator<TankBuildStage, void, void>;
const EMPTY_RESULT: IteratorReturnResult<void> = Object.freeze({ done: true, value: undefined });
// Unlike [].values(), this immutable empty iterator allocates no per-stage
// iterator/result on synchronous builds. It contains no cursor or resources.
const NO_STAGES: IterableIterator<never> = Object.freeze({
  next: (): IteratorReturnResult<void> => EMPTY_RESULT,
  [Symbol.iterator](): IterableIterator<never> { return this; },
});
function* singleStage<Stage>(stage: Stage): Generator<Stage, void, void> { yield stage; }

export function tankProfileCheckpoint(enabled: boolean, label: string): Iterable<string> {
  return enabled ? singleStage(label) : NO_STAGES;
}
/** Public synchronous callers fully drain the same authored body. They never
 * install a partial owner, invoke a scheduler or expose a partial result. */
export function drainTankBuild<Result>(iterator: Iterator<TankBuildStage, Result, void>): Result {
  let result = iterator.next();
  while (!result.done) result = iterator.next();
  return result.value;
}

/** An authored builder that carries its stepped body (the same statements, a stage at a time): the factory's
 *  frame-budgeted builds step it (UI-LOCKDOWN E, 2026-10-25); every other caller calls the builder and gets the whole
 *  build at once. The adapter (profileBuilderAdapter.ts) forwards it. */
export function withBuildSteps<Args extends unknown[]>(
  build: (...args: Args) => void,
  buildSteps: (...args: Args) => TankProfileBuild,
): (...args: Args) => void {
  return Object.assign(build, { buildSteps });
}
/** A builder made of its stepped body alone: synchronous callers drain it whole, the factory steps it. */
export function steppedBuilder<Args extends unknown[]>(buildSteps: (...args: Args) => TankProfileBuild): (...args: Args) => void {
  return withBuildSteps((...args: Args): void => drainTankBuild(buildSteps(...args)), buildSteps);
}

