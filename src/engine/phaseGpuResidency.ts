import { releaseObject3DGpuResources } from './resourceLifetime.ts';
import type { Object3D } from 'three';

interface GpuReleaseReceipt {
  objects: number;
  geometries: number;
  materials: number;
  textures: number;
}

export interface PhaseGpuResidencyStats {
  suspended: boolean;
  releases: number;
  resumes: number;
  resumeFailures: number;
  invalidations: number;
  lastRelease: GpuReleaseReceipt | null;
}

export interface RetainedPhaseGpuResidency {
  suspend(): GpuReleaseReceipt | null;
  invalidate(): boolean;
  resume(): Promise<boolean>;
  diagnostics(): PhaseGpuResidencyStats;
}

interface RetainedPhaseGpuResidencyOptions {
  root: Object3D;
  preserveRoots: Object3D[];
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
  restoreGpu,
  releaseMaterials = false,
}: RetainedPhaseGpuResidencyOptions): RetainedPhaseGpuResidency {
  if (!root?.traverse || !Array.isArray(preserveRoots)
    || typeof restoreGpu !== 'function') {
    throw new TypeError('phase GPU residency requires a root and render lifecycle ports');
  }

  const stats: PhaseGpuResidencyStats = {
    suspended: false,
    releases: 0,
    resumes: 0,
    resumeFailures: 0,
    invalidations: 0,
    lastRelease: null,
  };

  return {
    suspend() {
      if (stats.suspended) return null;
      stats.lastRelease = releaseObject3DGpuResources(root, {
        preserveRoots,
        releaseMaterials,
      });
      stats.suspended = true;
      stats.releases += 1;
      return stats.lastRelease;
    },

    invalidate() {
      if (stats.suspended) return false;
      // A restored WebGL context invalidates every GPU allocation without
      // disposing the reusable Three.js CPU graph. Mark the phase renewable
      // so its next covered activation performs the same complete upload path
      // as an intentional memory-pressure release.
      stats.suspended = true;
      stats.invalidations += 1;
      return true;
    },

    async resume() {
      if (!stats.suspended) return false;
      try {
        await restoreGpu();
        stats.suspended = false;
        stats.resumes += 1;
        return true;
      } catch (error) {
        // Keep the phase suspended after a failed upload. Clearing this flag
        // would make the next return treat disposed buffers as resident and
        // reveal a partially restored scene instead of retrying under cover.
        stats.resumeFailures += 1;
        throw error;
      }
    },

    diagnostics() {
      return {
        ...stats,
        lastRelease: stats.lastRelease ? { ...stats.lastRelease } : null,
      };
    },
  };
}
