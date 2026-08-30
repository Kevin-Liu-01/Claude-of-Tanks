import type {
  DriveTestController,
  DriveTestControllerOptions,
} from './driveTestController.ts';

interface DriveTestControllerModule {
  createDriveTestController(options: DriveTestControllerOptions): DriveTestController;
}

export interface DriveTestAccessOptions {
  enabled: boolean;
  options(): DriveTestControllerOptions;
  load?(): Promise<DriveTestControllerModule>;
}

export interface DriveTestAccess extends DriveTestController {
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
  let pending: Promise<DriveTestController> | null = null;
  const preload = (): Promise<DriveTestController | null> => {
    if (!enabled) return Promise.resolve(null);
    if (runtime) return Promise.resolve(runtime);
    if (pending) return pending;
    const request = load().then((module) => {
      runtime = module.createDriveTestController(options());
      return runtime;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  return {
    preload,
    get aimTargetId() { return runtime?.aimTargetId ?? null; },
    aimAtNearest: () => runtime?.aimAtNearest() ?? null,
    gunAimError: () => runtime?.gunAimError() ?? Infinity,
    aimState: () => runtime?.aimState() ?? null,
    fastForward: (seconds) => runtime?.fastForward(seconds) ?? 0,
    spawnKillShell: (aimYFrac) => runtime?.spawnKillShell(aimYFrac) ?? false,
    slayEnemies: () => { runtime?.slayEnemies(); },
    resetAim: () => { runtime?.resetAim(); },
  };
}
