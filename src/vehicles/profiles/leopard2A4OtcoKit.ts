// The kit of the Leopard 2A4 OTCO (leo2a4_otco), the field/ISAF fit of the build it replaces (inventory leo2a4_otco.md;
// the old buildLeo2A6MSteps in leopard.ts) carried onto the release hull and the pre-wedge 2A4 turret
// (leopard2A4Family.ts). On the hull: the upper-glacis ERA field (a6m_upper_glacis_era) laid in chevron courses either
// side of the splash board's arms, between the headlight pods and ahead of the driver; the ISAF bar-armour cage (side runs
// outboard of the fore blocks and the aft panels, the flanges and the step between them, the bow-corner flares, the stern
// panel under the stern rack); the mine-protection belly plate; the driver's reinforced hatch frame; the glacis service
// cover and clamp studs; the tow cable slung on the lower glacis from the bow's eyes; the sponson lockers and bins, the
// pioneer tools, the width rods, the horn and three spare links on the front mudguards; the engine deck's rope, anti-slip
// fields and cleats; the jack, the convoy plate and the stern shackles. On the turret: the cheek ERA
// (a6m_turret_cheek_era_R/L) on the front block's vertical faces and round its cut corners, the EMES 15 pocket kept clear,
// and the bar grille over it; the Barracuda skins, mounting rails, clamps and fasteners round it; the 12.7 mm remote
// weapon station (the vehicle's one working roof gun); the spaced cassettes on the walls; the bustle rack, its slat cage
// on the flanks and tail with the ISAF placards; the rigid whips, antenna pots, crosswind mast, forward roof periscope,
// cooler box and the empty spare-MG cradles; the cross and the number.
//
// Frames: hull metres (+Z forward, y from the ground; the world's right of a +Z hull is -X); turret metres from the ring's
// centre on the deck. The old build was mirrored (its driver and EMES at +X): crew-station items are mirrored here.
// Armour only in the armour buckets: the ERA through eraField, the belly plate and the wall cassettes through
// addExternalArmor; every cage, rail, rack, bin, tool and fitting is equipment or detail.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { lineAt } from './leopard2Hull.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { Leopard2A4KitContext } from './leopard2A4Kit.ts';
import { LEOPARD2_HULL } from '../leopard2HullDatums.ts';
import { LEO2A4_TURRET } from '../leopard2A4FamilyArmor.ts';
import { leopard2A4WedgeFace, leopard2A4WedgeTop } from './leopard2A4Wedge.ts';
import {
  HULL_SURFACES as HS, TURRET_SURFACES as TS, bustleRack, crosswindMast, deckFrame, deckY, eraField, mudguardY,
  type CassetteSeat,
} from './leopard2A4KitParts.ts';

const H = LEOPARD2_HULL, T = LEO2A4_TURRET;
type V3 = THREE.Vector3;
const v3 = (x: number, y: number, z: number): V3 => new THREE.Vector3(x, y, z);

/** The eraCluster's base cassette (tankFactoryCore eraCluster): a seat's scale is over these. */
const ERA_BASE = [0.28, 0.13, 0.07] as const;

/** A box laid between two points (its local z along a -> b). */
function bar(P: TankBuilderPort, bucket: string, a: V3, b: V3, w: number, h = w): void {
  const d = b.clone().sub(a), len = d.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), d.normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  P.addEquipment(bucket, KIT.box(w, h, len), m.x, m.y, m.z, e.x, e.y, e.z);
}

/** The Euler (XYZ) of the frame whose x, y and z axes are the given orthonormal vectors. */
function basisEuler(x: V3, y: V3, z: V3): THREE.Euler {
  return new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** A cassette w x h x depth centred at `face` on a surface with outward normal n and in-plane x axis ax, sunk `embed`. */
function cassette(face: V3, ax: V3, n: V3, w: number, h: number, depth: number, embed: number): CassetteSeat {
  ax = ax.clone().addScaledVector(n, -ax.dot(n)).normalize();
  const ay = n.clone().cross(ax).normalize();
  return {
    center: face.clone().addScaledVector(n, depth / 2 - embed),
    rotation: basisEuler(ax, ay, n),
    scale: [w / ERA_BASE[0], h / ERA_BASE[1], depth / ERA_BASE[2]],
  };
}

// ----------------------------------------------------------------------------------------------------------- the hull

/** A plan rectangle (x, z) as four corners, from its centre, its unit along-axis and half-sizes. */
type Plan = Array<readonly [number, number]>;
function planRect(cx: number, cz: number, ux: number, uz: number, hw: number, hh: number): Plan {
  const nx = -uz, nz = ux;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + ux * hw * a + nx * hh * b, cz + uz * hw * a + nz * hh * b] as const);
}
const planBox = (x0: number, x1: number, z0: number, z1: number): Plan => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
/** Whether two convex plan polygons overlap (separating axes). */
function overlaps(p: Plan, q: Plan): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      const ax = -(z2 - z1), az = x2 - x1;
      const pa = p.map(([x, z]) => ax * x + az * z), qa = q.map(([x, z]) => ax * x + az * z);
      if (Math.max(...pa) < Math.min(...qa) || Math.max(...qa) < Math.min(...pa)) return false;
    }
  }
  return true;
}

/** The splash board's arms (leopard2Hull.ts hullFittings): centred |x| 0.38 at z 2.78, 0.88 long, 5 cm thick, yawed 0.54
 *  out and back from their apex ahead of the driver. */
const ARM = Object.freeze({ x: 0.38, z: 2.78, half: 0.44, yaw: 0.54 });
/** The glacis service cover inside the arms' V, ahead of the gun's line. */
const COVER = Object.freeze({ z: 2.81, w: 0.20, d: 0.14 });

/**
 * The upper-glacis ERA field: cassettes 0.22 x 0.12 in courses parallel to each splash-board arm (the chevron fit of a
 * field laid round a kept splash board), ahead of and inside the V, out to the shoulders behind the headlight pods, back
 * to z 2.05 on the left (+X) and ahead of the driver's periscopes and hatch on the right, clear of the pods, the fuel
 * fillers, the mudguards and the service cover; each sits on the glacis's secant plane under it, 15 mm into the plate.
 */
