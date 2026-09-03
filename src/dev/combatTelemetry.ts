import type { RuntimeValue } from '../runtimeTypes.ts';
import { Vector3 } from 'three';

interface PhaseChangeEvent {
  phase: string;
}

interface ShellFiredEvent {
  shellId: string | number;
  isPlayer?: boolean;
  muzzlePos: readonly number[];
  dir: readonly number[];
}

interface ShellHitEvent {
  shellId: string | number;
  targetId: string;
  attackerId: string;
  damage?: number;
  kind: string;
  pos?: readonly number[] | null;
}

interface ShellExpiredEvent {
  shellId: string | number;
  hitTerrain?: boolean;
  pos?: readonly number[] | null;
}

interface CombatTelemetryEventMap {
  'phase:change': PhaseChangeEvent;
  'shell:fired': ShellFiredEvent;
  'shell:hit': ShellHitEvent;
  'shell:expired': ShellExpiredEvent;
}

interface EventBus {
  on(event: string, listener: (payload: RuntimeValue) => void): RuntimeValue;
}

function onCombatEvent<EventName extends keyof CombatTelemetryEventMap>(
  bus: EventBus,
  event: EventName,
  listener: (payload: CombatTelemetryEventMap[EventName]) => void,
): RuntimeValue {
  return bus.on(event, (payload) => listener(payload as CombatTelemetryEventMap[EventName]));
}

interface CombatEntity {
  id: string;
  isPlayer?: boolean;
  team?: string;
  state?: {
    pos: Vector3;
    speed?: number;
  } | null;
  combat?: { destroyed?: boolean } | null;
  spec: { dims: { heightM: number } };
}

interface CombatGame {
  timeS: number;
  player?: CombatEntity | null;
  tanks: CombatEntity[];
  tankById: Map<string, CombatEntity>;
}

export interface PlayerShellTelemetryRecord {
  shellId: string | number;
  t: number;
  targetId: string | null;
  targetDistM: number | null;
  targetSpeed: number | null;
  blockedDistM: number | null;
  terminal: 'tank' | 'terrain' | 'air' | null;
  hitTankId?: string | null;
  hitKind: string | null;
  damage: number;
  missM: number | null;
}

export interface BotPressureTelemetry {
  enemyShells: number;
  aimedAtPlayer: number;
  hitsOnPlayer: number;
  dmgOnPlayer: number;
}

export interface CombatTelemetry {
  playerShellLog: PlayerShellTelemetryRecord[];
  botPressure: BotPressureTelemetry;
}

export interface CombatTelemetryOptions {
  enabled: boolean;
  bus: EventBus;
  getGame(): CombatGame;
  getPinnedTargetId(): string | null;
  getAimBlockedDistance(): number | null | undefined;
  playerShellLog?: PlayerShellTelemetryRecord[];
  botPressure?: BotPressureTelemetry;
}

/**
 * Install attributable shell and bot-pressure telemetry only for explicit QA.
 * Ordinary production matches retain stable empty receipts and pay no roster
 * scans, miss-distance calculations, or ring-buffer writes.
 */
