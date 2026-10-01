// Owner-directed whole-vehicle dimensions, applied after donor registration.
// Keep source authoring frames unchanged; only the installed metre frame changes.
import type { FleetTankSpec } from './specContracts.ts';
import { fitArmorToDims } from './specs.ts';

export const VEHICLE_SIZE_FACTORS: Readonly<Record<string, number>> = Object.freeze({
  k21_x: .90, kf41_lynx_x: .90, type100: .90, lrmv_lynx: .90,
  borsuk: .90, ajax_x: .90, ares_apc_x: .90, griffin50_x: .90,
  griffin_viper: .90, challenger1_x: 1.10, upior: 1.10,
});
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
