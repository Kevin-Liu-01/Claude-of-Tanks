// The T-80, T-80B and T-80BV's combat frames on the T-80U X build they now draw (release 274, lane t80-family-274; the
// marks' builds are profiles/t80Marks.ts). As the T-90 marks take theirs (t90MarkFrames.ts): the twin's structural
// dimensions, each mark's own armour fitted to them (its plates, protection values and balance stay its own), the twin's
// yaw, trunnion and barrel, and the twin's measured gun depression over the same engine deck. Then each mark's gameplay
// ERA is the ERA its build draws (eraSeating.selftest.mjs, "armour and visuals agree in both directions"): the T-80 and
// T-80B carry none; the T-80BV's turret, glacis and skirt plates are Kontakt-1 (the fleet's KONTAKT1_ERA, as on the
// Leopard 2A4 V), not the T-80UK's Kontakt-5 values its record was copied from. Runs with the T-90 marks' pass, after
// every donor synchronisation and before the installed size policy (no size factor applies to these marks).
// First-party combat metadata: Kevin B. Liu (NOTICE.md).
import { fitArmorToDims } from './specs.ts';
import { KONTAKT1_ERA } from './leopard2A4Kontakt1.ts';
import type { FleetTankSpec } from './specContracts.ts';

const T80_MARKS = Object.freeze(['t80', 't80b', 't80bv'] as const);
const T80_MARK_TWIN = 't80u';
const STRUCTURAL_DIMS = ['hullLengthM', 'overallLengthM', 'widthM', 'heightM'] as const;
/** The BV's drawn Kontakt-1 clusters (profiles/t80Marks.ts), one gameplay plate each. */
export const T80BV_KONTAKT1_PLATES = Object.freeze(['glacis_era_L', 'glacis_era_R', 'skirt_era_L', 'skirt_era_R',
  'turret_era_L', 'turret_era_R'] as const);

export function applyT80MarkSourceFrames(specs: Record<string, FleetTankSpec>): void {
  const twin = specs[T80_MARK_TWIN];
  if (!twin) return;
  for (const id of T80_MARKS) {
    const spec = specs[id];
    if (!spec) continue;
    const before = { ...spec.dims };
    for (const key of STRUCTURAL_DIMS) spec.dims[key] = twin.dims[key];
    fitArmorToDims(spec.armor, before, spec.dims);
    spec.armor.turretPivot = [...twin.armor.turretPivot];
    spec.armor.gunPivot = [...twin.armor.gunPivot];
    spec.armor.gunBarrel.lengthM = twin.armor.gunBarrel.lengthM;
    spec.armor.gunBarrel.radiusM = twin.armor.gunBarrel.radiusM;
    spec.visual.trackWidthM = twin.visual.trackWidthM;
    if (twin.gunPitchByYawDeg) spec.gunPitchByYawDeg = twin.gunPitchByYawDeg;
    const plates = [...spec.armor.hullPlates, ...spec.armor.turretPlates];
    if (id !== 't80bv') {
      if (plates.some((plate) => plate.kind === 'era')) throw new Error(`${id}: the early marks draw no ERA, so carry none`);
      continue;
    }
    const era = plates.filter((plate) => plate.kind === 'era');
    const names = era.map((plate) => plate.name).sort();
    if (names.join() !== [...T80BV_KONTAKT1_PLATES].join())
      throw new Error(`t80bv: ERA plates ${names.join()} do not match its drawn Kontakt-1 clusters`);
    for (const plate of era) plate.era = { ...KONTAKT1_ERA };
  }
}
