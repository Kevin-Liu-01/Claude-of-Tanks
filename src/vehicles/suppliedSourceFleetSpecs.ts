import { isFleetBalanceFinalized } from './fleetBalanceState.ts';
// Owner-supplied September 2026 comparison builds. The source files are
// quarantined authoring inputs; playable geometry remains first-party and
// procedural in independent profile modules.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import {
  bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import { vehicleEraForId } from './taxonomy.ts';
import { restoreInstalledVehicleFrame } from './vehicleSizePolicy.ts';
import { ADDITIONAL_SUPPLIED_SOURCE_STUDIES } from './suppliedSourceStudyIndex.ts';
import { createType99Armor } from './profiles/type99Armor.ts';
import { applyFleetLauncherMuzzles } from './fleetLauncherMuzzles.ts';
import { GRIFFIN_HULL_LENGTH_M, GRIFFIN_TURRET_PIVOT, GRIFFIN_TURRET_SCALE as GRIFFIN_T } from './profiles/griffinProportions.ts';

const entries = [
  ['kurganets25', 'spz_wotan', 'Kurganets-25', 'Russia', 'ifv'],
  ...ADDITIONAL_SUPPLIED_SOURCE_STUDIES.map(({ id, donor, name, nation, role }) =>
    [id, donor, name, nation, role] as const),
] as const;

export const SUPPLIED_SOURCE_IDS = Object.freeze(entries.map(([id]) => id));

const dimensions: Readonly<Record<string, FleetDimensions>> = Object.freeze({
  ...Object.fromEntries(ADDITIONAL_SUPPLIED_SOURCE_STUDIES.map(study => [study.id, study.dimensions])),
  kurganets25: {
    hullLengthM: 7.4648,
    overallLengthM: 7.4883,
    widthM: 4.12977,
    heightM: 3.6166,
    silhouetteHullLengthM: 7.4648,
    silhouetteOverallLengthM: 7.4883,
    silhouetteWidthM: 4.12977,
    silhouetteHeightM: 4.17415,
  },
});

type SourceFrame = {
  readonly turret: readonly [number, number, number];
  readonly gun: readonly [number, number, number];
  readonly muzzleZ: number;
};

const sourceFrames: Readonly<Record<string, SourceFrame>> = Object.freeze({
  ...Object.fromEntries(ADDITIONAL_SUPPLIED_SOURCE_STUDIES.map(study => [study.id, {
    turret: study.turret, gun: study.gun, muzzleZ: study.muzzleZ,
  }])),
  kurganets25: {
    turret: [0, 2.21, -1.27],
    gun: [-.004, 2.917, -.68],
    muzzleZ: 1.77,
  },
});

/** The fleet Type 96B's mechanical gun clearance (absolute turret yaw, minimum pitch, degrees; gunPitchLimits.ts).
 * Release 227: with its mantlet boot clipped clear of the hull (type96bX.ts TYPE96B_BOOT_FLOOR), the whole-gun sweep
 * over this hull clears full depression through 142.5 degrees of traverse; beyond, the barrel enters the rear deck's
 * panels and louvre caps below -4.75 (145), -2 (160) and -3.5 (180) degrees. The rear arc stops at -1 degree, at least
 * 1 degree above every measured station (type96MantletClearance.selftest.mjs sweeps it). The 2026-10-20 follow-up
 * (tools/gun-depression-sweep.mjs: the whole gun 26 mm off every hull mesh, nets included, at every degree) holds that
 * curve and adds where it was short: the hull net and the side rubber at 22-32 (-6.5) and the deck's grilles and its
 * leaves from 133, up to +0.6 at 147-152 (nationalGunClearance.selftest.mjs). */
const TYPE96B_GUN_PITCH_BY_YAW_DEG = Object.freeze([[0,-7],[21,-7],[25,-6.7],[28,-6.5],[31,-6.5],[33,-7],[133,-7],[134,-6],[135,-5.4],
  [140,-4.9],[141,-4.1],[142,-2.7],[143,-1.4],[145,-0.5],[147,0.1],[148,0.6],[151,0.6],[152,0.5],[155,-1],[156,-0.6],[157,-0.5],
  [163,-0.4],[169,-0.4],[175,-0.8],[176,-0.6],[178,-0.6],[179,-0.7],[180,-1]] as const);

