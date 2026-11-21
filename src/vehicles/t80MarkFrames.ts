// The T-80, T-80B and T-80BV's combat frames on the T-80U X build they now draw (release 274, lane t80-family-274; the
// marks' builds are profiles/t80Marks.ts). As the T-90 marks take theirs (t90MarkFrames.ts): the twin's structural
// dimensions, each mark's own armour fitted to them (its plates, protection values and balance stay its own), the twin's
// yaw, trunnion and barrel, and the gun depression measured over each one's own engine deck and stern stowage. Then each mark's gameplay
// ERA is the ERA its build draws (eraSeating.selftest.mjs, "armour and visuals agree in both directions"): the T-80 and
// T-80B carry none; the turret, glacis and skirt plates of the T-80BV and of the Ukrainian T-80BV (the same tank in its
// 2015-24 service fit) are Kontakt-1 (the fleet's KONTAKT1_ERA, as on the Leopard 2A4 V), not the T-80UK's Kontakt-5
// values their records were copied from. The T-80U Kursk (profiles/t80uKursk.ts) draws the T-80U X build whole, so it
// takes the twin's armour record whole (plates, modules, crew, collision shells and contacts) at its own 1.04 protection
// factor, in place of the plates measured on its retired print-fitted loft, and its field Kontakt-1's six plates. Runs with the T-90 marks' pass, after
// every donor synchronisation and before the installed size policy (no size factor applies to these marks).
// First-party combat metadata: Kevin B. Liu (NOTICE.md).
import { fitArmorToDims } from './specs.ts';
import { KONTAKT1_ERA } from './leopard2A4Kontakt1.ts';
import { scaleNonExternalArmor } from './fleetSpecRegistry.ts';
import { reactivePlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const T80_MARKS = Object.freeze(['t80', 't80b', 't80bv', 'ua_t80bv'] as const);
const T80_MARK_TWIN = 't80u';
const STRUCTURAL_DIMS = ['hullLengthM', 'overallLengthM', 'widthM', 'heightM'] as const;
/** The T-80U Kursk and the protection factor its record has always carried over the T-80U's (ukraine.ts). */
const T80U_KURSK = 't80u_kursk';
export const T80U_KURSK_ARMOR_FACTOR = 1.04;
/** The Kursk's field Kontakt-1 clusters (profiles/t80uKursk.ts), one gameplay plate each. */
export const T80U_KURSK_K1_PLATES = Object.freeze(['glacis_k1_L', 'glacis_k1_R', 'skirt_era_L', 'skirt_era_R',
  'turret_k1_L', 'turret_k1_R'] as const);
/** The BV's drawn Kontakt-1 clusters (profiles/t80Marks.ts), one gameplay plate each. */
export const T80BV_KONTAKT1_PLATES = Object.freeze(['glacis_era_L', 'glacis_era_R', 'skirt_era_L', 'skirt_era_R',
  'turret_era_L', 'turret_era_R'] as const);

/** The gun's depression by turret yaw over each build with its stern stowage on (tools/gun-depression-sweep.mjs, keep 26 mm,
 * 2026-11-20; checks/stern-sweep.jsonl in the lane evidence). The T-80U's curve, measured without drums, let the gun pass
 * through them over the rear quarters: from 148 to 169 deg the gun now rides up to 7.5 deg over the drums, and the fender
 * tails' ZIP boxes and cans hold it at -3.5 to -4.6 deg ahead of them. The three Soviet marks share one curve (the same
 * stern); the Ukrainian T-80BV's cans, the Kursk's stern and the T-84's diesel stern give their own. */
const SOVIET_STERN_PITCH: [number, number][] = [[0, -5], [135, -5], [137, -3.5], [147, -3.5], [148, 2.2], [149, 4.7], [150, 6], [151, 6.5], [155, 7.1], [159, 7.2], [160, 7.5], [166, 7.5], [167, 7.3], [168, 6.4], [169, 4], [170, -1], [171, -0.8], [175, -0.8], [176, -0.9], [178, -1.9], [180, -1.9]];
const STERN_PITCH_BY_YAW_DEG: Readonly<Record<string, [number, number][]>> = Object.freeze({
  t80: SOVIET_STERN_PITCH, t80b: SOVIET_STERN_PITCH, t80bv: SOVIET_STERN_PITCH,
  ua_t80bv: [[0, -5], [145, -5], [147, -4.6], [148, 4.3], [149, 6], [150, 7], [151, 7.3], [154, 7.7], [157, 7.7], [158, 7.6], [159, 7.2], [160, 7.5], [166, 7.5], [167, 7.3], [168, 6.4], [169, 4], [170, -1], [171, -0.8], [175, -0.8], [176, -0.9], [178, -1.9], [180, -1.9]],
  t80u_kursk: [[0, -5], [145, -5], [147, -4.6], [148, 2.2], [149, 4.7], [150, 6], [151, 6.5], [155, 7.1], [159, 7.2], [160, 7.5], [166, 7.5], [167, 7.3], [168, 6.4], [169, 4], [170, -1], [171, -0.8], [175, -0.8], [176, -0.9], [178, -1.9], [180, -1.9]],
  t84: [[0, -5], [145, -5], [147, -4.6], [148, 2.2], [149, 4.7], [150, 6], [151, 6.5], [155, 7.1], [159, 7.2], [160, 7.5], [166, 7.5], [167, 7.3], [168, 6.4], [169, 4], [170, -1], [171, -0.8], [175, -0.8], [176, -0.9], [178, -2.5], [179, -2.5], [180, -2.7]],
});
/** The measured curve for a mark or the Kursk (a copy, so no spec shares an array). */
export const t80SternPitchByYawDeg = (id: string): [number, number][] | undefined =>
  STERN_PITCH_BY_YAW_DEG[id]?.map(([yaw, pitch]) => [yaw, pitch]);

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
    spec.gunPitchByYawDeg = t80SternPitchByYawDeg(id);
    const plates = [...spec.armor.hullPlates, ...spec.armor.turretPlates];
    if (id !== 't80bv' && id !== 'ua_t80bv') {
      if (plates.some((plate) => plate.kind === 'era')) throw new Error(`${id}: the early marks draw no ERA, so carry none`);
      continue;
    }
    const era = plates.filter((plate) => plate.kind === 'era');
    const names = era.map((plate) => plate.name).sort();
    if (names.join() !== [...T80BV_KONTAKT1_PLATES].join())
      throw new Error(`${id}: ERA plates ${names.join()} do not match its drawn Kontakt-1 clusters`);
    for (const plate of era) plate.era = { ...KONTAKT1_ERA };
  }
  const kursk = specs[T80U_KURSK];
  if (!kursk) return;
  for (const key of STRUCTURAL_DIMS) kursk.dims[key] = twin.dims[key];
  kursk.armor = structuredClone(twin.armor);
  scaleNonExternalArmor(kursk, T80U_KURSK_ARMOR_FACTOR);
  // its field Kontakt-1 (profiles/t80uKursk.ts), one gameplay plate per drawn cluster at the fleet's Kontakt-1 values; the
  // combat anatomy replaces each template's face with the drawn containers' faces
  for (const name of T80U_KURSK_K1_PLATES) {
    const turret = name.startsWith('turret');
    const face = turret ? 'top' : name.startsWith('glacis') ? 'front' : name.endsWith('_L') ? 'left' : 'right';
    (turret ? kursk.armor.turretPlates : kursk.armor.hullPlates).push(reactivePlate(name, face, { ...KONTAKT1_ERA }, 10));
  }
  kursk.visual.trackWidthM = twin.visual.trackWidthM;
  kursk.gunPitchByYawDeg = t80SternPitchByYawDeg(T80U_KURSK);
  applyT84Frame(specs, twin);
}