function glacisEraSeats(): CassetteSeat[] {
  const w = 0.22, h = 0.12, gap = 0.018, depth = 0.0756, embed = 0.015, clear = 0.045, a0 = 0.13;
  const c = Math.cos(ARM.yaw), s = Math.sin(ARM.yaw);
  const obstacles: Plan[] = [
    planBox(-0.95, -0.15, 1.70, 2.49),                                     // the driver's hatch and periscopes
    planBox(-COVER.w / 2 - 0.02, COVER.w / 2 + 0.02, COVER.z - COVER.d / 2 - 0.01, COVER.z + COVER.d / 2 + 0.01),
  ];
  for (const sx of [-1, 1]) {
    obstacles.push(planBox(Math.min(sx * 0.975, sx * 1.345), Math.max(sx * 0.975, sx * 1.345), 2.93, 3.28)); // pod + guards
    obstacles.push(planBox(Math.min(sx * 1.30, sx * 1.54), Math.max(sx * 1.30, sx * 1.54), 2.50, 2.74));    // filler
    obstacles.push(planBox(Math.min(sx * 1.04, sx * 1.73), Math.max(sx * 1.04, sx * 1.73), 3.15, 3.72));    // mudguard
    obstacles.push(planRect(sx * ARM.x, ARM.z, sx * c, -s, ARM.half + 0.03, 0.035));                         // the arm
  }
  const seats: CassetteSeat[] = [];
  for (const sx of [-1, 1]) {
    const ux = sx * c, uz = -s, nx = sx * s, nz = c;                       // along the arm (out and back); across it (forward)
    const ax = sx * (ARM.x - ARM.half * c), az = ARM.z + ARM.half * s;     // the apex
    for (const side of [1, -1]) {
      for (let k = 0; k < 12; k++) {
        const d = side * (clear + h / 2 + k * (h + gap));
        for (let j = -12; j <= 14; j++) {
          const a = a0 + j * (w + gap), cx = ax + ux * a + nx * d, cz = az + uz * a + nz * d;
          const plan = planRect(cx, cz, ux, uz, w / 2, h / 2);
          if (plan.some(([x, z]) => z > 3.38 || z < 2.05 || Math.abs(x) > 1.32 || sx * x < 0.012)) continue;
          if (obstacles.some((o) => overlaps(plan, o))) continue;
          // the secant plane over the footprint, lifted to touch the plate's highest point under it
          const zs = plan.map(([, z]) => z), zb = Math.min(...zs), zf = Math.max(...zs);
          const m = (deckY(zf) - deckY(zb)) / (zf - zb);
          let y0 = -Infinity;
          for (let i = 0; i <= 8; i++) {
            const z = zb + (zf - zb) * i / 8;
            y0 = Math.max(y0, deckY(z) - m * (z - cz));
          }
          for (const zk of [2.40, 3.00, 3.22]) if (zk > zb && zk < zf) y0 = Math.max(y0, deckY(zk) - m * (zk - cz));
          const n = v3(0, 1, -m).normalize(), along = v3(ux, m * uz, uz).normalize();
          seats.push(cassette(v3(cx, y0, cz), along, n, w, h, depth, embed));
        }
      }
    }
  }
  return seats;
}

/** A part laid flat on the glacis or deck at (x, z), lifted `lift` along its normal, turned `yaw` in the plate. */
function onDeck(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry, x: number, z: number, lift: number, yaw = 0): void {
  const f = deckFrame(x, z), p = f.point.clone().addScaledVector(f.normal, lift);
  P.add(bucket, g, p.x, p.y, p.z, f.rotation.x, yaw, 0);
}

/**
 * One run of the ISAF bar cage on a side: horizontal bars `rows` deep between y0 and y1 at |x| = x, a post at each
 * section's ends, stand-off brackets at the listed stations from the plate face at `seat` (the old leoSlatRun's cage).
 */
function slatRun(P: TankBuilderPort, sx: number, o: {
  x: number; seat: number; sections: ReadonlyArray<readonly [number, number]>; brackets: readonly number[];
  y0: number; y1: number; rows: number; lowY: number; highY: number;
}): void {
  const { box } = KIT;
  for (const [a, b] of o.sections) {
    for (let r = 0; r < o.rows; r++) {
      P.addEquipment('hullDetail', box(0.020, 0.020, b - a), sx * o.x, o.y0 + (o.y1 - o.y0) * r / (o.rows - 1), (a + b) / 2);
    }
    for (const z of [a + 0.014, b - 0.014]) P.addEquipment('hullDetail', box(0.028, o.y1 - o.y0 + 0.03, 0.028), sx * o.x, (o.y0 + o.y1) / 2, z);
  }
  for (const z of o.brackets) {
    for (const y of [o.lowY, o.highY]) {
      P.addEquipment('hullDark', box(o.x - o.seat + 0.012, 0.040, 0.042), sx * (o.x + o.seat - 0.012) / 2, y, z);
    }
  }
}

