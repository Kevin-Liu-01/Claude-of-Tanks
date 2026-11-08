// The South African line's own builders (release 269, southAfricaSpecs.ts): one demand-loaded pack. The Semel and the
// Olifants build on the Centurion family in profiles/uk.ts beside the Olifant Mk 2; the TTD is its own build here.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildTtd } from './ttd.ts';

export const SOUTH_AFRICA_PROFILES = {
  ttd: { build: buildTtd },
} satisfies VehicleProfileRecord;
