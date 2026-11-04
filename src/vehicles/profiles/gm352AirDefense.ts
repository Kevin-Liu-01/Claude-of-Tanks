// Release 268, the twin-cannon air-defence round: the two Russian vehicles on the GM-352 chassis family, each built in
// full on the one shared chassis (gm352Chassis.ts; the Pantsir's GM-352M1E is its option) under its own combat module:
// the 2K22M Tunguska-M's turret (tunguskaM.ts) and the Pantsir-S1's module (pantsirS1.ts). Every datum the spec reads
// (the ring, the trunnion, the twin fire axes, the launch exits) is gm352Layout.ts's, shared with gm352AirDefenseSpecs.ts.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildGm352Chassis } from './gm352Chassis.ts';
import { buildTunguskaTurret } from './tunguskaM.ts';
import { buildPantsirModule } from './pantsirS1.ts';

export function buildTunguskaM(P: TankBuilderPort): void {
  buildGm352Chassis(P, { variant: 'gm352' });
  buildTunguskaTurret(P);
}

export function buildPantsirS1(P: TankBuilderPort): void {
  buildGm352Chassis(P, { variant: 'gm352m1e' });
  buildPantsirModule(P);
}

export const GM352_AIR_DEFENSE_PROFILES = {
  tunguska_m: { build: buildTunguskaM },
  pantsir_s1: { build: buildPantsirS1 },
} as const;
