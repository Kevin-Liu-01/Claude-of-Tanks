// Browser-facing procedural fleet facade. The roster registry remains eager:
// the shared ordered registration (fleetRegistration.ts) registers every spec
// and runs the registration passes before anything else here evaluates.
// Authored visual families and canonical packs that do not participate in the
// opening vehicle are registered only when a concrete tank id requests them.
import './fleetRegistration.ts';
import {
  configureTankFactory,
  createTank as createTankCore,
  createTankSteps as createTankCoreSteps,
  registerCanonicalBuilders,
  registerProfiledBuilders,
  type DecorPlanner,
  type TankBuildStep,
} from './tankFactoryCore.ts';
import { FLEET_GROUP_BY_ID, type FleetGroup } from './fleetManifest.ts';
import {
  ensureAllVehicleMarkingSeatGroups,
  ensureVehicleMarkingSeats,
  ensureVehicleMarkingSeatsForIds,
  isVehicleMarkingSeatsReady,
} from './vehicleMarkingSeatLoader.ts';
import { ensureAllInteriorFills, ensureInteriorFills } from './interiorFills.ts';
import {
  ensureAllCombatAnatomyGroups,
  ensureCombatAnatomyCalibration,
  ensureCombatAnatomyCalibrations,
  isCombatAnatomyCalibrationReady,
} from './combatAnatomyCalibrationLoader.ts';
import { finalizeCombatAnatomy } from './combatAnatomy.ts';
import { ABRAMS_SOURCE_X_IDS } from './abramsSourceXSpecs.ts';
import { SAVED_TANK_IDS, TANK_SPECS } from './specs.ts';
import {
  createProfileBuilders,
  type ProfileBuildFunctions,
  type VehicleProfileRecord,
} from './profileBuilderAdapter.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

type GroupLoader = () => Promise<object | void>;
type TankVisual = ReturnType<typeof createTankCore>;

export interface CreateTankOptions {
  camo?: string;
  camoPattern?: string | null;
  camoSeed?: number;
  batchStatic?: boolean;
  battleDetailLod?: boolean;
  decor?: boolean;
  /** stage 2b: where a stepped build's decoration plans (offThreadDecorPlanner); its driver awaits the yielded waits */
  decorPlanner?: DecorPlanner;
  deferStaticBatch?: boolean;
  geometryQuality?: 'high' | 'low';
  geometryReceipt?: boolean;
  eraVisualBindingReceipt?: boolean;
  materialMode?: 'rendered' | 'geometry-only';
  proceduralOnly?: boolean;
  quality?: 'high' | 'ai' | 'low' | 'preview';
  staticPreview?: boolean;
  staticDrawMerge?: 'off' | 'identity' | 'translations' | 'dual';
}

/** (perf-252, from rosterState) The geometry tier of a BATTLE build — the battle roster's and the multiplayer seats'
 * (battlePresentation seatVisualOptions); the Garage and the Studio use their own builders: the player's own tank at
 * full geometry on a desktop, every other tank and every phone build at low. */
export function battleGeometryQuality(playerActor: boolean, deviceTier: string): NonNullable<CreateTankOptions['geometryQuality']> {
  return !playerActor || deviceTier === 'mobile' ? 'low' : 'high';
}

/**
 * The P21 static merge a BATTLE build takes (the battle roster's builds and the multiplayer seats'; never the Garage,
 * Gallery or hero builds): 'dual' for every vehicle (coordinator rulings 2026-10-24, perf-250/254): the identity build
 * exactly, plus far copies of its same-key parts, drawn only past ~30 m of screen-equivalent distance (tankFactoryCore
 * FAR_MERGE_ENTER_M). The player's own hull, a spectated or ridden one, a killcam subject and anything the camera comes
 * near draw byte-for-byte as the identity build; at range the copies fold the roof stations, gun rigs and loader guns
 * (a SEPv3 bot 112 -> 50 draws, a Leopard 2A7V 100 -> 65; the CPU render pairs at 50 m moved at most 12 px).
 * `?staticmerge=` (off | identity | translations | dual) still selects one mode for every build, for the probes'
 * same-build pairs.
 */
