import { releaseObject3DGpuResources } from './resourceLifetime.ts';
import type { Object3D } from 'three';

interface GpuReleaseReceipt {
  objects: number;
  geometries: number;
  materials: number;
  textures: number;
}

/**
 * The residency's one state (2026-11-02 audit R5). `restoring` is the span between a resume's start and its upload
 * settling; requests that arrive inside it are recorded and applied when it settles instead of being dropped.
 */
export type PhaseGpuResidencyPhase = 'resident' | 'suspended' | 'restoring';

export interface PhaseGpuResidencyStats {
  phase: PhaseGpuResidencyPhase;
  /** True unless the phase is resident (a restore in flight is not resident yet). */
  suspended: boolean;
  releases: number;
  resumes: number;
  resumeFailures: number;
  invalidations: number;
  lastRelease: GpuReleaseReceipt | null;
}

interface RetainedPhaseGpuResidency {
  suspend(options?: { releaseTextures?: boolean; additionalRoots?: Object3D[] }): GpuReleaseReceipt | null;
  invalidate(): boolean;
  resume(): Promise<boolean>;
  diagnostics(): PhaseGpuResidencyStats;
}

interface RetainedPhaseGpuResidencyOptions {
  root: Object3D;
  preserveRoots: Object3D[];
  additionalRoots?: Object3D[];
  restoreGpu(): Promise<void>;
  releaseMaterials?: boolean;
}

/**
 * Owns renewable WebGL residency for a retained, phase-exclusive scene root.
 * The CPU graph and authored materials stay intact; suspend evicts allocations
 * that the active phase cannot use, and resume restores them with exactly one
 * covered real frame rather than compiling synthetic light variants.
 */
export function createRetainedPhaseGpuResidency({
  root,
  preserveRoots,
  additionalRoots = [],
  restoreGpu,
  releaseMaterials = false,
}: RetainedPhaseGpuResidencyOptions): RetainedPhaseGpuResidency {
  if (!root?.traverse || !Array.isArray(preserveRoots)
    || typeof restoreGpu !== 'function') {
    throw new TypeError('phase GPU residency requires a root and render lifecycle ports');
  }

  const stats: PhaseGpuResidencyStats = {
    phase: 'resident',
    suspended: false,
    releases: 0,
    resumes: 0,
    resumeFailures: 0,
    invalidations: 0,
    lastRelease: null,
  };
  type SuspendOptions = { releaseTextures?: boolean; additionalRoots?: Object3D[] };
  // Requests that arrived while a restore was in flight, applied when it settles. The newest request wins: a resume
  // after a queued suspend cancels it.
  let queuedSuspend: SuspendOptions | null = null;
  let restoreInvalidated = false;
  let restoring: Promise<boolean> | null = null;

  const setPhase = (phase: PhaseGpuResidencyPhase): void => {
    stats.phase = phase;
    stats.suspended = phase !== 'resident';
  };
  const release = ({ releaseTextures = true, additionalRoots: releaseRoots = additionalRoots }: SuspendOptions): GpuReleaseReceipt => {
    stats.lastRelease = releaseObject3DGpuResources(root, {
      preserveRoots,
      additionalRoots: releaseRoots,
      releaseMaterials,
      releaseTextures,
    });
    stats.releases += 1;
    setPhase('suspended');
    return stats.lastRelease;
  };
  // The one place a restore ends: a queued suspend releases now, an invalidated restore stays renewable, a failure
  // stays suspended so the next covered return retries, and only a clean restore marks the phase resident.
  const settleRestore = (succeeded: boolean): void => {
    const suspendRequest = queuedSuspend;
    const invalidated = restoreInvalidated;
    queuedSuspend = null;
    restoreInvalidated = false;
    restoring = null;
    if (suspendRequest) release(suspendRequest);
    else setPhase(succeeded && !invalidated ? 'resident' : 'suspended');
  };
  const startRestore = (): Promise<boolean> => {
    setPhase('restoring');
    const run = (async () => {
      try {
        await restoreGpu();
      } catch (error) {
        // Keep the phase suspended after a failed upload. Clearing this flag
        // would make the next return treat disposed buffers as resident and
        // reveal a partially restored scene instead of retrying under cover.
        stats.resumeFailures += 1;
        settleRestore(false);
        throw error;
      }
      stats.resumes += 1;
      settleRestore(true);
      return true;
    })();
    restoring = run;
    return run;
  };

  const resume = (): Promise<boolean> => {
    if (stats.phase === 'resident') return Promise.resolve(false);
    if (stats.phase === 'restoring' && restoring) {
      // The newest request wins over a queued suspend; overlapping callers share the one upload.
      queuedSuspend = null;
      if (!restoreInvalidated) return restoring;
      // The upload in flight went to a lost context: renew again once it settles.
      return restoring.then(resume, resume);
    }
    return startRestore();
  };

  return {
    suspend(options = {}) {
      if (stats.phase === 'restoring') {
        // A battle that starts while the Garage is still uploading: release once the upload settles, so the
        // detached Garage never ends marked resident.
        queuedSuspend = options;
        return null;
      }
      if (stats.phase === 'suspended') return null;
      return release(options);
    },

    invalidate() {
      if (stats.phase === 'suspended') return false;
      // A restored WebGL context invalidates every GPU allocation without
      // disposing the reusable Three.js CPU graph. Mark the phase renewable
      // so its next covered activation performs the same complete upload path
      // as an intentional memory-pressure release. A restore in flight was
      // uploading into the lost context: it settles renewable, not resident.
      if (stats.phase === 'restoring') {
        if (restoreInvalidated) return false;
        restoreInvalidated = true;
      } else setPhase('suspended');
      stats.invalidations += 1;
      return true;
    },

    resume,

    diagnostics() {
      return {
        ...stats,
        lastRelease: stats.lastRelease ? { ...stats.lastRelease } : null,
      };
    },
  };
}
