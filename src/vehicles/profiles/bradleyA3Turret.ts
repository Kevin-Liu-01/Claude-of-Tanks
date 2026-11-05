// Kevin B. Liu — the M3A3 Bradley CFV's A3 turret (round 269; owner 2026-11-05: "redesign the m3a3 bradley turret").
//
// The A3 kept the A2 turret's structure, so its shell, M242, stowed TOW launcher, right-wall stowage bin, smoke banks and
// commander's station are the family's own parts (modern3.ts, measured from the owner's m2_bradley_ifv.glb): roof 0.77 m
// over the ring, the gun line 0.305 m under it. Both A3 sources agree with that shell: the owner's
// low_poly_m3a3_bradley.glb (registered by its 6.55 m hull, front -Z, x mirrored) stands its roof 0.69-0.76 m over the
// deck, the Ukrainian M2A3 (ukrainian_m2a3_bradley.glb, the same registration) 0.70 m, its gun 0.31 m under the roof
// (the 268 build's turret, squashed to 0.59 m, read low beside them). What the A3 adds is measured from those two models
// and checked against the photographs (docs/references/tanks/m3a3_bradley.md, round 269):
// - the IBAS gunner's sight head on the A2 ISU's station at the roof's left front (low-poly: 0.35..0.91 x 0.08..0.57
//   turret-local, 0.26 m tall; Ukrainian: 0.29..0.77 x 0.03..0.47, 0.27 m), its brow over a recessed window and its two
//   ballistic doors swung open at its sides (as the Poland qualification photograph shows them);
// - the Commander's Independent Viewer on a welded plinth at the roof's right rear corner, behind the commander's hatch
//   (low-poly: its head at -1.30..-0.71 x -1.40..-0.89, 0.40 m over the roof; Ukrainian: -1.11..-0.72 x -0.94..-0.72,
//   0.70 m), a window body under an armoured head whose brow overhangs it, 0.63 m over the roof in all;
// - the gunner's hatch beside the commander's, not behind it (low-poly 0.48, -0.31; Ukrainian 0.45, -0.34);
// - a deeper bustle rack (the Ukrainian model's bustle reaches 0.50 m aft of the rear wall);
// - BRAT tiles for the spec's gameplay turret ERA zones: two rows of two on each cheek's upper plate (where the 2004 Iraq
//   head-on photograph shows boxes seated beside the gun), and on the wall faces the launcher and the bin leave free (the
//   left wall aft of the launcher, the right wall aft of the bin).
// Every part is turret-local (ring plane y 0, +z forward, +x the vehicle's left).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import {
  BRADLEY_BIN, BRADLEY_TURRET, addBradleyCommanderStation, addBradleySmokeBanks, addBradleyStowageBin,
  addBradleyTowLauncher, addBradleyTurretShell, bradleyCheekPlateFrame,
} from '../modern3.ts';

type EraPut = (...transform: number[]) => void;

const R = BRADLEY_TURRET.roofY;
/** tankFactoryCore's eraCluster cassette, scaled per tile. */
const BRICK = Object.freeze({ w: 0.28, h: 0.13, d: 0.07 });

/** A welded block's section (counter-clockwise from +Z): x0..x1 by y0..y1, its two top edges chamfered by c. */
function chamferRing(x0: number, x1: number, y0: number, y1: number, c: number): SectionPoint[] {
  return [[x0, y0], [x1, y0], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c]];
}

/** The IBAS head (turret-local): footprint, top, and its window on the front face. */
const BRADLEY_A3_IBAS = Object.freeze({ x0: 0.24, x1: 0.78, z0: 0.06, z1: 0.52, top: R + 0.34, windowY: R + 0.15 });
/** The Commander's Independent Viewer: plinth, turntable axis, head, window (turret-local). */
const BRADLEY_A3_CIV = Object.freeze({
  x: -0.78, z: -0.965, plinth: Object.freeze({ x0: -0.96, x1: -0.60, z0: -1.12, z1: -0.81, bottom: 0.70, top: R + 0.10 }),
  body: Object.freeze({ x0: -0.95, x1: -0.61, z0: -1.08, z1: -0.85, y0: R + 0.15, y1: R + 0.31 }),
  head: Object.freeze({ x0: -0.99, x1: -0.57, z0: -1.13, z1: -0.81, y0: R + 0.31, y1: R + 0.63 }),
  windowY: R + 0.23,
});
const GUNNER_HATCH = Object.freeze({ x: 0.46, z: -0.34 });