export function battleStaticDrawMerge(_specId: string): NonNullable<CreateTankOptions['staticDrawMerge']> {
  const requested = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('staticmerge') : null;
  if (requested === 'off' || requested === 'identity' || requested === 'translations' || requested === 'dual') return requested;
  return 'dual';
}

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
  nationalModernization: () => import('./profiles/nationalModernization.ts').then(mod => registerProfiles(mod.NATIONAL_MODERNIZATION_PROFILES)),
  sinoSovietConcepts: () => import('./profiles/sinoSovietConcepts.ts').then(mod => registerProfiles(mod.SINO_SOVIET_CONCEPT_PROFILES)),
  t72Rys: () => import('./profiles/t72Rys.ts').then(mod => registerProfiles({t72_rys:{build:mod.buildT72Rys}})),
  aresApcX: () => import('./profiles/aresApcX.ts').then((mod) => registerProfiles(mod.ARES_APC_X_PROFILES)),
  // 264: the group's Leopard 2A6 UA builds the 2A6 and adds its field kit
  leopardA6X: () => Promise.all([import('./profiles/leopardA6X.ts'), import('./profiles/leopardA6Ua.ts')])
    .then(([a6, ua]) => registerProfiles({ ...a6.LEOPARD_A6_X_PROFILES, ...ua.LEOPARD_A6_UA_PROFILES })),
  xk2: () => import('./profiles/xk2.ts').then((mod) => registerProfiles(mod.XK2_PROFILES)),
  k1a1X: () => import('./profiles/k1a1X.ts').then((mod) => registerProfiles(mod.K1A1_X_PROFILES)),
  amx30X: () => import('./profiles/amx30X.ts').then((mod) => registerProfiles(mod.AMX30_X_PROFILES)),
  t62mv1X: () => import('./profiles/t62mv1X.ts').then((mod) => registerProfiles(mod.T62MV1_X_PROFILES)),
  t72b1987X: () => import('./profiles/t72b1987X.ts').then((mod) => registerProfiles(mod.T72B1987_X_PROFILES)),
  t80uX: () => import('./profiles/t80uX.ts').then((mod) => registerProfiles(mod.T80U_X_PROFILES)),
  t72b3X: () => import('./profiles/t72b3X.ts').then((mod) => registerProfiles(mod.T72B3_X_PROFILES)),
  jagdpanzerE100X: () => import('./profiles/jagdpanzerE100X.ts').then((mod) => registerProfiles(mod.JPZE100_X_PROFILES)),
  type10X: () => import('./profiles/type10X.ts').then((mod) => registerProfiles(mod.TYPE10_X_PROFILES)),
  type90X: () => import('./profiles/type90X.ts').then((mod) => registerProfiles(mod.TYPE90_X_PROFILES)),
  christian2: () => import('./profiles/christian2.ts').then((mod) => registerProfiles(mod.CHRISTIAN2_PROFILES)),
  leopard2a3B4: () => import('./profiles/leopard2a3B4.ts').then((mod) => registerProfiles(mod.LEOPARD2A3B4_PROFILES)),
  leopard2a4Family: () => import('./profiles/leopard2A4Family.ts').then((mod) => registerProfiles(mod.LEOPARD2A4_FAMILY_PROFILES)),
  denmark: () => import('./profiles/denmark.ts').then((mod) => registerProfiles(mod.DENMARK_PROFILES)),
  brazil: () => import('./profiles/brazil.ts').then((mod) => registerProfiles(mod.BRAZIL_PROFILES)),
  m41: () => import('./profiles/m41.ts').then((mod) => registerProfiles(mod.M41_PROFILES)),
  amx40X: () => import('./profiles/amx40X.ts').then((mod) => registerProfiles(mod.AMX40_X_PROFILES)),
  arieteX: () => import('./profiles/arieteX.ts').then((mod) => registerProfiles(mod.ARIETE_X_PROFILES)),
  strv122X: () => import('./profiles/strv122X.ts').then((mod) => registerProfiles(mod.STRV122_X_PROFILES)),
  t72b3mX: () => import('./profiles/t72b3mX.ts').then((mod) => registerProfiles(mod.T72B3M_X_PROFILES)),
  challenger1X: () => import('./profiles/challenger1X.ts').then((mod) => registerProfiles(mod.CHALLENGER1_X_PROFILES)),
  t72buX: () => import('./profiles/t72buX.ts').then((mod) => registerProfiles(mod.T72BU_X_PROFILES)),
  chieftain5X: () => import('./profiles/chieftain5X.ts').then((mod) => registerProfiles(mod.CHIEFTAIN5_X_PROFILES)),
  t90AwX: () => import('./profiles/t90AwX.ts').then((mod) => registerProfiles(mod.T90_AW_X_PROFILES)),
  t90BurlakX: () => import('./profiles/t90BurlakX.ts').then((mod) => registerProfiles(mod.T90_BURLAK_X_PROFILES)),
  griffinViper: () => import('./profiles/griffinViper.ts').then(mod => registerProfiles(mod.GRIFFIN_VIPER_PROFILES)),
  tos1aTagil: () => import('./profiles/tos1aTagil.ts').then(mod => registerProfiles(mod.TOS1A_TAGIL_PROFILES)),
  t90msX: () => import('./profiles/t90msX.ts').then((mod) => registerProfiles(mod.T90MS_X_PROFILES)),
  leclercX: () => import('./profiles/leclercX.ts').then((mod) => registerProfiles(mod.LECLERC_X_PROFILES)),
  leclercClassicX: () => import('./profiles/leclercClassicX.ts').then((mod) => registerProfiles(mod.LECLERC_CLASSIC_X_PROFILES)),
  chieftain10X: () => import('./profiles/chieftain10X.ts').then((mod) => registerProfiles(mod.CHIEFTAIN10_X_PROFILES)),
  leopardX: () => import('./profiles/leopardX.ts').then((mod) => registerProfiles(mod.LEOPARD_X_PROFILES)),
  t90X: () => import('./profiles/t90X.ts').then((mod) => registerProfiles(mod.T90_X_PROFILES)),
  merkavaX: () => import('./profiles/merkavaX.ts').then((mod) => registerProfiles(mod.MERKAVA_X_PROFILES)),
  k2X: () => import('./profiles/k2X.ts').then((mod) => registerProfiles(mod.K2_X_PROFILES)),
  kf51X: () => import('./profiles/kf51X.ts').then((mod) => registerProfiles(mod.KF51_X_PROFILES)),
  t14X: () => import('./profiles/t14X.ts').then((mod) => registerProfiles(mod.T14_X_PROFILES)),
  kurganetsX: () => import('./profiles/kurganetsX.ts')
    .then((mod) => registerProfiles(mod.KURGANETS_X_PROFILES)),
  fv510MilanX: () => import('./profiles/fv510MilanX.ts').then(mod => registerProfiles({ warrior_tes_h: { build: mod.buildFv510MilanX } })),
  griffin50X: () => import('./profiles/griffin50X.ts').then(mod => registerProfiles({ griffin50mm: { build: mod.buildGriffin50X } })),
  ajaxX: () => import('./profiles/ajaxX.ts').then(mod => registerProfiles({ ajax: { build: mod.buildAjaxX } })),
  aft10X: () => import('./profiles/aft10X.ts').then(mod => registerProfiles({ aft10: { build: mod.buildAft10X } })),
  bmp3mDragun125X: () => import('./profiles/bmp3mDragun125X.ts').then(mod => registerProfiles({ bmp3m_dragun125: { build: mod.buildBmp3mDragun125X } })),
  k21X: () => import('./profiles/k21X.ts').then(mod => registerProfiles({ k21: { build: mod.buildK21X } })),
  type96bX: () => import('./profiles/type96bX.ts').then(mod => registerProfiles({ type96b: { build: mod.buildType96bX } })),
  kf41LynxSourceX: () => import('./profiles/kf41LynxSourceX.ts').then(mod => registerProfiles({ kf41_lynx: { build: mod.buildKf41LynxX } })),
  m6Linebacker: () => import('./profiles/m6Linebacker.ts').then(mod => registerProfiles({ m6_linebacker: { build: mod.buildM6Linebacker } })),
  marder2: () => import('./profiles/marder2.ts').then(mod => registerProfiles({ marder2: { build: mod.buildMarder2 } })),
  amx10p: () => import('./profiles/amx10p.ts').then(mod => registerProfiles({ amx10p: { build: mod.buildAmx10p }, amx10p_25: { build: mod.buildAmx10p } })),
  dardo: () => import('./profiles/dardo.ts').then(mod => registerProfiles({ dardo: { build: mod.buildDardo } })),
  lrmvLynx: () => import('./profiles/lrmvLynx.ts').then(mod => registerProfiles({ lrmv_lynx: { build: mod.buildLrmvLynx } })),
  borsuk: () => import('./profiles/borsuk.ts').then(mod => registerProfiles({ borsuk: { build: mod.buildBorsuk } })),
  pumaS1SourceX: () => import('./profiles/pumaS1SourceX.ts').then(mod => registerProfiles({ puma_s1: { build: mod.buildPumaS1X } })),
  cv9040CSourceX: () => import('./profiles/cv9040CSourceX.ts').then(mod => registerProfiles({ cv9040c: { build: mod.buildCv9040CX }, ua_cv9040c: { build: (P: Parameters<typeof mod.buildCv9040CX>[0]) => mod.buildCv9040CX(P, { ukrainian: true }) } })),
  type89SourceX: () => import('./profiles/type89SourceX.ts').then(mod => registerProfiles({ type89: { build: mod.buildType89X } })),
  cv90MkivSourceX: () => import('./profiles/cv90MkivSourceX.ts').then(mod => registerProfiles({ cv90_mk4: { build: mod.buildCv90MkivX } })),
  cv90105TmlSourceX: () => import('./profiles/cv90105TmlSourceX.ts').then(mod => registerProfiles({ cv90105_tml: { build: mod.buildCv90105TmlX } })),
  sabraMk2SourceX: () => import('./profiles/sabraMk2SourceX.ts').then(mod => registerProfiles({ sabra_mk2: { build: mod.buildSabraMk2X } })),
  modern2: () => Promise.all([
    import('./modern2.ts'),
    import('./profiles/china.ts'),
    import('./profiles/chineseFrontline.ts'),
    import('./profiles/object695X.ts'),
  ])
    .then(([canonical, profiles, frontline, object695]) => {
      registerCanonicalBuilders('modern2', canonical.MODERN2_BUILDERS);
      registerProfiles({ ...profiles.CHINA_PROFILES, ...frontline.CHINESE_FRONTLINE_PROFILES, ...object695.OBJECT695_X_PROFILES });
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
  t90_1992: () => import('./profiles/t90.ts').then((mod) => registerProfiles(mod.T90_PROFILES)),
  russia: () => import('./profiles/russia.ts').then((mod) => registerProfiles(mod.RUSSIA_PROFILES)),
  t72: () => import('./profiles/t72.ts').then((mod) => registerProfiles(mod.T72_PROFILES)),
  t80: () => import('./profiles/t80.ts').then((mod) => registerProfiles(mod.T80_PROFILES)),
  ukraine: () => import('./profiles/ukraine.ts').then((mod) => registerProfiles(mod.UKRAINE_PROFILES)),
  poland: () => import('./profiles/poland.ts').then((mod) => registerProfiles(mod.POLAND_PROFILES)),
  abrams: () => import('./profiles/abrams.ts').then((mod) => registerProfiles(mod.ABRAMS_PROFILES)),
  abramsSourceX: () => import('./profiles/abramsSourceX.ts').then((mod) => registerProfiles(
    Object.fromEntries(ABRAMS_SOURCE_X_IDS.map((id) => [id, { build: mod.buildAbramsX }])),
  )),
  patton: () => import('./profiles/patton.ts').then((mod) => registerProfiles(mod.PATTON_PROFILES)),
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
    ensureInteriorFills([specId]),
  ]).then(() => {
    finalizeCombatAnatomy(tankSpecs[specId]);
  });
}

