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
  hydropneumaticAim?: unknown;
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

  let stickyUntilMs = -Infinity;
  let stickyDistM = 0;
  let lastPenRatio: number | null = null;
  let lastGunTargetId: string | null = null;
  let lastPenUntilMs = -Infinity;
  let blockedSinceMs = -1;

  function raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): AimWorldHit | null {
    const game = deps.getGame();
    const worldHit = deps.worldRaycast(origin, dir, maxDist);
    let bestDist = worldHit ? worldHit.dist : maxDist;
    let best = worldHit;
    let exactTank = false;
    let softDist = Infinity;
    for (const tank of game.tanks) {
      if (tank.isPlayer || !tank.state || !tank.combat || tank.combat.destroyed) continue;
      const radius = tank.spec.armor.boundingRadiusM;
      const inflatedRadius = radius * AIM_STICKY_INFLATE;
      armTo.copy(tank.state.pos);
      armTo.y += tank.spec.dims.heightM * 0.5;
      armTo.sub(origin);
      const projection = armTo.dot(dir);
      if (projection < 0 || projection - inflatedRadius > bestDist) continue;
      const lateralSq = armTo.lengthSq() - projection * projection;
      if (lateralSq > inflatedRadius * inflatedRadius) continue;
      if (projection < bestDist && projection < softDist) softDist = projection;
      if (lateralSq > radius * radius) continue;
      armEnd.copy(origin).addScaledVector(dir, Math.min(bestDist, projection + radius));
      const hits = traceTank(
        origin, armEnd, tankPoseFromState(tank.state), tank.spec.armor, tank.combat.eraSpent,
      ) as ArmorTraceHit[];
      if (!hits.length) continue;
      const distance = origin.distanceTo(hits[0].point);
      if (distance < bestDist) {
        bestDist = distance;
        best = { point: hits[0].point, normal: hits[0].normal, dist: distance, kind: 'tank' };
        exactTank = true;
      }
    }
    const sampleNow = now();
    if (exactTank) {
      stickyUntilMs = sampleNow + AIM_STICKY_HOLD_MS;
      stickyDistM = bestDist;
      return best;
    }
    if (softDist < Infinity) {
      stickyUntilMs = sampleNow + AIM_STICKY_HOLD_MS;
      stickyDistM = softDist;
      softHit.point.copy(origin).addScaledVector(dir, softDist);
      softHit.dist = softDist;
      return softHit;
    }
    if (sampleNow < stickyUntilMs && stickyDistM < bestDist) {
      softHit.point.copy(origin).addScaledVector(dir, stickyDistM);
      softHit.dist = stickyDistM;
      return softHit;
    }
    return best;
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

  function update(frame: AimFrame): void {
    const game = deps.getGame();
    const player = game.player;
    const rig = deps.getRig();
    if (!player?.state || !player.combat || !player.visual) return;
    frame.singleReticle = !!(player.spec.hydropneumaticAim && player.spec.armor.turretless);
    frame.point.copy(rig.aimPoint);
    frame.distM = rig.aimDist;
    frame.dispersionRadM = deps.computeDispersion(player.spec, player.state, rig.aimDist);
    frame.atGunLimit = player.state.atGunLimit;
    frame.gunLimitSpec = !!player.state.gunLimitSpec;
    frame.reload.t = player.combat.reload.t;
    frame.reload.totalS = player.combat.reload.totalS;
    frame.reload.kind = player.combat.reload.kind;
    frame.magazine.rounds = player.combat.magazine?.rounds || 0;
    frame.magazine.capacity = player.combat.magazine?.capacity || 0;
    frame.shellSlot = player.combat.shellSlot;
    frame.shells = deps.getShellCards();
    for (let slot = 0; slot < frame.shells.length; slot++) {
      if (Array.isArray(player.combat.ammo)) {
        frame.shells[slot].count = Math.max(0, Math.floor(player.combat.ammo[slot] || 0));
      }
    }
    frame.zoom = rig.mode === 'SNIPER' ? rig.zoom : 1;

    frame.gunDistM = gunCenterRay(player, frame.point, muzzle, bore, gunTarget);
    frame.gunTargetId = null;
    frame.gunMarker.copy(gunTarget);
    frame.blockedDistM = muzzlePathBlockDist(muzzle, gunTarget, frame.dispersionRadM);
    if (frame.blockedDistM != null) {
      if (blockedSinceMs < 0) blockedSinceMs = now();
      const dwellOk = now() - blockedSinceMs >= 500;
      const speedKmh = Math.abs(player.state.speed) * 3.6;
      frame.blockedLabel = dwellOk && (speedKmh <= 10 || rig.aimDist >= 120);
    } else {
      blockedSinceMs = -1;
      frame.blockedLabel = false;
    }

    frame.penRatio = null;
    const shellSpec = player.spec.gun.shells[player.combat.shellSlot];
    const gunWorldHit = deps.worldRaycast(muzzle, bore, 800);
    let bestDist = gunWorldHit ? gunWorldHit.dist : 800;
    let bestInfo: AimArmorInfo | null = null;
    let bestTargetId: string | null = null;
    for (const tank of game.tanks) {
      if (tank.isPlayer || tank.team === player.team || !tank.state || !tank.combat
          || tank.combat.destroyed || !deps.targetVisible(tank)) continue;
      targetDelta.copy(tank.state.pos);
      targetDelta.y += tank.spec.dims.heightM * 0.5;
      targetDelta.sub(muzzle);
      const projection = targetDelta.dot(bore);
      if (projection < 0 || projection > bestDist + tank.spec.armor.boundingRadiusM) continue;
      const radius = tank.spec.armor.boundingRadiusM * AIM_STICKY_INFLATE;
      if (targetDelta.lengthSq() - projection * projection > radius * radius) continue;
      const info = queryAimArmor(
        muzzle, bore, Math.min(800, bestDist + tank.spec.armor.boundingRadiusM),
        tankPoseFromState(tank.state, aimPose), tank.spec.armor, tank.combat.eraSpent,
      ) as AimArmorInfo | null;
      if (info && info.distM < bestDist) {
        bestDist = info.distM;
        bestInfo = info;
        bestTargetId = tank.id;
      }
    }
    if (bestInfo) {
      frame.gunMarker.copy(bestInfo.point);
      frame.gunDistM = bestDist;
      frame.gunTargetId = bestTargetId;
      frame.penRatio = estimatePenRatio(shellSpec, bestDist, bestInfo);
      lastPenRatio = frame.penRatio;
      lastGunTargetId = bestTargetId;
      lastPenUntilMs = now() + AIM_STICKY_HOLD_MS;
    } else {
      if (gunWorldHit) {
        frame.gunMarker.copy(gunWorldHit.point);
        frame.gunDistM = gunWorldHit.dist;
      }
      if (now() < lastPenUntilMs) {
        frame.penRatio = lastPenRatio;
        frame.gunTargetId = lastGunTargetId;
      }
    }
  }

  return { raycast, gunCenterRay, muzzlePathBlockDist, update };
}
