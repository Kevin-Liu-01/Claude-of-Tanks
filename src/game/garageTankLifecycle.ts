/**
 * End every battle-owned presentation lifetime before a resident player tank
 * is reused by the garage. Combat FX owns meshes parented to the tank (impact
 * decals) as well as world-space particles, lights, tracers, prints and
 * timers, while the tank visual owns articulation, damage and LOD state.
 * Reset both owners at the same phase boundary so neither can leak into the
 * showroom.
 *
 */
export interface LifecycleVisual {
  resetForGaragePresentation?(): void;
  resetDestroyed?(): void;
  setVisible?(visible: boolean): void;
  dispose?(): void;
}

interface LifecycleInput {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  shellSlot: number;
  aimPoint?: { set?(x: number, y: number, z: number): unknown };
}

interface LifecycleEntity {
  visual: LifecycleVisual | null;
  state: unknown;
  combat: unknown;
  specialAction: unknown;
  equip: unknown;
  ai: unknown;
  aiCtl: unknown;
  team: string;
  isPlayer: boolean;
  rigidGear: boolean;
  contactGeom: unknown;
  _destroyedAnnounced: boolean;
  _glbContactStampedVisual?: unknown;
  _openingRoute?: unknown;
  _lastImpactT?: number;
  _reloadEvent?: unknown;
  _soloRenderPose?: unknown;
  _spotFade?: number;
  _fxAcc?: number;
  _dustTravelAcc?: number;
  input?: LifecycleInput | null;
}

export interface BattleExitState {
  allTanks?: LifecycleEntity[];
  tanks: unknown[];
  shells: unknown[];
  player: unknown | null;
  spotting: unknown | null;
  result: unknown | null;
  resultReason: unknown | null;
  preBattleS: number;
  timeS: number;
  fireTickAcc: number;
  nextShellId: number;
  openingRouteJobs?: unknown[];
}

export function resetBattleTankForGarage({
  fx,
  visual = null,
}: {
  fx: { resetAll(): void };
  visual?: LifecycleVisual | null;
}): void {
  if (!fx || typeof fx.resetAll !== 'function') {
    throw new TypeError('garage lifecycle requires an FX reset owner');
  }

  // Run this first: impact decals are children of the battle visual. They
  // must detach before that visual is parked, disposed or adopted as hero.
  fx.resetAll();

  if (!visual) return;
  if (typeof visual.resetForGaragePresentation === 'function') {
    visual.resetForGaragePresentation();
  } else if (typeof visual.resetDestroyed === 'function') {
    // Compatibility for non-procedural/diagnostic visuals that predate the
    // complete showroom lifecycle API.
    visual.resetDestroyed();
  }
}

/**
 * Tear down a completed battle after its clean player visual has optionally
 * transferred into the garage pedestal cache. The roster records themselves
 * remain reusable, but no simulation, damage, AI, shell or presentation state
 * survives the phase boundary.
 *
 */
export function clearBattleAfterExit({
  game,
  preservedVisual = null,
  visualPool = null,
}: {
  game: BattleExitState;
  preservedVisual?: LifecycleVisual | null;
  visualPool?: { release(visual: LifecycleVisual): boolean } | null;
}): void {
  if (!game) throw new TypeError('garage lifecycle requires battle state');

  for (const entity of game.allTanks || []) {
    const visual = entity.visual;
    // A successfully adopted player visual is now garage-owned. Sever its
    // entity reference without disposing the scene graph the pedestal cache
    // just acquired. Every other actor releases its visual to the detached
    // clean pool or disposes it; no actor ownership survives.
    if (visual && visual !== preservedVisual) {
      if (visualPool?.release) visualPool.release(visual);
      else {
        visual.setVisible?.(false);
        visual.dispose?.();
      }
    }
    entity.visual = null;
    entity.state = null;
    entity.combat = null;
    entity.specialAction = null;
    entity.equip = null;
    entity.ai = null;
    entity.aiCtl = null;
    entity.team = 'enemy';
    entity.isPlayer = false;
    entity.rigidGear = false;
    entity.contactGeom = null;
    entity._destroyedAnnounced = false;
    entity._glbContactStampedVisual = null;
    entity._openingRoute = null;
    entity._lastImpactT = -1;
    entity._reloadEvent = null;
    entity._soloRenderPose = null;
    entity._spotFade = undefined;
    entity._fxAcc = 0;
    entity._dustTravelAcc = 0;
    if (entity.input) {
      entity.input.throttle = 0;
      entity.input.steer = 0;
      entity.input.brake = false;
      entity.input.fire = false;
      entity.input.shellSlot = 0;
      entity.input.aimPoint?.set?.(0, 0, 0);
    }
  }

  game.tanks.length = 0;
  game.shells.length = 0;
  game.player = null;
  game.spotting = null;
  game.result = null;
  game.resultReason = null;
  game.preBattleS = 0;
  game.timeS = 0;
  game.fireTickAcc = 0;
  game.nextShellId = 1;
  game.openingRouteJobs?.splice(0);
}