function addIbas(P: TankBuilderPort): void {
  const { box } = KIT;
  const { x0, x1, z0, z1, top, windowY } = BRADLEY_A3_IBAS, cx = (x0 + x1) / 2, foot = R - 0.02;
  // the armoured head: a welded box seated in the roof, its top edges chamfered, its brow falling 7 cm to the window face
  P.addEquipment('turret', sectionSolid([
    { z: z0, ring: chamferRing(x0, x1, foot, top - 0.025, 0.025) },
    { z: z0 + 0.03, ring: chamferRing(x0, x1, foot, top, 0.04) },
    { z: z1 - 0.11, ring: chamferRing(x0, x1, foot, top, 0.04) },
    { z: z1, ring: chamferRing(x0, x1, foot, top - 0.07, 0.04) },
  ]));
  // the window recess and its glass, and the two ballistic doors swung open beside it (hinged at the face's edges)
  P.add('turretDark', box(0.40, 0.13, 0.02), cx, windowY, z1 + 0.004);
  P.add('turretGlass', box(0.34, 0.085, 0.012), cx, windowY, z1 + 0.011);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.025, 0.17, 0.21), cx + s * 0.255, windowY, z1 + 0.10, 0, s * 0.18, 0);
    P.add('turretDetail', box(0.03, 0.05, 0.04), cx + s * 0.255, windowY, z1 + 0.012);                  // hinge block
  }
}

function addCiv(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const C = BRADLEY_A3_CIV, L = C.plinth, B = C.body, H = C.head;
  // the welded plinth on the roof's right rear corner, its outer face flush with the wall below the roof chamfer
  P.add('turret', sectionSolid([
    { z: L.z0, ring: chamferRing(L.x0, L.x1, L.bottom, L.top - 0.025, 0.02) },
    { z: L.z0 + 0.025, ring: chamferRing(L.x0, L.x1, L.bottom, L.top, 0.025) },
    { z: L.z1 - 0.025, ring: chamferRing(L.x0, L.x1, L.bottom, L.top, 0.025) },
    { z: L.z1, ring: chamferRing(L.x0, L.x1, L.bottom, L.top - 0.025, 0.02) },
  ]));
  // the turntable the head traverses on, then the window body and the armoured head, its brow 4 cm over the window
  P.add('turretDetail', cylY(0.15, 0.16, 0.06, P.q ? 20 : 12), C.x, L.top + 0.025, C.z);
  P.addEquipment('turret', sectionSolid([
    { z: B.z0, ring: chamferRing(B.x0, B.x1, B.y0 - 0.02, B.y1 + 0.01, 0.015) },
    { z: B.z1, ring: chamferRing(B.x0, B.x1, B.y0 - 0.02, B.y1 + 0.01, 0.015) },
  ]));
  const head = (z: number, drop: number) => ({ z, ring: chamferRing(H.x0, H.x1, H.y0, H.y1 - drop, 0.035) });
  P.addEquipment('turret', sectionSolid([
    head(H.z0, 0.03), head(H.z0 + 0.03, 0), head(H.z1 - 0.07, 0), head(H.z1 - 0.03, 0.02), head(H.z1, 0.07),
  ]));
  P.add('turretDark', box(0.27, 0.10, 0.02), C.x, C.windowY, B.z1 + 0.004);
  P.add('turretGlass', box(0.22, 0.065, 0.012), C.x, C.windowY, B.z1 + 0.011);
  P.add('turretDark', box(H.x1 - H.x0 - 0.06, 0.014, 0.012), C.x, H.y0 + 0.012, H.z1 + 0.004);           // brow seam
}

