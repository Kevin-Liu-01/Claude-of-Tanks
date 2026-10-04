// The one ordered fleet registration (2026-10-01). Every fleet facade imports
// this module: the browser fleet (fleetFactory.ts, players and solo), the
// spec-only authority fleet (authorityFleet.ts: the browser host Worker and
// the Node match service) and the eager tool fleet (tankFactory.ts). Spec
// packs register when they evaluate; keep donor waves ahead of their
// derivatives so every clone observes a complete source record. The
// registration passes below then run once per process, in this order, and
// the roster catalogs are sealed. Spec data only: no builders, no Three.js
// geometry, no calibration groups, no marking seats.
//
// modern1/modern2 rows register from their generated metadata on every path
// (the legacy builder files import it too), so no facade can register the
// legacy files' live objects: those alias plate vertices, and in-place armor
// fitting scaled an aliased vertex of a derived clone twice (the host's Type
// 96B X and the three Type 96 concepts, cloned from type99a, carried different
// turret plates, modules, crew boxes and hit shells than the player's).
// src/vehicles/fleetParity.selftest.mjs digests every spec as each facade
// finalizes it on its own and asserts equality.
import { applyTacticalRoleBalance } from './tacticalRoleBalance.ts';
import { applyVehicleSizePolicy } from './vehicleSizePolicy.ts';
import { prepareXk2DonorMetadata, synchronizeXk2CombatMetadata } from './xk2Specs.ts';
import { applyFleetBalancePass } from './fleetBalancePass.ts';

import './combatVariantSpecs.ts';
import './modern1Specs.generated.ts';
import './modern2Specs.generated.ts';
import './chineseFrontlineSpecs.ts';
import './russianFrontlineSpecs.ts';
import './kf51Specs.ts';
import './abramsConceptSpecs.ts';
import './challengerSpecs.ts';
import './modern3Specs.ts';
import './additionalFleetSpecs.ts';
import './aresApcXSpecs.ts';
import './classicFleetSpecs.ts';
import './franceSpecs.ts';
import './ukraine.ts';
import './china.ts';
import './sweden.ts';
import './poland.ts';
import './korea.ts';
import './japan.ts';
import './germany.ts';
import './afvFamily.ts';
import './sheridan.ts';
import { synchronizeSourceXCombatMetadata } from './sourceXFleetSpecs.ts';
import { synchronizeSuppliedSourceCombatMetadata } from './suppliedSourceFleetSpecs.ts';
import { synchronizeSecondWaveXCombatMetadata } from './sourceXSecondWaveSpecs.ts';
import { synchronizeAbramsSourceXCombatMetadata } from './abramsSourceXSpecs.ts';
import './merkavaModernSpecs.ts';
import './arieteModernSpecs.ts';
import './tos1aTagilSpecs.ts';
import './griffinViperSpecs.ts';
import { synchronizeIfvReplicaCombatMetadata } from './ifvReplicaSpecs.ts';
import './europePhotoIfvSpecs.ts';
import './amx10pSpecs.ts';
import './marder2Specs.ts';
import './m6LinebackerSpecs.ts';
import { synchronizeFleetRenewalMetadata } from './fleetRenewalSpecs.ts';
import { synchronizeNationalModernizationMetadata } from './nationalModernizationSpecs.ts';

import { TANK_SPECS, finalizeFirstPartyRoster } from './specs.ts';
import { applyNativeFamilyOrderToCatalogs } from './fleetOrder.ts';

applyFleetBalancePass(TANK_SPECS);
prepareXk2DonorMetadata();
synchronizeSourceXCombatMetadata();
synchronizeSuppliedSourceCombatMetadata();
synchronizeSecondWaveXCombatMetadata();
synchronizeAbramsSourceXCombatMetadata();
synchronizeXk2CombatMetadata();
synchronizeIfvReplicaCombatMetadata();
synchronizeFleetRenewalMetadata();
synchronizeNationalModernizationMetadata();
applyTacticalRoleBalance(TANK_SPECS);
finalizeFirstPartyRoster();
applyVehicleSizePolicy(TANK_SPECS);
applyNativeFamilyOrderToCatalogs();
