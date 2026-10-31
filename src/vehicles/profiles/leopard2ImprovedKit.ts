// The kit of the Leopard 2 Improved (leo2_improved), carried over from the 2A7V-pattern build it replaces (inventory:
// the lane's inventory/leo2_improved.md; legacy buildLeo2A7VSteps and addLeo2A7VFrontalProtection in leopard.ts) and
// re-seated on the release hull and the 2A4 turret with its 2A6-look wedge front (leopard2A4Family.ts,
// leopard2A4Wedge.ts). On the hull: the upper glacis's ERA field (a7v_upper_glacis_era) ahead of the driver's
// periscopes, between the headlight pods and round the splash board; the deep modular skirts hung outboard of the
// hull's own skirts with the side cassette band over them under its cap and hinge line; the lower-front module on the
// lower glacis; the front mudguard assembly with its rubber flaps and the rear flaps beside the hull's; the two
// APU/cooling housings raised over the deck's radiator louvres, the exhaust and its soot; the rear number. On the
// turret: the spaced layered blocks over the wedges' front faces (a7v_turret_cheek_layer_R/L), the side-armour module
// bands carrying the wedges' side modules back along the walls, the roof's diagonal strips, periscope heads and hatch
// strips, the full FLW 200 (leopard2A4Flw200.ts), the crew cooling unit, the four ADS sensor pods, the welded bustle
// box with its louvre service cassette, the bustle rack and its load, the slat rear arc, the crosswind mast and the
// asymmetric whips.
//
// The legacy builds were mirrored (their crew stations at the wrong hand): the handed items follow their crew station
// here (the loader's side, +X: the FLW 200 by the loader's hatch, the cooling unit, the mast, the service cassette, the
// longer whip, the APU's exhaust; the rear number on the vehicle's right, -X). The legacy hull's 0.9 lateral scale
// belonged to its own hull and is not applied to the release hull. Only the vehicle's real armour is armour: ERA
// through eraField, the skirts, cassettes, modules and cheek layers through addExternalArmor, the rest equipment or
// detail.
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { lineAt, mirrorRing } from './leopard2Hull.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { Leopard2A4KitContext } from './leopard2A4Kit.ts';
import {
  HULL_SURFACES as HS, TURRET_SURFACES as TS, deckY, eraField, glacisCassettes, mudguardY, sternRackFloor,
} from './leopard2A4KitParts.ts';
import { addLeopardFlw200, turretRoofY } from './leopard2A4Flw200.ts';
import { leopard2A4WedgeFace } from './leopard2A4Wedge.ts';
import { LEOPARD2_HULL } from '../leopard2HullDatums.ts';
import { LEO2A4_TURRET } from '../leopard2A4FamilyArmor.ts';
import { tankSeedId } from '../tankIdAliases.ts';

const H = LEOPARD2_HULL, T = LEO2A4_TURRET;

/** The deep modular skirts in place of the hull's own (its `skirts: 'none'`): 0.12 thick from x 1.70, 2 cm outside the
 *  track band's outer edge (1.68), hung to y 0.55 from the sponson's floor; the fore course, the aft course to the
 *  sprocket, a fender strip over it. */
const LEO2_IMPROVED_SKIRT = Object.freeze({ x0: 1.70, th: 0.12, foot: 0.55, top: 1.38, foreZ: [1.40, 3.16] as const,
  aftZ: [-2.85, 1.40] as const, stripZ: -3.66 });
const SK = LEO2_IMPROVED_SKIRT, SKX1 = SK.x0 + SK.th;

/** The hull's splash board on the glacis (leopard2Hull.ts hullFittings): two arms from the apex ahead of the driver back
 *  and out, each 0.88 m long and 5 cm thick, turned 0.54 rad. The ERA field keeps clear of it. */
const SPLASH = Object.freeze({ x: 0.38, z: 2.78, halfLen: 0.44, halfThick: 0.025, yaw: 0.54 });

/** The glacis ERA cassette (eraCluster's 0.28 x 0.13 x 0.07 base): narrowed so nine columns fit between the pods. */
const ERA_SCALE = Object.freeze([0.70, 1.0, 1.0] as const);

/** Whether an axis-aligned plan rectangle (centre, half extents) overlaps an oriented one (centre, unit axis, halves). */
function overlapsPlan(cx: number, cz: number, hx: number, hz: number, bx: number, bz: number, ux: number, uz: number,
  len: number, thick: number): boolean {
  for (const [ax, az] of [[1, 0], [0, 1], [ux, uz], [-uz, ux]]) {
    const ra = Math.abs(ax) * hx + Math.abs(az) * hz;
    const rb = len * Math.abs(ux * ax + uz * az) + thick * Math.abs(-uz * ax + ux * az);
    if (Math.abs((bx - cx) * ax + (bz - cz) * az) > ra + rb) return false;
  }
  return true;
}

