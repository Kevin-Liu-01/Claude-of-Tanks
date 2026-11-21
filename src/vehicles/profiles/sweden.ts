// Swedish armored family.
//
// The Strv 103s (103A, 103B and its netted twin, the concept 103E and Strv 152) and the UDES 03 (the S-tank's trials
// prototype) are one family on one casemate: profiles/strv103Family.ts (owner 2026-11-20). The Strv 81 and Strv 105 come from the rebuilt
// Centurion family; the Strv 121 (the Swedish Leopard 2A4) from profiles/leopard2A4Family.ts and its kit,
// profiles/leopard2A4Strv121Kit.ts. Owner-supplied models are fixed visual/metric references only; runtime geometry
// is first-party procedural.

import { centurionBuild } from './uk.ts';
import { buildStrv103Mark } from './strv103Family.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

function buildStrv81(P: TankBuilderPort): void {
  // release 262: the Strv 81B (the Centurion Mk 5 in Swedish service, 20-pdr Type B) from the rebuilt Centurion family;
  // its Swedish fittings (lights, glacis link brackets, radios, the cupola Ksp) are that family's 'strv81' mark
  centurionBuild(P, 'strv81');
}

function buildStrv105(P: TankBuilderPort): void {
  // release 262: the Strv 105 prototype (a Strv 104 with its FFV cassettes and a thermal sight) from the rebuilt family
  centurionBuild(P, 'strv105');
}

export const SWEDEN_PROFILES = {
  udes03: { build: (P: TankBuilderPort) => buildStrv103Mark(P, 'p') },
  strv103b: { build: (P: TankBuilderPort) => buildStrv103Mark(P, 'b') },
  strv103a: { build: (P: TankBuilderPort) => buildStrv103Mark(P, 'a') },
  strv103b_net: { build: (P: TankBuilderPort) => buildStrv103Mark(P, 'b') },
  strv103e: { build: (P: TankBuilderPort) => buildStrv103Mark(P, 'e') },
  strv152: { build: (P: TankBuilderPort) => buildStrv103Mark(P, 'x') },
  strv81: { build: buildStrv81 },
  strv105: { build: buildStrv105 },
  // 264: strv121 (the Swedish Leopard 2A4) is built on the release construction (profiles/leopard2A4Family.ts)
} satisfies VehicleProfileRecord;