function applySourceFrame(spec: FleetTankSpec, id: string): void {
  if (['type96b', 'aft10', 'sabra_mk2'].includes(id)) {
    // These source configurations author permanent shell/service panels, not
    // reactive cassettes (see their source packets). Their balance peers'
    // ERA zones have no removable native counterpart on these models.
    // Apply at registration AND post-balance synchronization; retain every
    // permanent plate and never mutate the donor's reactive protection.
    spec.armor.hullPlates = spec.armor.hullPlates.filter(plate => plate.kind !== 'era');
    spec.armor.turretPlates = spec.armor.turretPlates.filter(plate => plate.kind !== 'era');
  }
  const frame = id === 'griffin50mm' ? {
    turret: GRIFFIN_TURRET_PIVOT,
    gun: [0, 2.07 + .53 * GRIFFIN_T, GRIFFIN_TURRET_PIVOT[2] + 1.10 * GRIFFIN_T],
    muzzleZ: GRIFFIN_TURRET_PIVOT[2] + (1.10 + 2.93194) * GRIFFIN_T,
  } : sourceFrames[id];
  spec.armor.turretPivot = [...frame.turret];
  spec.armor.gunPivot = [
    frame.gun[0] - frame.turret[0],
    frame.gun[1] - frame.turret[1],
    frame.gun[2] - frame.turret[2],
  ];
  spec.armor.gunBarrel.lengthM = frame.muzzleZ - frame.gun[2];
  if (id === 'type96b') spec.gunPitchByYawDeg = TYPE96B_GUN_PITCH_BY_YAW_DEG;
  // the Bumerang-BM's 2A42 barrel (coordinator ruling 2026-10-15: the turret is the Bumerang-BM, so its gun is the 30 mm
  // 2A42, not a 57 mm)
  if (id === 'kurganets25') spec.armor.gunBarrel.radiusM = .05;
}

/** Game tuning starts from established fleet peers; the weapon family still
 * follows the supplied vehicle. These are balance values, not real ballistics. */
function applySourceArmament(spec: FleetTankSpec): void {
  const cannonPeers: Readonly<Record<string, string>> = {
    bmp3m_dragun125: 'ztz99a2', cv90105_tml: 'leo1a5', sabra_mk2: 'merkava3_baz',
    griffin50mm: 'cv90_mk4_concept', kf41_lynx: 'raiju_ifv', cv90_mk4: 'raiju_ifv',
  };
  const peer = cannonPeers[spec.id];
  if (peer) {
    spec.gun = structuredClone(registries.tankSpecs[peer].gun);
    delete spec.balancePeerOf;
  }
  if (spec.id === 'aft10') {
    // Eight canisters use the existing guided-primary simulation path.
    // Keeping a cannon round from the hull donor would create a phantom gun.
    spec.gun = structuredClone(registries.tankSpecs.m551_sheridan.gun);
    spec.gun.caliberMm = 170;
    const missile = spec.gun.shells[0];
    missile.name = 'HJ-10 guided missile';
    missile.caliberMm = 170;
    missile.count = 8;
    missile.launcherTubes = 8;
    spec.gun.shells = [missile];
    spec.gun.primaryGuided = true;
    spec.gun.fixedLaunchCanisters = true;
    spec.gun.muzzles = [-1.035, -.505, .505, 1.035].flatMap(x =>
      [-.025, .45].map(y => ({ x, y })));
    delete spec.balancePeerOf;
  }
  if (spec.id === 'k21') applyK21Launcher(spec);
  if (spec.id === 'kurganets25') applyKurganetsLaunchers(spec);
  applyAutocannonCaliber(spec);
  if (spec.id === 'ajax') {
    // Ajax has no guided anti-armor channel. Its Tier X peers with missiles
    // must not be judged against its 40 mm cannon alone (or vice versa).
    // This is audit metadata; retain every authored combat statistic.
    spec.balanceCohort = 'cannon-only';
  }
  if (['griffin50mm', 'kf41_lynx'].includes(spec.id)) {
    spec.gun.shells = spec.gun.shells.filter(round => !round.guided);
  }
  if (spec.id === 'bmp3m_dragun125') applyDragunAssaultBalance(spec);
  if (spec.id === 'warrior_tes_h') applyWarriorTesBalance(spec);
  applyGuidedShellLabels(spec);
  // Balance donors own tuning, not physical launch exits. A cannon-only source
  // must not inherit its peer's rack when metadata is synchronized again.
  delete spec.gun.launcherMuzzles;
  applyFleetLauncherMuzzles(spec);
}

