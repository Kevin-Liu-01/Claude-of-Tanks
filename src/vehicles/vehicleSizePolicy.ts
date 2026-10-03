// Owner-directed whole-vehicle dimensions, applied after donor registration.
// Keep source authoring frames unchanged; only the installed metre frame changes.
import type { FleetTankSpec } from './specContracts.ts';
import { fitArmorToDims } from './specs.ts';

export const VEHICLE_SIZE_FACTORS: Readonly<Record<string, number>> = Object.freeze({
  object695_x: .90, bmp3m_dragun125_x: .90, kurganets25_x: .90,
  t90a_vladimir: 1.05, t90m: 1.05, t90sm: 1.05, bmpt_t90: 1.05,
  t90: 1.05, t90a_burlak: 1.05, t90m_proryv: 1.05, t90ms: 1.05,
  k21_x: .90, kf41_lynx_x: .90, type100: .90, lrmv_lynx: .90,
  borsuk: .90, ajax_x: .90, ares_apc_x: .90, griffin50_x: .90,
  griffin_viper: .90, challenger1_x: 1.10, upior: 1.10,
});
/** Additional longitudinal chassis change, before the uniform installed scale.
 * Turret-local armor, weapon stations and ring position retain their dimensions. */
export const VEHICLE_HULL_LENGTH_FACTORS: Readonly<Record<string, number>> = Object.freeze({
  t90m: 1.10, t90m_proryv: 1.10,
});
function extendHullMetadata(spec: FleetTankSpec, factor: number): void {
  const oldLength = spec.dims.hullLengthM;
  spec.dims.hullLengthM *= factor;
  spec.dims.overallLengthM += oldLength * (factor - 1) / 2;
  for (const plate of spec.armor.hullPlates) plate.verts = plate.verts.map(p => [p[0], p[1], p[2] * factor]);
  for (const box of [...spec.armor.modules, ...spec.armor.crew]) {
    if (box.turretLocal || ('module' in box && box.module === 'turretRing')) continue;
    box.min = [box.min[0], box.min[1], box.min[2] * factor];
    box.max = [box.max[0], box.max[1], box.max[2] * factor];
  }
  spec.armor.boundingRadiusM *= factor;
}
const authoringFrames = new WeakMap<object, { source: FleetTankSpec; armor: FleetTankSpec['armor'] }>();

/** Donor combat refreshes may replace the armor/gun records after resizing. */
export function restoreInstalledVehicleFrame(spec: FleetTankSpec): void {
  const retained = authoringFrames.get(spec);
  if (!retained) return;
  const factor = VEHICLE_SIZE_FACTORS[spec.id];
  spec.armor = retained.armor;
  if (retained.source.gun.launcherMuzzles) {
    spec.gun.launcherMuzzles = retained.source.gun.launcherMuzzles.map(mouth =>
      ({ ...mouth, x: mouth.x * factor, y: mouth.y * factor, z: mouth.z * factor }));
  } else delete spec.gun.launcherMuzzles;
  if (Array.isArray(retained.source.gun.muzzles)) {
    spec.gun.muzzles = retained.source.gun.muzzles.map(mouth =>
      ({ ...mouth, x: mouth.x * factor, y: mouth.y * factor, z: mouth.z * factor }));
  }
}

/** Idempotent per registry instance. Derivatives have already cloned their
 * donor, so resizing a donor cannot resize its children a second time. */
export function applyVehicleSizePolicy(specs: Record<string, FleetTankSpec>): void {
  for (const [id, factor] of Object.entries(VEHICLE_SIZE_FACTORS)) {
    const spec = specs[id];
    if (!spec) continue;
    const retained = authoringFrames.get(spec);
    if (retained) {
      // Both tool and browser facades can register in one Node process.
      // Their donor refresh republishes native gun/pivot data. Restore this
      // vehicle's installed spatial frame, including calibrated anatomy.
      restoreInstalledVehicleFrame(spec);
      continue;
    }
    authoringFrames.set(spec, { source: structuredClone(spec), armor: spec.armor });
    const hullFactor = VEHICLE_HULL_LENGTH_FACTORS[id];
    if (hullFactor) extendHullMetadata(spec, hullFactor);
    const previous = { ...spec.dims };
    for (const key of Object.keys(spec.dims)) {
      if (key.endsWith('M') && typeof spec.dims[key] === 'number') spec.dims[key] *= factor;
    }
    fitArmorToDims(spec.armor, previous, spec.dims);
    spec.armor.gunBarrel.radiusM *= factor;
    spec.visual.trackWidthM *= factor;
    for (const mouth of spec.gun.launcherMuzzles ?? []) {
      mouth.x *= factor; mouth.y *= factor; mouth.z *= factor;
    }
    for (const mouth of Array.isArray(spec.gun.muzzles) ? spec.gun.muzzles : []) {
      for (const key of ['x', 'y', 'z']) if (typeof mouth[key] === 'number') mouth[key] *= factor;
    }
  }
}

export function vehicleAuthoringSpec<T extends FleetTankSpec>(spec: T): T {
  // Builders only read these retained spatial fields. Current identity and
  // tuning remain visible, including temporary inspection/camouflage choices.
  const source = authoringFrames.get(spec)?.source;
  return source ? { ...spec, dims: source.dims, armor: source.armor,
    visual: { ...spec.visual, trackWidthM: source.visual.trackWidthM },
    gun: { ...spec.gun, muzzles: source.gun.muzzles,
      launcherMuzzles: source.gun.launcherMuzzles } } : spec;
}
