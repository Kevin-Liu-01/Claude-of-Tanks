// The FLW 200 remote weapon station for the 2A4-era Leopards (leopard2A4Family.ts), carried over from the legacy
// leoFLW200 (profiles/leopard.ts; owner order §5.09-5 put the FLW 200 on these Leopards, the 2026-10-08 ruling made it the
// vehicle's working roof weapon) and seated on the 2A4 turret's roof. Two fits: the full open-yoke station (the Leopard 2
// Improved's: turntable, yoke arms with trunnion bosses and flank shields, the ammunition bin and its feed chute, the IR
// pointer, the sensor pod beside the yoke) and the compact fit (the 2A4 family's, narrower than its gun: the turntable and
// a forward pod under the gun's depression, no yoke).
//
// The working mechanism stays as the legacy built it: the M2 is a remote-controlled fitting on a riding cradle, built
// first; flwReach measures where its moving parts sweep through the weapon's whole pitch range and recoil, and every
// turntable part whose top the breech (or a compact fit's barrel) sweeps below is slotted there (slottedPrisms), the pod
// and the cable drop stop under the sweep; every part drawn between captureAuxiliaryStock and its finish is the station's
// yaw stock, so the whole station traverses with its gun. All of it is equipment (the 'turret' bucket's envelope is the
// turret's own armour): painted parts go to turretEquipment, the rest to the detail, dark and glass buckets.
//
// Frames: turret metres from the ring's centre on the deck; the station's own frame has its gun along +Z at rest, turned
// by `yaw` about its axis at (x, z).
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { captureAuxiliaryStock } from './auxiliaryStation.ts';
import { auxiliaryWeaponProfile } from '../auxiliaryWeapons.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { LEO2A4_TURRET } from '../leopard2A4FamilyArmor.ts';

const T = LEO2A4_TURRET;

/** Where the station stands and what it is called. */
export interface LeopardFlw200Options {
  /** 'full': the open-yoke station (the Leopard 2 Improved); 'compact': the 2A4 family's narrow fit, no yoke. */
  readonly fit: 'full' | 'compact';
  /** The station's axis on the roof (turret metres). */
  readonly x: number;
  readonly z: number;
  /** The station's rest bearing about its axis (radians, + turns the gun toward +X); default 0, the gun forward. */
  readonly yaw?: number;
  readonly seed: number;
  /** The working gun's name (the auxiliary-weapon tables key on it). */
  readonly name: string;
}

/** The legacy fits' proportions: scale, width scale, gun scale and elevation, drum height, the gun's and pod's rise. */
const FITS = Object.freeze({
  // the Leopard 2 Improved's (legacy s 0.90, gunY y + 0.01, drumH 0.07, podY y + 0.19, podH 0.16, shields, elev 0.08)
  full: Object.freeze({ s: 0.90, ws: 0.90, gunScale: 0.90, elev: 0.08, drumH: 0.07, gunRise: 0.01, podRise: 0.19 as number | null,
    podH: 0.16, shields: true }),
  // the 2A4 family's (legacy s 0.54, widthScale 0.12, gunY y + 0.08, the default drum, pod and gun scale 1.05 s)
  compact: Object.freeze({ s: 0.54, ws: 0.12, gunScale: 1.05 * 0.54, elev: 0.03, drumH: 0.10, gunRise: 0.08,
    podRise: null as number | null, podH: 0.185 * 0.54, shields: true }),
});

/** The 2A4 turret's roof height at z (the shell's stations): falling to the front block's seam ahead of z 0.2587, flat
 *  back to the bustle (z -1.8062), falling to the rear plate. */
export function turretRoofY(z: number): number {
  if (z > 0.3715) return THREE.MathUtils.lerp(0.7904, 0.739, Math.min(1, (z - 0.3715) / (T.blockZ - 0.3715)));
  if (z > 0.2587) return THREE.MathUtils.lerp(T.roofY, 0.7904, (z - 0.2587) / (0.3715 - 0.2587));
  if (z >= -1.8062) return T.roofY;
  if (z >= T.bustleEndZ) return THREE.MathUtils.lerp(0.775, T.roofY, (z - T.bustleEndZ) / (-1.8062 - T.bustleEndZ));
  return THREE.MathUtils.lerp(T.rearRoofY, 0.775, Math.max(0, (z - T.rearZ) / (T.bustleEndZ - T.rearZ)));
}

