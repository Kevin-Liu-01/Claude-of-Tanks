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
  lastRelease: GpuReleaseReceipt | null;
}

export interface RetainedPhaseGpuResidency {
  suspend(): GpuReleaseReceipt | null;
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

    async resume() {
      if (!stats.suspended) return false;
      try {
        await restoreGpu();
        return true;
      } finally {
        stats.suspended = false;
        stats.resumes += 1;
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
