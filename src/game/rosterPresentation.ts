import { rosterCallsigns } from '../ui/botCallsigns.ts';

interface RosterPresentationRow {
  id: string;
  name: string;
  tier: string;
  isPlayer: boolean;
  kind?: 'aircraft';
  /** Who drives it: a room player's name, a solo bot's callsign (ui/botCallsigns.ts, as the HUD names it); none for the
   *  viewer (the load screen reads "You"). */
  callsign?: string;
  /** The vehicle's nation (its flag). */
  nation?: string;
}

interface LobbyPlayer {
  id: string;
  specId?: string | null;
  name?: string;
  team?: string;
  bot?: boolean;
}

interface LobbyState {
  gameMode?: string;
  players: readonly LobbyPlayer[];
}

interface BattleRosterEntity {
  id?: string;
  aerial?: { kind: string };
  specId: string;
  team?: string;
  spec?: { id?: string; name?: string; nation?: string };
  isPlayer?: boolean;
  displayName?: string | null;
}

interface RosterPresentationOptions {
  getVehicleName(specId: string): string | null | undefined;
  getTier(specId: string): string;
  /** The vehicle's nation (a room's rows carry no spec). */
  getNation?(specId: string): string | null | undefined;
}

export interface RosterPresentation {
  lobbyRows(state: LobbyState, team: string, viewerId: string): RosterPresentationRow[];
  battleRows(entities: BattleRosterEntity[], team: string): RosterPresentationRow[];
  /** The bots' callsigns by seat id over every side in the battle's order, as the card and the HUD name them. */
  seatCallsigns(entities: readonly BattleRosterEntity[]): Map<string, string>;
}

/** (ac130-fx-228) a gunship pilot's row: the AC-130, no tier; it carries no name, its renderer names it through the one
 *  identity (ui/killSourceIdentity.ts, battleLoad.ts) */
const aircraftRow = (isPlayer: boolean): RosterPresentationRow => ({ id: 'ac130', name: '', tier: '', kind: 'aircraft', isPlayer });

/** Keep pre-battle and online lobby roster labels on one typed policy. */
export function createRosterPresentation({
  getVehicleName,
  getTier,
  getNation,
}: RosterPresentationOptions): RosterPresentation {
  const lobbyRows = (state: LobbyState, team: string, viewerId: string) => state.players
    .filter((player) => player.team === team && !!player.specId)
    .map((player): RosterPresentationRow => {
      if (state.gameMode === 'ac130' && player.team === 'alpha' && !player.bot) return aircraftRow(player.id === viewerId);
      const specId = player.specId!;
      const nation = getNation?.(specId);
      return {
        id: specId,
        name: getVehicleName(specId) || player.name || specId,
        tier: getTier(specId),
        isPlayer: player.id === viewerId,
        ...(player.name && player.id !== viewerId ? { callsign: player.name } : {}),
        ...(nation ? { nation } : {}),
      };
    });

  // the bots' callsigns over every side in the battle's order, as the HUD assigns them
  const seatCallsigns = (entities: readonly BattleRosterEntity[]) => rosterCallsigns(entities.map((entity) => ({
    id: entity.id ?? entity.specId, specId: entity.spec ? entity.spec.id ?? entity.specId : null,
    displayName: entity.displayName, isPlayer: entity.isPlayer,
  })));

  const battleRows = (entities: BattleRosterEntity[], team: string) => {
    const callsigns = seatCallsigns(entities);
    return entities
      .filter((entity) => entity.team === team)
      .map((entity): RosterPresentationRow => {
        if (entity.aerial?.kind === 'gunship') return aircraftRow(!!entity.isPlayer);
        const callsign = entity.isPlayer ? null : entity.displayName || callsigns.get(entity.id ?? entity.specId);
        const nation = entity.spec?.nation;
        return {
          id: entity.specId,
          name: entity.spec?.name || entity.specId,
          tier: getTier(entity.specId),
          isPlayer: !!entity.isPlayer,
          ...(callsign ? { callsign } : {}),
          ...(nation ? { nation } : {}),
        };
      })
      .sort((left, right) => Number(right.isPlayer) - Number(left.isPlayer));
  };

  return { lobbyRows, battleRows, seatCallsigns };
}