function addGunnerHatch(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const { x, z } = GUNNER_HATCH;
  P.add('turret', cylY(0.25, 0.26, 0.10, P.q ? 20 : 12), x, R + 0.04, z);
  P.add('turretDark', box(0.10, 0.03, 0.05), x, R + 0.10, z - 0.25);
}

function addBustleAndWhips(P: TankBuilderPort): void {
  // the bustle rack on the rear wall, open aft (the Ukrainian model's reaches 0.50 m aft of the wall, 1.3 m wide)
  const rack = FITTINGS.stowageRack({
    mats: P.mats, w: 1.30, d: 0.46, h: 0.40, rails: 4, fill: 0.5, seed: 3610, rotation: [0, Math.PI, 0],
  });
  rack.position.set(-0.07, 0.28, BRADLEY_TURRET.rearZ - 0.24);
  P.turretG.add(rack);
  // the whips on the rear roof: the left corner (the A2's station) and inboard of the viewer's plinth
  for (const [x, z, seed] of [[0.50, -1.02, 8], [-0.46, -1.06, 5]] as const) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.62, rake: 0.04, seed });
    whip.position.set(x, R, z);
    P.turretG.add(whip);
  }
}

/** The A3 turret on the family's A2 build: keeps the gun the family build seated (its rig, mantlet and M242), replaces
 *  the A2's turret with the shared shell, launcher, bin, smoke banks and commander's station plus the A3's own kit. */
export function buildBradleyA3Turret(P: TankBuilderPort): void {
  P.clear('turret', 'turretDark', 'turretDetail', 'turretGlass', 'turretCloth', 'turretExternalArmor', 'turretCupola',
    'turretHatch', 'turretEquipment', 'turretTrack');
  P.clearDecals('turret');
  for (const child of [...P.turretG.children]) if (child !== P.gunG) P.turretG.remove(child);
  addBradleyTurretShell(P);
  addBradleyTowLauncher(P);
  addBradleyCommanderStation(P);
  addGunnerHatch(P);
  addBradleyStowageBin(P);
  addBradleySmokeBanks(P);
  addIbas(P);
  addCiv(P);
  addBustleAndWhips(P);
  P.topY = Math.max(P.topY || 0, BRADLEY_A3_CIV.head.y1);
}

/** BRAT tiles on a cheek's upper plate (turret-local; side +1 the left): two rows of two, 150 x 170 x 80 mm, their backs
 *  5 mm into the ODS plate's face. `put` takes eraCluster's (x, y, z, rx, ry, rz, sx, sy, sz). */
export function placeBradleyA3CheekEra(side: number, put: EraPut): void {
  const F = bradleyCheekPlateFrame(side);
  const w = 0.15, h = 0.17, d = 0.08, lift = F.thickness + d / 2 - 0.005;
  for (const z of [0.82, 0.98]) for (const k of [0, 1]) {
    const [x, y, zz] = F.at(F.inner + 0.02 + w / 2 + k * (w + 0.012), z, lift);
    put(x, y, zz, F.slope - Math.PI / 2, 0, 0, w / BRICK.w, h / BRICK.h, d / BRICK.d);
  }
}

/** BRAT tiles on the turret's free wall faces (turret-local): on the left wall a column of two aft of the stowed launcher,
 *  on the right two columns of two aft of the stowage bin, all between the chine and the wall's top edge. */
export function placeBradleyA3SideEra(side: number, put: EraPut): void {
  const T = BRADLEY_TURRET;
  const inset = side > 0 ? T.plusInset : 0;
  const wallX = (y: number) => T.halfW - (T.halfW - T.edgeHalfW) * (y - T.chineY) / (T.edgeY - T.chineY) - inset;
  const w = side > 0 ? 0.30 : 0.25, h = 0.17, d = 0.07;
  const zs = side > 0 ? [-0.92] : [BRADLEY_BIN.z0 - 0.045 - w / 2, BRADLEY_BIN.z0 - 0.045 - w * 1.5 - 0.02];
  for (const z of zs) for (const y of [0.42, 0.605]) {
    put(side * (wallX(y) + d / 2 - 0.005), y, z, 0, side * Math.PI / 2, 0, w / BRICK.w, h / BRICK.h, d / BRICK.d);
  }
}