/** The ISAF bar cage on the hull: the side runs and their flanges, the step between the planes, the bow flares, the stern. */
function hullCage(P: TankBuilderPort): void {
  const { box } = KIT;
  const y0 = 0.88, y1 = 1.355, rows = 7, fx = HS.foreSkirtX + 0.10, ax = HS.aftSkirtX + 0.08, top = HS.skirtTopY;
  for (const sx of [-1, 1]) {
    // aft run on the six thin panels (face 1.72), its brackets clear of the panels' seams
    slatRun(P, sx, { x: ax, seat: HS.aftSkirtX - 0.008, y0, y1, rows, lowY: 0.93, highY: 1.32,
      sections: [[-2.80, -1.765], [-1.745, -0.71], [-0.69, 0.345], [0.365, 1.39]], brackets: [-2.275, -1.225, -0.175, 0.87] });
    // fore run on the heavy blocks (face 1.818), its brackets between the blocks' bolts
    slatRun(P, sx, { x: fx, seat: HS.foreSkirtX - 0.006, y0, y1, rows, lowY: 0.93, highY: 1.32,
      sections: [[1.43, 2.255], [2.275, 3.10]], brackets: [1.84, 2.70] });
    // flanges over each run's top to the skirt's top edge, the step between the planes at the blocks' leader
    P.addEquipment('hullDark', box(ax + 0.006 - 1.722, 0.018, 4.20), sx * (ax + 0.006 + 1.722) / 2, top + 0.01, -0.705);
    P.addEquipment('hullDark', box(fx + 0.006 - 1.820, 0.018, 1.68), sx * (fx + 0.006 + 1.820) / 2, top + 0.01, 2.265);
    for (let r = 0; r < rows; r++) {
      P.addEquipment('hullDetail', box(fx - ax + 0.02, 0.020, 0.026), sx * (fx + ax) / 2, y0 + (y1 - y0) * r / (rows - 1), 1.41);
    }
    P.addEquipment('hullDark', box(fx - ax + 0.03, 0.018, 0.08), sx * (fx + ax) / 2, top + 0.028, 1.41);
    // the bow-corner flare: from the fore run's end round the idler to the mudguard's outer edge
    const p0 = v3(sx * fx, 0, 3.10), p1 = v3(sx * 1.76, 0, 3.43);
    for (let r = 0; r < rows; r++) {
      const y = y0 + (y1 - y0) * r / (rows - 1);
      bar(P, 'hullDetail', p0.clone().setY(y), p1.clone().setY(y), 0.020);
    }
    P.addEquipment('hullDetail', box(0.026, y1 - y0 + 0.03, 0.026), p1.x, (y0 + y1) / 2, p1.z);
    P.addEquipment('hullDark', box(fx - HS.foreSkirtX + 0.012, 0.040, 0.042), sx * (fx + HS.foreSkirtX - 0.012) / 2, 1.05, 3.08);
    P.addEquipment('hullDark', box(1.76 - 1.715, 0.040, 0.042), sx * (1.76 + 1.715) / 2, 1.28, 3.43);
  }
  // the stern panel behind the rear plate, under the stern rack and its stays, clear of the tow hooks and cables
  const z = HS.rearZ - 0.16, w = 3.10;
  for (let r = 0; r < 6; r++) P.addEquipment('hullDetail', box(w, 0.024, 0.024), 0, 1.01 + r * 0.08, z);
  for (let i = 0; i < 9; i++) {
    const x = -w * 0.47 + w * 0.94 * i / 8;
    P.addEquipment('hullDetail', box(0.028, 0.45, 0.028), x, 1.21, z);
    // the drop brackets at every other post to the exhaust band's foot rail
    const bl = HS.rearZ - 0.015 - z;
    if (i % 2 === 0) P.addEquipment('hullDark', box(0.038, 0.038, bl), x, 1.385, z + bl / 2);
  }
  for (const x of [-0.55, 0.55]) P.addEquipment('hullDark', box(0.038, 0.038, HS.rearZ - z + 0.012), x, 1.01, (z + HS.rearZ) / 2);
  // the convoy marker plate bolted to the panel's bars under the convoy light
  P.addEquipment('hullDetail', box(0.30, 0.16, 0.015), 0, 1.13, z - 0.0195);
  for (const dx of [-0.12, 0.12]) P.addEquipment('hullDark', KIT.cylZ(0.012, 0.01, 8), dx, 1.13, z - 0.031);
}

/** The mine-protection plate bolted under the belly and up the lower glacis's first facet, its lip, seams and bolt pads. */
function bellyPlate(P: TankBuilderPort): void {
  const { box } = KIT;
  const yb = HS.bellyY, z0 = -3.30, z1 = 2.44;
  P.addExternalArmor('hull', box(1.86, 0.06, z1 - z0), 0, yb - 0.025, (z0 + z1) / 2);
  // the lower glacis's first facet (z 2.45 -> 2.80, rising to 0.60): the plate turns up it
  const [fz0, fy0] = [2.45, lineAt(H.belly, 2.45)], [fz1, fy1] = [2.80, lineAt(H.belly, 2.80)];
  const len = Math.hypot(fz1 - fz0, fy1 - fy0), rx = -Math.atan2(fy1 - fy0, fz1 - fz0);
  const nY = Math.cos(rx), nZ = Math.sin(rx);                                // the facet's upward normal
  const mz = (fz0 + fz1) / 2, my = (fy0 + fy1) / 2;
  P.addExternalArmor('hull', box(1.86, 0.06, len + 0.02), 0, my - 0.025 * nY, mz - 0.025 * nZ, rx, 0, 0);
  P.add('hullDark', box(1.90, 0.032, 0.08), 0, fy1 - 0.035, fz1 - 0.02, rx, 0, 0);          // forward lip
  for (const sx of [-1, 1]) {
    P.add('hullDark', box(0.03, 0.05, z1 - z0 - 0.10), sx * 0.945, yb - 0.035, (z0 + z1) / 2);     // side seam strips
    for (let k = 0; k < 6; k++) P.add('hullDetail', box(0.05, 0.02, 0.05), sx * 0.80, yb - 0.059, 2.20 - k * 1.0); // bolt pads
  }
}

/** The driver's reinforced hatch frame round his ring (open ahead, for the periscopes), and its hinge pots. */
function driverHatchFrame(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const [hx, hz] = HS.driverHatch, r = 0.345;
  for (const sx of [-1, 1]) onDeck(P, 'hullDetail', box(0.035, 0.03, 0.56), hx + sx * r, hz - 0.06, 0.012);
  onDeck(P, 'hullDetail', box(2 * r + 0.035, 0.03, 0.035), hx, hz - 0.38, 0.012);
  for (const sx of [-1, 1]) onDeck(P, 'hullDetail', cylY(0.04, 0.045, 0.05, P.q ? 12 : 8), hx + sx * 0.16, hz - 0.30, 0.02);
}

/** The glacis's hardware the ERA leaves showing: the centre service cover in the arms' V and the field's clamp studs. */
function glacisHardware(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  onDeck(P, 'hullDetail', box(COVER.w, 0.03, COVER.d), 0, COVER.z, 0.010);
  onDeck(P, 'hullDark', box(COVER.w - 0.04, 0.010, 0.014), 0, COVER.z + COVER.d / 2 - 0.02, 0.026);
  for (const [x, z] of GLACIS_STUDS) onDeck(P, 'hullDetail', cylY(0.026, 0.03, 0.03, P.q ? 10 : 8), x, z, 0.010);
}
/** The ERA field's clamp studs: four a side in the open seam the courses leave along each arm's line, past its tip. */
const GLACIS_STUDS: ReadonlyArray<readonly [number, number]> = [-1, 1].flatMap((sx) => [0.95, 1.13, 1.31, 1.49].map((a) => {
  const c = Math.cos(ARM.yaw), s = Math.sin(ARM.yaw);
  return [sx * (ARM.x - ARM.half * c + c * a), ARM.z + ARM.half * s - s * a] as const;
}));