/**
 * The upper glacis's ERA field (a7v_upper_glacis_era): nine columns between the headlight pods' guards, rows from the nose
 * back to the driver's periscopes, each cassette laid on the glacis at its own station and sunk 18 mm, skipping the seats
 * the splash board's arms stand on.
 */
function glacisEra(P: TankBuilderPort): number {
  const w = 0.28 * ERA_SCALE[0], h = 0.13 * ERA_SCALE[1], d = 0.07 * ERA_SCALE[2], margin = 0.012;
  const keep = (x: number, z: number): boolean => {
    const slope = Math.atan(-(deckY(z + 0.01) - deckY(z - 0.01)) / 0.02);
    const hx = w / 2, hz = (h / 2) * Math.cos(slope) + d * Math.sin(slope) / 2;
    if (z - hz < HS.driverHatch[1] + 0.41 || z + hz > 3.445 || Math.abs(x) + hx > HS.pods[0] - 0.185) return false;
    for (const s of [-1, 1]) {
      const ry = s * SPLASH.yaw;
      if (overlapsPlan(x, z, hx + margin, hz + margin, s * SPLASH.x, SPLASH.z, Math.cos(ry), -Math.sin(ry), SPLASH.halfLen,
        SPLASH.halfThick)) return false;
    }
    return true;
  };
  const pitch = h + 0.012, nose = 3.37;
  const seats = glacisCassettes({ halfW: HS.pods[0] - 0.185 - w / 2, z0: nose - 6 * pitch, z1: nose, cols: 9, rows: 7,
    scale: ERA_SCALE, embedM: 0.018, keep });
  eraField(P, 'a7v_upper_glacis_era', seats);
  return seats.length;
}

/** A skirt segment between z0 and z1 on side s, its leading lower corner cut back when `lead`. */
function skirtSegment(s: number, z0: number, z1: number, foot: number, lead: boolean): THREE.BufferGeometry {
  const ring = (z: number, bottom: number): SolidSection => {
    const r: SectionPoint[] = [[SK.x0, bottom], [SKX1, bottom], [SKX1, SK.top], [SK.x0, SK.top]];
    return { z, ring: s > 0 ? r : mirrorRing(r) };
  };
  return sectionSolid(lead ? [ring(z0, foot), ring(z1 - 0.20, foot), ring(z1, SK.top - 0.30)] : [ring(z0, foot), ring(z1, foot)]);
}

/**
 * The deep modular skirts, a side: the fore course (four segments, the leader cut back over the idler) with its foot's
 * flap strip, the aft course (ten segments) to the sprocket, the fender strip over the sprocket, the dark joints; over
 * the fore course a cap from the sponson's wall onto its top (aft, the cassette band carries the courses).
 */
function deepSkirts(P: TankBuilderPort, s: number): void {
  const { box } = KIT;
  const xc = s * (SK.x0 + SK.th / 2), hgt = SK.top - SK.foot;
  for (const [[z0, z1], n] of [[SK.foreZ, 4], [SK.aftZ, 10]] as const) {
    const L = (z1 - z0) / n;
    for (let k = 0; k < n; k++) {
      const a = z0 + L * k + 0.006, b = z0 + L * (k + 1) - 0.006;
      P.addExternalArmor('hull', skirtSegment(s, a, b, SK.foot, z1 === SK.foreZ[1] && k === n - 1));
      if (k > 0) P.add('hullDark', box(SK.th + 0.002, hgt * 0.86, 0.014), xc, (SK.foot + SK.top) / 2, z0 + L * k);
    }
  }
  // the fore course's flap strip along its foot, turned in under it
  const [f0, f1] = SK.foreZ;
  P.add('hullDetail', box(SK.th, 0.12, f1 - f0 - 0.26), s * (SKX1 - SK.th / 2 - 0.005), SK.foot - 0.02, (f0 + f1 - 0.20) / 2,
    0, 0, -s * 0.22);
  // the fender strip over the sprocket, the deep course's top band carried to the stern
  P.addExternalArmor('hull', box(SK.th, 0.14, SK.aftZ[0] - SK.stripZ - 0.012), xc, SK.top - 0.07, (SK.aftZ[0] + SK.stripZ) / 2 - 0.006);
  P.add('hullDark', box(SK.th + 0.002, 0.12, 0.014), xc, SK.top - 0.07, SK.aftZ[0]);
  // the fore course's cap, welded 1 cm into the sponson's wall over the 3 cm gap onto the course's top
  P.add('hullDetail', box(SKX1 + 0.01 - (HS.sponsonX - 0.01), 0.03, f1 - f0), s * (SKX1 + HS.sponsonX) / 2, SK.top + 0.015, (f0 + f1) / 2);
}

