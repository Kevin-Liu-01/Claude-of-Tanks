/**
 * airSupportBridge.ts — Air Support's rounds into the battle's fire events (air-support-270). The authorities announce a
 * call-in's round as mode_strike_round (it leaves the aircraft, never the caller's hull: sim/airSupportFire.ts); the
 * strafing jet's 30 mm and the AC-130's guns are fired rounds the presentation already knows how to show, so their
 * rounds reach the effects and the weapon sounds as a shell:fired from the aircraft's own muzzle, with no shooter (no hull
 * recoils, no hull's sight flashes). The bomb's release and the battery's rounds have no muzzle here: their arrival is
 * the presentation's (the whistle, the burst); the bomb's launch is kept for the world, which draws it falling from the
 * jet (releasedBombs). Solo and multiplayer both raise mode:strike_round on the one bus.
 * Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */
import type { EventBus } from './stateCore.ts';
import { markFreeFallStore } from '../fx/freeFallStores.ts';
import { currentBattleScope, type BattleScope } from './battleScope.ts';

interface StrikeRoundEvent {
  kind?: string; shellId?: number; shellName?: string; shellType?: string; caliberMm?: number; velocityMps?: number;
  weaponSound?: string | null; blastRadiusM?: number | null; x?: number; y?: number; z?: number; dx?: number; dy?: number; dz?: number;
}

// (air-support-275: the Maverick run's missiles leave their rails as fired rounds: their motor, their smoke, their report)
const FIRED_KINDS = new Set(['strafe', 'missile', 'gunship']);

/** Each released bomb's launch, by strike id: where it left the jet's pylon and its velocity (m/s), as the authority
 *  launched it, so the world draws it falling on its own arc (game/airSupportWorld.ts; at most RELEASED_MAX kept). */
export const releasedBombs = new Map<number, { x: number; y: number; z: number; vx: number; vy: number; vz: number }>();
const RELEASED_MAX = 16;

/**
 * (air-crash-he-276) The crash rounds of downed aircraft (sim/airSupportFire.ts launchCrash), by shell id: their strike's
 * id. When one meets the world (its shell:expired), its strike is in `crashedStrikes`: the world ends the falling airframe
 * there (a roof, a wall), not only at the ground.
 */
const crashRounds = new Map<string, number>();

/**
 * (aircraft-solid-277) The rounds that struck an aircraft since the world last drew (sim/airSupport.ts mode_aircraft_hit):
 * where (the sim's point, at the mode time `atS`), the face's normal, and what struck it. The world draws each on the
 * airframe and empties the list every frame (game/airSupportWorld.ts strikeHits); at most AIRCRAFT_HITS_MAX wait.
 */
export const aircraftHits: { strikeId: number; atS: number; x: number; y: number; z: number; nx: number; ny: number; nz: number;
  caliberMm: number; explosive: boolean }[] = [];
const AIRCRAFT_HITS_MAX = 32;
export const crashedStrikes = new Set<number>();
const CRASH_MAX = 16;

export function installAirSupportBridge(bus: EventBus): () => void {
  // (battle-teardown-276) the strikes kept here are the battle's (keyed by strike ids each battle counts from 1): they go
  // with it (game/battleScope.ts), so a strike of the next battle never reads the last one's bomb or crash
  let adopted: BattleScope | null = null;
  const adopt = (): void => {
    const scope = currentBattleScope();
    if (!scope || scope === adopted) return;
    adopted = scope;
    scope.defer(() => { releasedBombs.clear(); crashRounds.clear(); crashedStrikes.clear(); aircraftHits.length = 0; });
  };
  const offHit = bus.on('mode:aircraft_hit', (payload) => {
    adopt();
    const hit = payload as { strikeId?: number; atS?: number; x?: number; y?: number; z?: number; nx?: number; ny?: number; nz?: number;
      caliberMm?: number; explosive?: boolean } | null;
    // a roof station's share strikes no point on the airframe
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.strikeId) || !Number.isFinite(hit.atS)) return;
    if (aircraftHits.length >= AIRCRAFT_HITS_MAX) aircraftHits.shift();
    aircraftHits.push({ strikeId: hit.strikeId!, atS: hit.atS!, x: hit.x!, y: hit.y!, z: hit.z!, nx: hit.nx ?? 0, ny: hit.ny ?? 1,
      nz: hit.nz ?? 0, caliberMm: hit.caliberMm ?? 20, explosive: hit.explosive === true });
  });
  const offExpired = bus.on('shell:expired', (payload) => {
    adopt();
    const id = (payload as { shellId?: unknown } | null)?.shellId;
    const strikeId = id != null ? crashRounds.get(String(id)) : undefined;
    if (strikeId === undefined) return;
    crashRounds.delete(String(id));
    crashedStrikes.add(strikeId);
    if (crashedStrikes.size > CRASH_MAX) crashedStrikes.delete(crashedStrikes.values().next().value!);
  });
  const offRound = bus.on('mode:strike_round', (payload) => {
    adopt();
    const round = payload as (StrikeRoundEvent & { strikeId?: number; freeFall?: number; crash?: number }) | null;
    // an unpowered store: the tracer pass never draws it (fx/freeFallStores.ts), the world draws its body falling
    if (round?.freeFall === 1 && round.shellId != null) markFreeFallStore(round.shellId);
    // a downed aircraft's crash round: the world draws the airframe falling on its arc; no round of its strike's kind
    if (round?.crash === 1) {
      if (round.shellId != null && Number.isFinite(round.strikeId)) {
        crashRounds.set(String(round.shellId), round.strikeId!);
        if (crashRounds.size > CRASH_MAX) crashRounds.delete(crashRounds.keys().next().value!);
      }
      return;
    }
    if (round?.kind === 'bomb' && Number.isFinite(round.x) && Number.isFinite(round.strikeId)) {
      const speed = round.velocityMps ?? 0;
      releasedBombs.set(round.strikeId!, { x: round.x!, y: round.y!, z: round.z!,
        vx: (round.dx ?? 0) * speed, vy: (round.dy ?? 0) * speed, vz: (round.dz ?? 0) * speed });
      if (releasedBombs.size > RELEASED_MAX) releasedBombs.delete(releasedBombs.keys().next().value!);
      return;
    }
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
  return () => { offRound(); offExpired(); offHit(); };
}
