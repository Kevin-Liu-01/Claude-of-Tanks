export interface RosterPresentationRow {
  id: string;
  name: string;
  tier: string;
  isPlayer: boolean;
}

interface LobbyPlayer {
  id: string;
  specId?: string | null;
  name?: string;
  team?: string;
}

interface LobbyState {
  players: readonly LobbyPlayer[];
}

interface BattleRosterEntity {
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

/** Keep pre-battle and online lobby roster labels on one typed policy. */
export function createRosterPresentation({
  getVehicleName,
  getTier,
}: RosterPresentationOptions): RosterPresentation {
  const lobbyRows = (state: LobbyState, team: string, viewerId: string) => state.players
    .filter((player) => player.team === team && !!player.specId)
    .map((player) => {
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
    .map((entity) => ({
      id: entity.specId,
      name: entity.spec?.name || entity.specId,
      tier: getTier(entity.specId),
      isPlayer: !!entity.isPlayer,
    }))
    .sort((left, right) => Number(right.isPlayer) - Number(left.isPlayer));

  return { lobbyRows, battleRows };
}
