// Browser-facing procedural fleet facade. The roster registry remains eager;
// authored visual families and canonical packs that do not participate in the
// opening vehicle are registered only when a concrete tank id requests them.
import {
  configureTankFactory,
  createTank as createTankCore,
  registerCanonicalBuilders,
  registerProfiledBuilders,
} from './tankFactoryCore.ts';
import { FLEET_GROUP_BY_ID, type FleetGroup } from './fleetManifest.ts';
import {
  ensureAllVehicleMarkingSeatGroups,
  ensureVehicleMarkingSeats,
  ensureVehicleMarkingSeatsForIds,
  isVehicleMarkingSeatsReady,
} from './vehicleMarkingSeatLoader.ts';
import {
  ensureAllCombatAnatomyGroups,
  ensureCombatAnatomyCalibration,
  ensureCombatAnatomyCalibrations,
  isCombatAnatomyCalibrationReady,
} from './combatAnatomyCalibrationLoader.ts';
import { finalizeCombatAnatomy } from './combatAnatomy.ts';
import { applyFleetBalancePass } from './fleetBalancePass.ts';

import './combatVariantSpecs.ts';
import './modern1Specs.generated.ts';
import './modern2Specs.generated.ts';
import './chineseFrontlineSpecs.ts';
import './kf51Specs.ts';
import './abramsConceptSpecs.ts';
import './challengerSpecs.ts';
import './modern3Specs.ts';
import './additionalFleetSpecs.ts';
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

import {
  SAVED_TANK_IDS,
  TANK_SPECS,
  finalizeFirstPartyRoster,
} from './specs.ts';
import { applyNativeFamilyOrderToCatalogs } from './fleetOrder.ts';
import {
  createProfileBuilders,
  type ProfileBuildFunctions,
  type VehicleProfileRecord,
} from './profileBuilderAdapter.ts';

type GroupLoader = () => Promise<unknown>;
type TankVisual = ReturnType<typeof createTankCore>;

export interface CreateTankOptions {
  camo?: string;
  geometryQuality?: 'high' | 'low';
  geometryReceipt?: boolean;
  materialMode?: 'rendered' | 'geometry-only';
  proceduralOnly?: boolean;
  quality?: 'high' | 'ai' | 'low' | 'preview';
  [key: string]: unknown;
}

applyFleetBalancePass(TANK_SPECS);
finalizeFirstPartyRoster();
applyNativeFamilyOrderToCatalogs();

let profileKit: ProfileBuildFunctions | null = null;
let factoryReady = false;
let factoryReadyPromise: Promise<void> | null = null;

function ensureFactoryReady(): Promise<void> {
  if (factoryReady) return Promise.resolve();
  if (!factoryReadyPromise) {
    factoryReadyPromise = import('./profiles/kit.ts').then((kit) => {
      configureTankFactory({
        canonicalBuilderPacks: [],
        profiledBuilders: {},
        fittings: kit.FITTINGS,
      });
      profileKit = kit;
      factoryReady = true;
    }).catch((error) => {
      factoryReadyPromise = null;
      throw error;
    });
  }
  return factoryReadyPromise;
}

function registerProfiles(profiles: VehicleProfileRecord): void {
  if (!profileKit) throw new Error('Profile kit is not loaded');
  registerProfiledBuilders(createProfileBuilders(profiles, profileKit));
}