/**
 * The upper side cassette band, a side: nine cassettes from the sponson's wall (2 mm into it) out to the skirts' plane,
 * standing on the aft course and the fender strip, their end cassettes rolled; each with its seam and top strip; the
 * shelf over them from the sponson's wall (its inner edge welded into the wall), its hinge line and brackets.
 */
function sideCassettes(P: TankBuilderPort, s: number): void {
  const { box } = KIT;
  const z0 = -3.62, z1 = SK.aftZ[1] - 0.02, n = 9, L = (z1 - z0) / n, y0 = SK.top - 0.002, y1 = 1.585;
  const inner = HS.sponsonX - 0.002, xc = s * (inner + SKX1) / 2;
  for (let i = 0; i < n; i++) {
    const z = z0 + L * (i + 0.5), d = L - 0.02, hgt = y1 - y0;
    P.addExternalArmor('hull', box(SKX1 - inner, hgt, d), xc, (y0 + y1) / 2, z, 0, 0, s * (i === 0 ? -0.025 : i === n - 1 ? 0.025 : 0));
    P.add('hullDark', box(0.014, hgt * 0.82, 0.022), s * (SKX1 + 0.002), (y0 + y1) / 2, z + d / 2);
    P.add('hullDetail', box(0.018, 0.022, d * 0.76), s * (SKX1 + 0.002), y1 - 0.012, z);
  }
  const x0 = HS.sponsonX - 0.025, x1 = SKX1 + 0.005;
  P.addEquipment('hull', box(x1 - x0, 0.025, z1 - z0), s * (x0 + x1) / 2, y1 + 0.0125, (z0 + z1) / 2);
  P.add('hullDark', box(0.04, 0.03, z1 - z0), s * (x1 - 0.022), y1 + 0.039, (z0 + z1) / 2);
  for (const z of [-3.24, -2.12, -1.00, 0.12, 1.24]) P.add('hullDetail', box(0.06, 0.045, 0.10), s * (x1 - 0.05), y1 + 0.045, z);
}

/** The lower-front module on the lower glacis between the tracks: a plate on the chord across its knee, a seam, bolts. */
function lowerFrontModule(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const za = 2.92, zb = 3.30, ya = lineAt(H.belly, za), yb = lineAt(H.belly, zb), t = 0.10, hw = H.tubHalfWidthM - 0.04;
  const len = Math.hypot(zb - za, yb - ya), nz = (yb - ya) / len, ny = -(zb - za) / len;   // outward: forward and down
  P.addExternalArmor('hull', orientedSlab(
    [-hw, yb, zb], [hw, yb, zb], [hw, ya, za], [-hw, ya, za],
    [-hw, yb + ny * t, zb + nz * t], [hw, yb + ny * t, zb + nz * t], [hw, ya + ny * t, za + nz * t], [-hw, ya + ny * t, za + nz * t]));
  // its top edge's seam (on the top face, which faces up and forward) and two rows of bolts on its face
  const tilt = Math.atan2(-ny, nz);
  P.add('hullDark', box(hw * 2 - 0.04, 0.012, t), 0, yb + ny * t / 2 + 0.005 * (yb - ya) / len, zb + nz * t / 2 + 0.005 * (zb - za) / len,
    tilt, 0, 0);
  const faceTilt = Math.atan2(nz, ny);
  for (const u of [0.25, 0.75]) {
    const y = ya + (yb - ya) * u + ny * (t + 0.004), z = za + (zb - za) * u + nz * (t + 0.004);
    for (const x of [-0.70, -0.25, 0.25, 0.70]) P.add('hullDetail', cylY(0.02, 0.022, 0.012, 8), x, y, z, faceTilt, 0, 0);
  }
}

/**
 * The front mudguard assembly, a side: a lip across the hull's mudguard's front edge out to the skirts' plane, a post from
 * it back to the fore course's leader, a bracket from the lip into the nose, the hinge line, the rubber flap hung from it.
 */
