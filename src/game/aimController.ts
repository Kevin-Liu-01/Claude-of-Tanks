import * as THREE from 'three';
import { queryAimArmor, tankPoseFromState, traceTank } from '../sim/armor.ts';
import type { ArmorModel, ArmorPoseState } from '../sim/armor.ts';
import { estimatePenRatio } from '../sim/damage.ts';
import type {
  DamageArmorPlate,
  DamageShellSpec,
  PlateHit,
} from '../sim/damage.ts';
import type { ShellCard } from './playerBattleActions.ts';
import type { HydropneumaticAim } from '../vehicles/specContracts.ts';
import { pendingAmmoSelectionSlot } from './ammoSelectionPresentation.ts';

interface AimWorldHit {
  point: THREE.Vector3;
  normal: THREE.Vector3 | null;
  dist: number;
  kind: string;
}

interface AimState extends ArmorPoseState {
  speed: number;
  bloomF: number;
  atGunLimit?: boolean;
  gunLimitSpec?: boolean;
}

interface AimCombat {
  destroyed: boolean;
  eraSpent: Set<string>;
  reload: { t: number; totalS: number; kind?: string };
  magazine?: { rounds?: number; capacity?: number } | null;
  shellSlot: number;
  ammo?: number[];
}

interface AimSpec {
  hydropneumaticAim?: HydropneumaticAim;
  dims: { heightM: number };
  armor: ArmorModel & { boundingRadiusM: number };
  gun: { baseAccuracy: number; shells: DamageShellSpec[] };
}

interface ArmorTraceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

interface AimArmorInfo {
  plate: DamageArmorPlate;
  impactAngleDeg: number;
  point: THREE.Vector3;
  distM: number;
  layers: PlateHit[];
}

interface AimVisual {
  gunMuzzleWorld(out: THREE.Vector3): void;
  gunDirWorld(out: THREE.Vector3): void;
}

interface AimTank {
  id: string;
  team?: string;
  isPlayer?: boolean;
  _networkShellSlot?: number;
  _networkAmmoSelectionPending?: boolean;
  input?: { shellSlot?: number; fire?: boolean };
  state: AimState | null;
  combat: AimCombat | null;
  spec: AimSpec;
  visual: AimVisual | null;
}

interface AimGame {
  player: AimTank | null;
  tanks: AimTank[];
}

interface AimRig {
  aimPoint: THREE.Vector3;
  aimDist: number;
  mode: string;
  zoom: number;
}

export interface AimFrame {
  singleReticle: boolean;
  point: THREE.Vector3;
  distM: number;
  dispersionRadM: number;
  atGunLimit?: boolean;
  gunLimitSpec: boolean;
  reload: { t: number; totalS: number; kind?: string };
  magazine: { rounds: number; capacity: number };
  shellSlot: number;
  ammoSelectionPending?: boolean;
  shells: ShellCard[];
  zoom: number;
  gunDistM: number;
  gunTargetId: string | null;
  gunMarker: THREE.Vector3;
  blockedDistM: number | null;
  blockedLabel: boolean;
  penRatio: number | null;
}

export interface AimControllerDependencies {
  getGame(): AimGame;
  getRig(): AimRig;
  worldRaycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): AimWorldHit | null;
  targetVisible(target: AimTank): boolean;
  getShellCards(): ShellCard[];
  computeDispersion(spec: AimSpec, state: AimState, distanceM: number): number;
  now?: () => number;
}

export interface AimController {
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): AimWorldHit | null;
  gunCenterRay(
    player: AimTank,
    aimPoint: THREE.Vector3,
    outOrigin: THREE.Vector3,
    outDir: THREE.Vector3,
    outTarget: THREE.Vector3,
  ): number;
  muzzlePathBlockDist(
    origin: THREE.Vector3,
    aimPoint: THREE.Vector3,
    dispersionRadM: number,
  ): number | null;
  update(frame: AimFrame): void;
}

const AIM_STICKY_INFLATE = 1.15;
const AIM_STICKY_HOLD_MS = 300;

/**
 * Own the complete camera-marker/physical-bore contract. Both solo and
 * network presentation consume the same player state and therefore cannot
 * silently diverge into separate reticle math.
 */
