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
  // 267: the Terminator module's trunnion at the head's crown (profiles/bmptT90Station.ts BMPT_T90_TRUNNION)
  bmpt_t90: { turret: [0, 1.374, .15], gun: [0, 1.00, .55], lengthM: 3.36600, radiusM: .105 },
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
  agreeDrawnEra(specs);
}

/**
 * 267 (Main's tanks-suite triage, ruled "armour and visuals agree in both directions"; eraSeating.selftest.mjs holds it
 * fleet-wide): a mark's gameplay ERA is the ERA its build draws. Runs here, after every registration-time copy, so the
 * donors' own records (the T-90M Proryv, the T-90M X, the T-90A obr. 2004, the BMPT T-90 and the SM 2013 all copy the
 * T-90AM's plates when they register) keep theirs.
 * - The T-90AM draws the T-90SM source build: Relikt on the glacis and the turret front only. Its Proryv skirt and
 *   turret-flank plates (skirt_era_L/R, side_era_L/R) had nothing drawn on them; they go, as the SM 2013's already did.
 * - The T-90MS obr. 2011 draws its Tagil twin's turret-flank K-5 boxes (side_era_L/R clusters) with no plate under them;
 *   it takes the twin's two flank plates (the same turret frame since the pass above: the twin's yaw, dimensions and
 *   fitted plates), rated as its own K-5 turret plates are. The build fits each plate's hit faces to the drawn boxes'
 *   faces (the ERA visual binding).
 */
function agreeDrawnEra(specs: Record<string, FleetTankSpec>): void {
  const am = specs.t90am;
  if (am) {
    const undrawn = (plate: FleetTankSpec['armor']['hullPlates'][number]) =>
      plate.kind === 'era' && /^(skirt|side)_era_[LR]$/.test(plate.name);
    am.armor.hullPlates = am.armor.hullPlates.filter((plate) => !undrawn(plate));
    am.armor.turretPlates = am.armor.turretPlates.filter((plate) => !undrawn(plate));
  }
  const ms = specs.t90ms_2011, twin = specs.t90ms_tagil;
  if (ms && twin && !ms.armor.turretPlates.some((plate) => /^side_era_[LR]$/.test(plate.name))) {
    const rating = ms.armor.turretPlates.find((plate) => plate.name === 'turret_era_L');
    for (const name of ['side_era_L', 'side_era_R']) {
      const flank = twin.armor.turretPlates.find((plate) => plate.name === name);
      if (!flank || !rating) throw new Error(`t90ms_2011: no ${flank ? 'turret_era_L rating' : `${name} on its twin`} to agree its drawn ERA with`);
      ms.armor.turretPlates.push({ ...structuredClone(flank), era: structuredClone(rating.era) });
    }
  }
}