function frontMudguards(P: TankBuilderPort, s: number): void {
  const { box } = KIT;
  const mz = HS.mudguard.z1, lipX0 = 0.94, lipY0 = 1.02, lipY1 = 1.26;
  const along = (zs: readonly number[], x0: number, x1: number, y0: (z: number) => number, y1: (z: number) => number) =>
    sectionSolid(zs.map((z): SolidSection => {
      const r: SectionPoint[] = [[x0, y0(z)], [x1, y0(z)], [x1, y1(z)], [x0, y1(z)]];
      return { z, ring: s > 0 ? r : mirrorRing(r) };
    }));
  P.addEquipment('hull', box(SKX1 - lipX0, lipY1 - lipY0, 0.04), s * (SKX1 + lipX0) / 2, (lipY0 + lipY1) / 2, mz + 0.018);
  // the post along the skirts' plane from the fore course's leader to the lip, its top the mudguard's; the mudguard
  // carried out over it from the hull's
  P.addEquipment('hull', along([SK.foreZ[1] - 0.02, 3.40, 3.62, mz + 0.036], SKX1 - 0.04, SKX1, () => lipY0,
    (z) => mudguardY(Math.min(z, mz))));
  P.addEquipment('hull', along([SK.foreZ[1], 3.40, 3.62, mz], HS.mudguard.x1 - 0.005, SKX1 - 0.035,
    (z) => mudguardY(z) - 0.025, (z) => mudguardY(z)));
  P.addEquipment('hull', box(0.08, 0.08, mz + 0.005 - 3.445), s * 0.98, 1.07, (mz + 0.005 + 3.445) / 2);
  P.add('hullDetail', box(SKX1 - lipX0 - 0.04, 0.022, 0.024), s * (SKX1 + lipX0) / 2, lipY0 + 0.002, mz + 0.035);
  P.hangMudguard('leo2-improved-front-flap', 'hullRubber', box(SKX1 - 0.03 - 1.02, 0.42, 0.024), s * (SKX1 - 0.03 + 1.02) / 2,
    lipY0 - 0.22, mz + 0.025);
}

/** The rear flaps beside the hull's own, a side: the rubber flap under the skirts' plane, its hanger bar from the
 *  sponson's end and the bracket to the fender strip. */
function rearFlaps(P: TankBuilderPort, s: number): void {
  const { box } = KIT;
  const z = -3.70;
  P.add('hullDetail', box(SKX1 + 0.005 - (HS.sponsonX - 0.01), 0.035, 0.05), s * (SKX1 + 0.005 + HS.sponsonX - 0.01) / 2, 1.3875, z);
  P.add('hullDetail', box(0.07, 0.06, 0.10), s * (SK.x0 + 0.06), 1.34, z + 0.035);
  P.add('hullRubber', box(SKX1 - HS.sponsonX + 0.005, 0.42, 0.032), s * (SKX1 + HS.sponsonX + 0.005) / 2, 1.16, z);
}

/**
 * The APU/cooling housings on the engine deck's shoulders: each raised on two feet between the radiator louvres' ribs
 * (so the louvres stand clear under it) and 9 cm outside the bustle's sweep, with its louvre ribs, lid seam, latches and
 * rear intake mesh; the running APU's exhaust, its bore and heat-shield cowl on the loader's side (+X), and its soot.
 */
function apuHousings(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const x = 1.37, z0 = -3.44, z1 = -2.90, y0 = 1.84, y1 = 2.06, zc = (z0 + z1) / 2;
  for (const s of [-1, 1]) {
    P.addEquipment('hull', box(0.34, y1 - y0, z1 - z0), s * x, (y0 + y1) / 2, zc);
    for (const fz of [-3.35, -2.95]) P.add('hullDark', box(0.32, y0 - deckY(fz) + 0.004, 0.04), s * x, (y0 + deckY(fz)) / 2, fz);
    for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.28, 0.007, 0.055), s * x, y1 + 0.0035, z1 - 0.10 - k * 0.13);
    P.add('hullDark', box(0.30, 0.004, 0.010), s * x, y1 + 0.002, z1 - 0.03);
    for (const lz of [-3.02, -3.30]) P.add('hullDetail', box(0.014, 0.05, 0.06), s * (x + 0.177), (y0 + y1) / 2, lz);
    P.add('hullDark', box(0.18, 0.14, 0.014), s * (x + 0.05), (y0 + y1) / 2, z0 - 0.007);
  }
  const ex = x - 0.12, ey = 1.95;
  P.add('hullDark', cylZ(0.045, 0.10, 10), ex, ey, z0 - 0.05);
  P.add('hullDark', cylZ(0.032, 0.014, 8), ex, ey, z0 - 0.105);
  P.add('hullDetail', box(0.14, 0.08, 0.03), ex, ey + 0.055, z0 - 0.015);
  P.decal('hull', 'soot', null, 0.18, [ex + 0.04, ey, z0 - 0.002], Math.PI);
}

