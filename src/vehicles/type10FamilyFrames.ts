// The Type 10 marks' combat frames on the build they draw. 267 (Main 2026-10-31, the Japan line: "one base"): the TK-X
// and the Type 10B draw the modern Type 10 (profiles/type10X.ts) with their own packages, at its true size, so they take
// what the T-90 marks take from their twins (t90MarkFrames.ts): the Type 10's structural dimensions, their own armour
// fitted to them (their plates, protection values and balance stay their own) and its yaw, trunnion and barrel. Their
// registration-time rows stay the ×1.10 frame the STC-1, the Type 10 and the Kaitaku clone from (modern3Specs.ts,
// japan.ts), so this runs after every clone and donor synchronisation, beside the T-90 marks' pass.
// First-party combat metadata: Kevin B. Liu (NOTICE.md).
import { fitArmorToDims } from './specs.ts';
import type { FleetTankSpec } from './specContracts.ts';

const TYPE10_MARKS = Object.freeze(['type10_tk_x', 'type10b'] as const);
const STRUCTURAL_DIMS = ['hullLengthM', 'overallLengthM', 'widthM', 'heightM'] as const;

export function applyType10FamilyFrames(specs: Record<string, FleetTankSpec>): void {
  const twin = specs.type10;
  if (!twin) return;
  for (const id of TYPE10_MARKS) {
    const spec = specs[id];
    if (!spec) continue;
    const before = { ...spec.dims };
    for (const key of STRUCTURAL_DIMS) spec.dims[key] = twin.dims[key];
    fitArmorToDims(spec.armor, before, spec.dims);
    spec.armor.turretPivot = [...twin.armor.turretPivot];
    spec.armor.gunPivot = [...twin.armor.gunPivot];
    spec.armor.gunBarrel.lengthM = twin.armor.gunBarrel.lengthM;
    spec.armor.gunBarrel.radiusM = twin.armor.gunBarrel.radiusM;
  }
}