/** The Kurganets-25 IFV's Bumerang-BM (B05Ya01 Epokha) module (coordinator ruling 2026-10-15: one real configuration,
 * the 30 mm 2A42 as the primary balance channel, a coaxial 7.62 mm PKTM, drawn) with its two launchers in their own
 * slots: four Kornet-M, two in each twin housing on the turret flanks, and the rear-roof launcher's eight Bulat (owner
 * ruling 2026-10-15: "keep the missiles and kurganets launcher on it ... just make it properly attached"). Bulat's
 * 70 mm nominal caliber is game tuning: the publisher gives no exact caliber. Its soft-target effect reuses the peer HE
 * round, with the existing guided channel's motion, cycle and sound; this is not a thermobaric model. */
function applyKurganetsLaunchers(spec: FleetTankSpec): void {
  const guided = spec.gun.shells.find(round => round.guided);
  const highExplosive = spec.gun.shells.find(round => round.type === 'HE' && !round.guided);
  if (!guided || !highExplosive) throw new Error('Kurganets requires both declared missile and HE balance channels');
  const kornet = { ...structuredClone(guided), name: 'Kornet guided missile', count: 4, launcherTubes: 4 };
  const bulat = {
    ...structuredClone(highExplosive), name: 'Bulat guided missile', caliberMm: 70,
    guided: true, count: 8, launcherTubes: 8, velocityMps: guided.velocityMps,
    reloadS: guided.reloadS, soundProfile: guided.soundProfile,
  };
  spec.gun.shells = [spec.gun.shells[0], kornet, bulat];
}

/** The supplied K21 carries two auxiliary launch canisters. Missile damage,
 * speed and reload use the established Type 89 gameplay channel; they are not
 * claimed measurements of the source hardware. Keep the 40 mm APFSDS and HE
 * channels within the existing three-slot selector and carry two ready rounds. */
function applyK21Launcher(spec: FleetTankSpec): void {
  const peerMissile = registries.tankSpecs.hayate_ifv.gun.shells.find(round => round.guided);
  if (!peerMissile) throw new Error('K21 auxiliary launcher requires the Type 89 guided balance channel');
  const missile = structuredClone(peerMissile);
  missile.name = 'Guided missile';
  missile.count = 2;
  missile.launcherTubes = 2;
  spec.gun.shells = [spec.gun.shells[0], spec.gun.shells[1], missile];
  // The cohort audit independently verifies its five primary-gun/mobility
  // metrics. They remain identical to CV90; the auxiliary slot must not add
  // a duplicate primary-performance vote merely by changing ammunition type.
}

/** Preserve native caliber and distinguish same-type loadout channels. */
function applyAutocannonCaliber(spec: FleetTankSpec): void {
  const autocannonCalibers: Readonly<Record<string, number>> = {
    kurganets25: 30, griffin50mm: 50, ajax: 40, k21: 40, kf41_lynx: 35, cv90_mk4: 50,
  };
  const caliber = autocannonCalibers[spec.id];
  if (caliber) {
    spec.gun.caliberMm = caliber;
    const variants = new Map<string, number>();
    for (const round of spec.gun.shells) {
      if (round.guided) continue;
      round.caliberMm = caliber;
      const count = spec.gun.shells.filter(other => !other.guided && other.type === round.type).length;
      const variant = (variants.get(round.type) ?? 0) + 1;
      variants.set(round.type, variant);
      // Keep distinct loadout channels distinguishable after replacing a
      // balance peer's model-specific ammunition labels with native caliber.
      round.name = `${caliber} mm ${round.type}${count > 1 ? ` ${variant}` : ''}`;
    }
  }
}