function hullKit(P: TankBuilderPort): void {
  glacisEra(P);
  for (const s of [-1, 1]) {
    deepSkirts(P, s);
    sideCassettes(P, s);
    frontMudguards(P, s);
    rearFlaps(P, s);
  }
  lowerFrontModule(P);
  apuHousings(P);
  sternRackFloor(P);
  P.mats.rubber.color.setHex(0x33352b);
  // the old build's rear number on the lower rear plate's right, over the crossed tow cables
  P.decal('hull', 'number', 'Y-877', 0.26, [-0.62, 1.27, HS.rearZ - 0.006], Math.PI);
}

/** Lay a turret part on the roof at (x, z), its top `h` over it, turned ry (the roof's height at z, 2 mm into it). */
function onRoof(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry, x: number, z: number, h: number, ry = 0, rise = 0): void {
  P.addEquipment(bucket, g, x, turretRoofY(z) - 0.002 + h / 2 + rise, z, 0, ry, 0);
}

/**
 * The spaced layered blocks over the wedges' front faces (a7v_turret_cheek_layer_R on the left, +X, wedge; _L on the
 * right), as the old build's permanent cheek panels: three blocks a face from near its tip to the shoulder, each standing
 * 4 cm out along the face's normal on two spacers, 6 cm thick, under an inset cover plate with its bolts. The faces are
 * tall at the shoulder and thin at the tip, so the blocks taper with them.
 */
function cheekLayers(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const gap = 0.04, th = 0.06, cover = 0.015;
  for (const side of [1, -1] as const) {
    const at = (u: number, v: number, out: number): number[] => {
      const f = leopard2A4WedgeFace(side, u, v);
      return f.point.clone().addScaledVector(f.normal, out).toArray();
    };
    const slab = (u0: number, u1: number, v0: number, v1: number, w0: number, w1: number): THREE.BufferGeometry =>
      orientedSlab(at(u0, v0, w0), at(u1, v0, w0), at(u1, v1, w0), at(u0, v1, w0),
        at(u0, v0, w1), at(u1, v0, w1), at(u1, v1, w1), at(u0, v1, w1));
    for (const [u0, u1] of [[0.16, 0.42], [0.44, 0.70], [0.72, 0.97]] as const) {
      P.addExternalArmor('turret', slab(u0, u1, 0.10, 0.90, gap, gap + th));
      P.addExternalArmor('turret', slab(u0 + 0.025, u1 - 0.025, 0.22, 0.80, gap + th - 0.002, gap + th + cover));
      for (const u of [u0 + 0.06, u1 - 0.06]) {
        const f = leopard2A4WedgeFace(side, u, 0.5), r = f.rotation;
        const spacer = f.point.clone().addScaledVector(f.normal, gap / 2);
        P.addEquipment('turretDark', box(0.04, 0.035, gap + 0.012), spacer.x, spacer.y, spacer.z, r.x, r.y, r.z);
        const bolt = leopard2A4WedgeFace(side, u, 0.5).point.addScaledVector(f.normal, gap + th + cover + 0.005);
        P.addEquipment('turretDetail', cylZ(0.013, 0.012, 8), bolt.x, bolt.y, bolt.z, r.x, r.y, r.z);
      }
    }
  }
}

/** The floor's height under the walls at z (the 2A6 X's stations: level forward, rising over the bustle). */
function floorAt(z: number): number {
  if (z >= 0.2587) return T.floorY;
  if (z >= -0.4664) return THREE.MathUtils.lerp(0.146, T.floorY, (z + 0.4664) / (0.2587 + 0.4664));
  return z >= -1.023 ? THREE.MathUtils.lerp(T.bustleFloorY, 0.146, (z + 1.023) / (1.023 - 0.4664)) : T.bustleFloorY;
}

/** The 2A6 X's cheek roof planes (leopard2A4Wedge.ts cheekRoof, in its frame: y over the ground, the ring at 1.64), as
 *  turret metres at |x| on side `side`: the wedges' side modules' top. */
function sideModuleTop(side: number, absX: number, z: number): number {
  const x = side * absX;
  const y = side > 0
    ? Math.min((2.41496517 - .02096949 * x - .02873983 * z) / .99936695, (3.11507045 - .26781475 * x - .40417141 * z) / .87459747,
      (2.23276603 - .86978401 * x - .03448941 * z) / .49222582)
    : Math.min((2.43833975 + .02484870 * x - .03993549 * z) / .99889324, (3.12201470 + .27490637 * x - .41942070 * z) / .86516632,
      (2.31739595 + .86978401 * x - .03448941 * z) / .49222582);
  return y - T.pivot[1];
}

