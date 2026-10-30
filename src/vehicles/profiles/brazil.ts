// The Brazilian Army line's builders (release 266, brazilSpecs.ts): one demand-loaded pack for every Brazilian id.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildOsorioP1, buildOsorioP2 } from './osorio.ts';
import { buildTamoyo1, buildTamoyo3 } from './tamoyo.ts';
import { buildX1A2Carcara, buildX1Pioneiro } from './bernardiniX1.ts';

export const BRAZIL_PROFILES = {
  x1_pioneiro: { build: buildX1Pioneiro },
  x1a2_carcara: { build: buildX1A2Carcara },
  osorio_p1: { build: buildOsorioP1 },
  osorio_p2: { build: buildOsorioP2 },
  tamoyo1: { build: buildTamoyo1 },
  tamoyo3: { build: buildTamoyo3 },
} satisfies VehicleProfileRecord;