/** The tow cable slung on the lower glacis between the bow's tow eyes, clamped at its foot and either side. */
function lowerGlacisCable(P: TankBuilderPort): void {
  const { box } = KIT;
  const r = 0.024;
  /** A point on the lower glacis at (x, z), lifted `lift` off it along its outward (forward and down) normal. */
  const onLower = (x: number, z: number, lift: number): { p: V3; rx: number } => {
    const e = 0.01, dy = (lineAt(H.belly, z + e) - lineAt(H.belly, z - e)) / (2 * e);
    const n = v3(0, -1, dy).normalize();
    return { p: v3(x, lineAt(H.belly, z), z).addScaledVector(n, lift), rx: Math.atan2(n.z, n.y) };
  };
  const pts: Array<[number, number, number]> = [];
  for (const s of [-1, -0.85, -0.62, -0.38, -0.15, 0, 0.15, 0.38, 0.62, 0.85, 1]) {
    const a = Math.abs(s), x = s * 0.70, z = 3.10 + 0.36 * a;
    const { p } = onLower(x, z, r + 0.004);
    pts.push(a === 1 ? [x, 0.98, 3.47] : [p.x, p.y, p.z]);
  }
  KIT.towCable(P, pts, r);
  for (const s of [-0.38, 0, 0.38]) {
    const { p, rx } = onLower(s * 0.70, 3.10 + 0.36 * Math.abs(s), 0.006);
    P.add('hullDetail', box(0.085, 0.018, 0.075), p.x, p.y, p.z, rx, 0, 0);
  }
}

/** The fender and deck stowage: lockers and bins on the sponsons, the pioneer tools, rope, anti-slip and cleats. */
function deckStowage(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const sx of [-1, 1]) {
    // the low lockers under the turret floor's sweep (1.698), and the bins aft, beyond the radius (2.65 m) where the
    // wedge's underside has risen clear of them and under the bustle's floor (1.854)
    for (const [bz, bl, bh] of [[0.55, 1.10, 0.025], [-2.265, 0.63, 0.10]] as const) {
      const f = deckFrame(1.50, bz), y = f.point.y, rx = f.rotation.x;
      P.add('hullDetail', box(0.27, bh, bl), sx * 1.50, y + bh / 2 - 0.003, bz, rx, 0, 0);
      P.add('hullDetail', box(0.29, 0.012, bl + 0.02), sx * 1.50, y + bh + 0.003, bz, rx, 0, 0);
      const ly = bz > 0 ? y + bh * 0.5 : y + bh * 0.6;
      for (const dz of [-0.28, 0.28]) P.add('hullDark', box(0.012, Math.min(0.05, bh * 0.7), 0.08), sx * 1.636, ly, bz + bl * dz);
    }
  }
  // shovel (-X) and axe (+X) on the sponsons' edges between the lockers and the bins
  KIT.shovelTool(P, -1.60, deckY(-0.74) + 0.016, -0.74);
  onDeck(P, 'hullWood', box(0.03, 0.022, 0.62), 1.60, -0.72, 0.011);
  onDeck(P, 'hullDark', box(0.05, 0.028, 0.15), 1.60, -0.46, 0.014);
  // crowbar on the engine deck's right, inboard of the bin
  onDeck(P, 'hullDark', box(0.028, 0.024, 0.85), -1.28, -2.125, 0.012);
  // the tow rope laid on the engine deck behind the access plates, ahead of the deck's step
  KIT.towCable(P, [[-1.12, deckY(-2.47) + 0.014, -2.47], [-0.50, deckY(-2.57) + 0.014, -2.57], [0.50, deckY(-2.57) + 0.014, -2.57],
    [1.12, deckY(-2.47) + 0.014, -2.47]], 0.016);
  // the deck's anti-slip fields beside the ring and two flat tie-down cleats
  for (const [x, z0, z1] of [[-1.19, -0.20, 1.12], [1.19, -0.20, 1.12]] as const) {
    P.add('hullRubber', box(0.30, 0.006, z1 - z0), x, deckY((z0 + z1) / 2) + 0.002, (z0 + z1) / 2);
  }
  for (const [x, z] of [[-1.19, 1.30], [1.19, -0.40]] as const) P.add('hullDetail', box(0.10, 0.012, 0.05), x, deckY(z) + 0.006, z);
}

/** The bow's fittings on the front mudguards: the width rods, the Bosch horn (left), three spare links (right). */
function mudguardFittings(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const { box, cylY, cylZ, sph } = KIT;
  for (const sx of [-1, 1]) {
    const y = mudguardY(3.55);
    P.add('hullDetail', cylY(0.008, 0.008, 0.31, 6), sx * 1.66, y + 0.15, 3.55);
    P.add('hullDetail', sph(0.016, 8), sx * 1.66, y + 0.31, 3.55);
  }
  const hy = mudguardY(3.36);
  P.add('hullDark', box(0.09, 0.07, 0.11), 1.42, hy + 0.028, 3.36);
  P.add('hullDark', KIT.xform(cylZ(0.035, 0.02, 10), 0, 0, 0.062), 1.42, hy + 0.028, 3.36);
  // three spare links across the right mudguard, laid with its fall
  const mz = 3.45, slope = (mudguardY(mz + 0.01) - mudguardY(mz - 0.01)) / 0.02, rx = Math.atan(-slope);
  const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.24, pitch: 0.16, seed: ctx.seed + 61, rotation: [rx, Math.PI / 2, 0] });
  links.position.set(-1.36, mudguardY(mz) + 0.041 * Math.cos(rx), mz + 0.041 * Math.sin(rx));
  P.hullG.add(links);
}

/** The rear: the wooden jack under the crossed cables, D-shackles through the tow hooks' eyes. */
function sternFittings(P: TankBuilderPort): void {
  P.add('hullWood', KIT.box(0.24, 0.10, 0.08), 0, 0.88, HS.rearZ - 0.039);
  for (const sx of [-1, 1]) P.add('hullDark', KIT.xform(KIT.torus(0.045, 0.013, 12), 0, 0, 0, 0, 0, Math.PI / 2), sx * 0.80, 0.80, -3.965);
}

function hullKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  eraField(P, 'a6m_upper_glacis_era', glacisEraSeats());
  glacisHardware(P);
  driverHatchFrame(P);
  hullCage(P);
  bellyPlate(P);
  lowerGlacisCable(P);
  deckStowage(P);
  mudguardFittings(P, ctx);
  sternFittings(P);
}

// --------------------------------------------------------------------------------------------------------- the turret

const wallOf = (sx: number): number => sx < 0 ? T.wallRightM : T.wallLeftM;
type Side = 1 | -1;
/** The wedge's front face (leopard2A4WedgeFace): u from the tip (0) to the shoulder (1), v from its foot (0) to its top
 *  edge (1). Side +1 is the left (+X) wedge, the spec helpers' "R" plate. */
const wedgeAt = (side: Side, u: number, v: number): ReturnType<typeof leopard2A4WedgeFace> => leopard2A4WedgeFace(side, u, v);
/** The cheek ERA's mounting rail under each wedge's front-face top edge (the cassettes themselves lie on the tops, the old
 *  OTCO's 56 a side; a second course on the faces would grow its coverage past the old build's). */
