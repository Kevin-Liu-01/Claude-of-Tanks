interface RosterPresentationRow {
  id: string;
  name: string;
  tier: string;
  isPlayer: boolean;
  kind?: 'aircraft';
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
  aerial?: { kind: string };
  specId: string;
  team?: string;
  spec?: { name?: string };
  isPlayer?: boolean;
}

interface RosterPresentationOptions {
  getVehicleName(specId: string): string | null | undefined;
  getTier(specId: string): string;
}

export interface RosterPresentation {
  lobbyRows(state: LobbyState, team: string, viewerId: string): RosterPresentationRow[];
  battleRows(entities: BattleRosterEntity[], team: string): RosterPresentationRow[];
}

/** (ac130-fx-228) a gunship pilot's row: the AC-130, no tier; it carries no name, its renderer names it through the one
 *  identity (ui/killSourceIdentity.ts, battleLoad.ts) */
const aircraftRow = (isPlayer: boolean): RosterPresentationRow => ({ id: 'ac130', name: '', tier: '', kind: 'aircraft', isPlayer });

/** Keep pre-battle and online lobby roster labels on one typed policy. */
export function createRosterPresentation({
  getVehicleName,
  getTier,
}: RosterPresentationOptions): RosterPresentation {
  const lobbyRows = (state: LobbyState, team: string, viewerId: string) => state.players
    .filter((player) => player.team === team && !!player.specId)
    .map((player): RosterPresentationRow => {
      if (state.gameMode === 'ac130' && player.team === 'alpha' && !player.bot) return aircraftRow(player.id === viewerId);
      const specId = player.specId!;
      return {
        id: specId,
        name: getVehicleName(specId) || player.name || specId,
        tier: getTier(specId),
        isPlayer: player.id === viewerId,
      };
    });

  const battleRows = (entities: BattleRosterEntity[], team: string) => entities
    .filter((entity) => entity.team === team)
    .map((entity): RosterPresentationRow => entity.aerial?.kind === 'gunship' ? aircraftRow(!!entity.isPlayer) : ({
      id: entity.specId,
      name: entity.spec?.name || entity.specId,
      tier: getTier(entity.specId),
      isPlayer: !!entity.isPlayer,
    }))
    .sort((left, right) => Number(right.isPlayer) - Number(left.isPlayer));

  return { lobbyRows, battleRows };
}
