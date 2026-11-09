/**
 * airSupportBridge.ts — Air Support's rounds into the battle's fire events (air-support-270). The authorities announce a
 * call-in's round as mode_strike_round (it leaves the aircraft, never the caller's hull: sim/airSupportFire.ts); the
 * strafing jet's 30 mm and the AC-130's guns are fired rounds the presentation already knows how to show, so their
 * rounds reach the effects and the weapon sounds as a shell:fired from the aircraft's own muzzle, with no shooter (no hull
 * recoils, no hull's sight flashes). The bomb's release and the battery's rounds have no muzzle here: their arrival is
 * the presentation's (the whistle, the burst). Solo and multiplayer both raise mode:strike_round on the one bus.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { EventBus } from './stateCore.ts';

interface StrikeRoundEvent {
  kind?: string; shellId?: number; shellName?: string; shellType?: string; caliberMm?: number; velocityMps?: number;
  weaponSound?: string | null; blastRadiusM?: number | null; x?: number; y?: number; z?: number; dx?: number; dy?: number; dz?: number;
}

const FIRED_KINDS = new Set(['strafe', 'gunship']);

export function installAirSupportBridge(bus: EventBus): () => void {
  return bus.on('mode:strike_round', (payload) => {
    const round = payload as StrikeRoundEvent | null;
    if (!round || !FIRED_KINDS.has(String(round.kind)) || !Number.isFinite(round.x)) return;
    bus.emit('shell:fired', {
      shellId: round.shellId ?? -1,
      shooterId: null,
      isPlayer: false,
      shellType: round.shellType ?? 'AP',
      shellName: round.shellName ?? '',
      caliberMm: round.caliberMm ?? 30,
      velocityMps: round.velocityMps ?? 1000,
      weaponSound: round.weaponSound ?? null,
      ...(round.blastRadiusM != null ? { blastRadiusM: round.blastRadiusM } : {}),
      muzzlePos: [round.x!, round.y!, round.z!],
      dir: [round.dx ?? 0, round.dy ?? -1, round.dz ?? 0],
      airStrike: round.kind,
    });
  });
}