const CHEEK = Object.freeze({ stations: 10, gap: 0.012, depth: 0.0588, embed: 0.024, course: 0.055, foot: 0.006,
  rail: 0.016, minH: 0.028 });


/**
 * The cheek ERA's main field on each wedge's sloped top, where the old OTCO laid it (its 7 courses x 8 stations): eight
 * stations across the wedge from the mantlet cover's sweep (|x| 0.26) outward, seven courses along each from just behind
 * the front edge (leopard2A4WedgeTop) back to the side module's turn, or on the right short of the EMES 15 housing. Each
 * cassette is fitted to the drawn top under it (rays against the turret's armour: the top is lofted between the 2A6 X's
 * stations, and on the right wedge cut ~10 cm lower than the sampler's planes over the EMES 15's port channel), sunk 8 mm
 * at its lowest point.
 */
const TOP = Object.freeze({ courses: 7, gap: 0.016, depth: 0.0588, lid: 0.011, sink: 0.008, edge: 0.012, inner: 0.275,
  /** The right wedge's housing clearance (the housing's front runs z 1.66..1.79) and the window's foot: cassettes in the
   *  sight's lane stay under it. */
  emesBackZ: 1.82, emesLane: Object.freeze([0.47, 0.98] as const), windowFootY: 0.68 });

/**
 * The top's stations [centre |x|, width] on one wedge, kept off the edges that run along it: the outboard chamfer's (left
 * |x| ~1.17, right ~1.27), and on the right the EMES 15 port channel's walls (|x| 0.478 and 0.971, the 2A6 X's strip
 * stations in leopard2A4Wedge.ts).
 */
function topStations(side: Side): Array<[number, number]> {
  const regions: ReadonlyArray<readonly [number, number, number]> = side > 0 ? [[TOP.inner, 1.15, 8]]
    : [[TOP.inner, 0.4697, 2], [0.4857, 0.9627, 4], [0.9787, 1.255, 2]];
  const out: Array<[number, number]> = [];
  for (const [x0, x1, n] of regions) {
    const w = (x1 - x0 - (n - 1) * TOP.gap) / n;
    for (let k = 0; k < n; k++) out.push([x0 + w / 2 + k * (w + TOP.gap), w]);
  }
  return out;
}

/** The front edge of a wedge's top at |x| (where its outer edge reaches x, from the tip back), turret z. */
function topFrontZ(side: Side, x: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(leopard2A4WedgeTop(side, mid, 1).point.x) < x) lo = mid; else hi = mid;
  }
  return leopard2A4WedgeTop(side, hi, 1).point.z;
}

/** A cassette fitted to the drawn top over the plan rectangle |x| xc +- w/2, z zc +- dz/2: its seat, or null where the top
 *  under it varies more than the cassette can hide, or it would stand into the EMES 15's sight lane. */
function topCassette(side: Side, xc: number, w: number, zc: number, dz: number, ray: TurretRay, lane: boolean): CassetteSeat | null {
  const pts: V3[] = [];
  for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const hit = ray(v3(side * (xc + i * (w / 2 - 0.004)), 1.5, zc + j * (dz / 2 - 0.004)), v3(0, -1, 0));
    if (!hit) return null;
    pts.push(hit.point);
  }
  const n = pts[2].clone().sub(pts[0]).cross(pts[3].clone().sub(pts[1])).normalize();
  if (n.y < 0) n.negate();
  const c = pts.reduce((t, p) => t.add(p), v3(0, 0, 0)).multiplyScalar(1 / pts.length);
  const d = pts.map((p) => p.clone().sub(c).dot(n)), lo = Math.min(...d), hi = Math.max(...d);
  if (hi - lo > TOP.depth - TOP.sink - 0.006) return null;
  // the cassette's foot 8 mm under the top's lowest point beneath it
  const foot = c.clone().addScaledVector(n, lo - TOP.sink);
  if (lane && foot.y + (TOP.depth + TOP.lid) * n.y > TOP.windowFootY) return null;
  const len = dz * Math.hypot(1, n.z / n.y);
  return cassette(foot, v3(1, 0, 0), n, w, len, TOP.depth, 0);
}

/** A station's run on the top (front and back z): on the right in the sight's lane it ends where a cassette would rise
 *  into the window's view. */
function topRun(side: Side, xc: number, w: number, ray: TurretRay): { front: number; back: number } {
  const front = topFrontZ(side, xc + w / 2) - TOP.edge;
  let back = (side > 0 ? leopard2A4WedgeTop(side, 1, 0.5).point.z : TOP.emesBackZ) + TOP.edge;
  if (side < 0 && xc > TOP.emesLane[0] && xc < TOP.emesLane[1]) {
    for (let z = front - 0.06; z > back; z -= 0.01) {
      if (!topCassette(side, xc, w, z, 0.06, ray, true)) { back = z + 0.03; break; }
    }
  }
  return { front, back };
}

/** The top field's seats on one wedge, turret metres: seven equal courses a station. */
function topEraSeats(side: Side, ray: TurretRay): CassetteSeat[] {
  const seats: CassetteSeat[] = [];
  for (const [xc, w] of topStations(side)) {
    const { front, back } = topRun(side, xc, w, ray);
    const lane = side < 0 && xc > TOP.emesLane[0] && xc < TOP.emesLane[1];
    const dz = (front - back - (TOP.courses - 1) * TOP.gap) / TOP.courses;
    for (let c = 0; c < TOP.courses; c++) {
      const seat = topCassette(side, xc, w, front - dz / 2 - c * (dz + TOP.gap), dz, ray, lane);
      if (seat) seats.push(seat);
    }
  }
  return seats;
}

/**
 * The bar grille over a wedge's top field, 85 mm out along the top's normal (the old addLeo2A6MCheekCage): six rails
 * across the field at fractions of each station's run, uprights along it at the field's ends and in its seams, stand-off
 * ties from the top through the seams; on the right it leaves the EMES 15's sight lane open.
 */
