import { writeGrassTuftData } from './grassChunkWork.ts';

interface GrassCarpetTarget {
  matrices: Float32Array;
  colors: Float32Array;
}

export interface GrassCarpetWorkState {
  stage: 'idle' | 'cell' | 'candidates' | 'cache' | 'write' | 'publish' | 'complete' | 'cancelled';
  pending: boolean;
  cold: boolean;
  requestedGeneration: number;
  publishedGeneration: number;
  targetGeneration: number;
  requestedCell: { x: number; z: number } | null;
  publishedCell: { x: number; z: number } | null;
  buildingCell: { x: number; z: number } | null;
  cellsDone: number;
  cellsTotal: number;
  candidatesDone: number;
  candidatesTotal: number;
  instancesDone: number;
  instancesTotal: number;
  variantCounts: readonly [number, number];
  cacheSize: number;
}

interface GrassCarpetWorkOptions {
  seed: number;
  cellSize: number;
  ring: number;
  candidatesPerCell: number;
  capacity: number;
  cache: Map<string, Float32Array>;
  cacheCapacity: number;
  scratch: Float32Array;
  random(seed: number): () => number;
  makeTuft(x: number, z: number, random: () => number): number[] | null;
  /** Returns the inactive halves only; called once per requested rebuild. */
  targets(): readonly [GrassCarpetTarget, GrassCarpetTarget];
  publish(counts: readonly [number, number], cellX: number, cellZ: number, generation: number): void;
}

export interface GrassCarpetWork {
  readonly complete: boolean;
  request(cellX: number, cellZ: number): void;
  step(): void;
  cancel(): void;
  getState(): GrassCarpetWorkState;
}

/**
 * Owns one reusable cell staging array and the inactive carpet halves. A newer
 * camera request finishes only an in-flight cell (keeping its seeded work and
 * completed-cell FIFO insertion), then replaces the unpresented output prefix.
 * Completed cached cells survive retarget/cancel; no partial cell is cached.
 */
