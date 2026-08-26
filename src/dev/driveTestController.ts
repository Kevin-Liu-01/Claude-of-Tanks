import * as THREE from 'three';
import { createShell } from '../sim/ballistics.js';
import { computeDispersionRadM, SIM_DT } from '../sim/movement.js';

interface DriveTestShellSpec {
  type: string;
  name: string;
  caliberMm: number;
  velocityMps: number;
}

interface DriveTestSpec {
  dims: { heightM: number };
  armor: { boundingRadiusM: number };
  gun: { shells: DriveTestShellSpec[] };
}

interface DriveTestState {
  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  turretYaw: number;
  gunPitch: number;
  visualPitch?: number;
  bloomF?: number;
  atGunLimit?: boolean;
  gunLimitSpec?: boolean;
}

interface DriveTestCombat {
  destroyed: boolean;
  shellSlot: number;
  reload: { t: number };
  hp: number;
  fire: { burning: boolean };
}

interface DriveTestVisual {
  gunPivotWorld(out: THREE.Vector3): void;
  gunMuzzleWorld(out: THREE.Vector3): void;
  gunDirWorld(out: THREE.Vector3): void;
  syncFromState(state: DriveTestState, dt?: number): void;
  setDestroyed?(): void;
}

interface DriveTestTank {
  id: string;
  specId?: string;
  team?: string;
  isPlayer?: boolean;
  state: DriveTestState;
  combat: DriveTestCombat;
  spec: DriveTestSpec;
  visual: DriveTestVisual | null;
  input: { aimPoint: THREE.Vector3; fire: boolean };
  _destroyedAnnounced?: boolean;
}

interface DriveTestGame {
  phase: string;
  timeS: number;
  player: DriveTestTank | null;
  tanks: DriveTestTank[];
  tankById: Map<string, DriveTestTank>;
  shells: unknown[];
  nextShellId: number;
}

interface DriveTestWorld {
  heightField: { getHeightAt(x: number, z: number): number };
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): { dist: number } | null;
}

interface DriveTestRig {
  aimDist: number;
  snapSniper(zoom: number, yaw: number, pitch: number): void;
}

interface DriveTestAimController {
  gunCenterRay(
    player: DriveTestTank,
    aimPoint: THREE.Vector3,
    outOrigin: THREE.Vector3,
    outDirection: THREE.Vector3,
    outTarget: THREE.Vector3,
  ): unknown;
  muzzlePathBlockDist(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    dispersionRadiusM: number,
  ): number | null;
}

interface DriveTestBus {
  emit(type: string, payload: Record<string, unknown>): void;
}

interface PlayerShellRecord {
  targetId?: string | null;
  terminal?: string | null;
  damage?: number;
}

export interface DriveTestControllerOptions {
  getGame(): DriveTestGame;
  getWorld(): DriveTestWorld | null;
  getRig(): DriveTestRig;
  getCollider(): unknown;
  bus: DriveTestBus;
  input: { isDown(action: string): boolean };
  aimController: DriveTestAimController;
  debugFlags: { forceFire: boolean };
  playerShellLog: readonly PlayerShellRecord[];
  heightField: { getHeightAt(x: number, z: number): number };
  simStep(
    game: DriveTestGame,
    bus: DriveTestBus,
    world: DriveTestWorld,
    rig: DriveTestRig,
    collider: unknown,
  ): void;
  resetPresentationPoses(): void;
  resetSimAccumulator(): void;
}

export interface DriveTestController {
  readonly aimTargetId: string | null;
  aimAtNearest(): { id: string; distM: number } | null;
  gunAimError(): number;
  aimState(): Record<string, unknown> | null;
  fastForward(seconds: number): number;
  spawnKillShell(aimYFrac?: number): boolean;
  slayEnemies(): void;
  resetAim(): void;
}

/**
 * Own deterministic rendered-battle QA controls. These methods are deliberately
 * outside authoritative gameplay; they drive the same simulation ports used by
 * browser gates without making the integration entry own test-only state.
 */
