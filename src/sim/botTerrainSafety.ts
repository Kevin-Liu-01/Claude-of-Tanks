/** Predict landing cost with the game's own impact law before driving off an
 * edge. Uses the drivable bridge surface, not the river bed underneath it. */
import { fallDamage } from './impact.ts';
import { STANDARD_PHYSICS, type RulesetPhysics } from './matchRuleset.ts';
import type { NavigationBridgeDeck } from './bridgeDeckNavigation.ts';

export interface BotTerrainField {
  readonly bridgeDecks?: readonly NavigationBridgeDeck[];
  getHeightAt(x: number, z: number): number;
}
interface FallEntity {
  spec: { weightTons: number; dims: { widthM: number; lengthM?: number; hullLengthM?: number } };
  state: { pos: { x: number; z: number }; yaw: number; speed: number; grounded: boolean };
  combat?: { hp: number; modeDamageTakenScale?: number };
  modeGravityScale?: number;
  modePhysics?: RulesetPhysics | null;
  modeJumpMps?: number | null;
}

export function createBotTerrainSafety(field: BotTerrainField) {
  function surfaceY(x: number, z: number): number {
    let y = field.getHeightAt(x, z);
    for (const deck of field.bridgeDecks ?? []) {
      const dx = x - deck.x, dz = z - deck.z;
      if (Math.abs(dx * deck.ux + dz * deck.uz) <= deck.halfLength
          && Math.abs(dx * deck.uz - dz * deck.ux) <= deck.halfWidth) y = Math.max(y, deck.deckY);
    }
    return y;
  }
  function affordable(entity: FallEntity, drop: number, upMps = 0): boolean {
    const g = 9.81 * Math.max(.1, entity.modeGravityScale ?? 1);
    const speed = Math.sqrt(Math.max(0, upMps * upMps + 2 * g * drop));
    // Include a modest imperfect-landing margin; a bot does not assume it will
    // land perfectly level, nor trade most of its remaining hull for a shortcut.
    const cost = fallDamage(entity.modePhysics ?? STANDARD_PHYSICS, entity.spec.weightTons, speed, 1.3)
      * (entity.combat?.modeDamageTakenScale ?? 1);
    return cost <= Math.min(30, (entity.combat?.hp ?? 1000) * .04);
  }
  function corridorSafe(entity: FallEntity, yaw: number, travel: number): boolean {
    const {x, z} = entity.state.pos;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), direction = Math.sign(travel) || 1;
    const halfLength = (entity.spec.dims.hullLengthM ?? entity.spec.dims.lengthM ?? 6) * .5;
    const reach = Math.abs(travel) + halfLength + 1;
    const count = Math.max(1, Math.ceil(reach / 1.5));
    const width = entity.spec.dims.widthM * .35;
    for (let lane = -1; lane <= 1; lane++) {
      const sx = x + fz * width * lane, sz = z - fx * width * lane;
      let previous = surfaceY(sx, sz);
      let steepStart = previous;
      for (let step = 1; step <= count; step++) {
        const distance = reach * step / count * direction;
        const next = surfaceY(sx + fx * distance, sz + fz * distance);
        if (previous - next <= reach / count * .65) steepStart = previous;
        if (!Number.isFinite(next) || !affordable(entity, steepStart - next)) return false;
        previous = next;
      }
    }
    return true;
  }
  function jumpLandingSafe(entity: FallEntity, travel: number): boolean {
    const {x, z} = entity.state.pos, yaw = entity.state.yaw;
    const start = surfaceY(x, z);
    const finish = surfaceY(x + Math.sin(yaw) * travel, z + Math.cos(yaw) * travel);
    return Number.isFinite(start) && Number.isFinite(finish)
      && affordable(entity, start - finish, entity.modeJumpMps ?? 0);
  }
  return { corridorSafe, jumpLandingSafe, surfaceY };
}