interface FlwSlot { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }

/**
 * A turntable part's convex plan (x, z points about its axis) less the slot the gun's breech and barrel sweep through:
 * the convex pieces either side of the slot and ahead of and behind it (each the plan clipped by half planes), each a
 * prism `h` tall standing on y 0. The pieces abut along the slot's lines. (Legacy leopard.ts, release 230.)
 */
function slottedPrisms(plan: readonly (readonly [number, number])[], h: number, slot: FlwSlot): THREE.BufferGeometry[] {
  type Point = readonly [number, number];
  const clip = (poly: readonly Point[], f: (p: Point) => number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!, fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  };
  const inSlotX = (poly: readonly Point[]): Point[] => clip(clip(poly, (p) => p[0] - slot.x0), (p) => slot.x1 - p[0]);
  const pieces = [
    clip(plan, (p) => slot.x0 - p[0]),
    clip(plan, (p) => p[0] - slot.x1),
    clip(inSlotX(plan), (p) => p[1] - slot.z1),
    clip(inSlotX(plan), (p) => slot.z0 - p[1]),
  ];
  const out: THREE.BufferGeometry[] = [];
  for (const piece of pieces) {
    let area = 0;
    for (let i = 0; i < piece.length; i++) { const a = piece[i]!, b = piece[(i + 1) % piece.length]!; area += a[0] * b[1] - b[0] * a[1]; }
    if (piece.length < 3 || Math.abs(area) < 2e-5) continue;
    const shape = new THREE.Shape(piece.map(([x, z]) => new THREE.Vector2(x, -z)));
    out.push(new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2));
  }
  return out;
}

/**
 * Where the station's moving parts reach, in the station's frame before it is placed: their x extent (pitch about the
 * trunnion's x axis and recoil along the bore keep every point's x), and the lowest any of them comes over a footprint
 * (station x and z) through the weapon's pitch range, the gun at rest and recoiled (its triangles sampled a centimetre
 * apart, a degree of pitch apart, kept per centimetre cell). (Legacy leopard.ts, release 230.)
 */