export function createDriveTestController({
  getGame,
  getWorld,
  getRig,
  getCollider,
  bus,
  input,
  aimController,
  debugFlags,
  playerShellLog,
  heightField,
  simStep,
  resetPresentationPoses,
  resetSimAccumulator,
}: DriveTestControllerOptions): DriveTestController {
  const required = [getGame, getWorld, getRig, getCollider, simStep,
    resetPresentationPoses, resetSimAccumulator];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('drive test controller requires every runtime port');
  }

  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const rayOrigin = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const DEG = Math.PI / 180;
  let aimTargetId: string | null = null;
  let leadLatchHFrac = 0;
  let leadLatchUntilS = -1;
  let leadLatchTargetId: string | null = null;

  function debugLeadPoint(
    player: DriveTestTank,
    target: DriveTestTank,
    out: THREE.Vector3,
  ): THREE.Vector3 {
    const world = getWorld();
    if (!world || !player.visual) return out;
    player.visual.gunPivotWorld(v1);
    const shell = player.spec.gun.shells[Math.max(
      0,
      Math.min(2, player.combat.shellSlot),
    )];
    if (!shell) return out;
    const targetVelocityX = Math.sin(target.state.yaw) * target.state.speed;
    const targetVelocityZ = Math.cos(target.state.yaw) * target.state.speed;
    const solveAt = (heightFraction: number) => {
      v2.copy(target.state.pos);
      v2.y += target.spec.dims.heightM * heightFraction;
      let aimX = v2.x;
      let aimZ = v2.z;
      for (let iteration = 0; iteration < 2; iteration++) {
        const dx = aimX - v1.x;
        const dy = v2.y - v1.y;
        const dz = aimZ - v1.z;
        const travelS = Math.sqrt(dx * dx + dy * dy + dz * dz) / shell.velocityMps;
        aimX = v2.x + targetVelocityX * travelS;
        aimZ = v2.z + targetVelocityZ * travelS;
      }
      out.set(aimX, v2.y, aimZ);
    };

    player.visual.gunMuzzleWorld(v3);
    const marginM = 1.5;
    const clearAt = (heightFraction: number) => {
      solveAt(heightFraction);
      rayDirection.copy(out).sub(v3);
      const distanceM = rayDirection.length();
      if (distanceM < 12) return true;
      rayDirection.multiplyScalar(1 / distanceM);
      return !world.raycast(v3, rayDirection, distanceM - marginM);
    };
    const pathClearance = () => {
      let clearanceM = Infinity;
      for (let sample = 2; sample <= 11; sample++) {
        const fraction = sample / 12.2;
        const x = v3.x + (out.x - v3.x) * fraction;
        const y = v3.y + (out.y - v3.y) * fraction;
        const z = v3.z + (out.z - v3.z) * fraction;
        const sampleClearance = (y - world.heightField.getHeightAt(x, z)) / fraction;
        if (sampleClearance < clearanceM) clearanceM = sampleClearance;
      }
      return clearanceM;
    };

    let bouncedLast = false;
    for (let index = playerShellLog.length - 1; index >= 0; index--) {
      const record = playerShellLog[index];
      if (record.targetId !== target.id || !record.terminal) continue;
      bouncedLast = record.terminal === 'tank' && (record.damage || 0) <= 0;
      break;
    }
    const game = getGame();
    const latched = leadLatchTargetId === target.id && game.timeS < leadLatchUntilS;
    if (latched && clearAt(leadLatchHFrac)) return out;

    const heightM = target.spec.dims.heightM;
    if (bouncedLast) {
      for (const heightFraction of [0.34, 0.62, 0.5]) {
        if (!clearAt(heightFraction)) continue;
        leadLatchHFrac = heightFraction;
        leadLatchTargetId = target.id;
        leadLatchUntilS = game.timeS + 1;
        return out;
      }
      solveAt(0.5);
      leadLatchTargetId = null;
      return out;
    }
    if (clearAt(0.5)) {
      const scaledClearanceM = pathClearance();
      const headroomM = heightM * 0.5;
      const deltaM = Math.max(0, Math.min(
        0.25 * heightM,
        (headroomM - scaledClearanceM) / 2,
      ));
      out.y += deltaM;
      rayDirection.copy(out).sub(v3);
      const distanceM = rayDirection.length();
      rayDirection.multiplyScalar(1 / Math.max(distanceM, 1e-6));
      if (distanceM < 12 || !world.raycast(v3, rayDirection, distanceM - marginM)) {
        leadLatchHFrac = 0.5 + deltaM / heightM;
        leadLatchTargetId = target.id;
        leadLatchUntilS = game.timeS + 1;
        return out;
      }
      out.y -= deltaM;
    }
    for (const heightFraction of [0.5, 0.72, 0.88]) {
      if (!clearAt(heightFraction)) continue;
      leadLatchHFrac = heightFraction;
      leadLatchTargetId = target.id;
      leadLatchUntilS = game.timeS + 1;
      return out;
    }
    solveAt(0.5);
    leadLatchTargetId = null;
    return out;
  }

  function gunAimError(): number {
    const player = getGame().player;
    if (!player?.state || player.combat.destroyed || !player.visual) return Infinity;
    player.visual.gunMuzzleWorld(v1);
    player.visual.gunDirWorld(v3);
    v2.copy(player.input.aimPoint).sub(v1).normalize();
    return Math.acos(Math.min(1, Math.max(-1, v3.dot(v2))));
  }

  function aimState(): Record<string, unknown> | null {
    const game = getGame();
    const player = game.player;
    if (!player?.state || player.combat.destroyed || !player.visual) return null;
    const rig = getRig();
    // Preserve the original scratch order: gunAimError uses v2. Resolve it
    // before gunCenterRay writes the muzzle-path target into that vector.
    const errMrad = gunAimError() * 1000;
    aimController.gunCenterRay(
      player,
      player.input.aimPoint,
      rayOrigin,
      rayDirection,
      v2,
    );
    const blockedDistM = aimController.muzzlePathBlockDist(
      rayOrigin,
      v2,
      computeDispersionRadM(player.spec, player.state, rig.aimDist),
    );
    return {
      errMrad,
      bloomF: player.state.bloomF,
      reticleRadM: computeDispersionRadM(player.spec, player.state, rig.aimDist),
      aimDistM: rig.aimDist,
      reloadT: player.combat.reload.t,
      atGunLimit: !!player.state.atGunLimit,
      gunLimitSpec: !!player.state.gunLimitSpec,
      gunPitchDeg: Math.round(player.state.gunPitch * 573) / 10,
      turretYawDeg: Math.round(player.state.turretYaw * 573) / 10,
      blockedDistM,
      leadHFrac: leadLatchTargetId ? leadLatchHFrac : null,
    };
  }

  function aimAtNearest(): { id: string; distM: number } | null {
    const game = getGame();
    const world = getWorld();
    const player = game.player;
    if (!world || !player?.state || player.combat.destroyed || !player.visual) return null;
    player.visual.gunPivotWorld(v1);
    let best: DriveTestTank | null = null;
    let bestDistanceM = Infinity;
    for (const entity of game.tanks) {
      if (entity.team !== 'enemy' || !entity.state || !entity.combat
          || entity.combat.destroyed) continue;
      v2.copy(entity.state.pos);
      v2.y += entity.spec.dims.heightM * 0.5;
      v3.copy(v2).sub(v1);
      const distanceM = v3.length();
      if (distanceM >= bestDistanceM || distanceM < 1e-3) continue;
      v3.multiplyScalar(1 / distanceM);
      const obstruction = world.raycast(v1, v3, distanceM);
      if (obstruction && obstruction.dist < distanceM - 2) continue;
      player.visual.gunMuzzleWorld(rayOrigin);
      if (aimController.muzzlePathBlockDist(rayOrigin, v2, 0) != null) continue;
      bestDistanceM = distanceM;
      best = entity;
    }
    if (!best) return null;

    v2.copy(best.state.pos);
    v2.y += best.spec.dims.heightM * 0.5;
    const shell = player.spec.gun.shells[Math.max(
      0,
      Math.min(2, player.combat.shellSlot),
    )];
    if (!shell) return null;
    const targetVelocityX = Math.sin(best.state.yaw) * best.state.speed;
    const targetVelocityZ = Math.cos(best.state.yaw) * best.state.speed;
    let aimX = v2.x;
    let aimZ = v2.z;
    for (let iteration = 0; iteration < 2; iteration++) {
      const dx = aimX - v1.x;
      const dy = v2.y - v1.y;
      const dz = aimZ - v1.z;
      const travelS = Math.sqrt(dx * dx + dy * dy + dz * dz) / shell.velocityMps;
      aimX = v2.x + targetVelocityX * travelS;
      aimZ = v2.z + targetVelocityZ * travelS;
    }
    v3.set(aimX, v2.y, aimZ).sub(v1);
    getRig().snapSniper(
      4,
      Math.atan2(v3.x, v3.z),
      Math.atan2(v3.y, Math.hypot(v3.x, v3.z)),
    );
    aimTargetId = best.id;
    return { id: best.id, distM: bestDistanceM };
  }

  function fastForward(seconds: number): number {
    const game = getGame();
    const world = getWorld();
    const rig = getRig();
    if (!world) return game.timeS;
    const steps = Math.max(0, Math.round(seconds / SIM_DT));
    for (let step = 0; step < steps; step++) {
      if (game.phase !== 'battle') break;
      const player = game.player;
      if (player && !player.combat.destroyed) {
        player.input.fire = debugFlags.forceFire
          || (player.input.fire && input.isDown('fire'));
        const target = aimTargetId ? game.tankById.get(aimTargetId) : null;
        if (target?.state && target.combat && !target.combat.destroyed) {
          debugLeadPoint(player, target, player.input.aimPoint);
        }
      }
      simStep(game, bus, world, rig, getCollider());
      for (const entity of game.tanks) {
        if (entity.state && entity.visual) entity.visual.syncFromState(entity.state);
      }
    }
    resetPresentationPoses();
    resetSimAccumulator();
    return game.timeS;
  }

  function spawnKillShell(aimYFrac = 0.45): boolean {
    const game = getGame();
    const world = getWorld();
    const player = game.player;
    if (!world || !player?.state || player.combat.destroyed) return false;
    const preferred = game.tankById.get('t90m');
    const shooter = preferred?.team === 'enemy' && preferred.combat
      && !preferred.combat.destroyed
      ? preferred
      : game.tanks.find((tank) => tank.team === 'enemy'
        && tank.combat && !tank.combat.destroyed);
    if (!shooter?.visual) return false;
    player.combat.hp = Math.min(player.combat.hp, 1);
    v2.copy(player.state.pos);
    v2.y += player.spec.dims.heightM * aimYFrac;
    const original = {
      pos: shooter.state.pos.clone(),
      yaw: shooter.state.yaw,
      turretYaw: shooter.state.turretYaw,
      gunPitch: shooter.state.gunPitch,
    };
    shooter.visual.gunMuzzleWorld(rayOrigin);
    const groundOffsetM = shooter.state.pos.y - heightField.getHeightAt(
      shooter.state.pos.x,
      shooter.state.pos.z,
    );
    for (const relativeBearingDeg of [90, -90, 70, -70, 110, -110, 45, 135]) {
      const azimuth = player.state.yaw + relativeBearingDeg * DEG;
      const x = v2.x + Math.sin(azimuth) * 130;
      const z = v2.z + Math.cos(azimuth) * 130;
      shooter.state.pos.set(x, heightField.getHeightAt(x, z) + groundOffsetM, z);
      for (let solve = 0; solve < 2; solve++) {
        shooter.visual.syncFromState(shooter.state, 0);
        shooter.visual.gunMuzzleWorld(v1);
        v3.copy(v2).sub(v1).normalize();
        shooter.state.yaw = Math.atan2(v3.x, v3.z);
        shooter.state.turretYaw = 0;
        shooter.state.gunPitch = Math.atan2(v3.y, Math.hypot(v3.x, v3.z))
          - (shooter.state.visualPitch || 0);
      }
      shooter.visual.syncFromState(shooter.state, 0);
      shooter.visual.gunMuzzleWorld(v1);
      v3.copy(v2).sub(v1);
      const distanceM = v3.length();
      v3.multiplyScalar(1 / distanceM);
      const obstruction = world.raycast(
        v1,
        v3,
        distanceM - player.spec.armor.boundingRadiusM - 1,
      );
      if (obstruction) continue;
      const shellSpec = shooter.spec.gun.shells[0];
      if (!shellSpec) return false;
      const shell = createShell(
        shellSpec,
        shooter.id,
        false,
        v1,
        v3,
        game.nextShellId++,
      ) as { id: unknown };
      game.shells.push(shell);
      bus.emit('shell:fired', {
        shellId: shell.id,
        shooterId: shooter.id,
        isPlayer: false,
        shellType: shellSpec.type,
        shellName: shellSpec.name,
        caliberMm: shellSpec.caliberMm,
        velocityMps: shellSpec.velocityMps,
        timeS: game.timeS,
        muzzlePos: [v1.x, v1.y, v1.z],
        dir: [v3.x, v3.y, v3.z],
      });
      return true;
    }
    shooter.state.pos.copy(original.pos);
    shooter.state.yaw = original.yaw;
    shooter.state.turretYaw = original.turretYaw;
    shooter.state.gunPitch = original.gunPitch;
    shooter.visual.syncFromState(shooter.state, 0);
    return false;
  }

  function slayEnemies(): void {
    const game = getGame();
    for (const entity of game.tanks) {
      if (entity.isPlayer || entity.team !== 'enemy' || !entity.combat
          || entity.combat.destroyed) continue;
      entity.combat.hp = 0;
      entity.combat.destroyed = true;
      entity.combat.fire.burning = false;
      if (entity._destroyedAnnounced) continue;
      entity._destroyedAnnounced = true;
      entity.visual?.setDestroyed?.();
      bus.emit('tank:destroyed', {
        id: entity.id,
        specId: entity.specId,
        pos: [entity.state.pos.x, entity.state.pos.y, entity.state.pos.z],
        killerId: game.player ? game.player.id : null,
        cause: 'shot',
      });
    }
  }

  return {
    get aimTargetId() { return aimTargetId; },
    aimAtNearest,
    gunAimError,
    aimState,
    fastForward,
    spawnKillShell,
    slayEnemies,
    resetAim() { aimTargetId = null; },
  };
}
