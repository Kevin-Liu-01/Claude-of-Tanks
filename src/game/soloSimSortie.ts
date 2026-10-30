/**
 * A free sortie's seats for the solo sim Worker (RUST-ENGINE-DECISION §7 step 5, phase 3), from the one plan the load card
 * drew (rosterState.planBattleSeats): every seat's side, vehicle and callsign as the card and the HUD name them, the bots'
 * difficulty as setupBattle sets it, and the paint each wears (the player's selection, a bot's biome roll as
 * planBattleCamoOverrides rolls it for the page's own battle). Pure: the page plans, the Worker seats exactly this.
 */
import { rulesetBotDifficulty } from '../sim/matchRuleset.ts';
import type { MatchRuleset } from '../sim/matchRuleset.ts';
import type { PlannedBattleSeat } from './rosterState.ts';
import type { SoloSimSeat } from './soloSimProtocol.ts';

/** The player's seat on the Worker (its id is the sortie's, never the vehicle's: duplicate picks are valid). */
export const SOLO_SIM_PLAYER_ID = 'player';

export interface SoloSimSortieSeats {
  seats: SoloSimSeat[];
  /** The paint by seat: the player's selection, a bot's biome roll ('auto') or its vehicle's selection. */
  camo: Map<string, string>;
}

export function soloSimSortieSeats(planned: readonly PlannedBattleSeat[], {
  ruleset, difficulty, playerName, playerCamo, playerEquipment = [], autoCamoSpecIds = [], selectionFor = () => 'factory',
  callsigns = new Map(),
}: {
  ruleset: Pick<MatchRuleset, 'horde' | 'assault'>;
  /** The stored bot difficulty (Settings): stepped down for a wave mode's hostiles, as setupBattle steps it. */
  difficulty: 'easy' | 'normal' | 'hard';
  playerName: string;
  playerCamo: string;
  playerEquipment?: readonly string[];
  /** The specs whose bots wear the battlefield's biome paint this battle (planBattleCamoOverrides). */
  autoCamoSpecIds?: readonly string[];
  /** The paint a vehicle's selection names (a bot not rolled for the biome wears it, as the page's battle paints it). */
  selectionFor?(specId: string): string;
  /**
   * The bots' callsigns by seat id, as the card names them (rosterPresentation.seatCallsigns: the page holds the names, so
   * this lazy module shares no chunk with the boot's).
   */
  callsigns?: ReadonlyMap<string, string>;
}): SoloSimSortieSeats {
  const auto = new Set(autoCamoSpecIds);
  const camo = new Map<string, string>();
  const seats = planned.map((seat, index): SoloSimSeat => {
    const team = seat.team === 'player' ? 'alpha' : 'bravo';
    if (seat.isPlayer) {
      camo.set(SOLO_SIM_PLAYER_ID, playerCamo);
      return { playerId: SOLO_SIM_PLAYER_ID, name: playerName, team, specId: seat.specId, isPlayer: true, equipment: [...playerEquipment] };
    }
    // (a bot's id is its seat's: the plan's order, unique even where two seats drive one vehicle)
    const playerId = `bot-${index}`;
    camo.set(playerId, auto.has(seat.specId) ? 'auto' : selectionFor(seat.specId));
    return {
      playerId, team, specId: seat.specId, isPlayer: false,
      name: seat.displayName || callsigns.get(seat.id) || seat.spec?.name || seat.specId,
      difficulty: rulesetBotDifficulty(ruleset, seat.team, difficulty),
    };
  });
  return { seats, camo };
}
