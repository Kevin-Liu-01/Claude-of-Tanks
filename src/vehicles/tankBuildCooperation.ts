import type { BufferGeometry, Material, Object3D, Texture } from 'three';

type ObservedResource = BufferGeometry | Material | Texture;
interface Disposable { dispose(): void; }
interface BuildMesh extends Object3D {
  isMesh?: boolean;
  geometry?: BufferGeometry;
  isBatchedMesh?: boolean;
  isInstancedMesh?: boolean;
  dispose?(): void;
}
export type TankBuildStage = string | {
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
export interface TankBuildCheckpoint {
  label: string;
  owner: TankBuildOwner;
}
export interface TankBuildOwner {
  root: Object3D;
  checkpoint(stage: TankBuildStage): TankBuildCheckpoint;
  stats(): { closed: boolean; observed: number; disposed: number };
  resources(): ObservedResource[];
  memory(): { geometries: number; arrayBuffers: number; arrayBytes: number };
  release(): void;
  abort(): void;
}
interface OwnerOptions {
  root: Object3D;
  mats: Disposable;
  buckets: Record<string, BufferGeometry[]>;
  disposables: ObservedResource[];
  equipmentDamage: Disposable;
  releaseShadow(resource: Material): void;
  disposeFitting(geometry: BufferGeometry): boolean;
  isMaterial(resource: ObservedResource): resource is Material;
}

function* singleStage<Stage>(stage: Stage): Generator<Stage, void, void> { yield stage; }

export function tankBuildCheckpoint(owner: TankBuildOwner | null, label: string): Iterable<TankBuildCheckpoint> {
  return owner ? singleStage(owner.checkpoint(label)) : NO_STAGES;
}
export function tankProfileCheckpoint(enabled: boolean, label: string): Iterable<string> {
  return enabled ? singleStage(label) : NO_STAGES;
}
export function* observeTankProfile(owner: TankBuildOwner, stages: TankProfileBuild): Generator<TankBuildCheckpoint, void, void> {
  for (const stage of stages) yield owner.checkpoint(stage);
}
export function constructTankProfile<Builder>(builder: Builder, owner: TankBuildOwner | null,
  profile: ((builder: Builder) => TankProfileBuild) | null, synchronous: () => void): Iterable<TankBuildCheckpoint> {
  if (!profile) { synchronous(); return NO_STAGES; }
  if (!owner) throw new Error('Cooperative profile requires its private resource owner');
  return observeTankProfile(owner, profile(builder));
}
export function releasePartialTankBuild(owner: TankBuildOwner | null): void { owner?.release(); }
export function abortPartialTankBuild(owner: TankBuildOwner | null, completed: boolean): void {
  if (!completed) owner?.abort();
}

function isGeometry(resource: ObservedResource): resource is BufferGeometry {
  return 'isBufferGeometry' in resource && resource.isBufferGeometry === true;
}
function isRuntimeOwner(object: BuildMesh): object is BuildMesh & Disposable {
  return !!(object.isBatchedMesh || object.isInstancedMesh) && typeof object.dispose === 'function';
}

/** Created only for a yielding build. The finished visual keeps its original
 * disposal contract; cancelled partial geometry is never published or cached. */
export function createPartialBuildOwner({ root, mats, buckets, disposables,
  equipmentDamage, releaseShadow, disposeFitting, isMaterial }: OwnerOptions): TankBuildOwner {
  const observed = new Map<ObservedResource, () => void>();
  const temporarySources = new Set<BufferGeometry>();
  let disposed = new WeakSet<Disposable>(), disposedCount = 0, closed = false;
  const markDisposed = (resource: Disposable): void => {
    if (disposed.has(resource)) return;
    disposed.add(resource); disposedCount++;
  };
  const watch = (resource: ObservedResource): void => {
    if (observed.has(resource) || disposed.has(resource)) return;
    const listener = (): void => {
      markDisposed(resource);
      resource.removeEventListener('dispose', listener);
      observed.delete(resource);
      if (isGeometry(resource)) temporarySources.delete(resource);
    };
    observed.set(resource, listener); resource.addEventListener('dispose', listener);
  };
  const observe = (): void => {
    for (const resource of disposables) watch(resource);
    for (const list of Object.values(buckets)) for (const geometry of list) watch(geometry);
    root.traverse((object: BuildMesh) => { if (object.isMesh && object.geometry) watch(object.geometry); });
  };
  const release = (): void => {
    for (const [resource, listener] of observed) resource.removeEventListener('dispose', listener);
    observed.clear(); disposed = new WeakSet(); disposedCount = 0;
    temporarySources.clear(); closed = true;
  };
  const once = (resource: Disposable): void => {
    if (disposed.has(resource)) return;
    markDisposed(resource); resource.dispose();
  };
  const owner: TankBuildOwner = {
    root,
    checkpoint(stage) {
      if (typeof stage !== 'string') for (const resource of stage.resources) {
        temporarySources.add(resource); watch(resource);
      }
      observe(); return { label: typeof stage === 'string' ? stage : stage.label, owner };
    },
    stats: () => ({ closed, observed: observed.size, disposed: disposedCount }),
    resources() { observe(); return [...observed.keys()]; },
    memory() {
      observe(); const buffers = new Set<ArrayBufferLike>(); let geometries = 0;
      for (const resource of observed.keys()) {
        if (!isGeometry(resource) || disposed.has(resource)) continue;
        geometries++;
        const attributes = Object.values(resource.attributes);
        if (resource.index) attributes.push(resource.index);
        for (const attribute of attributes) buffers.add(
          ('data' in attribute ? attribute.data.array : attribute.array).buffer);
      }
      return { geometries, arrayBuffers: buffers.size,
        arrayBytes: [...buffers].reduce((total, buffer) => total + buffer.byteLength, 0) };
    },
    release,
    abort() {
      if (closed) return;
      observe(); equipmentDamage.dispose();
      for (const resource of disposables) {
        if (isMaterial(resource)) releaseShadow(resource);
        once(resource);
      }
      root.traverse((object: BuildMesh) => {
        if (isRuntimeOwner(object)) once(object);
        if (!object.isMesh || !object.geometry) return;
        if (!disposed.has(object.geometry) && disposeFitting(object.geometry)) markDisposed(object.geometry);
        if (object.userData.__kitMerged || object.userData.__cotTrackRuntimeClone
            || object.userData.__cotSharedAttributeView) once(object.geometry);
      });
      for (const list of Object.values(buckets)) for (const geometry of list) once(geometry);
      for (const geometry of temporarySources) once(geometry);
      mats.dispose(); root.removeFromParent(); release();
    },
  };
  return owner;
}

/** Public synchronous callers fully drain the same authored body. They never
 * install a partial owner, invoke a scheduler or expose a partial result. */
export function drainTankBuild<Result>(iterator: Iterator<TankBuildStage | TankBuildCheckpoint, Result, void>): Result {
  let result = iterator.next();
  while (!result.done) result = iterator.next();
  return result.value;
}