function flwReach(mg: THREE.Object3D, depression: number, elevation: number) {
  mg.updateMatrixWorld(true);
  const pitch = mg.getObjectByName('auxiliaryWeaponPitch')!, recoil = mg.getObjectByName('auxiliaryWeaponRecoil');
  const stroke = Number(mg.userData.auxiliaryRecoilM) || 0, cell = 0.01;
  const toPitch = new THREE.Matrix4().copy(pitch.matrixWorld).invert(), toPitchFrame = new THREE.Matrix4();
  const points: number[] = [], recoils: boolean[] = [];
  let minX = Infinity, maxX = -Infinity;
  pitch.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    let inRecoil = false;
    for (let up: THREE.Object3D | null = mesh; up && !inRecoil; up = up.parent) inRecoil = up === recoil;
    toPitchFrame.multiplyMatrices(toPitch, mesh.matrixWorld);
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
    const n = index ? index.count : position.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const at = (k: number, out: THREE.Vector3): THREE.Vector3 =>
        out.fromBufferAttribute(position, index ? index.getX(t + k) : t + k).applyMatrix4(toPitchFrame);
      at(0, a); at(1, b); at(2, c);
      const rows = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / cell));
      for (let i = 0; i <= rows; i++) for (let j = 0; j <= rows - i; j++) {
        p.copy(a).multiplyScalar(1 - (i + j) / rows).addScaledVector(b, i / rows).addScaledVector(c, j / rows);
        points.push(p.x, p.y, p.z); recoils.push(inRecoil);
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      }
    }
  });
  const floor = new Map<number, number>();
  const key = (x: number, z: number): number => Math.floor(x / cell) * 100000 + Math.floor(z / cell);
  const pivot = pitch.position, pitches: number[] = [];
  for (let e = -depression; e < elevation; e += Math.PI / 180) pitches.push(e);
  pitches.push(elevation);
  for (const e of pitches) {
    const c = Math.cos(e), sn = Math.sin(e);
    for (const r of stroke ? [0, stroke] : [0]) for (let i = 0; i < points.length; i += 3) {
      if (r && !recoils[i / 3]) continue;
      const x = points[i]!, y = points[i + 1]!, z = points[i + 2]! - r;
      const sy = pivot.y + y * c + z * sn, sz = pivot.z - y * sn + z * c, k = key(pivot.x + x, sz);
      if (sy < (floor.get(k) ?? Infinity)) floor.set(k, sy);
    }
  }
  return {
    minX: pivot.x + minX,
    maxX: pivot.x + maxX,
    /** The cells over [x0, x1] x [z0, z1] the moving parts come lower than y in (heights from the gun's origin). */
    slot(y: number, x0: number, x1: number, z0: number, z1: number): FlwSlot | null {
      let sx0 = Infinity, sx1 = -Infinity, sz0 = Infinity, sz1 = -Infinity;
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
        for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
          if ((floor.get(i * 100000 + j) ?? Infinity) >= y) continue;
          sx0 = Math.min(sx0, i * cell); sx1 = Math.max(sx1, (i + 1) * cell);
          sz0 = Math.min(sz0, j * cell); sz1 = Math.max(sz1, (j + 1) * cell);
        }
      }
      return sx0 <= sx1 ? { x0: sx0, x1: sx1, z0: sz0, z1: sz1 } : null;
    },
    /** The lowest the moving parts come over the footprint (from the gun's origin; Infinity where they never reach). */
    lowest(x0: number, x1: number, z0: number, z1: number): number {
      let low = Infinity;
      for (let i = Math.floor(x0 / cell) - 1; i <= Math.floor(x1 / cell) + 1; i++) {
        for (let j = Math.floor(z0 / cell) - 1; j <= Math.floor(z1 / cell) + 1; j++) low = Math.min(low, floor.get(i * 100000 + j) ?? Infinity);
      }
      return low;
    },
  };
}

/**
 * The FLW 200 on the 2A4 turret's roof at (x, z): its base plate welded 2 mm into the roof, the working M2 on its riding
 * cradle at the fit's height. Its parts are the station's yaw stock (they traverse with the gun).
 */
