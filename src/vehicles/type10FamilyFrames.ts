// The Type 10 marks' combat frames on the build they draw. 267 (Main 2026-10-31, the Japan line: "one base"): the TK-X
// and the Type 10B draw the modern Type 10 (profiles/type10X.ts) with their own packages, at its true size, so they take
// what the T-90 marks take from their twins (t90MarkFrames.ts): the Type 10's structural dimensions, their own armour
// fitted to them (their plates, protection values and balance stay their own) and its yaw, trunnion and barrel. Their
// registration-time rows stay the ×1.10 frame the STC-1, the Type 10 and the Kaitaku clone from (modern3Specs.ts,
// japan.ts), so this runs after every clone and donor synchronisation, beside the T-90 marks' pass.
// First-party combat metadata: Kevin B. Liu (NOTICE.md).
import { fitArmorToDims } from './specs.ts';
import { tkxTrialPlates, type10bWedgePlates } from './type10MarkArmor.ts';
import type { FleetTankSpec } from './specContracts.ts';

const TYPE10_MARKS = Object.freeze(['type10_tk_x', 'type10b'] as const);

/** The TK-X prototypes' trials finish (owner 2026-11-01: "the tk x and type 10b need to look a lot more unique"; TRDI
 *  trial and museum photographs, docs/references/photos/type10-tk-x-20261031.json, tkx_no3: a pale grey ground with sand
 *  and grey-green bands), and their trial designation in place of the production '73'. The production Type 10 clones the
 *  TK-X's registration visual (sourceXSecondWaveSpecs.ts), so the coat is set here, after every clone. Its stock paint
 *  is paint_type10 (the generator names paints by the lead's seed id; camoPolicy.ts). */
const TKX_TRIALS_VISUAL = Object.freeze({ scheme: 'stripes', base: '#8c8f87', weather: '#999b92',
  patches: ['#a8987a', '#6d7866'], camoScale: 0.55, number: 'TK-X' } as const);
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
  if (specs.type10_tk_x) Object.assign(specs.type10_tk_x.visual, { ...TKX_TRIALS_VISUAL, patches: [...TKX_TRIALS_VISUAL.patches] });
  // the marks' added armour, plates the record never carried with their own protection (Main 2026-11-01: armour that
  // reads as armour is armour; type10MarkArmor.ts), about the Type 10's pivot both marks now turn on
  if (specs.type10_tk_x) {
    const trial = tkxTrialPlates();
    specs.type10_tk_x.armor.turretPlates.push(...trial.turret);
    specs.type10_tk_x.armor.hullPlates.push(...trial.hull);
  }
  if (specs.type10b) specs.type10b.armor.turretPlates.push(...type10bWedgePlates());
}
