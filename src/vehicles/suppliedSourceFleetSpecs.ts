// Owner-supplied September 2026 comparison builds. The source files are
// quarantined authoring inputs; playable geometry remains first-party and
// procedural in independent profile modules.
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS, fitArmorToDims } from './specs.ts';
import {
  bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions,
} from './fleetSpecRegistry.ts';
import type { FleetDimensions, FleetTankSpec } from './specContracts.ts';
import { vehicleEraForId } from './taxonomy.ts';
import { ADDITIONAL_SUPPLIED_SOURCE_STUDIES } from './suppliedSourceStudyIndex.ts';

const entries = [
  ['kurganets25_x', 'spz_puma_s1', 'Kurganets-25', 'Russia', 'ifv'],
  ...ADDITIONAL_SUPPLIED_SOURCE_STUDIES.map(({ id, donor, name, nation, role }) =>
    [id, donor, name, nation, role] as const),
] as const;

export const SUPPLIED_SOURCE_IDS = Object.freeze(entries.map(([id]) => id));
export const SUPPLIED_SOURCE_DONORS = Object.freeze(
  Object.fromEntries(entries.map(([id, donor]) => [id, donor])),
);

const dimensions: Readonly<Record<string, FleetDimensions>> = Object.freeze({
  ...Object.fromEntries(ADDITIONAL_SUPPLIED_SOURCE_STUDIES.map(study => [study.id, study.dimensions])),
  kurganets25_x: {
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
  kurganets25_x: {
    turret: [0, 2.21, -1.27],
    gun: [-.004, 2.917, -.68],
    muzzleZ: .857,
  },
});

function applySourceFrame(spec: FleetTankSpec, id: string): void {
  if (['type96b_x', 'aft10_x', 'sabra_mk2_x'].includes(id)) {
    // These source configurations author permanent shell/service panels, not
    // reactive cassettes (see their source packets). Their balance peers'
    // ERA zones have no removable native counterpart on these models.
    // Apply at registration AND post-balance synchronization; retain every
    // permanent plate and never mutate the donor's reactive protection.
    spec.armor.hullPlates = spec.armor.hullPlates.filter(plate => plate.kind !== 'era');
    spec.armor.turretPlates = spec.armor.turretPlates.filter(plate => plate.kind !== 'era');
  }
  const frame = sourceFrames[id];
  spec.armor.turretPivot = [...frame.turret];
  spec.armor.gunPivot = [
    frame.gun[0] - frame.turret[0],
    frame.gun[1] - frame.turret[1],
    frame.gun[2] - frame.turret[2],
  ];
  spec.armor.gunBarrel.lengthM = frame.muzzleZ - frame.gun[2];
}

/** Game tuning starts from established fleet peers; the weapon family still
 * follows the supplied vehicle. These are balance values, not real ballistics. */
function applySourceArmament(spec: FleetTankSpec): void {
  const cannonPeers: Readonly<Record<string, string>> = {
    bmp3m_dragun125_x: 'ztz99a2', cv90105_tml_x: 'leo1a5', sabra_mk2_x: 'merkava3d',
    griffin50_x: 'cv90_mkiv', kf41_lynx_x: 'type89_light_tiger', cv90_mkiv_x: 'type89_light_tiger',
  };
  const peer = cannonPeers[spec.id];
  if (peer) {
    spec.gun = structuredClone(registries.tankSpecs[peer].gun);
    delete spec.balancePeerOf;
  }
  if (spec.id === 'aft10_x') {
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
  if (spec.id === 'k21_x') applyK21Launcher(spec);
  if (spec.id === 'kurganets25_x') applyKurganetsLaunchers(spec);
  applyAutocannonCaliber(spec);
  if (['griffin50_x', 'kf41_lynx_x'].includes(spec.id)) {
    spec.gun.shells = spec.gun.shells.filter(round => !round.guided);
  }
  if (spec.id === 'bmp3m_dragun125_x') applyDragunAssaultBalance(spec);
  applyGuidedShellLabels(spec);
}

/** The supplied Epokha turret has four Kornet and eight visible Bulat tubes.
 * Keep the primary balance channel and expose both launchers in three slots.
 * Bulat's 70 mm nominal caliber is game tuning: the publisher gives no exact
 * caliber. Its soft-target effect reuses the peer HE round, with the existing
 * guided channel's motion, cycle and sound; this is not a thermobaric model. */
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
  const peerMissile = registries.tankSpecs.type89.gun.shells.find(round => round.guided);
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
    kurganets25_x: 57, griffin50_x: 50, ajax_x: 40, k21_x: 40, kf41_lynx_x: 35, cv90_mkiv_x: 50,
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

/** Preserve source weapon labels after peer and caliber adaptation. */
function applyGuidedShellLabels(spec: FleetTankSpec): void {
  if (spec.id !== 'fv510_milan_x' && spec.id !== 'cv90_mkiv_x') return;
  const isMilan = spec.id === 'fv510_milan_x';
  for (const round of spec.gun.shells) {
    if (!round.guided) continue;
    round.name = isMilan ? 'MILAN guided missile' : 'Guided missile';
    round.launcherTubes = isMilan ? 1 : 2;
    if (isMilan) round.caliberMm = 115;
  }
}

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
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
  const structure = registries.tankSpecs[id === 'kurganets25_x' ? 'spz_puma' : donorId];
  spec.armor = structuredClone(structure.armor);
  const donorDimensions = { ...structure.dims };
  Object.assign(spec.dims, dimensions[id]);
  fitArmorToDims(spec.armor, donorDimensions, spec.dims);
  applySourceFrame(spec, id);
  spec.visual = {
    ...spec.visual,
    scheme: id === 'kurganets25_x' ? 'russian-digital' : 'pla-digital',
    base: id === 'kurganets25_x' ? '#58634b' : '#506145',
    weather: id === 'kurganets25_x' ? '#6a705d' : '#667357',
    patches: id === 'kurganets25_x'
      ? ['#333c32', '#76725a', '#444b3d']
      : ['#2f3e31', '#788064', '#424b3c'],
    marking: id === 'kurganets25_x' ? 'russian' : 'pla',
    number: id === 'kurganets25_x' ? 'K-25' : 'OD-20',
    trackWidthM: id === 'kurganets25_x' ? 0.44 : 0.56,
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
  const fields = [
    'hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
    'hullTraverseDegS', 'terrainResistance', 'pivotStyle', 'turretTraverseDegS',
    'gunPitchDegS', 'gunElevationDeg', 'gunDepressionDeg', 'gun',
  ] as const;
  for (const [id, donorId] of entries) {
    const target = registries.tankSpecs[id], donor = registries.tankSpecs[donorId];
    for (const field of fields) Object.assign(target, { [field]: structuredClone(donor[field]) });
    target.balancePeerOf = donorId;
    const structure = registries.tankSpecs[id === 'kurganets25_x' ? 'spz_puma' : donorId];
    target.armor = structuredClone(structure.armor);
    fitArmorToDims(target.armor, structure.dims, target.dims);
    applySourceFrame(target, id);
    applySourceArmament(target);
  }
}
