// The Danish Army line's builders (release 265, denmarkSpecs.ts): one demand-loaded pack for every Danish id.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildLeo1A3DK, buildLeo1A5DK, buildLeo1A5DK1 } from './leopard1Dk.ts';
import { buildLeopard2A5DK } from './leopard2Dk.ts';
import { buildCv90, type CvBuilderPort } from './cv90.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export const DENMARK_PROFILES = {
  leo1a3dk: { build: buildLeo1A3DK },
  leo1a5dk: { build: buildLeo1A5DK },
  leo1a5dk1: { build: buildLeo1A5DK1 },
  leo2a5dk: { build: buildLeopard2A5DK },
  cv9035dk: { build: (P: TankBuilderPort) => buildCv90(P as unknown as CvBuilderPort, { danish: true }) },
} satisfies VehicleProfileRecord;