function applyDragunAssaultBalance(spec: FleetTankSpec): void {
  // Tier-X light assault gun: trade MBT survivability and moving accuracy
  // for a responsive chassis and a useful stop-and-fire 125 mm cycle.
  // These are deliberate game values, not historical protection claims.
  Object.assign(spec, {
    hp: 1850, enginePowerHp: 816, weightTons: 28,
    topSpeedKmh: 72, reverseSpeedKmh: 30, hullTraverseDegS: 52,
    terrainResistance: { hard: .66, medium: .78, soft: 1.30 },
    pivotStyle: 'neutral', turretTraverseDegS: 44, gunPitchDegS: 30,
    gunElevationDeg: 18, gunDepressionDeg: 8,
  });
  Object.assign(spec.gun, {
    reloadS: 5.4, baseAccuracy: .31, aimTimeS: 1.65,
    bloom: { move: .11, hullRot: .10, turret: .065, afterShot: 2.8 },
  });
  delete spec.gun.autoloader; // continuous single-round feed, no burst magazine
  const load = [24, 10, 6];
  spec.gun.shells.forEach((round, index) => {
    round.name = `125 mm ${round.type}`;
    round.reloadS = 5.4;
    round.count = load[index];
  });
  // Preserve the registered plate geometry and manned layout. Author only
  // thin armor ratings; the chassis donor must not decide this variant's tier.
  const ratings: Readonly<Record<string, readonly [number, number, number]>> = {
    upper_glacis: [45,75,100], lower_front: [30,40,55], hull_side: [25,30,40],
    hull_roof: [18,18,18], turret_cheek: [50,85,115], mantlet: [70,100,130],
    turret_side: [30,40,55], turret_rear: [25,25,25], turret_roof: [20,20,20],
  };
  for (const plate of [...spec.armor.hullPlates, ...spec.armor.turretPlates]) {
    const key = Object.keys(ratings).find(name => plate.name === name || plate.name.startsWith(`${name}_`));
    if (key) [plate.physicalMm, plate.keMm, plate.ceMm] = ratings[key];
  }
  delete spec.balancePeerOf;
}

/**
 * The Tier X Warrior TES(H) (FLEET_BALANCE_REVISION.warrior_tes_h; coordinator ruling 2026-10-13 on the owner's
 * "new warrior type ... tier 10"): TES(H) add-on armour and a hotter L14A2 APDS load over the Tier IX FV510 Warrior
 * MILAN it is tuned from, so it meets the modern Tier X IFV floor. The MILAN stays at 850 mm.
 */
function applyWarriorTesBalance(spec: FleetTankSpec): void {
  spec.hp = 2300;
  Object.assign(spec.gun.shells[0], { pen100Mm: 150, pen1000Mm: 135, pen2000Mm: 120 });
  delete spec.balancePeerOf; // no longer combat-equivalent to its donor, so it votes in its own peer medians
}

/** Preserve source weapon labels after peer and caliber adaptation. */
function applyGuidedShellLabels(spec: FleetTankSpec): void {
  if (spec.id !== 'warrior_tes_h' && spec.id !== 'cv90_mk4') return;
  const isMilan = spec.id === 'warrior_tes_h';
  for (const round of spec.gun.shells) {
    if (!round.guided) continue;
    round.name = isMilan ? 'MILAN guided missile' : 'Guided missile';
    round.launcherTubes = isMilan ? 1 : 2;
    if (isMilan) round.caliberMm = 115;
  }
}

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

/** Release 233: the Type 96B X's donor frame is the Longwei's retired VT-derivative envelope and gameplay size, frozen
 * when the Longwei was rebuilt (profiles/longwei.ts), so its hit zones do not follow the new Longwei turret. */
const TYPE96B_FRAME_DIMS: FleetDimensions = Object.freeze({ hullLengthM: 7.76, overallLengthM: 11.66, widthM: 3.7, heightM: 3.16 });