/**
 * The side-armour module bands: the wedges' side modules carried back along the walls from their root (z 1.095) in their
 * own section (the broad outer face, the chamfer up to the wall), as cassettes to the smoke dischargers (right) or to the
 * welded ammunition hatch (left), their foot stepping up with the floor; the seams in their joints, the strip along their
 * outer top edge, the crosses on the middle cassette.
 */
function sideModules(P: TankBuilderPort): void {
  const { box } = KIT;
  const W = T.wedge;
  for (const [sx, z0, n] of [[-1, -0.44, 3], [1, -0.17, 3]] as const) {
    const wall = (sx < 0 ? T.wallRightM : T.wallLeftM) - 0.004, broad = sx < 0 ? W.broadRight : W.broadLeft, z1 = W.rootZ;
    // the section's top: the broad face's top, the chamfer's kink (where its plane meets the roof's), the wall's
    let lo: number = wall, hi: number = broad;
    const flat = (x: number): number => sideModuleTop(sx, wall, z1) + (sideModuleTop(sx, wall + 0.001, z1) - sideModuleTop(sx, wall, z1)) * (x - wall) / 0.001;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (Math.abs(sideModuleTop(sx, m, z1) - flat(m)) < 1e-6) lo = m; else hi = m; }
    const kink = lo, topB = sideModuleTop(sx, broad, z1);
    const ring = (foot: number, inset = 0): SectionPoint[] => {
      const r: SectionPoint[] = [[wall, foot], [broad - inset, foot], [broad - inset, topB - inset], [kink, sideModuleTop(sx, kink, z1) - inset],
        [wall, sideModuleTop(sx, wall, z1) - inset]];
      return sx > 0 ? r : mirrorRing(r);
    };
    const L = (z1 - z0) / n, prism = (foot: number, a: number, b: number, inset = 0): THREE.BufferGeometry =>
      sectionSolid([{ z: a, ring: ring(foot, inset) }, { z: b, ring: ring(foot, inset) }]);
    for (let k = 0; k < n; k++) {
      const a = z0 + L * k, b = a + L, foot = floorAt(a);
      P.addExternalArmor('turret', prism(foot, a + 0.006, k === n - 1 ? b + 0.004 : b - 0.006));
      if (k > 0) P.add('turretDark', prism(floorAt(a - L), a - 0.007, a + 0.007, 0.004));
      if (k === 1) {
        P.decal('turret', 'crossgrey', null, 0.20, [sx * (broad + 0.002), (foot + topB) / 2, (a + b) / 2], sx * Math.PI / 2);
      }
    }
    P.add('turretDetail', box(0.024, 0.02, z1 - z0 - 0.01), sx * (broad - 0.008), topB + 0.004, (z0 + z1) / 2);
  }
}

/**
 * The roof: the six periscope heads in arcs ahead of the hatches (outside the commander's ring of eight and the loader's
 * forward periscope), the strips behind the hatches, the two diagonal strips, the four ADS sensor pods at the corners, the
 * crew cooling unit, the crosswind mast.
 */
