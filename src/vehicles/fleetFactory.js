// Browser-facing procedural fleet facade. The roster registry remains eager;
// authored visual families and canonical packs that do not participate in the
// opening vehicle are registered only when a concrete tank id requests them.
import {
  configureTankFactory,
  createTank as createTankCore,
  registerCanonicalBuilders,
  registerProfiledBuilders,
} from './tankFactoryCore.js';
import { FLEET_GROUP_BY_ID } from './fleetManifest.js';
import {
  ensureAllVehicleMarkingSeatGroups,
  ensureVehicleMarkingSeats,
  ensureVehicleMarkingSeatsForIds,
  isVehicleMarkingSeatsReady,
} from './vehicleMarkingSeatLoader.js';
import {
  ensureAllCombatAnatomyGroups,
  ensureCombatAnatomyCalibration,
  ensureCombatAnatomyCalibrations,
  isCombatAnatomyCalibrationReady,
} from './combatAnatomyCalibrationLoader.js';
import { finalizeCombatAnatomy } from './combatAnatomy.js';

import './variants.js';
import './modern1Specs.generated.js';
import './modern2Specs.generated.js';
import './userdrops.js';
import './userdrops2.js';
import './userdrops3.js';
import './userdrops4.js';
import './challengerSpecs.js';
import './modern3Specs.js';
import './userdrops5.js';
import './userdrops6.js';
import './franceSpecs.js';
import './ukraine.js';
import './china.js';
import './sweden.js';
import './poland.js';
import './korea.js';
import './japan.js';
import './germany.js';
import './afvFamily.js';

import {
  ALL_TANK_IDS,
  DEVELOPMENT_TANK_IDS,
  PRODUCTION_TANK_IDS,
  RUNTIME_TANK_IDS,
  SAVED_TANK_IDS,
  TANK_SPECS,
  VISIBLE_TANK_IDS,
  finalizeFirstPartyRoster,
} from './specs.js';
import { applyNativeFamilyOrder } from './fleetOrder.js';

function toBuilders(profiles) {
  if (!profileKit) throw new Error('Profile kit is not loaded');
  const { buildDonorVariant, buildProfile } = profileKit;
  return Object.fromEntries(Object.entries(profiles).map(([id, profile]) => [id, (P) => (
    profile.build ? profile.build(P, profile)
      : profile.base ? buildDonorVariant(P, profile)
        : buildProfile(P, profile)
  )]));
}

finalizeFirstPartyRoster();
for (const ids of [
  ALL_TANK_IDS,
  DEVELOPMENT_TANK_IDS,
  SAVED_TANK_IDS,
  PRODUCTION_TANK_IDS,
  VISIBLE_TANK_IDS,
  RUNTIME_TANK_IDS,
]) applyNativeFamilyOrder(ids);

let profileKit = null;
let factoryReady = false;
let factoryReadyPromise = null;

function ensureFactoryReady() {
  if (factoryReady) return Promise.resolve();
  if (!factoryReadyPromise) {
    factoryReadyPromise = import('./profiles/kit.js').then((kit) => {
      configureTankFactory({ canonicalBuilderPacks: [], fittings: kit.FITTINGS });
      profileKit = kit;
      factoryReady = true;
    }).catch((error) => {
      factoryReadyPromise = null;
      throw error;
    });
  }
  return factoryReadyPromise;
}

function registerProfiles(profiles) {
  registerProfiledBuilders(toBuilders(profiles));
}