export function createGrassCarpetWork(options: GrassCarpetWorkOptions): GrassCarpetWork {
  const diameter = options.ring * 2 + 1, totalCells = diameter * diameter;
  const counts: [number, number] = [0, 0];
  // Inactive boot halves may still draw one ZERO-scale instance to allocate
  // their GPU buffers. Keep slot zero unchanged until the atomic publication,
  // including when CPU preparation precedes their very first GPU upload.
  const firstMatrices = [new Float32Array(16), new Float32Array(16)];
  const firstColors = [new Float32Array(3), new Float32Array(3)];
  let phase: GrassCarpetWorkState['stage'] = 'idle';
  let desiredX = 0, desiredZ = 0, targetX = 0, targetZ = 0;
  let requestedGeneration = 0, targetGeneration = 0, publishedGeneration = 0;
  let publishedX = 0, publishedZ = 0;
  let cellIndex = 0, candidate = 0, accepted = 0, offset = 0;
  let cellX = 0, cellZ = 0, cellKey = '';
  let cell: Float32Array | null = null, random: (() => number) | null = null;
  let targets: readonly [GrassCarpetTarget, GrassCarpetTarget] | null = null;

  function retarget(): void {
    targetX = desiredX; targetZ = desiredZ; targetGeneration = requestedGeneration;
    cellIndex = 0; candidate = 0; accepted = 0; offset = 0;
    cell = null; random = null;
    counts[0] = counts[1] = 0;
    targets = options.targets();
    phase = 'cell';
  }

  function selectCell(): void {
    if (cellIndex >= totalCells) { phase = 'publish'; return; }
    cellX = targetX + cellIndex % diameter - options.ring;
    cellZ = targetZ + Math.floor(cellIndex / diameter) - options.ring;
    cellKey = cellX + ',' + cellZ;
    cell = options.cache.get(cellKey) ?? null;
    offset = 0;
    if (cell) { phase = 'write'; return; }
    random = options.random((options.seed ^ 0x51ab ^ (cellX * 374761393) ^ (cellZ * 668265263)) >>> 0);
    candidate = 0; accepted = 0; phase = 'candidates';
  }

  function advanceCandidate(): void {
    if (candidate >= options.candidatesPerCell) { phase = 'cache'; return; }
    const tuft = options.makeTuft(cellX * options.cellSize + random!() * options.cellSize,
      cellZ * options.cellSize + random!() * options.cellSize, random!);
    if (tuft && (accepted + 1) * 10 <= options.scratch.length) {
      tuft[4] *= 0.96; tuft[5] *= 1.04;
      options.scratch.set(tuft, accepted * 10);
      accepted++;
    }
    candidate++;
  }

  function cacheCell(): void {
    // Fixed maximum 1024 records in production, as in the original path.
    // This bounded allocation/copy is one cooperative (not preemptible) step.
    cell = options.scratch.slice(0, accepted * 10);
    options.cache.set(cellKey, cell);
    if (options.cache.size > options.cacheCapacity) {
      const oldest = options.cache.keys().next().value;
      if (oldest !== undefined) options.cache.delete(oldest);
    }
    random = null; phase = 'write';
  }

  function writeInstance(): void {
    if (offset >= cell!.length) { cell = null; cellIndex++; phase = 'cell'; return; }
    const variant = cell![offset + 9];
    if (counts[variant] < options.capacity) {
      const target = targets![variant];
      const index = counts[variant]++;
      if (index === 0) writeGrassTuftData(firstMatrices[variant], firstColors[variant], 0, cell!, offset);
      else writeGrassTuftData(target.matrices, target.colors, index, cell!, offset);
    }
    offset += 10;
  }

  function publish(): void {
    for (let variant = 0; variant < 2; variant++) if (counts[variant] > 0) {
      targets![variant].matrices.set(firstMatrices[variant], 0);
      targets![variant].colors.set(firstColors[variant], 0);
    }
    options.publish(counts, targetX, targetZ, targetGeneration);
    publishedX = targetX; publishedZ = targetZ; publishedGeneration = targetGeneration;
    targets = null; phase = 'complete';
  }

  return {
    get complete() { return phase === 'idle' || phase === 'complete'; },
    request(x, z) {
      if (phase === 'cancelled') throw new Error('Grass carpet work was cancelled');
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) throw new RangeError('Invalid grass carpet cell');
      if (requestedGeneration > 0 && desiredX === x && desiredZ === z) return;
      desiredX = x; desiredZ = z; requestedGeneration++;
      // Record pending immediately, but do no hidden candidate work in request.
      if (phase === 'idle' || phase === 'complete') phase = 'cell';
    },
    step() {
      if (phase === 'cancelled') throw new Error('Grass carpet work was cancelled');
      if (phase === 'idle' || phase === 'complete') return;
      if (requestedGeneration !== targetGeneration && phase !== 'candidates' && phase !== 'cache') {
        retarget();
        return;
      }
      // Requests are checked above, so an obsolete target can never flip live.
      switch (phase) {
        case 'cell': selectCell(); break;
        case 'candidates': advanceCandidate(); break;
        case 'cache': cacheCell(); break;
        case 'write': writeInstance(); break;
        case 'publish': publish(); break;
      }
    },
    cancel() {
      phase = 'cancelled';
      targets = null; cell = null; random = null;
    },
    getState() {
      return {
        stage: phase, pending: phase !== 'cancelled' && requestedGeneration !== publishedGeneration,
        cold: publishedGeneration === 0, requestedGeneration, publishedGeneration, targetGeneration,
        requestedCell: requestedGeneration ? { x: desiredX, z: desiredZ } : null,
        publishedCell: publishedGeneration ? { x: publishedX, z: publishedZ } : null,
        buildingCell: phase === 'candidates' || phase === 'cache' ? { x: cellX, z: cellZ } : null,
        cellsDone: cellIndex, cellsTotal: totalCells,
        candidatesDone: candidate, candidatesTotal: options.candidatesPerCell,
        instancesDone: offset / 10, instancesTotal: cell ? cell.length / 10 : 0,
        variantCounts: [counts[0], counts[1]], cacheSize: options.cache.size,
      };
    },
  };
}

const carpetWorkNow = (): number => performance.now();
/** Deadline plus hard cap; callbacks and final publication are timed steps too. */
export function advanceGrassCarpetWork(
  work: GrassCarpetWork, maxSteps: number, budgetMs: number, now: () => number = carpetWorkNow,
): number {
  const limit = Number.isFinite(maxSteps) ? Math.max(0, Math.floor(maxSteps)) : 0;
  if (!limit || !(budgetMs > 0)) return 0;
  const start = now();
  let steps = 0;
  while (!work.complete && steps < limit) {
    work.step(); steps++;
    const elapsed = now() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= budgetMs) break;
  }
  return steps;
}