function cheekCage(P: TankBuilderPort, side: Side, ray: TurretRay): void {
  const off = 0.085, st = topStations(side), runs = st.map(([xc, w]) => topRun(side, xc, w, ray));
  /** The cage's point over |x| at fraction f of the run there (runs interpolated between stations). */
  const at = (x: number, f: number, o = off): V3 | null => {
    let i = st.findIndex(([xc]) => xc >= x);
    if (i < 0) i = st.length - 1;
    const j = Math.max(0, i - 1), t = i === j ? 0 : THREE.MathUtils.clamp((x - st[j][0]) / (st[i][0] - st[j][0]), 0, 1);
    const front = THREE.MathUtils.lerp(runs[j].front, runs[i].front, t), back = THREE.MathUtils.lerp(runs[j].back, runs[i].back, t);
    const hit = smoothHit(ray, side * x, THREE.MathUtils.lerp(front, back, f));
    return hit ? hit.point.addScaledVector(hit.normal, o) : null;
  };
  const line = (pts: Array<V3 | null>, wbar: number, bucket = 'turretDetail'): void => {
    for (let k = 0; k + 1 < pts.length; k++) if (pts[k] && pts[k + 1]) bar(P, bucket, pts[k]!, pts[k + 1]!, wbar);
  };
  // the cage's spans across the wedge: the whole field on the left; on the right either side of the sight's lane
  const spans: Array<[number, number]> = side > 0 ? [[TOP.inner, 1.15]] : [[TOP.inner, 0.4697], [0.9787, 1.255]];
  for (const [x0, x1] of spans) {
    const inside = st.map(([xc]) => xc).filter((x) => x > x0 && x < x1);
    const xs = [x0 + 0.01, ...inside, x1 - 0.01];
    for (const f of [0.04, 0.22, 0.40, 0.58, 0.76, 0.94]) line(xs.map((x) => at(x, f)), 0.022);
    const seams = inside.slice(0, -1).map((x, k) => (x + inside[k + 1]) / 2);
    const ups = [x0 + 0.01, ...seams.filter((_, k) => k % 2 === 0), x1 - 0.01];
    for (const x of ups) line([0.02, 0.25, 0.5, 0.75, 0.96].map((f) => at(x, f)), 0.024);
    for (const x of seams.filter((_, k) => k % 2 === 0)) {
      for (const f of [0.15, 0.85]) {
        const foot = at(x, f, -0.01), head = at(x, f);
        if (foot && head) bar(P, 'turretDark', foot, head, 0.016);
      }
    }
  }
}

/** A ray against the turret's own armour (the 'turret' bucket's parts, turret metres): the first hit, its normal facing the
 *  ray's origin. */
type TurretRay = (from: V3, dir: V3) => { point: V3; normal: V3 } | null;
function turretRay(P: TankBuilderPort): TurretRay {
  const meshes: THREE.Mesh[] = [];
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  P.forEachBucketPart('turret', (g) => { meshes.push(new THREE.Mesh(g, mat)); });
  const rc = new THREE.Raycaster();
  return (from, dir) => {
    rc.set(from, dir.clone().normalize());
    const hit = rc.intersectObjects(meshes, false)[0];
    if (!hit?.face) return null;
    const normal = hit.face.normal.clone();
    if (normal.dot(dir) > 0) normal.negate();
    return { point: hit.point.clone(), normal };
  };
}

/** A point straight down on the turret's armour at (x, z) and the normal of the top round it (from rays 3 cm either side:
 *  the drawn tops are lofted, their single triangles' normals kinked by a few degrees). */
function smoothHit(ray: TurretRay, x: number, z: number, r = 0.03): { point: V3; normal: V3 } | null {
  const down = v3(0, -1, 0), at = (dx: number, dz: number) => ray(v3(x + dx, 1.5, z + dz), down)?.point;
  const c = at(0, 0), xa = at(-r, 0), xb = at(r, 0), za = at(0, -r), zb = at(0, r);
  if (!c || !xa || !xb || !za || !zb) return null;
  const normal = zb.clone().sub(za).cross(xb.clone().sub(xa)).normalize();
  return { point: c, normal: normal.y < 0 ? normal.negate() : normal };
}

/** A part laid on a surface point with its +Y along the normal and its +X along `along` (projected into the surface). */
function onSurface(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry, p: V3, n: V3, along: V3, lift: number): void {
  const ax = along.clone().addScaledVector(n, -along.dot(n)).normalize(), az = ax.clone().cross(n).normalize();
  const e = basisEuler(ax, n, az), c = p.clone().addScaledVector(n, lift);
  P.addEquipment(bucket, g, c.x, c.y, c.z, e.x, e.y, e.z);
}

/**
 * The Barracuda and appliqué hardware round the cheek ERA: the ERA's mounting rail along each face's top edge with three
 * clamps hooking over its top course, a thin Barracuda skin on the wedge's top behind it with its five fastener heads.
 */
function cheekHardware(P: TankBuilderPort, side: Side, ray: TurretRay): void {
  const { box, cylY } = KIT;
  const top = (u: number, o: number): V3 => {
    const f = wedgeAt(side, u, 1);
    return f.point.clone().addScaledVector(f.normal, o).setY(f.point.y - CHEEK.rail / 2);
  };
  // the rail: a dark strip on the face under its top edge, from where the face stands 9 cm to the shoulder; three clamps on
  // it reaching down over the top course
  const a = top(0.20, 0.008), b = top(0.985, 0.008);
  bar(P, 'turretDark', a, b, 0.016, 0.014);
  for (const u of [0.40, 0.65, 0.90]) {
    const f = wedgeAt(side, u, 1), p = f.point.clone().addScaledVector(f.normal, 0.013).setY(f.point.y - CHEEK.rail - 0.012);
    P.addEquipment('turretDetail', box(0.045, 0.06, 0.03), p.x, p.y, p.z, 0, f.rotation.y, 0);
  }
  // the Barracuda skin on the strip of the wedge's top the ERA leaves behind it (on the right between the mantlet cover's
  // sweep and the EMES 15 housing): a thin slab conforming to the plates under it, its five fastener heads
  const [x0, x1] = side > 0 ? [0.32, 0.86] : [0.285, 0.45], z0 = 1.16, z1 = 1.76;
  const at = (s: number, t: number): { point: V3; normal: V3 } | null =>
    ray(v3(side * THREE.MathUtils.lerp(x0, x1, s), 1.5, THREE.MathUtils.lerp(z1, z0, t)), v3(0, -1, 0));
  P.addEquipment('turret', conformalSlab(at, 6, 8, 0.012));
  for (const [s, t] of [[0.10, 0.06], [0.90, 0.06], [0.5, 0.5], [0.10, 0.94], [0.90, 0.94]] as const) {
    const hit = at(s, t);
    if (hit) onSurface(P, 'turretDetail', cylY(0.018, 0.018, 0.012, 8), hit.point, hit.normal, v3(0, 0, 1), 0.014);
  }
}

/** A thin slab laid on a surface: `at(s, t)` (s, t in 0..1) gives its points and normals; nu x nv cells, `thick` deep,
 *  its underside 3 mm into the plate. Null samples are left out of the slab's cells. */