let ridingPartsPrebuildAsked = false;

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
    ensureInteriorFills(specIds),
  ]).then(() => {
    for (const id of specIds || []) finalizeCombatAnatomy(tankSpecs[id]);
    // the first ask for builders ahead of their builds starts the riding stations' off-thread prebuild, these tanks
    // first (UI-LOCKDOWN E): every such ask comes after the Garage's first tank, and its chunk loads only here
    if (!ridingPartsPrebuildAsked && typeof Worker === 'function') {
      ridingPartsPrebuildAsked = true;
      void import('./ridingPartsPrebuild.ts').then(({ startRidingPartsPrebuild }) => startRidingPartsPrebuild(specIds), () => {});
    }
  });
}

export function ensureFullFleet(): Promise<void> {
  return Promise.all([
    ...(Object.keys(GROUP_LOADERS) as FleetGroup[]).map(ensureGroup),
    ensureAllVehicleMarkingSeatGroups(),
    ensureAllCombatAnatomyGroups(),
    ensureAllInteriorFills(),
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
  engineCtx: RuntimeValue,
  opts: CreateTankOptions = {},
): TankVisual {
  if (!isTankBuilderReady(specId)) {
    throw new Error(`Tank builder '${specId}' is not loaded; await ensureTankBuilder('${specId}')`);
  }
  return createTankCore(specId, engineCtx, opts);
}

/** Demand-ready private construction; callers must close abandoned iterators. */
export function createTankSteps(
  specId: string,
  engineCtx: RuntimeValue,
  opts: CreateTankOptions = {},
): Generator<TankBuildStep, TankVisual, void> {
  if (!isTankBuilderReady(specId)) {
    throw new Error(`Tank builder '${specId}' is not loaded; await ensureTankBuilder('${specId}')`);
  }
  return createTankCoreSteps(specId, engineCtx, opts);
}

/**
 * Stage 2b pass 1 (UI-LOCKDOWN E): the decor worker's planner, for a stepped build whose driver awaits the waits it
 * yields (the Garage pedestal, the battle streamer); null where no Worker runs (the Node tools). Asking for it starts the
 * client and the worker, so they load while the core builds ahead of its decoration; a failed load or worker falls
 * back to the in-line pass for that tank.
 */
export function offThreadDecorPlanner(): DecorPlanner | null {
  if (typeof Worker !== 'function') return null;
  const client = import('./decorPlanClient.ts');
  client.then(({ startDecorWorker }) => startDecorWorker(), () => {});
  return (args) => client.then(({ planDecoration }) => planDecoration(args));
}

export { KIT } from './tankFactoryCore.ts';