export function createAimController(deps: AimControllerDependencies): AimController {
  const now = deps.now ?? (() => performance.now());
  const armEnd = new THREE.Vector3();
  const armTo = new THREE.Vector3();
  const softHit: AimWorldHit = {
    point: new THREE.Vector3(), normal: null, dist: 0, kind: 'tank-soft',
  };
  const muzzle = new THREE.Vector3();
  const bore = new THREE.Vector3();
  const gunTarget = new THREE.Vector3();
  const targetDelta = new THREE.Vector3();
  const pathDir = new THREE.Vector3();
  const aimPose = {
    pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
  };
  const armorSelection: {
    info: AimArmorInfo | null;
    targetId: string | null;
    worldHit: AimWorldHit | null;
    distanceM: number;
  } = { info: null, targetId: null, worldHit: null, distanceM: 800 };
  const raySelection: {
    best: AimWorldHit | null;
    bestDistance: number;
    exactTank: boolean;
    softDistance: number;
  } = { best: null, bestDistance: 0, exactTank: false, softDistance: Infinity };

  let stickyUntilMs = -Infinity;
  let stickyDistM = 0;
  let lastPenRatio: number | null = null;
  let lastGunTargetId: string | null = null;
  let lastPenUntilMs = -Infinity;
  let blockedSinceMs = -1;

  function findClosestRayHit(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
  ): void {
    const game = deps.getGame();
    const worldHit = deps.worldRaycast(origin, dir, maxDist);
    raySelection.bestDistance = worldHit ? worldHit.dist : maxDist;
    raySelection.best = worldHit;
    raySelection.exactTank = false;
    raySelection.softDistance = Infinity;
    for (const tank of game.tanks) {
      if (tank.isPlayer || !tank.state || !tank.combat || tank.combat.destroyed) continue;
      const radius = tank.spec.armor.boundingRadiusM;
      const inflatedRadius = radius * AIM_STICKY_INFLATE;
      armTo.copy(tank.state.pos);
      armTo.y += tank.spec.dims.heightM * 0.5;
      armTo.sub(origin);
      const projection = armTo.dot(dir);
      if (projection < 0 || projection - inflatedRadius > raySelection.bestDistance) continue;
      const lateralSq = armTo.lengthSq() - projection * projection;
      if (lateralSq > inflatedRadius * inflatedRadius) continue;
      if (projection < raySelection.bestDistance && projection < raySelection.softDistance) {
        raySelection.softDistance = projection;
      }
      if (lateralSq > radius * radius) continue;
      armEnd.copy(origin).addScaledVector(
        dir, Math.min(raySelection.bestDistance, projection + radius),
      );
      const hits = traceTank(
        origin, armEnd, tankPoseFromState(tank.state), tank.spec.armor, tank.combat.eraSpent,
      ) as ArmorTraceHit[];
      if (!hits.length) continue;
      const distance = origin.distanceTo(hits[0].point);
      if (distance >= raySelection.bestDistance) continue;
      raySelection.bestDistance = distance;
      raySelection.best = {
        point: hits[0].point,
        normal: hits[0].normal,
        dist: distance,
        kind: 'tank',
      };
      raySelection.exactTank = true;
    }
  }

  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): AimWorldHit | null {
    findClosestRayHit(origin, dir, maxDist);
    const sampleNow = now();
    if (raySelection.exactTank) {
      stickyUntilMs = sampleNow + AIM_STICKY_HOLD_MS;
      stickyDistM = raySelection.bestDistance;
      return raySelection.best;
    }
    if (raySelection.softDistance < Infinity) {
      stickyUntilMs = sampleNow + AIM_STICKY_HOLD_MS;
      stickyDistM = raySelection.softDistance;
      softHit.point.copy(origin).addScaledVector(dir, raySelection.softDistance);
      softHit.dist = raySelection.softDistance;
      return softHit;
    }
    if (sampleNow < stickyUntilMs && stickyDistM < raySelection.bestDistance) {
      softHit.point.copy(origin).addScaledVector(dir, stickyDistM);
      softHit.dist = stickyDistM;
      return softHit;
    }
    return raySelection.best;
  }

  function muzzlePathBlockDist(
    origin: THREE.Vector3,
    aimPoint: THREE.Vector3,
    _dispersionRadM: number,
  ): number | null {
    pathDir.copy(aimPoint).sub(origin);
    const pathLength = pathDir.length();
    if (pathLength <= 12) return null;
    pathDir.multiplyScalar(1 / pathLength);
    const blocked = deps.worldRaycast(origin, pathDir, pathLength - 1.5);
    if (blocked) return blocked.dist;
    return null;
  }

  function gunCenterRay(
    player: AimTank,
    aimPoint: THREE.Vector3,
    outOrigin: THREE.Vector3,
    outDir: THREE.Vector3,
    outTarget: THREE.Vector3,
  ): number {
    if (!player.visual) {
      throw new Error('gun-center ray requires an active tank visual');
    }
    player.visual.gunMuzzleWorld(outOrigin);
    player.visual.gunDirWorld(outDir);
    const rangeM = Math.max(outOrigin.distanceTo(aimPoint), 6);
    outTarget.copy(outOrigin).addScaledVector(outDir, rangeM);
    return rangeM;
  }

  function writeAmmoFrame(frame: AimFrame, player: AimTank): void {
    const pendingSlot = pendingAmmoSelectionSlot(player);
    frame.ammoSelectionPending = pendingSlot !== null;
    frame.shellSlot = pendingSlot ?? player.combat!.shellSlot;
    frame.shells = deps.getShellCards();
    if (!Array.isArray(player.combat!.ammo)) return;
    for (let slot = 0; slot < frame.shells.length; slot++) {
      frame.shells[slot].count = Math.max(0, Math.floor(player.combat!.ammo![slot] || 0));
    }
  }

  function writeBaseAimFrame(frame: AimFrame, player: AimTank, rig: AimRig): void {
    const state = player.state!;
    const combat = player.combat!;
    frame.singleReticle = !!(player.spec.hydropneumaticAim && player.spec.armor.turretless);
    frame.point.copy(rig.aimPoint);
    frame.distM = rig.aimDist;
    frame.dispersionRadM = deps.computeDispersion(player.spec, state, rig.aimDist);
    frame.atGunLimit = state.atGunLimit;
    frame.gunLimitSpec = !!state.gunLimitSpec;
    frame.reload.t = combat.reload.t;
    frame.reload.totalS = combat.reload.totalS;
    frame.reload.kind = combat.reload.kind;
    frame.magazine.rounds = combat.magazine?.rounds || 0;
    frame.magazine.capacity = combat.magazine?.capacity || 0;
    writeAmmoFrame(frame, player);
    frame.zoom = rig.mode === 'SNIPER' ? rig.zoom : 1;
  }

  function updateBlockedAimFrame(frame: AimFrame, player: AimTank, rig: AimRig): void {
    frame.blockedDistM = muzzlePathBlockDist(muzzle, gunTarget, frame.dispersionRadM);
    if (frame.blockedDistM == null) {
      blockedSinceMs = -1;
      frame.blockedLabel = false;
      return;
    }
    if (blockedSinceMs < 0) blockedSinceMs = now();
    const dwellOk = now() - blockedSinceMs >= 500;
    const speedKmh = Math.abs(player.state!.speed) * 3.6;
    frame.blockedLabel = dwellOk && (speedKmh <= 10 || rig.aimDist >= 120);
  }

  function findBestArmorTarget(game: AimGame, player: AimTank): void {
    const worldHit = deps.worldRaycast(muzzle, bore, 800);
    armorSelection.info = null;
    armorSelection.targetId = null;
    armorSelection.worldHit = worldHit;
    armorSelection.distanceM = worldHit ? worldHit.dist : 800;
    for (const tank of game.tanks) {
      if (tank.isPlayer || tank.team === player.team || !tank.state || !tank.combat) continue;
      if (tank.combat.destroyed || !deps.targetVisible(tank)) continue;
      targetDelta.copy(tank.state.pos);
      targetDelta.y += tank.spec.dims.heightM * 0.5;
      targetDelta.sub(muzzle);
      const projection = targetDelta.dot(bore);
      if (projection < 0 ||
          projection > armorSelection.distanceM + tank.spec.armor.boundingRadiusM) continue;
      const radius = tank.spec.armor.boundingRadiusM * AIM_STICKY_INFLATE;
      if (targetDelta.lengthSq() - projection * projection > radius * radius) continue;
      const info = queryAimArmor(
        muzzle,
        bore,
        Math.min(800, armorSelection.distanceM + tank.spec.armor.boundingRadiusM),
        tankPoseFromState(tank.state, aimPose),
        tank.spec.armor,
        tank.combat.eraSpent,
      ) as AimArmorInfo | null;
      if (!info || info.distM >= armorSelection.distanceM) continue;
      armorSelection.distanceM = info.distM;
      armorSelection.info = info;
      armorSelection.targetId = tank.id;
    }
  }

  function applyArmorSelection(
    frame: AimFrame,
    shellSpec: DamageShellSpec,
  ): void {
    const info = armorSelection.info;
    if (info) {
      frame.gunMarker.copy(info.point);
      frame.gunDistM = armorSelection.distanceM;
      frame.gunTargetId = armorSelection.targetId;
      frame.penRatio = estimatePenRatio(shellSpec, armorSelection.distanceM, info);
      lastPenRatio = frame.penRatio;
      lastGunTargetId = armorSelection.targetId;
      lastPenUntilMs = now() + AIM_STICKY_HOLD_MS;
      return;
    }
    if (armorSelection.worldHit) {
      frame.gunMarker.copy(armorSelection.worldHit.point);
      frame.gunDistM = armorSelection.worldHit.dist;
    }
    if (now() >= lastPenUntilMs) return;
    frame.penRatio = lastPenRatio;
    frame.gunTargetId = lastGunTargetId;
  }

  function update(frame: AimFrame): void {
    const game = deps.getGame();
    const player = game.player;
    const rig = deps.getRig();
    frame.ammoSelectionPending = false;
    if (!player?.state || !player.combat || !player.visual) return;
    writeBaseAimFrame(frame, player, rig);
    frame.gunDistM = gunCenterRay(player, frame.point, muzzle, bore, gunTarget);
    frame.gunTargetId = null;
    frame.gunMarker.copy(gunTarget);
    updateBlockedAimFrame(frame, player, rig);
    frame.penRatio = null;
    const shellSpec = player.spec.gun.shells[player.combat.shellSlot];
    findBestArmorTarget(game, player);
    applyArmorSelection(frame, shellSpec);
  }

  return { raycast, gunCenterRay, muzzlePathBlockDist, update };
}
