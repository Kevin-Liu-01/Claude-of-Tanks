// The Brazilian Army line's builders (release 266, brazilSpecs.ts): one demand-loaded pack for every Brazilian id.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildOsorioP1, buildOsorioP2 } from './osorio.ts';

export const BRAZIL_PROFILES = {
  osorio_p1: { build: buildOsorioP1 },
  osorio_p2: { build: buildOsorioP2 },
} satisfies VehicleProfileRecord;