/** The T-84 (profiles/t84.ts) draws the T-80U X hull, running gear, ring and gun under its own welded turret, so it takes
 * the twin's armour record (plates, modules, crew, collision shells and contacts) at the T-84's own protection: each of the
 * twin's plates takes the value of the T-84's plate of the same name, the welded turret's cheeks and mantlet included;
 * its gameplay ERA is the Kontakt-5 it draws, the glacis and the turret at its own ratings and the skirts' front blocks
 * as the turret's. Runs here, after every registration-time copy, so the
 * vehicles built from the T-84's record (the Oplot-M and -T, the PT-84s, the Object 477) keep theirs. */
const T84 = 't84';
/** The T-84's Kontakt-5 ratings, as its record carried them on the Oplot concept: the glacis heavier than the turret's. */
const T84_GLACIS_K5 = Object.freeze({ keReduction: 0.2, ceFlatMm: 450 });
const T84_TURRET_K5 = Object.freeze({ keReduction: 0.2, ceFlatMm: 400 });
export const T84_ERA_PLATES = Object.freeze(['glacis_era_L', 'glacis_era_R', 'skirt_era_L', 'skirt_era_R',
  'turret_era_L', 'turret_era_R'] as const);
function applyT84Frame(specs: Record<string, FleetTankSpec>, twin: FleetTankSpec): void {
  const t84 = specs[T84];
  if (!t84) return;
  const own = [...t84.armor.hullPlates, ...t84.armor.turretPlates];
  const value = (name: string) => own.find((plate) => plate.name === name && plate.kind !== 'era');
  for (const key of STRUCTURAL_DIMS) t84.dims[key] = twin.dims[key];
  t84.armor = structuredClone(twin.armor);
  for (const plate of [...t84.armor.hullPlates, ...t84.armor.turretPlates]) {
    if (plate.kind === 'era') { plate.era = { ...(plate.name.startsWith('glacis') ? T84_GLACIS_K5 : T84_TURRET_K5) }; continue; }
    const mine = value(plate.name);
    if (mine) Object.assign(plate, { physicalMm: mine.physicalMm, keMm: mine.keMm, ceMm: mine.ceMm });
  }
  for (const name of ['skirt_era_L', 'skirt_era_R'])
    t84.armor.hullPlates.push(reactivePlate(name, name.endsWith('_L') ? 'left' : 'right', { ...T84_TURRET_K5 }, 15));
  const era = [...t84.armor.hullPlates, ...t84.armor.turretPlates].filter((plate) => plate.kind === 'era').map((plate) => plate.name).sort();
  if (era.join() !== [...T84_ERA_PLATES].sort().join()) throw new Error(`t84: ERA plates ${era.join()} do not match its drawn Kontakt-5`);
  t84.visual.trackWidthM = twin.visual.trackWidthM;
  t84.gunPitchByYawDeg = t80SternPitchByYawDeg(T84) ?? twin.gunPitchByYawDeg;
}
