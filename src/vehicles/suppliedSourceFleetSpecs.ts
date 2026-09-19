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
  ['kurganets25_x', 'spz_puma', 'Kurganets-25', 'Russia', 'ifv'],
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
  const kornet = { ...structuredClone(guided), name: 'Kornet guided missile', count: 4 };
  const bulat = {
    ...structuredClone(highExplosive), name: 'Bulat guided missile', caliberMm: 70,
    guided: true, count: 8, velocityMps: guided.velocityMps,
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

/** Preserve source weapon labels after peer and caliber adaptation. */
function applyGuidedShellLabels(spec: FleetTankSpec): void {
  if (spec.id === 'bmp3m_dragun125_x') {
    for (const round of spec.gun.shells) {
      round.name = round.guided ? '152 mm guided missile' : `${round.caliberMm} mm ${round.type}`;
    }
  }
  if (spec.id === 'fv510_milan_x' || spec.id === 'cv90_mkiv_x') {
    for (const round of spec.gun.shells) {
      if (!round.guided) continue;
      round.name = spec.id === 'fv510_milan_x' ? 'MILAN guided missile' : 'Guided missile';
      if (spec.id === 'fv510_milan_x') round.caliberMm = 115;
    }
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
  const donorDimensions = { ...spec.dims };
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
    target.armor = structuredClone(donor.armor);
    fitArmorToDims(target.armor, donor.dims, target.dims);
    applySourceFrame(target, id);
    applySourceArmament(target);
  }
}
