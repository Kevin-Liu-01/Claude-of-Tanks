// Boot-light owner-directed C2 upgrade of the definitive enlarged C1.
// CIO documents 1500 hp, wider tracks, electric controls and new sights.
// Protection/reload/aim values below are gameplay tuning, not classified data.
import './sourceXSecondWaveSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs } from './fleetSpecRegistry.ts';
import { ARIETE_C2_X_DATUMS as D, ARIETE_C2_X_GUN_PITCH_BY_YAW_DEG } from './profiles/arieteXFamilyFrame.ts';
import { arieteC2ArmorFaces } from './profiles/arieteC2XArmor.ts';
import { arieteC2EraPlates } from './profiles/arieteC2Era.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

function addUpgradeProtection(spec: FleetTankSpec): void {
  for (const face of arieteC2ArmorFaces()) {
    const belly = face.name.startsWith('mine_');
    const cheek = face.owner === 'turret';
    const plate = {
      name: face.name, verts: face.verts, convexPolygon: true,
      kind: 'spaced' as const, era: null, moduleLink: null, gunFollow: false,
      physicalMm: belly ? 20 : cheek ? 50 : 35,
      keMm: belly ? 20 : cheek ? 140 : 100,
      ceMm: belly ? 20 : cheek ? 280 : 260,
      // A closed pack is one layer even when a ray crosses both faces.
      surfaceGroup: `ariete_c2_x:${face.name.replace(/_\d+$/, '')}`,
    };
    (cheek ? spec.armor.turretPlates : spec.armor.hullPlates).push(plate);
  }
}

function createArieteC2(): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, 'ariete_c2_x', 'ariete_c1_x', {
    name: 'C2 Ariete', nation: 'Italy', era: 'modern', role: 'mbt',
  });
  delete spec.balancePeerOf;
  delete spec.sourceStudyStatus;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  Object.assign(spec, {
    hp: 2600, enginePowerHp: 1500, weightTons: 62,
    topSpeedKmh: 65, reverseSpeedKmh: 30, hullTraverseDegS: 42,
    terrainResistance: { hard: .65, medium: .76, soft: 1.40 },
    turretTraverseDegS: 44, gunPitchDegS: 36,
    gunDepressionDeg: 9, gunElevationDeg: 20, gunPitchByYawDeg: ARIETE_C2_X_GUN_PITCH_BY_YAW_DEG,
  });
  // Retain C1's manual 120 mm ammunition, penetration and damage. The tier
  // step improves stabilization and cycle time, not invented missile rounds.
  Object.assign(spec.gun, {
    reloadS: 5.4, baseAccuracy: .26, aimTimeS: 1.45,
    bloom: { move: .040, hullRot: .055, turret: .040, afterShot: 1.9 },
  });
  spec.armor.gunBarrel.lengthM = D.barrelLengthM;
  spec.armor.gunBarrel.radiusM = D.barrelRadiusM;
  spec.dims = { ...D.dims };
  spec.visual = { ...spec.visual, patches: [...spec.visual.patches],
    trackWidthM: D.trackWidthM, number: 'C2 02' };
  addUpgradeProtection(spec);
  for (const {owner, plate} of arieteC2EraPlates())
    (owner === 'hull' ? spec.armor.hullPlates : spec.armor.turretPlates).push(plate);
  return spec;
}

registerFleetSpecs(registries, ['ariete_c2_x'], { ariete_c2_x: createArieteC2() });
