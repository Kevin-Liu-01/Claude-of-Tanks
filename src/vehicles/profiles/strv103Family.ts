// The Strv 103 family (owner 2026-11-20: "redesign the strv 103s", then "clean up and redesign the S tank models like how
// we did for the leclercs, but wiht the same general style cues"): one casemate, one running gear and one gun port for
// every mark, each mark's kit on top, on the Leclerc rebuild pattern: a datum frame and one file per subsystem.
//   strv103Frame.ts      marks, per-mark frames, the measured casemate stations, the glacis plane, the fixed guns
//   strv103Hull.ts       the closed section-solid casemate (tub and sponsoned body), the gun in its glacis housing, louvres
//   strv103Gear.ts       the four-wheel front-drive course and the fender lip
//   strv103Roof.ts       the crew roof: cupola, sights, hatches, crew guns, remote stations
//   strv103Equipment.ts  bins, the Ksp 58 box, the rear plate, rope, whips, the cleaning-rod tube, tail lamps
//   strv103Marks.ts      each mark's kit
// Marks: a (103A, 1967), b (103B, its netted twin strv103b_net on the same build), e (103E, tier X concept),
// p (UDES 03, the S-tank's trials prototype), x (Strv 152, tier X concept round a 152 mm).
// Docs: docs/references/tanks/strv103.md, strv103a.md, strv103e.md, strv152.md, udes03.md.
// Every gun part rides hull buckets (fixedMount: rig_turret stays empty; P.turretG/P.gunG keep only the virtual pivots).
// First-party: Kevin B. Liu (NOTICE.md).

import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { FRAMES, type Strv103Mark } from './strv103Frame.ts';
import { casemate, fixedGun, ventilation } from './strv103Hull.ts';
import { runningGear } from './strv103Gear.ts';
import { crewRoof } from './strv103Roof.ts';
import { fenderBins, fenderMgBox, hasRearBoxes, hullFittings, rearBoxes, tail } from './strv103Equipment.ts';
import { kitA, kitB, kitE, kitP, kitX } from './strv103Marks.ts';
export type { Strv103Mark } from './strv103Frame.ts';
export { addFixedGunPort } from './strv103Hull.ts';

/** The Strv 103 of the given mark. */
export function buildStrv103Mark(P: TankBuilderPort, mark: Strv103Mark): void {
  const F = FRAMES[mark];
  P.fixedMount = true;
  casemate(P, mark);
  fixedGun(P, mark);
  ventilation(P, mark);
  crewRoof(P, mark);
  fenderBins(P, mark);
  if (mark !== 'p') fenderMgBox(P);
  tail(P, mark === 'x' ? F.tailZ : F.plateZ);
  if (hasRearBoxes(mark)) rearBoxes(P, F.plateZ);
  hullFittings(P, mark);
  runningGear(P, F.plateZ);
  if (mark === 'a') kitA(P);
  else if (mark === 'b') kitB(P);
  else if (mark === 'p') kitP(P);
  else if (mark === 'x') { kitE(P, F.plateZ, F.tailZ); kitX(P); }
  else kitE(P, F.plateZ);
  const number = P.spec.visual.number || { a: '103A', b: '103B', e: '103E', p: '03', x: '152' }[mark];
  const decalX = mark === 'e' || mark === 'x' ? 1.905 : mark === 'p' ? 1.725 : 1.765;
  const decalZ = mark === 'e' || mark === 'x' ? -0.48 : -0.98;                        // (critic r6: on one module, off its seam)
  P.decal('hull', 'number', number, 0.26, [decalX, 1.66, decalZ], Math.PI / 2, 0, 0);
  P.decal('hull', 'number', number, 0.26, [-decalX, 1.66, decalZ], -Math.PI / 2, 0, 0);
  addVehicleGhillieSuit(P);
  P.topY = 1.35;
}