export function createCombatTelemetry({
  enabled,
  bus,
  getGame,
  getPinnedTargetId,
  getAimBlockedDistance,
  playerShellLog = [],
  botPressure = {
    enemyShells: 0,
    aimedAtPlayer: 0,
    hitsOnPlayer: 0,
    dmgOnPlayer: 0,
  },
}: CombatTelemetryOptions): CombatTelemetry {
  if (!enabled) return { playerShellLog, botPressure };

  const relative = new Vector3();
  const targetFor = (muzzle: readonly number[], dir: readonly number[]): CombatEntity | null => {
    const game = getGame();
    const pinnedId = getPinnedTargetId();
    const pinned = pinnedId ? game.tankById.get(pinnedId) : null;
    if (pinned?.state && pinned.combat && !pinned.combat.destroyed) return pinned;
    let best: CombatEntity | null = null;
    let bestLateralM = 40;
    for (const entity of game.tanks) {
      if (entity.isPlayer || entity.team !== 'enemy' || !entity.state
        || !entity.combat || entity.combat.destroyed) continue;
      relative.copy(entity.state.pos);
      relative.y += entity.spec.dims.heightM * 0.5;
      relative.x -= muzzle[0];
      relative.y -= muzzle[1];
      relative.z -= muzzle[2];
      const projection = relative.x * dir[0] + relative.y * dir[1] + relative.z * dir[2];
      if (projection < 0) continue;
      const lateralM = Math.sqrt(Math.max(0, relative.lengthSq() - projection * projection));
      if (lateralM < bestLateralM) {
        bestLateralM = lateralM;
        best = entity;
      }
    }
    return best;
  };

  const missDistanceM = (
    record: PlayerShellTelemetryRecord,
    position?: readonly number[] | null,
  ): number | null => {
    const game = getGame();
    const target = record.targetId ? game.tankById.get(record.targetId) : null;
    if (!target?.state || !position) return null;
    const centerY = target.state.pos.y + target.spec.dims.heightM * 0.5;
    return Math.round(Math.hypot(
      position[0] - target.state.pos.x,
      position[1] - centerY,
      position[2] - target.state.pos.z,
    ) * 100) / 100;
  };

  const recordFor = (shellId: string | number): PlayerShellTelemetryRecord | null => {
    for (let index = playerShellLog.length - 1; index >= 0; index -= 1) {
      if (playerShellLog[index].shellId === shellId) return playerShellLog[index];
    }
    return null;
  };

  onCombatEvent(bus, 'phase:change', (event) => {
    if (event.phase !== 'battle') return;
    botPressure.enemyShells = 0;
    botPressure.aimedAtPlayer = 0;
    botPressure.hitsOnPlayer = 0;
    botPressure.dmgOnPlayer = 0;
  });
  onCombatEvent(bus, 'shell:fired', (event) => {
    const game = getGame();
    if (!event.isPlayer) {
      const player = game.player;
      if (!player?.state) return;
      botPressure.enemyShells += 1;
      const centerY = player.state.pos.y + player.spec.dims.heightM * 0.5;
      const rx = player.state.pos.x - event.muzzlePos[0];
      const ry = centerY - event.muzzlePos[1];
      const rz = player.state.pos.z - event.muzzlePos[2];
      const projection = rx * event.dir[0] + ry * event.dir[1] + rz * event.dir[2];
      if (projection <= 0) return;
      const lateralSq = rx * rx + ry * ry + rz * rz - projection * projection;
      if (lateralSq < 36) botPressure.aimedAtPlayer += 1;
      return;
    }
    if (!game.player?.state) return;
    const target = targetFor(event.muzzlePos, event.dir);
    const blockedDistance = getAimBlockedDistance();
    playerShellLog.push({
      shellId: event.shellId,
      t: Math.round(game.timeS * 100) / 100,
      targetId: target?.id ?? null,
      targetDistM: target?.state
        ? Math.round(target.state.pos.distanceTo(game.player.state.pos)) : null,
      targetSpeed: target?.state ? Math.round((target.state.speed || 0) * 10) / 10 : null,
      blockedDistM: blockedDistance ? Math.round(blockedDistance) : null,
      terminal: null,
      hitKind: null,
      damage: 0,
      missM: null,
    });
    if (playerShellLog.length > 64) playerShellLog.shift();
  });
  onCombatEvent(bus, 'shell:hit', (event) => {
    const game = getGame();
    if (game.player && event.targetId === game.player.id) {
      botPressure.hitsOnPlayer += 1;
      botPressure.dmgOnPlayer += event.damage || 0;
    }
    if (!game.player || event.attackerId !== game.player.id) return;
    const record = recordFor(event.shellId);
    if (!record) return;
    record.terminal = 'tank';
    record.hitTankId = event.targetId;
    record.hitKind = event.kind;
    record.damage = Math.round(event.damage || 0);
    record.missM = missDistanceM(record, event.pos);
  });
  onCombatEvent(bus, 'shell:expired', (event) => {
    const record = recordFor(event.shellId);
    if (!record || record.terminal) return;
    record.terminal = event.hitTerrain ? 'terrain' : 'air';
    record.missM = missDistanceM(record, event.pos);
  });

  return { playerShellLog, botPressure };
}
