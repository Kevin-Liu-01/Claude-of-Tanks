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