function roofKit(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const [cx, cz] = T.commander, [lx, lz] = T.loader;
  for (const [hx, hz, angles] of [[cx, cz, [55, 80, 105]], [lx, lz, [-75, -40, 25]]] as const) {
    for (const deg of angles) {
      const a = deg * Math.PI / 180, x = hx + Math.sin(a) * 0.48, z = hz + Math.cos(a) * 0.48;
      onRoof(P, 'turretDark', box(0.14, 0.035, 0.075), x, z, 0.035, a);
      onRoof(P, 'turretGlass', box(0.102, 0.022, 0.014), x + Math.sin(a) * 0.032, z + Math.cos(a) * 0.032, 0.022, a, 0.006);
    }
  }
  onRoof(P, 'turretDetail', box(0.24, 0.024, 0.032), cx, -0.44, 0.024, 0.18);
  onRoof(P, 'turretDetail', box(0.24, 0.024, 0.032), lx, -0.47, 0.024, -0.18);
  for (const s of [-1, 1]) onRoof(P, 'turretDark', box(0.020, 0.018, 0.42), s * 1.02, -0.55, 0.018, s * 0.36);
  // the ADS sensor pods: on the roof's flat inside its edge bevel, front pods looking forward and out, rear pods back and out
  for (const s of [-1, 1]) {
    for (const [pz, ry] of [[0.28, s * 0.5], [-1.97, s * 2.6]] as const) {
      const px = s * (TS.wallAt(s, pz) - (pz < 0 ? 0.115 : 0.095));
      onRoof(P, 'turretDetail', box(0.10, 0.085, 0.10), px, pz, 0.085, ry);
      onRoof(P, 'turretDark', box(0.075, 0.055, 0.014), px + Math.sin(ry) * 0.052, pz + Math.cos(ry) * 0.052, 0.055, ry, 0.012);
      onRoof(P, 'turretDark', box(0.022, 0.022, 0.16), px, pz - 0.10, 0.022, 0, Math.min(0, turretRoofY(pz - 0.18) - turretRoofY(pz)));
    }
  }
  // the crew cooling unit on the bustle roof (loader's side): a seat flange, the low body, its louvre ribs, lid seam,
  // latches on its outboard face and the conduit forward into the roof
  const ax = 0.80, az = -1.66;
  onRoof(P, 'turretDark', box(0.40, 0.012, 0.50), ax, az, 0.012);
  onRoof(P, 'turret', box(0.38, 0.10, 0.48), ax, az, 0.10, 0, 0.010);
  for (let k = 0; k < 4; k++) onRoof(P, 'turretDetail', box(0.32, 0.006, 0.05), ax, az - 0.17 + k * 0.11, 0.006, 0, 0.110 - 0.003);
  onRoof(P, 'turretDark', box(0.34, 0.004, 0.010), ax, az + 0.19, 0.004, 0, 0.109);
  for (const dz of [0.07, -0.11]) P.addEquipment('turretDetail', box(0.012, 0.04, 0.05), ax + 0.196, turretRoofY(az) + 0.06, az + dz);
  onRoof(P, 'turretDark', box(0.03, 0.03, 0.22), ax - 0.17, az + 0.35, 0.03);
  // the crosswind sensor's mast and head on the bustle roof's fall
  const mx = 0.45, mz = -2.20, mBase = turretRoofY(mz) - 0.003, mTop = 0.92;
  P.addEquipment('turretDetail', cylY(0.014, 0.018, mTop - mBase, 8), mx, (mBase + mTop) / 2, mz);
  P.addEquipment('turretDark', box(0.04, 0.035, 0.10), mx, mTop + 0.0175, mz);
}

/** The bustle's welded box behind the rear plate, its wings along the chamfered corners, its recessed lid, the louvre
 *  service cassette on its rear face (loader's half). Equipment: it is stowage, not the turret's armour. */
const BOX = Object.freeze({ halfW: 1.04, z1: -2.85, y0: 0.26, y1: 0.66 });

function bustleBox(P: TankBuilderPort): void {
  const { box } = KIT;
  const front = T.rearZ + 0.005, h = BOX.y1 - BOX.y0;
  P.addEquipment('turret', box(BOX.halfW * 2, h, front - BOX.z1), 0, (BOX.y0 + BOX.y1) / 2, (front + BOX.z1) / 2);
  for (const s of [-1, 1]) {
    // the triangle between the box's side and the chamfer, its long side 4 mm inside the chamfer's face
    const rear = s < 0 ? T.rearRightM : T.rearLeftM, wall = s < 0 ? 1.10 : 1.16;
    const zAt = (x: number): number => T.rearZ + (x - rear) * (T.bustleEndZ - T.rearZ) / (wall - rear);
    // the chamfer's line moved 4 mm into the shell (its inward normal), met with the box's side
    const n = new THREE.Vector2(-(T.bustleEndZ - T.rearZ), wall - rear).normalize().multiplyScalar(0.004);
    const zIn = zAt(BOX.halfW - n.x) + n.y;
    const pts: Array<[number, number]> = [[rear + n.x, T.rearZ + n.y], [BOX.halfW, T.rearZ], [BOX.halfW, zIn]];
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(s * x, -z)));
    P.addEquipment('turret', new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2), 0, BOX.y0, 0);
  }
  P.addEquipment('turretDark', box(BOX.halfW * 2 - 0.12, 0.012, 0.15), 0, BOX.y1 + 0.004, (front + BOX.z1) / 2);
  // the service cassette: a recessed louvre panel between two full-height frame members, five ribs across it
  const cx = 0.36, rz = BOX.z1;
  P.addEquipment('turretDark', box(0.46, 0.22, 0.012), cx, 0.47, rz - 0.004);
  for (const fx of [cx - 0.24, cx + 0.24]) P.addEquipment('turretDetail', box(0.022, h - 0.02, 0.022), fx, (BOX.y0 + BOX.y1) / 2, rz - 0.009);
  for (let k = 0; k < 5; k++) P.addEquipment('turretDetail', box(0.42, 0.012, 0.010), cx, 0.39 + k * 0.04, rz - 0.013);
}