function conformalSlab(at: (s: number, t: number) => { point: V3; normal: V3 } | null, nu: number, nv: number,
  thick: number): THREE.BufferGeometry {
  const top: V3[] = [], bot: V3[] = [], hits: boolean[] = [], normals: V3[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const hit = at(i / nu, j / nv);
      const p = hit ? hit.point : v3(0, 0, 0), n = hit ? hit.normal : v3(0, 1, 0);
      top.push(p.clone().addScaledVector(n, thick - 0.003));
      bot.push(p.clone().addScaledVector(n, -0.003));
      hits.push(!!hit);
      normals.push(n);
    }
  }
  const pos: number[] = [], k = (i: number, j: number): number => j * (nu + 1) + i;
  const quad = (a: V3, b: V3, c: V3, d: V3): void => { pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray()); };
  // a cell stands only where all four of its samples found the plate; the rim closes every edge with no cell beyond it
  const cell = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < nu && j < nv
    && hits[k(i, j)] && hits[k(i + 1, j)] && hits[k(i + 1, j + 1)] && hits[k(i, j + 1)];
  const rim = (i0: number, j0: number, i1: number, j1: number): void => quad(top[k(i0, j0)], top[k(i1, j1)], bot[k(i1, j1)], bot[k(i0, j0)]);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      if (!cell(i, j)) continue;
      quad(top[k(i, j)], top[k(i + 1, j)], top[k(i + 1, j + 1)], top[k(i, j + 1)]);
      quad(bot[k(i, j)], bot[k(i, j + 1)], bot[k(i + 1, j + 1)], bot[k(i + 1, j)]);
      if (!cell(i, j - 1)) rim(i + 1, j, i, j);
      if (!cell(i, j + 1)) rim(i, j + 1, i + 1, j + 1);
      if (!cell(i - 1, j)) rim(i, j, i, j + 1);
      if (!cell(i + 1, j)) rim(i + 1, j + 1, i + 1, j);
    }
  }
  // the grid's sense turns with the side it is mirrored to: wind every face so the top faces out along the plate's
  // normal (inside out, the slab drew its underside to the eye and its rims open)
  for (let j = 0, done = false; j < nv && !done; j++) {
    for (let i = 0; i < nu && !done; i++) {
      if (!cell(i, j)) continue;
      const a = top[k(i, j)], e1 = top[k(i + 1, j)].clone().sub(a), e2 = top[k(i + 1, j + 1)].clone().sub(a);
      if (e1.cross(e2).dot(normals[k(i, j)]) < 0) {
        for (let t = 0; t < pos.length; t += 9) for (let c = 0; c < 3; c++) [pos[t + 3 + c], pos[t + 6 + c]] = [pos[t + 6 + c], pos[t + 3 + c]];
      }
      done = true;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i], pos[i + 2]);                   // plan-projected (the bucket's own UVs re-project)
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** The chamfer studs: four a side on the side modules' steep outboard chamfer, ahead of the wall cassettes. */
function chamferStuds(P: TankBuilderPort, ray: TurretRay): void {
  for (const sx of [-1, 1]) {
    for (const z of [1.20, 1.36, 1.52, 1.68]) {
      const hit = ray(v3(sx * 2.2, 1.0, z), v3(-sx * 0.82, -0.57, 0));
      if (!hit || Math.abs(hit.normal.x) < 0.5) continue;
      onSurface(P, 'turretDetail', KIT.cylY(0.018, 0.018, 0.016, 8), hit.point, hit.normal, v3(0, 0, 1), 0.004);
    }
  }
}

/** The turret walls' spaced cassettes, five a side between the ammunition hatch and the side modules' roots, bolted. */
function wallCassettes(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const th = 0.045, len = 0.215, pitch = 0.245, z0 = T.wedge.rootZ - 0.07 - len / 2 - 4 * pitch;
  for (const sx of [-1, 1]) {
    const x = sx * (wallOf(sx) + th / 2 - 0.003);
    for (let k = 0; k < 5; k++) {
      const z = z0 + k * pitch;
      P.addExternalArmor('turret', box(th, 0.28, len), x, 0.32, z);
      for (const dz of [-0.07, 0.07]) P.addEquipment('turretDetail', cylX(0.014, 0.016, 8), sx * (wallOf(sx) + th + 0.004), 0.32, z + dz);
    }
  }
}

/** The 12.7 mm remote weapon station on the bustle roof behind the hatches and the aft lifting arch (the old
 *  addLeo2A6MRoofRCWS): bearing, housing, cap, sensor head and the working remote M2. */
function roofRcws(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const { box, cylY, torus } = KIT;
  const x = 0.08, z = -1.62, seat = T.roofY - 0.01, seg = P.q ? 20 : 14;
  P.addEquipment('turret', cylY(0.20, 0.22, 0.08, seg), x, seat + 0.04, z);
  P.addEquipment('turretDark', torus(0.19, 0.018, seg, 8), x, seat + 0.085, z);
  P.addEquipment('turret', box(0.36, 0.16, 0.34), x, seat + 0.175, z);
  P.addEquipment('turretDetail', box(0.32, 0.025, 0.30), x, seat + 0.2675, z);
  P.addEquipment('turretDark', box(0.14, 0.16, 0.15), x + 0.24, seat + 0.185, z - 0.03);
  P.addEquipment('turretGlass', box(0.10, 0.07, 0.014), x + 0.24, seat + 0.195, z + 0.052);
  const mg = FITTINGS.pintleMG({ remoteControlled: true, ridingCradle: true, mats: P.mats, cls: 'm2', scale: 0.72,
    tone: 'two-tone', elev: 0.035, ammo: true, shield: false, ring: false, seed: ctx.seed + 24 });
  mg.name = 'leo2A6MRemoteMachineGun';
  mg.position.set(x, seat + 0.195, z + 0.05);
  mg.userData.remoteControlled = true;
  P.turretG.add(mg);
}

