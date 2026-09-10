import { Matrix4, Sphere } from 'three';

type NumericArray = Float32Array | Float64Array | number[];

/** Exact column-major yaw transform shared by eager, streamed and carpet grass. */
export function writeGrassTuftData(
  matrices: Float32Array, colors: Float32Array, index: number,
  tuft: NumericArray, offset: number,
): void {
  const yaw = tuft[offset + 3], sn = Math.sin(yaw), cs = Math.cos(yaw);
  const sxz = tuft[offset + 4], sy = tuft[offset + 5], mi = index * 16;
  matrices[mi] = cs * sxz; matrices[mi + 1] = 0; matrices[mi + 2] = -sn * sxz; matrices[mi + 3] = 0;
  matrices[mi + 4] = 0; matrices[mi + 5] = sy; matrices[mi + 6] = 0; matrices[mi + 7] = 0;
  matrices[mi + 8] = sn * sxz; matrices[mi + 9] = 0; matrices[mi + 10] = cs * sxz; matrices[mi + 11] = 0;
  matrices[mi + 12] = tuft[offset]; matrices[mi + 13] = tuft[offset + 1];
  matrices[mi + 14] = tuft[offset + 2]; matrices[mi + 15] = 1;
  const ci = index * 3;
  colors[ci] = tuft[offset + 6]; colors[ci + 1] = tuft[offset + 7]; colors[ci + 2] = tuft[offset + 8];
}

export interface GrassChunkBuffer {
  variant: number;
  count: number;
  matrices: Float32Array;
  colors: Float32Array;
  sphere: Sphere;
}

interface GrassChunkWorkOptions {
  candidateCount: number;
  random(): number;
  x0: number;
  z0: number;
  size: number;
  makeTuft(x: number, z: number, random: () => number): number[] | null;
  staging: readonly Float64Array[];
  variantSphere(variant: number): Sphere;
  /** Atomic, fixed-variant scene publication, charged as the final work step. */
  publish?(buffers: readonly GrassChunkBuffer[]): void;
}

export interface GrassChunkWorkState {
  stage: 'candidates' | 'allocate' | 'write' | 'bounds' | 'publish' | 'complete' | 'cancelled';
  candidatesDone: number;
  candidatesTotal: number;
  accepted: number;
  variant: number;
  variantsTotal: number;
  instancesDone: number;
  instancesTotal: number;
}

export interface GrassChunkWork {
  readonly complete: boolean;
  readonly buffers: readonly GrassChunkBuffer[];
  /** Allocates only when an explicit diagnostic checkpoint asks for it. */
  getState(): GrassChunkWorkState;
  /** One candidate, one instance write, one sphere union, or one phase edge. */
  step(): void;
  cancel(): void;
}

/**
 * CPU-only work until publication. The caller exclusively owns staging while
 * this job is active; publication must attach only fully prepared meshes.
 */
export function createGrassChunkWork(options: GrassChunkWorkOptions): GrassChunkWork {
  const counts = options.staging.map(() => 0);
  const buffers: GrassChunkBuffer[] = [];
  const matrix = new Matrix4(), sphere = new Sphere();
  let phase: GrassChunkWorkState['stage'] = 'candidates';
  let candidate = 0, variant = 0, instance = 0;
  let current: GrassChunkBuffer | null = null;
  let sourceSphere: Sphere | null = null;
  return {
    get complete() { return phase === 'complete'; },
    get buffers() {
      if (phase !== 'complete') throw new Error('Grass chunk buffers are not complete');
      return buffers;
    },
    getState() {
      let accepted = 0;
      for (let i = 0; i < counts.length; i++) accepted += counts[i];
      return { stage: phase, candidatesDone: candidate, candidatesTotal: options.candidateCount,
        accepted, variant, variantsTotal: counts.length,
        instancesDone: instance, instancesTotal: current?.count ?? 0 };
    },
    step() {
      if (phase === 'cancelled') throw new Error('Grass chunk work was cancelled');
      if (phase === 'complete') return;
      if (phase === 'publish') {
        options.publish?.(buffers);
        phase = 'complete';
        return;
      }
      if (phase === 'candidates') {
        if (candidate < options.candidateCount) {
          const tuft = options.makeTuft(
            options.x0 + options.random() * options.size,
            options.z0 + options.random() * options.size, options.random);
          if (tuft) {
            const vv = tuft[9];
            options.staging[vv].set(tuft, counts[vv] * 10);
            counts[vv]++;
          }
          candidate++;
        } else phase = 'allocate';
        return;
      }
      if (phase === 'allocate') {
        if (variant >= counts.length) { phase = 'publish'; return; }
        const count = counts[variant];
        if (count === 0) { variant++; return; }
        current = { variant, count, matrices: new Float32Array(count * 16),
          colors: new Float32Array(count * 3), sphere: new Sphere().makeEmpty() };
        buffers.push(current);
        sourceSphere = options.variantSphere(variant);
        instance = 0;
        phase = 'write';
        return;
      }
      if (phase === 'write') {
        if (instance < current!.count) {
          writeGrassTuftData(current!.matrices, current!.colors, instance,
            options.staging[variant], instance * 10);
          instance++;
        } else { instance = 0; phase = 'bounds'; }
        return;
      }
      if (instance < current!.count) {
        // Match InstancedMesh.computeBoundingSphere exactly: read the already
        // Float32-rounded matrix, transform the source sphere, union in order.
        matrix.fromArray(current!.matrices, instance * 16);
        sphere.copy(sourceSphere!).applyMatrix4(matrix);
        current!.sphere.union(sphere);
        instance++;
      } else { current = null; sourceSphere = null; instance = 0; variant++; phase = 'allocate'; }
    },
    cancel() {
      phase = 'cancelled';
      buffers.length = 0;
      current = null;
      sourceSphere = null;
    },
  };
}

/** A deadline is cooperative; the hard step cap also handles frozen/bad clocks. */
const grassWorkNow = (): number => performance.now();
export function advanceGrassChunkWork(
  work: GrassChunkWork, maxSteps: number, budgetMs: number,
  now: () => number = grassWorkNow,
): number {
  const limit = Number.isFinite(maxSteps) ? Math.max(0, Math.floor(maxSteps)) : 0;
  if (!limit || !(budgetMs > 0)) return 0;
  const start = now();
  let steps = 0;
  while (!work.complete && steps < limit) {
    work.step();
    steps++;
    const elapsed = now() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= budgetMs) break;
  }
  return steps;
}