const GROUP_LOADERS = Object.freeze({
  modern2: () => Promise.all([
    import('./modern2.ts'),
    import('./profiles/china.ts'),
    import('./profiles/chineseFrontline.ts'),
  ])
    .then(([canonical, profiles, frontline]) => {
      registerCanonicalBuilders('modern2', canonical.MODERN2_BUILDERS);
      registerProfiles({ ...profiles.CHINA_PROFILES, ...frontline.CHINESE_FRONTLINE_PROFILES });
    }),
  franceCore: () => import('./france.ts')
    .then((mod) => registerCanonicalBuilders('france', mod.FRANCE_BUILDERS)),
  modern3Core: () => import('./modern3.ts')
    .then((mod) => registerCanonicalBuilders('modern3', mod.MODERN3_BUILDERS)),
  misc: () => import('./profiles/misc.ts').then((mod) => registerProfiles(mod.MISC_PROFILES)),
  uk: () => import('./profiles/uk.ts').then((mod) => registerProfiles(mod.UK_PROFILES)),
  challenger: () => import('./profiles/challenger.ts').then((mod) => {
    registerCanonicalBuilders('challenger', mod.CHALLENGER_BUILDERS);
    registerProfiles(mod.CHALLENGER_PROFILES);
  }),
  leopard: () => import('./profiles/leopard.ts').then((mod) => registerProfiles(mod.LEOPARD_PROFILES)),
  italy: () => import('./profiles/italy.ts').then((mod) => registerProfiles(mod.ITALY_PROFILES)),
  sweden: () => Promise.all([
    import('./profiles/sweden.ts'),
    import('./profiles/cv90.ts'),
  ]).then(([family, cv90]) => registerProfiles({
    ...family.SWEDEN_PROFILES,
    ...cv90.CV90_PROFILES,
  })),
  sovietHeavy: () => import('./profiles/soviet-heavy.ts').then((mod) => registerProfiles(mod.SOVIET_HEAVY_PROFILES)),
  t90: () => import('./profiles/t90.ts').then((mod) => registerProfiles(mod.T90_PROFILES)),
  russia: () => import('./profiles/russia.ts').then((mod) => registerProfiles(mod.RUSSIA_PROFILES)),
  t72: () => import('./profiles/t72.ts').then((mod) => registerProfiles(mod.T72_PROFILES)),
  t80: () => import('./profiles/t80.ts').then((mod) => registerProfiles(mod.T80_PROFILES)),
  ukraine: () => import('./profiles/ukraine.ts').then((mod) => registerProfiles(mod.UKRAINE_PROFILES)),
  poland: () => import('./profiles/poland.ts').then((mod) => registerProfiles(mod.POLAND_PROFILES)),
  abrams: () => import('./profiles/abrams.ts').then((mod) => registerProfiles(mod.ABRAMS_PROFILES)),
  patton: () => import('./profiles/patton.ts').then((mod) => registerProfiles(mod.PATTON_PROFILES)),
  ww2: () => import('./profiles/ww2.ts').then((mod) => registerProfiles(mod.WW2_PROFILES)),
  casemate: () => import('./profiles/casemate.ts').then((mod) => {
    const { strv103: _swedenOwnsStrv103, ...profiles } = mod.CASEMATE_PROFILES;
    registerProfiles(profiles);
  }),
  merkava: () => import('./profiles/merkava.ts').then((mod) => registerProfiles(mod.MERKAVA_PROFILES)),
  afv: () => Promise.all([
    import('./profiles/afvFamily.ts'),
    import('./profiles/pumaS1.ts'),
    import('./profiles/type89LightTiger.ts'),
  ])
    .then(([family, pumaS1, type89LightTiger]) => registerProfiles({
      ...family.AFV_FAMILY_PROFILES,
      ...pumaS1.PUMA_S1_PROFILES,
      ...type89LightTiger.TYPE89_LIGHT_TIGER_PROFILES,
    })),
  korea: () => import('./profiles/korea.ts').then((mod) => registerProfiles(mod.KOREA_PROFILES)),
  japan: () => import('./profiles/japan.ts').then((mod) => registerProfiles(mod.JAPAN_PROFILES)),
  germany: () => import('./profiles/germany.ts').then((mod) => registerProfiles(mod.GERMANY_PROFILES)),
  sheridan: () => import('./profiles/sheridan.ts').then((mod) => registerProfiles(mod.SHERIDAN_PROFILES)),
} satisfies Record<FleetGroup, GroupLoader>);
const groupPromises = new Map<FleetGroup, Promise<void>>();
const readyGroups = new Set<FleetGroup>();
const tankSpecs = TANK_SPECS;

function ensureGroup(group: FleetGroup | undefined): Promise<void> {
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

export function ensureTankBuilder(specId: string): Promise<void> {
  return Promise.all([
    ensureGroup(FLEET_GROUP_BY_ID[specId]),
    ensureVehicleMarkingSeats(specId),
    ensureCombatAnatomyCalibration(specId),
  ]).then(() => {
    finalizeCombatAnatomy(tankSpecs[specId]);
  });
}

export function ensureTankBuilders(specIds: readonly string[]): Promise<void> {
  const groups = new Set<FleetGroup>();
  for (const id of specIds || []) {
    const group = FLEET_GROUP_BY_ID[id];
    if (group) groups.add(group);
  }
  return Promise.all([
    ...[...groups].map(ensureGroup),
    ensureVehicleMarkingSeatsForIds(specIds),
    ensureCombatAnatomyCalibrations(specIds),
  ]).then(() => {
    for (const id of specIds || []) finalizeCombatAnatomy(tankSpecs[id]);
  });
}

export function ensureFullFleet(): Promise<void> {
  return Promise.all([
    ...(Object.keys(GROUP_LOADERS) as FleetGroup[]).map(ensureGroup),
    ensureAllVehicleMarkingSeatGroups(),
    ensureAllCombatAnatomyGroups(),
  ]).then(() => {
    for (const id of SAVED_TANK_IDS) finalizeCombatAnatomy(tankSpecs[id]);
  });
}

export function isTankBuilderReady(specId: string): boolean {
  const group = FLEET_GROUP_BY_ID[specId];
  return factoryReady
    && (!group || readyGroups.has(group))
    && isVehicleMarkingSeatsReady(specId)
    && isCombatAnatomyCalibrationReady(specId);
}

export function createTank(
  specId: string,
  engineCtx: unknown,
  opts: CreateTankOptions = {},
): TankVisual {
  if (!isTankBuilderReady(specId)) {
    throw new Error(`Tank builder '${specId}' is not loaded; await ensureTankBuilder('${specId}')`);
  }
  return createTankCore(specId, engineCtx, opts);
}

export { KIT } from './tankFactoryCore.ts';