export function addLeopardFlw200(P: TankBuilderPort, o: LeopardFlw200Options): void {
  const { box, cylY, cylZ } = KIT;
  const F = FITS[o.fit], s = F.s, ws = F.ws, full = o.fit === 'full';
  const Y = turretRoofY(o.z) - 0.002, gunY = Y + F.gunRise, seg = P.q ? 18 : 12;
  const yaw = o.yaw ?? 0, cos = Math.cos(yaw), sin = Math.sin(yaw), turn = new THREE.Matrix4();
  /** Lay a part in the station's frame (x, z about its axis; y in turret metres), turned by the station's yaw. */
  const put = (bucket: string, g: THREE.BufferGeometry, lx: number, y: number, lz: number, rx = 0, ry = 0, rz = 0): void => {
    if (rx || ry || rz) g.applyMatrix4(turn.makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    if (yaw) g.rotateY(yaw);
    P.addEquipment(bucket, g, o.x + lx * cos + lz * sin, y, o.z - lx * sin + lz * cos);
  };
  // THE GUN: the M2 on its riding cradle, sunk into its own station at the fit's height, forward at rest, slightly
  // elevated; its own can off (the station's bin is the feed). Built first: the station stands clear of everything it
  // sweeps through.
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', scale: F.gunScale, elev: F.elev, ammo: false,
    seed: o.seed, remoteControlled: true, ridingCradle: true });
  const weapon = auxiliaryWeaponProfile(12.7, P.spec.id);
  const reach = flwReach(mg, weapon.depressionRad, weapon.elevationRad);
  const clear = 0.008;                                                         // the clearance audit's 1.5 mm and room
  /** The highest a part over the station-frame footprint may crown (Infinity where the gun never reaches). */
  const crown = (x0: number, x1: number, z0: number, z1: number): number => gunY + reach.lowest(x0, x1, z0, z1) - clear;
  const finishStation = captureAuxiliaryStock(P, o.name);
  /** A turntable part h tall from y0 over its convex plan (about cx, cz): round where the gun never sweeps under its top,
   *  slotted where it does. */
  const turntablePart = (bucket: string, round: () => THREE.BufferGeometry, plan: readonly (readonly [number, number])[],
    y0: number, h: number, cx = 0, cz = 0): void => {
    const xs = plan.map((q) => q[0] + cx), zs = plan.map((q) => q[1] + cz);
    const slot = reach.slot(y0 + h - gunY + clear, Math.min(...xs) - clear, Math.max(...xs) + clear, Math.min(...zs) - clear,
      Math.max(...zs) + clear);
    if (!slot) { put(bucket, round(), cx, y0 + h / 2, cz); return; }
    const cut = { x0: slot.x0 - clear - cx, x1: slot.x1 + clear - cx, z0: slot.z0 - clear - cz, z1: slot.z1 + clear - cz };
    for (const piece of slottedPrisms(plan, h, cut)) put(bucket, piece, cx, y0, cz);
  };
  const rect = (hx: number, hz: number): [number, number][] => [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  const disc = (r: number, n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [r * Math.sin(2 * Math.PI * i / n), r * Math.cos(2 * Math.PI * i / n)] as [number, number]);
  const dh = F.drumH;
  // the base plate and its corner gussets tie the station into the roof; the powered slew ring and drum (the automated
  // tell: a ringed turntable, not a pintle post) and the drum's neck
  turntablePart('turret', () => box(0.50 * ws, 0.030, 0.50 * s), rect(0.25 * ws, 0.25 * s), Y, 0.030);
  for (const side of [-1, 1]) {
    turntablePart('turretDark', () => box(0.42 * ws, 0.026, 0.05), rect(0.21 * ws, 0.025), Y + 0.029, 0.026, 0, side * 0.21 * s);
  }
  turntablePart('turretDark', () => cylY(0.21 * s, 0.21 * s, 0.024, seg + 4), disc(0.21 * s, seg + 4), Y + 0.030, 0.024);
  turntablePart('turret', () => cylY(0.16 * s, 0.185 * s, dh, seg + 4), disc(0.1725 * s, seg + 4), Y + 0.05, dh);
  turntablePart('turretDark', () => cylY(0.135 * s, 0.135 * s, 0.05, seg), disc(0.135 * s, seg), Y + 0.02 + dh, 0.05);
  const deckTop = Y + 0.05 + dh, pedTop = gunY + 0.10;
  // the cradle line: the yoke arms', bin's and pointer's heights
  const troughC = Math.max(pedTop + 0.10 * s, Y - 0.02 + 0.0675 * s);
  // the yoke's arms stand outboard of everything that moves (the fitting's cradle and the gun), on the deck
  const armX = (side: number): number => side * Math.max(0.125 * ws, (side < 0 ? -reach.minX : reach.maxX) + clear + 0.019);
  const armTop = troughC + 0.03 * s, armBottom = Math.min(troughC - 0.12 * s, deckTop - 0.005), armZ = -0.02 * s;
  const podH = F.podH;
  let podX = 0, podZ = 0.42 * s, podY = F.podRise === null ? pedTop - 0.045 * s : Y + F.podRise;
  if (full) {
    for (const side of [-1, 1]) {
      put('turretDark', box(0.038, armTop - armBottom, 0.17 * s), armX(side), (armBottom + armTop) / 2, armZ);
      // the trunnion's boss on the arm's outer face
      put('turretDark', cylZ(0.030 * s, 0.03, 10), armX(side) + side * 0.034, troughC - 0.025 * s, armZ, 0, Math.PI / 2, 0);
      // flank armour on each arm (no rear plate: the receiver's rear swings down behind the gun)
      if (F.shields) put('turret', box(0.016, 0.17 * s, 0.46 * s), armX(side) + side * 0.010 * ws, troughC + 0.005 * s, 0.02 * s);
    }
    // the ammunition bin outboard of the yoke's -X arm, its bracket to the arm and its feed chute to the gun
    const binX = armX(-1) - 0.019 - 0.0675 * ws + 0.005, binY = troughC - 0.025 * s;
    put('turretDetail', box(0.135 * ws, 0.15 * s, 0.30 * s), binX, binY, -0.04 * s);
    put('turretDark', box(0.06 * ws, 0.04, 0.05), binX + 0.055 * ws, troughC - 0.065 * s, -0.04 * s);
    put('turretDark', box(0.014, 0.05, 0.10 * s), binX + 0.065 * ws, troughC + 0.045 * s, -0.02 * s);
    // the IR pointer on the +X arm's front
    const irZ = armZ + 0.085 * s + 0.045 * s - 0.01;
    put('turretDetail', cylZ(0.022 * s, 0.09 * s, 10), armX(1), troughC + 0.015 * s, irZ);
    put('turretGlass', cylZ(0.016 * s, 0.008, 10), armX(1), troughC + 0.015 * s, irZ + 0.05 * s);
    // the sensor pod beside the yoke on its +X arm
    podZ = armZ;
    podX = armX(1) + 0.019 + 0.135 * ws - 0.004;
    podY = Math.max(podY, Y + podH / 2 + 0.002);
  } else {
    // the compact fit's pod stays forward under the gun's depression
    podY = Math.min(podY, crown(-0.1375 * ws, 0.1375 * ws, podZ - 0.0875 * s, podZ + 0.0875 * s) - podH / 2 - 0.016);
  }
  // the sensor pod: housing, crown, the day and thermal windows on its aim face, the rangefinder, the wiper bar
  put('turretDark', box(0.27 * ws, podH, 0.17 * s), podX, podY, podZ);
  put('turretDetail', box(0.275 * ws, 0.016, 0.175 * s), podX, podY + podH / 2 + 0.008, podZ);
  put('turretGlass', box(0.085 * ws, Math.min(0.065 * s, podH * 0.42), 0.012), podX - 0.055 * ws, podY + podH * 0.14, podZ + 0.085 * s);
  put('turretGlass', box(0.060 * ws, Math.min(0.050 * s, podH * 0.34), 0.012), podX + 0.065 * ws, podY + podH * 0.08, podZ + 0.085 * s);
  put('turretDark', cylZ(0.020 * s, 0.014, 8), podX + 0.065 * ws, podY - podH * 0.27, podZ + 0.09 * s);
  put('turretDark', box(0.20 * ws, 0.014, 0.014), podX, podY - podH * 0.43, podZ + 0.085 * s);
  // the compact pod hangs on a bracket from the drum, under the gun's depression
  if (!full) put('turretDark', box(0.03, 0.022, 0.225 * s), 0, podY - podH * 0.38, 0.2225 * s);
  // the cable drop under the gun's sweep and the conduit laid on the roof behind the station (seated on the roof's
  // lowest point under it where the bustle's roof falls away)
  const cableBottom = Y + 0.01;
  const cableTop = Math.min(Y + Math.max(0.05, pedTop - Y - 0.06) + 0.01,
    crown(0.10 * s - 0.016, 0.10 * s + 0.016, -0.10 * s - 0.025, -0.10 * s + 0.025));
  if (cableTop - cableBottom >= 0.01) put('turretDark', box(0.032, cableTop - cableBottom, 0.05), 0.10 * s, (cableBottom + cableTop) / 2, -0.10 * s);
  const conduit0 = -0.36 * s - 0.15, conduit1 = -0.36 * s + 0.15;
  const [r0, r1] = [conduit0, conduit1].map((lz) => turretRoofY(o.z - 0.06 * sin + lz * cos));
  put('turretDark', box(0.028, 0.006, conduit1 - conduit0), 0.06, (r0 + r1) / 2 + 0.002, (conduit0 + conduit1) / 2,
    -Math.atan2(r1 - r0, conduit1 - conduit0));
  mg.name = o.name;
  mg.position.set(o.x, gunY, o.z);
  mg.rotation.y = yaw;
  P.turretG.add(mg);
  finishStation();
}
