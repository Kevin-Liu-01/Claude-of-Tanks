// The earlier T-90 marks' combat frames on the source-X builds they draw. 2026-10-31 (lane t90-family-266; Main: "If
// nine marks draw the X turret while their spec pivots are the old ones ... the combat turret/gun frames are wrong, and
// shots, hits and aim come from the wrong place. Make each mark's spec pivots equal its drawn X turret, the way the X
// ids' are"). Since the rebuild (profiles/t90.ts) each mark draws its source-X twin's hull, turret and gun, so it takes
// what the X ids take from their donors (sourceXFleetSpecs.ts, sourceXSecondWaveSpecs.ts): the twin's structural
// dimensions, its own armour fitted to them (its plates, protection values and balance stay its own), and the twin's
// yaw, trunnion and barrel. The Burlak prototype draws its own turret on the T-90A ring and the BMPT T-90 its own
// station, so theirs are the frames measured on their built rigs (tools/gun-barrel-align-census.mjs, 2026-10-31,
// divided by their 1.05 installed size). Runs after every donor synchronisation and before the installed size policy,
// which then scales the 1.05 marks as it scales their builds.
// First-party combat metadata: Kevin B. Liu (NOTICE.md).
import { fitArmorToDims } from './specs.ts';
import type { FleetTankSpec } from './specContracts.ts';

type Vec3 = [number, number, number];
type MeasuredFrame = { turret: Vec3; gun: Vec3; lengthM: number; radiusM: number };

const T90_MARK_TWINS = Object.freeze({
  t90_1992: 't90', t90a_2004: 't90a', t90a_2006: 't90a_vladimir', t90ms_2011: 't90ms_tagil',
  t90sm_2013: 't90sm', t90am: 't90sm', t90m_proryv: 't90m',
});
const STRUCTURAL_DIMS = ['hullLengthM', 'overallLengthM', 'widthM', 'heightM'] as const;
// turret: the yaw pivot in the hull frame; gun: the trunnion from the yaw pivot; both in the authoring frame
const MEASURED_FRAMES: Readonly<Record<string, MeasuredFrame>> = Object.freeze({
  t90a_burlak_proto: { turret: [.01, 1.468, -.0039], gun: [-.00495, .37419, 1.3039], lengthM: 4.74076, radiusM: .09914 },
  bmpt_t90: { turret: [0, 1.374, .15], gun: [0, .68, .55], lengthM: 3.36600, radiusM: .105 },
});

export function applyT90MarkSourceFrames(specs: Record<string, FleetTankSpec>): void {
  for (const [id, twinId] of Object.entries(T90_MARK_TWINS)) {
    const spec = specs[id], twin = specs[twinId];
    if (!spec || !twin) continue;
    const before = { ...spec.dims };
    for (const key of STRUCTURAL_DIMS) spec.dims[key] = twin.dims[key];
    fitArmorToDims(spec.armor, before, spec.dims);
    spec.armor.turretPivot = [...twin.armor.turretPivot];
    spec.armor.gunPivot = [...twin.armor.gunPivot];
    spec.armor.gunBarrel.lengthM = twin.armor.gunBarrel.lengthM;
    spec.armor.gunBarrel.radiusM = twin.armor.gunBarrel.radiusM;
  }
  for (const [id, frame] of Object.entries(MEASURED_FRAMES)) {
    const spec = specs[id];
    if (!spec) continue;
    spec.armor.turretPivot = [...frame.turret];
    spec.armor.gunPivot = [...frame.gun];
    spec.armor.gunBarrel.lengthM = frame.lengthM;
    spec.armor.gunBarrel.radiusM = frame.radiusM;
  }
}
