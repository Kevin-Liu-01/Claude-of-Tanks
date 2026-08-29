// Typed eager fleet factory facade for release tools and headless audits. It
// evaluates spec packs in donor order, seals the selectable roster, and
// configures the cycle-free implementation once. Player boot uses the
// demand-loaded fleetFactory.ts boundary instead.

import { configureTankFactory } from './tankFactoryCore.js';
import { MODERN3_BUILDERS } from './modern3.js';
import { FRANCE_BUILDERS } from './france.ts';
import { MODERN2_BUILDERS } from './modern2.js';
import { MODERN1_BUILDERS } from './modern1.ts';
import { CHALLENGER_BUILDERS } from './profiles/challenger.js';
import { FITTINGS } from './profiles/kit.js';
import { PROFILED_BUILDERS } from './profiledProcedurals.ts';
import { VEHICLE_MARKING_SEATS } from './vehicleMarkingSeats.generated.ts';
import { registerVehicleMarkingSeatRecords } from './vehicleMarkingSeatRegistry.ts';
import { COMBAT_ANATOMY_CALIBRATIONS } from './combatAnatomyCalibrations.ts';
import { registerCombatAnatomyCalibrations } from './combatAnatomyCalibrationRegistry.ts';
import { finalizeCombatAnatomy } from './combatAnatomy.ts';

// These modules register specs at evaluation time. Keep donor waves ahead of
// their derivatives so every clone observes a complete source record.
import './combatVariantSpecs.ts';
import './kf51Specs.ts';
import './abramsConceptSpecs.ts';
import './additionalFleetSpecs.ts';
import './classicFleetSpecs.ts';
import './ukraine.ts';
import './china.ts';
import './sweden.ts';
import './poland.ts';
import './korea.ts';
import './japan.ts';
import './germany.ts';
import './afvFamily.ts';
import './sheridan.ts';

import {
  ALL_TANK_IDS,
  BOT_TANK_IDS,
  DEVELOPMENT_TANK_IDS,
  PRODUCTION_TANK_IDS,
  RUNTIME_TANK_IDS,
  SAVED_TANK_IDS,
  TANK_SPECS,
  VISIBLE_TANK_IDS,
  finalizeFirstPartyRoster,
} from './specs.js';
import { applyNativeFamilyOrder } from './fleetOrder.ts';

const tankSpecs = TANK_SPECS as unknown as Record<string, unknown>;

registerCombatAnatomyCalibrations(COMBAT_ANATOMY_CALIBRATIONS);
finalizeFirstPartyRoster();
for (const id of SAVED_TANK_IDS) finalizeCombatAnatomy(tankSpecs[id]);
registerVehicleMarkingSeatRecords(VEHICLE_MARKING_SEATS);
for (const ids of [
  ALL_TANK_IDS,
  BOT_TANK_IDS,
  DEVELOPMENT_TANK_IDS,
  SAVED_TANK_IDS,
  PRODUCTION_TANK_IDS,
  VISIBLE_TANK_IDS,
  RUNTIME_TANK_IDS,
]) applyNativeFamilyOrder(ids);
configureTankFactory({
  canonicalBuilderPacks: [
    ['modern1', MODERN1_BUILDERS],
    ['challenger', CHALLENGER_BUILDERS],
    ['modern2', MODERN2_BUILDERS],
    ['modern3', MODERN3_BUILDERS],
    ['france', FRANCE_BUILDERS],
  ],
  profiledBuilders: PROFILED_BUILDERS,
  fittings: FITTINGS,
});

export { KIT, createTank } from './tankFactoryCore.js';