/** The armor frame and size a study is fitted from: its structure donor's, or a frozen frame. */
function structureFrame(id: string, donorId: string): Pick<FleetTankSpec, 'armor' | 'dims'> {
  if (id === 'type96b') return { armor: createType99Armor('type96b_frame'), dims: TYPE96B_FRAME_DIMS };
  return registries.tankSpecs[id === 'kurganets25' ? 'spz_puma' : donorId];
}

const specs: Record<string, FleetTankSpec> = {};
for (const [id, donorId, name, nation, role] of entries) {
  const spec = cloneFleetVariant(registries.tankSpecs, id, donorId, {
    name, nation, era: vehicleEraForId(id) ?? 'modern', role,
  });
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  spec.balancePeerOf = donorId;
  stripSilhouetteDimensions(spec.dims);
  // The tier-X peer owns combat tuning, not the already fitted source armor frame.
  const structure = structureFrame(id, donorId);
  spec.armor = structuredClone(structure.armor);
  const donorDimensions = { ...structure.dims };
  Object.assign(spec.dims, dimensions[id]);
  if (id === 'griffin50mm') Object.assign(spec.dims, {
    hullLengthM: GRIFFIN_HULL_LENGTH_M, overallLengthM: GRIFFIN_HULL_LENGTH_M,
    heightM: 2.07 + (3.75 - 2.07) * GRIFFIN_T,
    silhouetteHullLengthM: GRIFFIN_HULL_LENGTH_M, silhouetteOverallLengthM: GRIFFIN_HULL_LENGTH_M,
    silhouetteHeightM: 2.07 + (3.75 - 2.07) * GRIFFIN_T,
  });
  fitArmorToDims(spec.armor, donorDimensions, spec.dims);
  applySourceFrame(spec, id);
  spec.visual = {
    ...spec.visual,
    scheme: id === 'kurganets25' ? 'russian-digital' : 'pla-digital',
    base: id === 'kurganets25' ? '#58634b' : '#506145',
    weather: id === 'kurganets25' ? '#6a705d' : '#667357',
    patches: id === 'kurganets25'
      ? ['#333c32', '#76725a', '#444b3d']
      : ['#2f3e31', '#788064', '#424b3c'],
    marking: id === 'kurganets25' ? 'russian' : 'pla',
    number: id === 'kurganets25' ? 'K-25' : 'OD-20',
    trackWidthM: id === 'kurganets25' ? 0.44 : 0.56,
  };
  const study = ADDITIONAL_SUPPLIED_SOURCE_STUDIES.find(study => study.id === id);
  if (study) {
    // Keep each balance peer's established paint vocabulary, independently
    // measured track width, and a separate procedural visual identity.
    spec.visual = { ...structuredClone(registries.tankSpecs[donorId].visual), trackWidthM: study.trackWidthM };
  }
  specs[id] = spec;
}
registerFleetSpecs(registries, SUPPLIED_SOURCE_IDS, specs);
for (const id of SUPPLIED_SOURCE_IDS) applySourceArmament(registries.tankSpecs[id]);

/** Copy only current combat tuning from the chosen balance peer. Geometry,
 * dimensions, identity, armor frame and presentation records remain native. */
export function synchronizeSuppliedSourceCombatMetadata(): void {
  // Combat donor synchronization is initialization-only once final role tuning is published.
  if (isFleetBalanceFinalized(registries.tankSpecs)) return;
  const fields = [
    'hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
    'hullTraverseDegS', 'terrainResistance', 'pivotStyle', 'turretTraverseDegS',
    'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'gun',
  ] as const;
  for (const [id, donorId] of entries) {
    const target = registries.tankSpecs[id], donor = registries.tankSpecs[donorId];
    for (const field of fields) Object.assign(target, { [field]: structuredClone(donor[field]) });
    target.balancePeerOf = donorId;
    const structure = structureFrame(id, donorId);
    target.armor = structuredClone(structure.armor);
    fitArmorToDims(target.armor, structure.dims, target.dims);
    applySourceFrame(target, id);
    applySourceArmament(target);
    restoreInstalledVehicleFrame(target);
  }
}
