import type {
  DriveTestController,
  DriveTestControllerOptions,
} from './driveTestController.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';

interface DriveTestControllerModule {
  createDriveTestController(options: DriveTestControllerOptions): DriveTestController;
}

interface DriveTestAccessOptions {
  enabled: boolean;
  options(): DriveTestControllerOptions;
  load?(): Promise<DriveTestControllerModule>;
}

interface DriveTestAccess extends DriveTestController {
  preload(): Promise<DriveTestController | null>;
}

/**
 * Stable facade for engineering-only battle controls. Production callers keep
 * inert methods without transferring the controller chunk; explicit QA entry
 * joins one retryable import and every existing callback sees the live owner.
 */
export function createDriveTestAccess({
  enabled,
  options,
  load = () => import('./driveTestController.ts'),
}: DriveTestAccessOptions): DriveTestAccess {
  if (typeof enabled !== 'boolean' || typeof options !== 'function'
    || typeof load !== 'function') {
    throw new TypeError('drive test access requires intent, options, and loader');
  }

  let runtime: DriveTestController | null = null;
  // (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: a failed transfer is asked again under the one policy
  // (at once after one failure, then past its backoff; a removed chunk shows the reload action), not at once by every call
  const chunk = createLazyChunk(() => load().then((module) => (runtime = module.createDriveTestController(options()))));
  const preload = (): Promise<DriveTestController | null> => (enabled ? chunk.load() : Promise.resolve(null));

  return {
    preload,
    get aimTargetId() { return runtime?.aimTargetId ?? null; },
    aimAtNearest: () => runtime?.aimAtNearest() ?? null,
    gunAimError: () => runtime?.gunAimError() ?? Infinity,
    aimState: () => runtime?.aimState() ?? null,
    fastForward: (seconds) => runtime?.fastForward(seconds) ?? 0,
    spawnKillShell: (aimYFrac) => runtime?.spawnKillShell(aimYFrac) ?? false,
    slayEnemies: (cause?: 'ammorack' | 'shot') => { runtime?.slayEnemies(cause); },
    resetAim: () => { runtime?.resetAim(); },
  };
}
