// The M113s' hull fittings the M113A3's blind critics found missing (the pioneer tools among them) (release 269; the owner 2026-11-05: "make the m113a3
// a lottt better"): the ramp's hinge knuckles, door handle and latch on our four marks, and on the A3 the A2's and A3's
// smoke grenade launchers and the driver's mirrors. The crew's kit is the decor layer's (decorations.ts M113_MANIFESTS).
// Our four marks only: profiles/m113.ts calls it from their turret step, so the M163's M741 hull (the twin-aa lane's
// buildM113HullSteps) is untouched. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { M113_BASE, m113Datums, type M113Mark } from '../m113Datums.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { KIT } from './kit.ts';

const { box, cylX, cylY, cylZ } = KIT;
const B = M113_BASE;

/** A pioneer tool lying on the roof's edge strip along the hull, its head across at the front end, in two clamps; its
 * 3 cm stands under every gun's and launcher's lowest pass (the gun depression sweep holds it). */
function roofTool(P: TankBuilderPort, kind: 'axe' | 'pick', x: number, z: number, len: number): void {
  const y = B.roofY + 0.022;
  P.add('hullWood', cylZ(kind === 'axe' ? 0.019 : 0.016, len, 8), x, y, z);
  const head = z + len / 2 - 0.03;
  if (kind === 'axe') P.add('hullDark', box(0.17, 0.030, 0.07), x - Math.sign(x) * 0.04, y, head);
  else P.add('hullDark', box(0.40, 0.030, 0.05), x - Math.sign(x) * 0.08, y, head);
  for (const f of [-0.32, 0.30]) P.add('hullDark', box(0.06, 0.03, 0.045), x, B.roofY + 0.008, z + f * len);
}

/** The pioneer tools on the roof's edge strips (the decor's side seats stood past the track width): the shovel and the
 * axe on the left, the pick on the right, clear of the driver's hatch, the engine grille and the roof's loads. */
function pioneerTools(P: TankBuilderPort, mark: M113Mark): void {
  const D = m113Datums(mark), z0 = D.ringZ - (mark === 'as4' ? 0.45 : 0.75);
  KIT.shovelTool(P, 1.12, B.roofY + 0.022, z0 + 0.80, 0.95);
  roofTool(P, 'axe', 1.12, z0 - 0.25, 0.80);
  roofTool(P, 'pick', -1.10, z0 + 0.35, 0.90);
}

/** The AS4's tow cable along its right appliqué's top, in three clamps (the decor's side seat stood past the width). */
function as4Cable(P: TankBuilderPort): void {
  const x = -(B.hw + 0.065 + 0.012), y = 1.76, zs = [-2.10, -1.10, -0.10, 0.80];
  KIT.towCable(P, zs.map((z, k) => [x, y + (k % 2 ? -0.02 : 0), z] as [number, number, number]), 0.016);
  for (const z of [zs[0], zs[1], zs[3]]) P.add('hullDetail', box(0.04, 0.08, 0.06), x + 0.006, y, z);
}

/** The ramp's hinge knuckles along its foot, the door's handle and the ramp's latch (critic: "a panel line only"). */
function rampHardware(P: TankBuilderPort, mark: M113Mark): void {
  const D = m113Datums(mark), z = D.sternZ - 0.02;
  for (const x of [-0.62, 0, 0.62]) P.add('hullDark', cylX(0.04, 0.22, 10), x, 0.64, z);
  P.add('hullDark', box(0.04, 0.12, 0.04), 0.36, 1.18, z - 0.02);
  P.add('hullDark', box(0.10, 0.03, 0.03), 0.36, 1.24, z - 0.04);
  P.add('hullDark', box(0.14, 0.06, 0.035), 0, B.roofY - 0.16, z - 0.01);
}

/** The A3's smoke grenade launchers, four tubes a side on the roof's front corners behind the lift eyes (the glacis' top
 * holds the driver's periscopes and the lamp clusters), angled up and out; the driver's mirrors on stalks at the hull's
 * front corners, outside the M2's reach. */
function a3Hardware(P: TankBuilderPort): void {
  const D = m113Datums('a3'), R = B.roofY;
  for (const s of [-1, 1] as const) {
    const x = s * 1.16, z = D.glacisTopZ - 0.24;
    P.add('hullDetail', box(0.20, 0.06, 0.16), x, R + 0.03, z);
    for (const [dx, dy] of [[-0.045, 0.09], [0.045, 0.09], [-0.045, 0.16], [0.045, 0.16]] as const) {
      P.add('hullDetail', markSmokeTube(cylZ(0.033, 0.17, 12)), x + dx, R + dy, z + 0.04, -0.55, s * 0.35, 0);
    }
    P.add('hullDark', cylY(0.012, 0.012, 0.34, 8), s * 1.25, R + 0.15, D.glacisTopZ - 0.04);
    P.add('hullDark', box(0.03, 0.17, 0.13), s * 1.25, R + 0.36, D.glacisTopZ - 0.04, 0, s * 0.35, 0);
    P.add('hullGlass', box(0.008, 0.14, 0.10), s * 1.25, R + 0.36, D.glacisTopZ + 0.012, 0, s * 0.35, 0);
  }
}

/** Each mark's hull hardware; the receipt lists it for australia.selftest.mjs. */
export function addM113Fittings(P: TankBuilderPort, mark: M113Mark): void {
  rampHardware(P, mark);
  pioneerTools(P, mark);
  if (mark === 'a3') a3Hardware(P);
  if (mark === 'as4') as4Cable(P);
  P.hullG.userData.m113Fittings = Object.freeze({ mark, rampHardware: true, pioneerTools: 3,
    smokeLaunchers: mark === 'a3' ? 2 : 0, mirrors: mark === 'a3' });
}