/** The roof's field fit: rigid whips on the radios' bases, antenna pots, the crosswind mast, the forward periscope plate. */
function roofFit(P: TankBuilderPort): void {
  const { box, cylY, sph } = KIT;
  const roof = T.roofY;
  for (const ax of [-0.88017, 0.91495]) {
    P.addEquipment('turretDark', cylY(0.02, 0.02, 0.07, 10), ax, roof + 0.13, -1.98);
    P.addEquipment('turretDetail', cylY(0.007, 0.010, 0.95, 6), ax, roof + 0.10 + 0.475, -1.98);
    P.addEquipment('turretDetail', sph(0.014, 8), ax, roof + 1.055, -1.98);
  }
  for (const [x, w] of [[0.905, 0.035], [-0.865, 0.03]] as const) {
    P.addEquipment('turretDetail', cylY(w, w + 0.006, 0.08, 10), x, roof + 0.04, -0.77);
    P.addEquipment('turretDark', cylY(0.012, 0.012, 0.05, 8), x, roof + 0.105, -0.77);
  }
  crosswindMast(P, -0.55, -1.80);
  // the forward roof plate and periscope ahead of the loader's ring (mirrored from the old build's left)
  const roofAt = (z: number): number => THREE.MathUtils.lerp(0.7904, 0.739, (z - 0.3715) / (T.blockZ - 0.3715));
  const tilt = Math.atan((0.7904 - 0.739) / (T.blockZ - 0.3715));
  P.addEquipment('turretDetail', box(0.30, 0.028, 0.38), 0.85, roofAt(0.70) + 0.010, 0.70, tilt, 0, 0);
  P.addEquipment('turretDark', box(0.24, 0.012, 0.02), 0.85, roofAt(0.90) + 0.026, 0.90, tilt, 0, 0);
  P.addEquipment('turretDetail', box(0.14, 0.07, 0.10), 0.62, roofAt(0.98) + 0.03, 0.98, tilt, 0, 0);
  P.addEquipment('turretGlass', box(0.11, 0.028, 0.012), 0.62, roofAt(0.98) + 0.042, 1.031, tilt, 0, 0);
}

/** The bustle: its rack, the slat cage on its flanks behind the smoke rows and across its tail, the placards, the cooler
 *  box and the empty spare-MG cradles on the roof. */
function bustleFit(P: TankBuilderPort): void {
  const { box } = KIT;
  /** The bustle roof's height at z (level to -1.81, falling to the bustle's end, then to the rear plate). */
  const roofAt = (z: number): number => z >= T.bustleEndZ
    ? T.roofY - (T.roofY - 0.775) * THREE.MathUtils.clamp((z + 1.8062) / (T.bustleEndZ + 1.8062), 0, 1)
    : THREE.MathUtils.lerp(0.775, T.rearRoofY, (T.bustleEndZ - z) / (T.bustleEndZ - T.rearZ));
  const rack = bustleRack(P, { halfW: 1.06, depth: 0.32, low: 0.28, top: 0.66, rails: 3, bars: 9 });
  // the tail cage 12 cm behind the rack, dropped to the rack's middle rail on four brackets
  const tz = rack.backZ - 0.12;
  for (let r = 0; r < 7; r++) P.addEquipment('turretDetail', box(2.10, 0.022, 0.024), 0, 0.28 + r * 0.075, tz);
  for (let i = 0; i < 7; i++) {
    const x = -1.00 + i * (2.00 / 6);
    P.addEquipment('turretDetail', box(0.026, 0.49, 0.026), x, 0.505, tz);
    if (i % 2 === 0) P.addEquipment('turretDark', box(0.034, 0.034, 0.13), x, 0.47, tz + 0.065);
  }
  // the flank runs at |x| 1.53, outboard of the smoke tubes' mouths: rails, posts, low brackets to the wall clear of the
  // tubes' breeches and high ones over the roof's edge down to the top rail
  for (const sx of [-1, 1]) {
    const x = sx * 1.53;
    for (const [a, b] of [[-2.28, -1.73], [-1.71, -1.16]] as const) {
      for (let r = 0; r < 7; r++) P.addEquipment('turretDetail', box(0.020, 0.020, b - a), x, 0.28 + r * 0.075, (a + b) / 2);
      for (const z of [a + 0.013, b - 0.013]) P.addEquipment('turretDetail', box(0.026, 0.49, 0.026), x, 0.505, z);
    }
    for (const z of [-2.10, -1.66]) {
      const wall = TS.wallAt(sx, z);
      P.addEquipment('turretDark', box(1.53 - wall + 0.01, 0.036, 0.040), sx * (1.53 + wall - 0.01) / 2, 0.30, z);
    }
    for (const z of [-2.10, -1.40]) {
      const wall = TS.wallAt(sx, z) - 0.06, y = roofAt(z) + 0.008;
      P.addEquipment('turretDark', box(1.53 - wall, 0.03, 0.040), sx * (1.53 + wall) / 2, y, z);
      P.addEquipment('turretDark', box(0.026, y - 0.72, 0.03), x, (y + 0.72) / 2, z);
    }
    // the ISAF placard across the two sections' joint
    P.addEquipment('turret', box(0.016, 0.30, 0.44), sx * 1.548, 0.50, -1.72);
  }
  // the ISAF cooler box and the empty spare-MG cradles on the bustle roof (their feet on its lowest point under them)
  const cool = roofAt(-2.55) - 0.004;
  P.addEquipment('turretCloth', box(0.46, 0.24, 0.34), 0.52, cool + 0.12, -2.38);
  P.addEquipment('turretDetail', box(0.50, 0.03, 0.38), 0.52, cool + 0.255, -2.38);
  const cradle = roofAt(-2.45) - 0.004;
  for (const x of [-0.25, -0.65]) {
    P.addEquipment('turretDetail', box(0.08, 0.05, 0.10), x, cradle + 0.025, -2.40);
    P.addEquipment('turretDark', box(0.04, 0.02, 0.10), x, cradle + 0.055, -2.40);
  }
}

function turretKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  // the cheek fields on the wedges' tops, the old OTCO's 56 a side: the spec helpers' "R" is +X (the left wedge), "L"
  // the -X wedge
  const ray = turretRay(P);
  eraField(P, 'a6m_turret_cheek_era_R', topEraSeats(1, ray), true);
  eraField(P, 'a6m_turret_cheek_era_L', topEraSeats(-1, ray), true);
  for (const side of [1, -1] as const) {
    cheekCage(P, side, ray);
    cheekHardware(P, side, ray);
  }
  chamferStuds(P, ray);
  wallCassettes(P);
  roofRcws(P, ctx);
  roofFit(P);
  bustleFit(P);
  // the cross on the left wall and the number on the right, over the cassettes
  P.decal('turret', 'crossgrey', null, 0.20, [TS.wallLeft + 0.002, 0.57, 0.43], Math.PI / 2);
  P.decal('turret', 'number', 'A6M', 0.17, [-(TS.wallRight + 0.002), 0.57, 0.43], -Math.PI / 2);
}

/** The Leopard 2A4 OTCO's kit, after the hull and the turret. */
export function addLeo2A4OtcoKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  hullKit(P, ctx);
  turretKit(P, ctx);
}
