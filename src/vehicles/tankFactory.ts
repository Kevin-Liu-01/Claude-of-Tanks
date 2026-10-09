// Typed eager fleet factory facade for release tools and headless audits.
// Every spec here is the spec the browser fleet and the authorities hold: the
// shared ordered registration (fleetRegistration.ts) runs the registration
// passes, and fleetParity.selftest.mjs digests every spec per facade. Only
// the catalog ORDER is the tools' own: the builder packs and the packs listed
// before fleetRegistration.ts below evaluate first, in the tools' historical
// order, which the generated receipts list ids in (docs/VEHICLE-ROSTER.md,
// the manual reference). Every calibration and marking seat then registers,
// every spec is finalized once and the cycle-free implementation is
// configured once. Player boot uses the demand-loaded fleetFactory.ts; the
// authorities use the spec-only authorityFleet.ts.

import { configureTankFactory } from './tankFactoryCore.ts';
import { MODERN3_BUILDERS } from './modern3.ts';
import { FRANCE_BUILDERS } from './france.ts';
import { MODERN2_BUILDERS } from './modern2.ts';
import './modern1.ts';
import { CHALLENGER_BUILDERS } from './profiles/challenger.ts';
import { FITTINGS } from './profiles/kit.ts';
import { attachTankDecorations, attachTankDecorationsSteps } from './decorations.ts';
import { PROFILED_BUILDERS } from './profiledProcedurals.ts';
import { VEHICLE_MARKING_SEATS } from './vehicleMarkingSeats.generated.ts';
import { registerVehicleMarkingSeatRecords } from './vehicleMarkingSeatRegistry.ts';
import { COMBAT_ANATOMY_CALIBRATIONS } from './combatAnatomyCalibrations.ts';
import { registerCombatAnatomyCalibrations } from './combatAnatomyCalibrationRegistry.ts';
import { finalizeCombatAnatomy } from './combatAnatomy.ts';
import './combatVariantSpecs.ts';
import './kf51Specs.ts';
import './abramsConceptSpecs.ts';
import './additionalFleetSpecs.ts';
import './aresApcXSpecs.ts';
import './classicFleetSpecs.ts';
import './ukraine.ts';
import './china.ts';
import './chineseFrontlineSpecs.ts';
import './russianFrontlineSpecs.ts';
import './fleetRegistration.ts';
import { SAVED_TANK_IDS, TANK_SPECS } from './specs.ts';

registerCombatAnatomyCalibrations(COMBAT_ANATOMY_CALIBRATIONS);
for (const id of SAVED_TANK_IDS) finalizeCombatAnatomy(TANK_SPECS[id]);
registerVehicleMarkingSeatRecords(VEHICLE_MARKING_SEATS);
configureTankFactory({
  canonicalBuilderPacks: [
    ['challenger', CHALLENGER_BUILDERS],
    ['modern2', MODERN2_BUILDERS],
    ['modern3', MODERN3_BUILDERS],
    ['france', FRANCE_BUILDERS],
  ],
  profiledBuilders: PROFILED_BUILDERS,
  fittings: FITTINGS,
  decorations: { attachTankDecorations, attachTankDecorationsSteps },
});

export { KIT, bucketMaterialKey, createTank } from './tankFactoryCore.ts';
