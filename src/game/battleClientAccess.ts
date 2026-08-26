import type {
  AimController,
  AimControllerDependencies,
} from './aimController.ts';

type RuntimeModule = typeof import('./battleClientRuntime.ts');
type RuntimeLoader = () => Promise<RuntimeModule>;

export interface BattleClientAccess {
  preload(): Promise<RuntimeModule>;
  isReady(): boolean;
  readonly aimController: AimController;
  readonly computeDispersionRadM: RuntimeModule['computeDispersionRadM'];
  readonly shotRecoilScale: RuntimeModule['shotRecoilScale'];
  readonly tankPoseFromState: RuntimeModule['tankPoseFromState'];
  readonly traceTank: RuntimeModule['traceTank'];
  readonly selectShell: RuntimeModule['selectShell'];
  readonly resolveShellHit: RuntimeModule['resolveShellHit'];
  readonly createCombatState: RuntimeModule['createCombatState'];
  readonly repairAllModules: RuntimeModule['repairAllModules'];
  readonly startMagazineReload: RuntimeModule['startMagazineReload'];
  readonly createShell: RuntimeModule['createShell'];
  readonly activateSpecialAction: RuntimeModule['activateSpecialAction'];
  readonly specialActionLocksShell: RuntimeModule['specialActionLocksShell'];
  readonly isPostwarVehicleEra: RuntimeModule['isPostwarVehicleEra'];
}

/**
 * Keep client combat math and the armor-query controller outside garage boot.
 *
 * The stable aim proxy lets the camera own one raycast callback before the
 * dynamic module arrives. Garage rays fall back to terrain; every operation
 * that requires a combat entity fails closed until Battle intent has awaited
 * the retryable runtime transfer.
 */
export function createBattleClientAccess(
  getAimDependencies: () => AimControllerDependencies,
  load: RuntimeLoader = () => import('./battleClientRuntime.ts'),
): BattleClientAccess {
  if (typeof getAimDependencies !== 'function' || typeof load !== 'function') {
    throw new TypeError('battle client access requires dependency and loader ports');
  }

  let runtime: RuntimeModule | null = null;
  let aim: AimController | null = null;
  let pending: Promise<RuntimeModule> | null = null;

  const preload = (): Promise<RuntimeModule> => {
    if (runtime) return Promise.resolve(runtime);
    if (pending) return pending;
    const request = load().then((loaded) => {
      aim = loaded.createAimController(getAimDependencies());
      runtime = loaded;
      return loaded;
    });
    pending = request;
    request.catch(() => {
      if (pending === request) pending = null;
    });
    return request;
  };

  const requireRuntime = (): RuntimeModule => {
    if (!runtime) throw new Error('Battle client runtime is not ready.');
    return runtime;
  };
  const requireAim = (): AimController => {
    if (!aim) throw new Error('Battle aim controller is not ready.');
    return aim;
  };

  const aimController: AimController = {
    raycast(origin, direction, maxDistance) {
      if (aim) return aim.raycast(origin, direction, maxDistance);
      return getAimDependencies().worldRaycast(origin, direction, maxDistance);
    },
    gunCenterRay: (...args) => requireAim().gunCenterRay(...args),
    muzzlePathBlockDist: (...args) => requireAim().muzzlePathBlockDist(...args),
    update(frame) { if (aim) aim.update(frame); },
  };

  return {
    preload,
    isReady: () => runtime !== null,
    aimController,
    computeDispersionRadM: (...args) => requireRuntime().computeDispersionRadM(...args),
    shotRecoilScale: (...args) => requireRuntime().shotRecoilScale(...args),
    tankPoseFromState: (...args) => requireRuntime().tankPoseFromState(...args),
    traceTank: (...args) => requireRuntime().traceTank(...args),
    selectShell: (...args) => requireRuntime().selectShell(...args),
    resolveShellHit: (...args) => requireRuntime().resolveShellHit(...args),
    createCombatState: (...args) => requireRuntime().createCombatState(...args),
    repairAllModules: (...args) => requireRuntime().repairAllModules(...args),
    startMagazineReload: (...args) => requireRuntime().startMagazineReload(...args),
    createShell: (...args) => requireRuntime().createShell(...args),
    activateSpecialAction: (...args) => requireRuntime().activateSpecialAction(...args),
    specialActionLocksShell: (...args) => requireRuntime().specialActionLocksShell(...args),
    isPostwarVehicleEra: (...args) => requireRuntime().isPostwarVehicleEra(...args),
  };
}