/**
 * The rack behind the box (its slatted rear, posts and floor) and its load (the cans, three bundles, the tarp on the box's
 * lid); the slat arc round the bustle: a side panel a side on brackets from the wall and the box, a corner panel from it to
 * the rack's rear corner post. Every corner stays 9 cm inside the APU housings' reach.
 */
function bustleRackAndSlats(P: TankBuilderPort): void {
  const { box } = KIT;
  const rz = -3.26, rx = 0.90, fy = 0.25, side = 1.24, sz0 = -2.10, sz1 = -2.84, bars = [0.34, 0.43, 0.52, 0.61];
  const floor = new THREE.Shape([[-BOX.halfW, BOX.z1], [BOX.halfW, BOX.z1], [rx - 0.02, rz + 0.005], [-(rx - 0.02), rz + 0.005]]
    .map(([x, z]) => new THREE.Vector2(x, -z)));
  P.addEquipment('turretDark', new THREE.ExtrudeGeometry(floor, { depth: 0.016, bevelEnabled: false }).rotateX(-Math.PI / 2), 0, fy, 0);
  for (const y of [0.28, 0.47, 0.66]) P.addEquipment('turretDetail', box(rx * 2 + 0.03, 0.03, 0.03), 0, y, rz);
  for (const x of [-rx, -rx / 2, 0, rx / 2, rx]) P.addEquipment('turretDetail', box(0.03, 0.43, 0.03), x, fy + 0.215, rz);
  for (const s of [-1, 1]) {
    // the side panel: posts, bars, brackets back to the wall (front) and to the box's side (rear)
    for (const z of [sz0, sz1 + 0.01]) P.addEquipment('turretDetail', box(0.022, 0.36, 0.022), s * side, 0.48, z);
    for (const y of bars) P.addEquipment('turretDark', box(0.018, 0.028, sz0 - sz1 + 0.02), s * side, y, (sz0 + sz1) / 2);
    const wall = TS.wallAt(s, sz0) - 0.006;
    for (const y of [0.40, 0.58]) {
      P.addEquipment('turretDark', box(side - wall, 0.04, 0.04), s * (side + wall) / 2, y, sz0);
      P.addEquipment('turretDark', box(side - BOX.halfW + 0.006, 0.04, 0.04), s * (side + BOX.halfW - 0.006) / 2, y, sz1 + 0.01);
    }
    // the corner panel from the side panel's rear post to the rack's rear corner post
    const dx = s * (rx - side), dz = rz - sz1, len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
    for (const y of bars) P.addEquipment('turretDark', box(0.018, 0.028, len + 0.02), s * (side + rx) / 2, y, (sz1 + rz) / 2, 0, ry, 0);
  }
  // the load: the cans and a bundle on the right, a low bundle under the service cassette, a bundle at the left corner,
  // the tarp rolled on the box's lid against the rear plate
  const shelf = fy + 0.016, zc = (BOX.z1 + rz) / 2;
  KIT.jerryCan(P, 'turretCloth', -0.62, shelf + 0.246, zc, 0);
  KIT.stowage(P, 'turretCloth', P.rng, [[-0.16, shelf + 0.17, zc, 0.42, 0.34, 0.34], [0.36, shelf + 0.08, zc - 0.01, 0.40, 0.16, 0.30],
    [0.74, shelf + 0.15, zc, 0.26, 0.30, 0.30]]);
  KIT.tarpRoll(P, 'turretCloth', 0.40, BOX.y1 + 0.086, T.rearZ - 0.105, 0.90, 0.082, true, P.q ? 12 : 8);
}

/** The whips at the turret's antenna pots, asymmetric: the longer on the loader's side (+X), the shorter right. */
function whips(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  for (const [x, h, k] of [[-0.88017, 1.73, 0], [0.91495, 2.35, 1]] as const) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.0086, seed: ctx.seed + 20 + k, rotation: [-0.10, 0, 0] });
    whip.position.set(x, T.roofY + 0.10, -1.98);
    P.turretG.add(whip);
  }
}

function turretKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  cheekLayers(P);
  sideModules(P);
  roofKit(P);
  // the FLW 200, the full open-yoke station, on the bustle roof by the loader's hatch: behind the aft lifting eye's arch,
  // its gun passing between the hatches
  addLeopardFlw200(P, { fit: 'full', x: 0.10, z: -1.53, seed: ctx.seed + 33, name: `${tankSeedId(ctx.id)}Flw200Gun` });
  bustleBox(P);
  bustleRackAndSlats(P);
  whips(P, ctx);
}

/** The Leopard 2 Improved's kit, after the hull and the turret. */
export function addLeo2ImprovedKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  hullKit(P);
  turretKit(P, ctx);
}
