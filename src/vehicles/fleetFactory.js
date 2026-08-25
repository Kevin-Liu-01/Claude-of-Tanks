// Browser-facing procedural fleet facade. Canonical builders and the roster
// registry remain eager; the large authored profile families are registered
// only when a concrete tank id requests their chunk.
import {
  configureTankFactory,
  createTank as createTankCore,
  registerProfiledBuilders,
} from './tankFactoryCore.js';
import { MODERN3_BUILDERS } from './modern3.js';
import { FRANCE_BUILDERS } from './france.js';
import { MODERN2_BUILDERS } from './modern2.js';
import { MODERN1_BUILDERS } from './modern1.js';
import { CHALLENGER_BUILDERS } from './profiles/challenger.js';
import { MISC_PROFILES } from './profiles/misc.js';
import { FITTINGS, buildDonorVariant, buildProfile } from './profiles/kit.js';
import { FLEET_GROUP_BY_ID } from './fleetManifest.js';

import './variants.js';
import './userdrops.js';
import './userdrops2.js';
import './userdrops3.js';
import './userdrops4.js';
import './userdrops5.js';
import './userdrops6.js';
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
  VISIBLE_TANK_IDS,
  finalizeFirstPartyRoster,
} from './specs.js';
import { applyNativeFamilyOrder } from './fleetOrder.js';

function toBuilders(profiles) {
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

configureTankFactory({
  canonicalBuilderPacks: [
    ['modern1', MODERN1_BUILDERS],
    ['challenger', CHALLENGER_BUILDERS],
    ['modern2', MODERN2_BUILDERS],
    ['modern3', MODERN3_BUILDERS],
    ['france', FRANCE_BUILDERS],
  ],
  fittings: FITTINGS,
});
registerProfiledBuilders(toBuilders(MISC_PROFILES));

const GROUP_LOADERS = Object.freeze({
  uk: () => import('./profiles/uk.js').then((mod) => mod.UK_PROFILES),
  challenger: () => import('./profiles/challenger.js').then((mod) => mod.CHALLENGER_PROFILES),
  leopard: () => import('./profiles/leopard.js').then((mod) => mod.LEOPARD_PROFILES),
  italy: () => import('./profiles/italy.js').then((mod) => mod.ITALY_PROFILES),
  sweden: () => import('./profiles/sweden.js').then((mod) => mod.SWEDEN_PROFILES),
  sovietHeavy: () => import('./profiles/soviet-heavy.js').then((mod) => mod.SOVIET_HEAVY_PROFILES),
  t90: () => import('./profiles/t90.js').then((mod) => mod.T90_PROFILES),
  russia: () => import('./profiles/russia.js').then((mod) => mod.RUSSIA_PROFILES),
  t72: () => import('./profiles/t72.js').then((mod) => mod.T72_PROFILES),
  t80: () => import('./profiles/t80.js').then((mod) => mod.T80_PROFILES),
  ukraine: () => import('./profiles/ukraine.js').then((mod) => mod.UKRAINE_PROFILES),
  poland: () => import('./profiles/poland.js').then((mod) => mod.POLAND_PROFILES),
  abrams: () => import('./profiles/abrams.js').then((mod) => mod.ABRAMS_PROFILES),
  patton: () => import('./profiles/patton.js').then((mod) => mod.PATTON_PROFILES),
  ww2: () => import('./profiles/ww2.js').then((mod) => mod.WW2_PROFILES),
  casemate: () => import('./profiles/casemate.js').then((mod) => {
    const { strv103: _swedenOwnsStrv103, ...profiles } = mod.CASEMATE_PROFILES;
    return profiles;
  }),
  merkava: () => import('./profiles/merkava.js').then((mod) => mod.MERKAVA_PROFILES),
  afv: () => import('./profiles/afvFamily.js').then((mod) => mod.AFV_FAMILY_PROFILES),
  china: () => import('./profiles/china.js').then((mod) => mod.CHINA_PROFILES),
  korea: () => import('./profiles/korea.js').then((mod) => mod.KOREA_PROFILES),
  japan: () => import('./profiles/japan.js').then((mod) => mod.JAPAN_PROFILES),
  germany: () => import('./profiles/germany.js').then((mod) => mod.GERMANY_PROFILES),
});
const groupPromises = new Map();
const readyGroups = new Set();

function ensureGroup(group) {
  if (!group || readyGroups.has(group)) return Promise.resolve();
  let pending = groupPromises.get(group);
  if (!pending) {
    pending = GROUP_LOADERS[group]().then((profiles) => {
      registerProfiledBuilders(toBuilders(profiles));
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
  return ensureGroup(FLEET_GROUP_BY_ID[specId]);
}

export function ensureTankBuilders(specIds) {
  const groups = new Set();
  for (const id of specIds || []) {
    const group = FLEET_GROUP_BY_ID[id];
    if (group) groups.add(group);
  }
  return Promise.all([...groups].map(ensureGroup)).then(() => undefined);
}

export function ensureFullFleet() {
  return Promise.all(Object.keys(GROUP_LOADERS).map(ensureGroup)).then(() => undefined);
}

export function isTankBuilderReady(specId) {
  const group = FLEET_GROUP_BY_ID[specId];
  return !group || readyGroups.has(group);
}

export function createTank(specId, engineCtx, opts) {
  if (!isTankBuilderReady(specId)) {
    throw new Error(`Tank builder '${specId}' is not loaded; await ensureTankBuilder('${specId}')`);
  }
  return createTankCore(specId, engineCtx, opts);
}

export { KIT } from './tankFactoryCore.js';
