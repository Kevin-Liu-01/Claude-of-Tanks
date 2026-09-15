// Batch 19 (2026-09-14): the campaign debrief the end screen shows after a Frontline Assault
// sortie — which operation, how far the line went, the stars this sortie earned, and what the
// ladder does next. Pure: it reads the battle:ended payload and the operation table only; the
// record itself is written by campaignProgress on the same event.
import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  campaignNextOperation, campaignOperationById, campaignOperationForMap, campaignParTimeS,
  type CampaignOperation,
} from './campaignOperations.ts';
import { campaignStarsFor } from './campaignProgress.ts';

export interface CampaignDebrief {
  readonly operation: CampaignOperation;
  readonly cleared: boolean;
  /** Sectors taken this sortie and the sector count. */
  readonly sectorsTaken: number;
  readonly sectorsTotal: number;
  /** Stars this sortie earned (0 unless the line was held). */
  readonly stars: number;
  readonly underPar: boolean;
  readonly noAllyLost: boolean;
  readonly parTimeS: number;
  readonly durationS: number | null;
  readonly alliesLost: number | null;
  /** The operation the ladder opens (or re-opens) next; null after the last one. */
  readonly next: CampaignOperation | null;
}

interface CampaignDebriefInput {
  readonly gameMode?: RuntimeValue;
  readonly campaignOperationId?: RuntimeValue;
  readonly mapId?: RuntimeValue;
  readonly result?: RuntimeValue;
  readonly line?: RuntimeValue;
  readonly durationS?: RuntimeValue;
  readonly timeLimitS?: RuntimeValue;
  readonly alliesLost?: RuntimeValue;
}

function finite(value: RuntimeValue): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** null for anything that is not a campaign sortie (other modes, network disconnects). */
export function campaignDebrief(input: CampaignDebriefInput | null | undefined): CampaignDebrief | null {
  if (!input || input.gameMode !== 'frontline_assault') return null;
  const operation = campaignOperationById(typeof input.campaignOperationId === 'string' ? input.campaignOperationId : null)
    ?? campaignOperationForMap(typeof input.mapId === 'string' ? input.mapId : null);
  if (!operation) return null;
  const line = input.line && typeof input.line === 'object' && !Array.isArray(input.line)
    ? input.line as Record<string, RuntimeValue> : null;
  const sectorsTotal = Math.max(1, Math.round(finite(line?.total ?? null) ?? 3));
  const cleared = input.result === 'victory';
  const sectorsTaken = cleared ? sectorsTotal : Math.max(0, Math.min(sectorsTotal, Math.round(finite(line?.index ?? null) ?? 0)));
  const durationS = finite(input.durationS ?? null);
  const alliesLost = finite(input.alliesLost ?? null);
  const parTimeS = campaignParTimeS(operation);
  const stars = campaignStarsFor({
    result: input.result, durationS: input.durationS,
    timeLimitS: input.timeLimitS ?? operation.timeLimitS, alliesLost: input.alliesLost,
  });
  return {
    operation,
    cleared,
    sectorsTaken,
    sectorsTotal,
    stars,
    underPar: cleared && durationS != null && durationS <= parTimeS,
    noAllyLost: cleared && alliesLost === 0,
    parTimeS,
    durationS,
    alliesLost,
    next: cleared ? campaignNextOperation(operation) : operation,
  };
}
