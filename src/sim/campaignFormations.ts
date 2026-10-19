/**
 * The country each campaign operation's formation is drawn from (gameplay-modes-228): the one table the solo campaign
 * (game/campaignOperations.ts builds its ladder from it) and the multiplayer bot planner (src/mp/room/roomBots.ts, which
 * the rooms Worker reaches and which may not import src/game) both read. The story fixes it under both TEAM NATIONS
 * values.
 */
import type { CountryId } from './teamNations.ts';

export const CAMPAIGN_OPERATION_COUNTRY: Readonly<Record<string, CountryId>> = Object.freeze({
  first_light: 'russia',
  iron_ridge: 'germany',
  steinburg: 'germany',
  tarkhan_steppe: 'russia',
  frontier_basin: 'china',
  delta_crossing: 'usa',
});

/** An operation's formation country, or null for a free sortie / an unknown id. */
export function campaignOperationCountry(operationId: string | null | undefined): CountryId | null {
  return operationId && Object.prototype.hasOwnProperty.call(CAMPAIGN_OPERATION_COUNTRY, operationId)
    ? CAMPAIGN_OPERATION_COUNTRY[operationId]! : null;
}