const GROUP_LOADERS = Object.freeze({
  modern2Core: () => import('./modern2.js')
    .then((mod) => registerCanonicalBuilders('modern2', mod.MODERN2_BUILDERS)),
  franceCore: () => import('./france.js')
    .then((mod) => registerCanonicalBuilders('france', mod.FRANCE_BUILDERS)),
  modern3Core: () => import('./modern3.js')
    .then((mod) => registerCanonicalBuilders('modern3', mod.MODERN3_BUILDERS)),
  misc: () => import('./profiles/misc.js').then((mod) => registerProfiles(mod.MISC_PROFILES)),
  uk: () => import('./profiles/uk.js').then((mod) => registerProfiles(mod.UK_PROFILES)),
  challenger: () => import('./profiles/challenger.js').then((mod) => {
    registerCanonicalBuilders('challenger', mod.CHALLENGER_BUILDERS);
    registerProfiles(mod.CHALLENGER_PROFILES);
  }),
  leopard: () => import('./profiles/leopard.js').then((mod) => registerProfiles(mod.LEOPARD_PROFILES)),
  italy: () => import('./profiles/italy.js').then((mod) => registerProfiles(mod.ITALY_PROFILES)),
  sweden: () => import('./profiles/sweden.js').then((mod) => registerProfiles(mod.SWEDEN_PROFILES)),
  sovietHeavy: () => import('./profiles/soviet-heavy.js').then((mod) => registerProfiles(mod.SOVIET_HEAVY_PROFILES)),
  t90: () => import('./profiles/t90.js').then((mod) => registerProfiles(mod.T90_PROFILES)),
  russia: () => import('./profiles/russia.js').then((mod) => registerProfiles(mod.RUSSIA_PROFILES)),
  t72: () => import('./profiles/t72.js').then((mod) => registerProfiles(mod.T72_PROFILES)),
  t80: () => import('./profiles/t80.js').then((mod) => registerProfiles(mod.T80_PROFILES)),
  ukraine: () => import('./profiles/ukraine.js').then((mod) => registerProfiles(mod.UKRAINE_PROFILES)),
  poland: () => import('./profiles/poland.js').then((mod) => registerProfiles(mod.POLAND_PROFILES)),
  abrams: () => import('./profiles/abrams.js').then((mod) => registerProfiles(mod.ABRAMS_PROFILES)),
  patton: () => import('./profiles/patton.js').then((mod) => registerProfiles(mod.PATTON_PROFILES)),
  ww2: () => import('./profiles/ww2.js').then((mod) => registerProfiles(mod.WW2_PROFILES)),
  casemate: () => import('./profiles/casemate.js').then((mod) => {
    const { strv103: _swedenOwnsStrv103, ...profiles } = mod.CASEMATE_PROFILES;
    registerProfiles(profiles);
  }),
  merkava: () => import('./profiles/merkava.js').then((mod) => registerProfiles(mod.MERKAVA_PROFILES)),
  afv: () => import('./profiles/afvFamily.js').then((mod) => registerProfiles(mod.AFV_FAMILY_PROFILES)),
  // Type 99A is the one retained profile that wraps its earlier canonical
  // donor. Keep that old builder pack on the China demand path.
  china: () => Promise.all([import('./modern2.js'), import('./profiles/china.js')])
    .then(([canonical, profiles]) => {
      registerCanonicalBuilders('modern2', canonical.MODERN2_BUILDERS);
      registerProfiles(profiles.CHINA_PROFILES);
    }),
  korea: () => import('./profiles/korea.js').then((mod) => registerProfiles(mod.KOREA_PROFILES)),
  japan: () => import('./profiles/japan.js').then((mod) => registerProfiles(mod.JAPAN_PROFILES)),
  germany: () => import('./profiles/germany.js').then((mod) => registerProfiles(mod.GERMANY_PROFILES)),
});
const groupPromises = new Map();
const readyGroups = new Set();

function ensureGroup(group) {
  if (!group || readyGroups.has(group)) return ensureFactoryReady();
  let pending = groupPromises.get(group);
  if (!pending) {
    pending = ensureFactoryReady().then(() => GROUP_LOADERS[group]()).then(() => {
      readyGroups.add(group);
    }).catch((error) => {
      groupPromises.delete(group);
      throw error;
    });
    groupPromises.set(group, pending);
  }
  return pending;
}

export function ensureTankBuilder(specId) {
  return Promise.all([
    ensureGroup(FLEET_GROUP_BY_ID[specId]),
    ensureVehicleMarkingSeats(specId),
    ensureCombatAnatomyCalibration(specId),
  ]).then(() => {
    finalizeCombatAnatomy(TANK_SPECS[specId]);
  });
}

export function ensureTankBuilders(specIds) {
  const groups = new Set();
  for (const id of specIds || []) {
    const group = FLEET_GROUP_BY_ID[id];
    if (group) groups.add(group);
  }
  return Promise.all([
    ...[...groups].map(ensureGroup),
    ensureVehicleMarkingSeatsForIds(specIds),
    ensureCombatAnatomyCalibrations(specIds),
  ]).then(() => {
    for (const id of specIds || []) finalizeCombatAnatomy(TANK_SPECS[id]);
  });
}

export function ensureFullFleet() {
  return Promise.all([
    ...Object.keys(GROUP_LOADERS).map(ensureGroup),
    ensureAllVehicleMarkingSeatGroups(),
    ensureAllCombatAnatomyGroups(),
  ]).then(() => {
    for (const id of SAVED_TANK_IDS) finalizeCombatAnatomy(TANK_SPECS[id]);
  });
}

export function isTankBuilderReady(specId) {
  const group = FLEET_GROUP_BY_ID[specId];
  return factoryReady
    && (!group || readyGroups.has(group))
    && isVehicleMarkingSeatsReady(specId)
    && isCombatAnatomyCalibrationReady(specId);
}

export function createTank(specId, engineCtx, opts) {
  if (!isTankBuilderReady(specId)) {
    throw new Error(`Tank builder '${specId}' is not loaded; await ensureTankBuilder('${specId}')`);
  }
  return createTankCore(specId, engineCtx, opts);
}

export { KIT } from './tankFactoryCore.js';
