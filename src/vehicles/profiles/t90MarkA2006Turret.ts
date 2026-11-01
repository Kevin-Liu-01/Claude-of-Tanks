// The T-90A obr. 2006 (`t90a_2006`) turret package: the pre-rebuild obr. 2006 turret's character laid as equipment on
// the T-90A Vladimir source-X turret (t90X.ts buildT90AVladimirX, datum V). 2026-10-31 (lane t90-family-266; the owner:
// "make 2013, 2006, and 2004 turrets look more like they were before just on the new base", then "the new turrets have
// to be properly inspired from bases of the turrets from the ones that were there in the new verisons. like they should
// properly look distinguished like what was done with the other tanks but upholding the new level of visual quality").
// Then (the owner: "see the 2022 is the level of innovation i want in our reworked t90s. same but fresh and different
// take"): a bold concept of its own rooted in the old obr. 2006 turret, which was long and welded: in front a K-5 chevron
// across the face, the Shtora heads on broad angled shoes, 902B fans on the cheek course and a crown rising behind the
// sights; behind, a raised faceted crown growing aft into a long bustle with transverse lids, long side rails carrying
// gear, flank bins with dark service faces and a louvred, railed bustle face; and 902B batteries on armoured shoes, an
// armoured Kord base and two radio courses on shoes with whips. The twin's casting, armour, bins, sights, launchers and
// roof station stay as they are and keep their clearances (mantlet and gun sweep, Shtora lenses, sight windows, launcher
// lanes, the station's swept circle, hatches, the ring); every part below is turret-frame equipment (builder frame
// minus the ring pivot), measured off the twin's stock by ray and buried 5-15 mm into what carries it.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { fabricBody, fabricStrap, rolledEndSpiral, type FabricSpec } from '../accessoryPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
const { box, cylY, cylZ } = KIT;
const STOCK = ['turret', 'turretDetail', 'turretExternalArmor', 'turretDark'];

/** First hit on the given stock buckets (turret buckets are in the turret frame), or null. */
function stockRay(P: TankBuilderPort, buckets: string[], from: Point, dir: Point): THREE.Vector3 | null {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ray = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize());
  let best: THREE.Intersection | undefined;
  P.forEachBucketPart(buckets, (g) => {
    const m = new THREE.Mesh(g, mat); m.updateMatrixWorld();
    const h = ray.intersectObject(m)[0]; if (h && (!best || h.distance < best.distance)) best = h;
  });
  mat.dispose();
  return best ? best.point : null;
}
function seat(P: TankBuilderPort, buckets: string[], from: Point, dir: Point, what: string): THREE.Vector3 {
  const p = stockRay(P, buckets, from, dir);
  if (!p) throw new Error(`t90a_2006 turret: no stock under the ${what}`);
  return p;
}

/** A bar of section w x h laid from a to b, its h axis kept as near vertical as the run allows. */
function bar(P: TankBuilderPort, bucket: string, a: Point, b: Point, w: number, h: number): void {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = box(w, h, len);
  g.rotateX(-Math.atan2(d.y, Math.hypot(d.x, d.z))).rotateY(Math.atan2(d.x, d.z));
  P.addEquipment(bucket, g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** A flat strap (thickness t across the run, width w along z) lying on a facet from a to b in one transverse plane;
 * `out` (+1/-1) picks the facet normal that faces away from the centreline, and `bury` sinks it into the facet. */
function strap(P: TankBuilderPort, bucket: string, a: readonly [number, number], b: readonly [number, number], z: number,
  t: number, w: number, out: number, bury: number): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  let nx = -dy / len, ny = dx / len;
  if (nx * out < 0) { nx = -nx; ny = -ny; }
  const off = t / 2 - bury;
  P.addEquipment(bucket, box(t, len, w), (a[0] + b[0]) / 2 + nx * off, (a[1] + b[1]) / 2 + ny * off, z, 0, 0, Math.atan2(-dx, dy));
}

// ---------------------------------------------------------------------------------------------------------------
// The welded bustle (old: weldedStationLoft bustle, -0.62..-2.72 m behind the old pivot). Its forward station is buried
// in the rear face of the twin's turret box and it runs 0.95 m aft over the engine deck. Its mid ridge lies on the plan
// taper of the twin's side bins (measured by ray), so bins, flank bins and bustle read as one long tapering welded
// flank as on the old turret: a lower facet flaring out to the ridge, an upper facet falling in to the roof, the roof
// falling aft from the crown.
type Station = readonly [z: number, y0: number, ym: number, y1: number, xb: number, xm: number, xt: number];
const [Z, Y0, YM, Y1, XB, XM, XT] = [0, 1, 2, 3, 4, 5, 6] as const;
interface Bustle { stations: readonly Station[]; front: number; tail: number }
function bustleAt(b: Bustle, z: number): Station {
  const s = b.stations;
  let i = 0; while (i < s.length - 2 && z > s[i + 1][Z]) i++;
  const p = s[i], q = s[i + 1], t = (z - p[Z]) / (q[Z] - p[Z]);
  return p.map((v, k) => v + (q[k] - v) * t) as unknown as Station;
}
function weldedSection(st: Station): SolidSection {
  return { z: st[Z], ring: [[-st[XB], st[Y0]], [st[XB], st[Y0]], [st[XM], st[YM]], [st[XT], st[Y1]], [-st[XT], st[Y1]], [-st[XM], st[YM]]] };
}
/** x of the bustle's upper facet at height y (y between the ridge and the roof). */
const upperX = (st: Station, y: number): number => st[XM] - (st[XM] - st[XT]) * (y - st[YM]) / (st[Y1] - st[YM]);

interface TwinRear {
  rear: number; top: number; half: number; taper: (z: number) => number; slope: number;
  /** z of the twin side bin's rear face at x (per side, the line through two rays from astern) */
  binRear: (x: number) => number;
}
function measureTwinRear(P: TankBuilderPort): TwinRear {
  // the turret-rear box of the twin (classicBins): its rear face, roof and flanks
  const rear = seat(P, STOCK, [0, .50, -5], [0, 0, 1], 'bustle root').z;
  const top = seat(P, STOCK, [0, 3, rear + .20], [0, -1, 0], 'crown').y;
  const half = Math.min(seat(P, STOCK, [3, .50, rear + .20], [-1, 0, 0], 'left flank bin').x,
    -seat(P, STOCK, [-3, .50, rear + .20], [1, 0, 0], 'right flank bin').x);
  // the outer face of the twin's left side bin, which carries the plan taper aft
  const za = -1.00, zb = -1.35;
  const xa = seat(P, ['turretDetail'], [3, .45, za], [-1, 0, 0], 'side bin face').x;
  const xb = seat(P, ['turretDetail'], [3, .45, zb], [-1, 0, 0], 'side bin face').x;
  const slope = (xa - xb) / (za - zb);
  const rearLine = (s: number): ((x: number) => number) => {
    const z1 = seat(P, ['turretDetail'], [s * .85, .45, -5], [0, 0, 1], 'side bin rear').z;
    const z2 = seat(P, ['turretDetail'], [s * 1.08, .45, -5], [0, 0, 1], 'side bin rear').z;
    return (x) => z1 + (z2 - z1) * (Math.abs(x) - .85) / (1.08 - .85);
  };
  const left = rearLine(1), right = rearLine(-1);
  return { rear, top, half, slope, taper: (z) => xb + slope * (z - zb), binRear: (x) => (x > 0 ? left : right)(x) };
}

function weldedBustle(P: TankBuilderPort, m: TwinRear): Bustle {
  const front = m.rear + .014, mid = m.rear - .436, tail = m.rear - .936, L = (z: number): number => m.taper(z) - .004;
  const stations: Station[] = [
    [tail, .300, .480, .640, L(tail) - .085, L(tail), L(tail) - .145],
    [mid, .290, .535, .760, L(mid) - .100, L(mid), L(mid) - .170],
    [front, .285, .582, m.top + .147, L(front) - .120, L(front), L(front) - .210],
  ];
  const b = { stations, front, tail };
  P.addEquipment('turretDetail', sectionSolid(stations.map(weldedSection)));
  // fillet welds down the two rear corners of the tail plate and along its roof edge
  const t = stations[0];
  for (const s of [-1, 1]) {
    P.addEquipment('turretDetail', beamBetween([s * t[XB], t[Y0] + .01, tail], [s * t[XM], t[YM], tail], .009, 6));
    P.addEquipment('turretDetail', beamBetween([s * t[XM], t[YM], tail], [s * t[XT], t[Y1], tail], .009, 6));
  }
  P.addEquipment('turretDetail', beamBetween([-t[XT], t[Y1], tail], [t[XT], t[Y1], tail], .009, 6));
  return b;
}

// The raised welded crown (old: the faceted crown loft that grew aft into the bustle, and its unequal roof facets): a
// faceted shell that rises off the cast roof behind the roof armour in a steep glacis, rides over the twin's box roof
// and the flank bins' lids at full bustle height and runs into the bustle, so the turret's back carries one long, high,
// flat crown line. Its lower edges are sunk into the box and the bin lids and welded along them.
function raisedCrown(P: TankBuilderPort, b: Bustle): void {
  const zr = b.front - .03, zm = BIN.front - .025, zf = -1.42;
  const back = bustleAt(b, zr), yb = BIN.y1 + .005, top = back[Y1] - .008;
  const roof = Math.min(seat(P, ['turret'], [.33, 3, zf], [0, -1, 0], 'crown toe').y, seat(P, ['turret'], [-.33, 3, zf], [0, -1, 0], 'crown toe').y);
  const ring = (hb: number, y0: number, ht: number, y1: number): SolidSection['ring'] => [[-hb, y0], [hb, y0], [ht, y1], [-ht, y1]];
  const hb = upperX(back, yb) - .010;
  P.addEquipment('turretDetail', sectionSolid([
    { z: zr, ring: ring(hb, yb, back[XT] - .010, top) },
    { z: zm, ring: ring(hb - .02, yb, back[XT] - .03, top - .004) },
    { z: zf, ring: ring(.33, roof - .012, .30, roof + .033) },
  ]));
  for (const s of [-1, 1]) P.addEquipment('turretDetail', beamBetween([s * (hb + .002), yb + .002, zr + .02], [s * (hb - .018), yb + .002, zm], .008, 6));
  // two unequal dark facets sunk into the crown roof, as on the old crown
  P.addEquipment('turretDark', box(.40, .014, .28), .24, top + .001, -1.71, 0, .07, 0);
  P.addEquipment('turretDark', box(.30, .014, .21), -.27, top + .001, -1.66, 0, -.05, 0);
}

// Three broad transverse lids across the falling bustle roof with hinge pins and grab handles (old: four lids).
function bustleLids(P: TankBuilderPort, b: Bustle): void {
  for (const z of [b.front - .17, b.front - .47, b.front - .77]) {
    const d = .25, st = bustleAt(b, z), y = st[Y1], w = 2 * (st[XT] - .07);
    const rx = Math.atan2(bustleAt(b, z - .05)[Y1] - bustleAt(b, z + .05)[Y1], .10);
    P.addEquipment('turretDark', box(w, .016, d), 0, y + .003, z, rx, 0, 0);
    const hy = bustleAt(b, z + d / 2)[Y1] + .010;
    P.addEquipment('turretDetail', KIT.cylX(.012, w * .82, 10), 0, hy, z + d / 2 - .012);       // hinge pin
    const gz = z - d / 2 + .05, gy = bustleAt(b, gz)[Y1];
    P.addEquipment('turretDetail', beamBetween([-.11, gy + .004, gz], [-.11, gy + .045, gz], .008, 6));
    P.addEquipment('turretDetail', beamBetween([.11, gy + .004, gz], [.11, gy + .045, gz], .008, 6));
    P.addEquipment('turretDetail', beamBetween([-.11, gy + .045, gz], [.11, gy + .045, gz], .008, 6)); // grab handle
  }
}

// Flank bins in the notches between the twin's side bins and the bustle (old: the bustle's flank bins with their dark
// service faces): welded to the box flank, buried in the bustle's front, their outer faces on the bins' taper, with a
// chamfered top edge, a lid, a service face, two hasps and a fillet weld down the front corner.
const BIN = { front: -1.515, y0: .295, y1: .640 } as const;
function mirrorRing(ring: [number, number][], s: number): [number, number][] {
  return s > 0 ? ring : ring.map(([x, y]) => [-x, y] as [number, number]).reverse();
}
function flankBins(P: TankBuilderPort, m: TwinRear, b: Bustle): void {
  const zr = b.front - .010, zf = BIN.front, zc = (zf + zr) / 2, xi = m.half - .0165, { y0, y1 } = BIN;
  const xo = (z: number): number => m.taper(z) - .002, yaw = Math.atan(m.slope);
  for (const s of [-1, 1]) {
    const body = (z: number): SolidSection => ({ z, ring: mirrorRing([[xi, y0], [xo(z), y0], [xo(z), y1 - .035], [xo(z) - .035, y1], [xi, y1]], s) });
    const lid = (z: number): SolidSection => ({ z, ring: mirrorRing([[xi - .006, y1 - .004], [xo(z) - .03, y1 - .004], [xo(z) - .03, y1 + .014], [xi - .006, y1 + .014]], s) });
    P.addEquipment('turretDetail', sectionSolid([body(zr), body(zf)]));
    P.addEquipment('turretDetail', sectionSolid([lid(zr - .006), lid(zf + .008)]));
    const face = (dz: number, out: number): [number, number] => [s * (xo(zc + dz) + out), zc + dz];
    const [fx, fz] = face(0, .0015);
    P.addEquipment('turretDark', box(.010, .19, .20), fx, .45, fz, 0, s * yaw, 0);                     // service face
    for (const dz of [-.085, .085]) { const [hx, hz] = face(dz, .004); P.addEquipment('turretDark', box(.016, .050, .030), hx, .53, hz, 0, s * yaw, 0); }
    P.addEquipment('turretDetail', beamBetween([s * (m.half + .004), y0 + .01, zf - .004], [s * (m.half + .004), y1 - .01, zf - .004], .008, 6));
    slotFloor(P, m, s, zf);
  }
}

// The flank bin closes the rear of the narrow slot between the twin's casting and its side bin; a welded floor plate
// spans that slot and the wedge behind the side bin, so the plan holds no enclosed see-through pocket.
function slotFloor(P: TankBuilderPort, m: TwinRear, s: number, binFront: number): void {
  const yb = .478, yt = .508, ring = (xin: number, xout: number): [number, number][] =>
    mirrorRing([[xin, yb], [xout, yb], [xout, yt], [xin, yt]], s);
  const shell = (z: number): number => Math.abs(seat(P, ['turret'], [0, .495, z], [s, 0, 0], 'slot floor').x);
  const bin = (z: number, from: number): number => Math.abs(seat(P, ['turretDetail'], [s * (from + .005), .495, z], [s, 0, 0], 'slot floor').x);
  const zA = binFront - .015, zB = m.binRear(s * 1.17) + .004, zC = m.binRear(s * .80) + .004;
  const sections: SolidSection[] = [
    { z: zA, ring: ring(.38, m.taper(zA) - .012) },
    { z: zB, ring: ring(.38, 1.19) },
    { z: zC, ring: ring(.38, .815) },
  ];
  for (const z of [-1.15, -.95, -.88, -.82, -.77, -.73, -.71, -.69, -.66]) {
    const xs = shell(z), xo = bin(z, xs);
    if (xo - xs > .012) sections.push({ z, ring: ring(xs - .02, xo + .02) });
  }
  P.addEquipment('turretDetail', sectionSolid(sections));
}

// Long side rails carrying gear (old: square rails at the bustle's mid ridge, seated on its taper, with uprights at
// every station). On the left the rail starts at the front of the twin's side bin and runs straight along the bins'
// taper onto the bustle ridge to the tail; on the right the twin's outer bin covers that face, so it starts behind it.
// The rail's inner face is sunk into the stock it rides; strap uprights hug the bin faces and both bustle facets; a
// lashed tarpaulin roll rides each rail in the angle of the bustle's upper facet.
function sideRails(P: TankBuilderPort, m: TwinRear, b: Bustle): void {
  const t = .046, off = .012, aft = b.tail + .045, mid = b.stations[1], yaw = Math.atan(m.slope);
  const yR = b.stations[2][YM], on = (z: number): number => m.taper(z) + off;
  for (const s of [-1, 1]) {
    const start = s > 0 ? -.70 : -1.525, last = bustleAt(b, aft);
    const course: Point[] = [[s * on(start), yR, start], [s * on(b.front), yR, b.front],
      [s * (mid[XM] + off), mid[YM], mid[Z]], [s * (last[XM] + off), last[YM], aft]];
    for (let i = 0; i < course.length - 1; i++) {
      const a = course[i], c = course[i + 1], k = i ? .02 / Math.hypot(c[0] - a[0], c[2] - a[2]) : 0;
      bar(P, 'turretDetail', [a[0] - (c[0] - a[0]) * k, a[1] - (c[1] - a[1]) * k, a[2] - (c[2] - a[2]) * k], c, t, t);
    }
    // uprights on the bin faces (the twin's bin carries one between its latches), straps over the bustle facets
    for (const z of s > 0 ? [-1.08, BIN.front - .025, b.front + .02] : [BIN.front - .025, b.front + .02]) {
      const twinBin = z > BIN.front, lo = twinBin ? .24 : BIN.y0 + .035, hi = twinBin ? .60 : BIN.y1 - .035;
      P.addEquipment('turretDetail', box(.016, hi - lo, .040), s * (m.taper(z) + .002), (lo + hi) / 2, z, 0, s * yaw, 0);
    }
    for (const z of [b.front - .17, mid[Z] - .06, aft + .05]) {
      const st = bustleAt(b, z), lowX = st[XB] + (st[XM] - st[XB]) * .07, hiY = st[YM] + (st[Y1] - st[YM]) * .40;
      strap(P, 'turretDetail', [s * st[XM], st[YM]], [s * lowX, st[Y0] + .02], z, .018, .046, s, .007);
      strap(P, 'turretDetail', [s * st[XM], st[YM]], [s * upperX(st, hiY), hiY], z, .018, .046, s, .007);
    }
    const [r, za, zb] = s > 0 ? [.10, b.front - .10, b.tail + .12] : [.088, b.front - .15, b.tail + .18];
    railRoll(P, b, s, r, za, zb, t / 2);
  }
}

/** A lashed tarpaulin roll lying on the rail top in the angle of the bustle's upper facet, from za aft to zb. */
function railRoll(P: TankBuilderPort, b: Bustle, s: number, r: number, za: number, zb: number, railHalf: number): void {
  const centre = (z: number): THREE.Vector3 => {
    const st = bustleAt(b, z), ux = st[XT] - st[XM], uy = st[Y1] - st[YM], len = Math.hypot(ux, uy);
    const nx = uy / len, ny = -ux / len, cy = st[YM] + railHalf + r - .004;   // the outward normal of the upper facet
    return new THREE.Vector3(s * (st[XM] + ((r - .012) - (cy - st[YM]) * ny) / nx), cy, z);
  };
  const a = centre(za), c = centre(zb), axis = a.clone().sub(c), len = axis.length(), mid = a.clone().add(c).multiplyScalar(.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.normalize());
  const spec: FabricSpec = { len, hw: r, hh: r, exponent: 2.1, endScale: .92, endLength: .04, flatten: 0, wrinkle: .03,
    seg: 18, stations: 4, cinch: [-len * .3, len * .3], cinchDepth: .1, seed: s > 0 ? 71 : 73 };
  const put = (bucket: string, g: THREE.BufferGeometry): void => { g.applyQuaternion(q); P.addEquipment(bucket, g, mid.x, mid.y, mid.z); };
  put('turretCloth', fabricBody(spec));
  for (const station of spec.cinch ?? []) put('turretDark', fabricStrap(spec, station));
  for (const end of [-1, 1] as const) put('turretDark', rolledEndSpiral(r * .92, end * len / 2, end, 20));
}

// ---------------------------------------------------------------------------------------------------------------
// The front (old: the K-5 chevron across the turret face, the 902B fans on the cheek course and the crown rising behind
// the sights), laid round the twin's mantlet, Shtora heads, sight head, cheek course and launcher lanes.

/** A prism along x from x0 to x1 whose side profile is the (z, y) polygon (any winding). */
function prismX(x0: number, x1: number, profile: readonly (readonly [number, number])[]): THREE.BufferGeometry {
  let ring = profile.map(([z, y]) => [-z, y] as [number, number]);
  let area = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) ring = ring.reverse();
  return sectionSolid([{ z: x0, ring }, { z: x1, ring }]).rotateY(Math.PI / 2);
}

// Boxed K-5 cassettes in two rows across the cast face between the mantlet and each Shtora head, their faces folded into
// the old turret's forward chevron. They stand 5 cm clear of the mantlet's sides (which elevation does not move), stop
// short of the Shtora caps and sit 20 cm behind the Shtora lenses and below the sight head's line.
function faceChevron(P: TankBuilderPort): void {
  const xs: readonly (readonly [number, number])[] = [[.385, .495], [.505, .615]];
  for (const s of [-1, 1]) {
    const face = Math.max(...[.20, .34, .48].map((y) => seat(P, ['turret'], [s * .50, y, 4], [0, 0, -1], 'face cassette').z));
    const back = face + .010, nose = face + .175, foot = face + .085, low = .150, mid = .350, high = .548;
    P.addEquipment('turretDetail', box(.245, high - low + .02, .030), s * .50, (low + high) / 2, face + .007);       // carrier
    for (const [a, b] of xs) {
      const [x0, x1] = s > 0 ? [a, b] : [-b, -a];
      P.addEquipment('turretDetail', prismX(x0, x1, [[back, low], [foot, low], [nose, mid - .005], [back, mid - .005]]));
      P.addEquipment('turretDetail', prismX(x0, x1, [[back, mid + .005], [nose, mid + .005], [foot, high], [back, high]]));
    }
    P.addEquipment('turretDark', box(.235, .010, nose - back - .02), s * .50, mid, (back + nose) / 2 - .01);         // row gasket
    for (const x of [.44, .56]) for (const y of [low + .03, high - .03]) {
      P.addEquipment('turretDark', KIT.cylZ(.011, .014, 6), s * x, y, foot + .018);                                // tile bolts
    }
  }
}

// Mirrored 902B fans on armoured shoes on the cast roof behind the cheek course (old: the six-tube fans on the cheek
// course): six tubes in a row along the back of the cheek course, each aimed out and forward over the cheek modules.
// The fans stand inboard of the twin launchers' lanes (which cross the shoulder further out), outside the roof station's
// swept circle and forward of the hatches.
function cheekFans(P: TankBuilderPort): void {
  const a = [.825, .735] as const, b = [1.165, .255] as const;                   // the row, front-inner to rear-outer
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  const yaw = Math.atan2(ux, uz), pitch = .44;
  for (const s of [-1, 1]) {
    let roof = 9, high = -9;
    for (const t of [-.05, .25, .5, .75, 1.05]) for (const off of [-.07, .07]) {
      const x = a[0] + (b[0] - a[0]) * t + uz * off, z = a[1] + (b[1] - a[1]) * t - ux * off;
      const y = seat(P, ['turret'], [s * x, 3, z], [0, -1, 0], '902B shoe').y; roof = Math.min(roof, y); high = Math.max(high, y);
    }
    const yb = roof - .012, yt = high + .055, cx = s * (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    P.addEquipment('turretDetail', box(.15, yt - yb, len + .10), cx, (yb + yt) / 2, cz, 0, s * yaw, 0);              // shoe
    P.addEquipment('turretDark', box(.004, (yt - yb) * .55, len - .02), cx + s * uz * .076, yb + (yt - yb) * .55, cz - ux * .076, 0, s * yaw, 0);
    // the tubes leave the shoe along its outer-forward normal, pitched up
    const nx = s * uz, nz = -ux * 1, dir = new THREE.Vector3(nx * Math.cos(pitch), Math.sin(pitch), nz * Math.cos(pitch));
    if (dir.z < 0) dir.set(-dir.x, dir.y, -dir.z);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    for (let i = 0; i < 6; i++) {
      const t = (i + .5) / 6, px = s * (a[0] + (b[0] - a[0]) * t), pz = a[1] + (b[1] - a[1]) * t;
      const root = new THREE.Vector3(px, yt - .01, pz), at = (d: number): THREE.Vector3 => root.clone().addScaledVector(dir, d);
      const tube = KIT.cylZ(.041, .25, 12).applyQuaternion(q), cap = KIT.cylZ(.046, .030, 12).applyQuaternion(q);
      const c = at(.105), m = at(.225);
      P.addEquipment('turretDark', tube, c.x, c.y, c.z);
      P.addEquipment('turretDetail', cap, m.x, m.y, m.z);
      P.addEquipment('turretDetail', box(.07, .05, .09), root.x, yt - .005, root.z, 0, s * yaw, 0);                 // tube cradle
    }
  }
}

// The crown rising behind the sight head (old: the raised crown behind the ESSA and Shtora heads): a faceted welded cowl
// that climbs off the roof behind the gunner's sight head and stands a hand above it, wider than the head, so the
// turret's front profile carries a raised crown. Its rear corner stays outside the roof station's lowest swept band.
function sightCrown(P: TankBuilderPort): void {
  const zr = .15, zf = .48;
  const head = seat(P, STOCK, [0, 3, zf + .05], [0, -1, 0], 'sight head').y;
  const roof = (z: number): number => Math.min(...[-.24, 0, .24].map((x) => seat(P, ['turret'], [x, 3, z], [0, -1, 0], 'sight crown').y));
  const rr = roof(zr), rf = roof(zf - .02);
  const ring = (hb: number, yb: number, ht: number, yt: number): SolidSection['ring'] => [[-hb, yb], [hb, yb], [ht, yt], [-ht, yt]];
  P.addEquipment('turretDetail', sectionSolid([
    { z: zr, ring: ring(.22, rr - .012, .19, rr + .025) },
    { z: zf, ring: ring(.26, rf - .012, .22, head + .046) },
  ]));
  // a dark armour facet sunk into the cowl's climbing roof
  const rise = head + .046 - (rr + .025), zp = zf - .10, yp = rr + .025 + rise * (zp - zr) / (zf - zr);
  P.addEquipment('turretDark', box(.30, .012, .14), 0, yp + .001, zp, -Math.atan2(rise, zf - zr), 0, 0);
}

// Broad angled shoes under the Shtora heads (old: the broad shoes that grew out of the cheek and entered the rear half
// of each enlarged housing): a welded wedge from inside the back of each housing, over its carrier, rising aft into the
// cheek roof, between the face cassettes and the cheek course. The lens and its view stay clear.
function shtoraShoes(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    const lens = seat(P, ['turretDark'], [s * .82, .30, 4], [0, 0, -1], 'Shtora head');
    const back = seat(P, STOCK, [s * .82, .30, lens.z - .06], [0, 0, -1], 'Shtora head back').z;   // the housing's rear face
    const zf = back + .025, zr = .92, xi = .645, xo = .92;
    const roofR = Math.max(...[xi + .02, xo - .02].map((x) => seat(P, ['turret'], [s * x, 3, zr], [0, -1, 0], 'Shtora shoe').y));
    const ring = (yb: number, yt: number): [number, number][] => mirrorRing([[xi, yb], [xo, yb], [xo, yt - .04], [xo - .04, yt], [xi, yt]], s);
    P.addEquipment('turretDetail', sectionSolid([{ z: zr, ring: ring(.30, roofR + .045) }, { z: zf, ring: ring(.25, .495) }]));
    for (const z of [zr + .10, zf - .10]) P.addEquipment('turretDark', KIT.cylY(.012, .012, .012, 6), s * (xi + .06), .495 + (roofR + .045 - .495) * (zf - z) / (zf - zr) + .004, z);
  }
}

// The bustle face (old: vertical rails and a louvre grid on the rear plate): a framed louvre grille welded on the tail
// plate behind five vertical guard rails welded to the frame's top and bottom bars.
function sternLouvres(P: TankBuilderPort, b: Bustle): void {
  const z = b.tail, top = .595, low = .335, half = .475;
  for (const y of [top, low]) P.addEquipment('turretDetail', box(2 * half + .03, .030, .050), 0, y, z - .020);
  for (const x of [-half, half]) P.addEquipment('turretDetail', box(.030, top - low + .03, .050), x, (top + low) / 2, z - .020);
  for (let y = low + .045; y < top - .02; y += .043) P.addEquipment('turretDark', box(2 * half - .03, .010, .052), 0, y, z - .018, .62, 0, 0);
  for (const x of [-.38, -.19, 0, .19, .38]) P.addEquipment('turretDetail', box(.022, top - low + .02, .022), x, (top + low) / 2, z - .047);
}

// Two radio courses on welded shoes with spring-based whips at the rear corners of the raised crown (old: the restored
// aft radio courses at the crown's rear corners), stepped and asymmetric as on the old turret. The whips stay under the
// twin's own whip tip and outside the roof station's swept circle.
function radioCourses(P: TankBuilderPort): void {
  for (const [x, z, h] of [[.66, -1.80, 1.20], [-.64, -1.72, 1.02]] as const) {
    const y = seat(P, ['turretDetail'], [x, 3, z], [0, -1, 0], 'radio shoe').y;
    if (y < BIN.y1 + .10) throw new Error('t90a_2006 turret: the radio shoe missed the crown');
    const top = y - .008 + .09;
    P.addEquipment('turretDetail', box(.15, .09, .20), x, top - .045, z);
    P.addEquipment('turretDark', cylY(.036, .050, .10, 12), x, top + .045, z);
    P.addEquipment('turretDark', cylY(.017, .017, .075, 8), x, top + .13, z);
    P.addEquipment('turretDark', cylY(.0045, .010, h, 6), x, top + .16 + h / 2, z);
  }
}

// 902B batteries on armoured shoes (old: addT90AVladimirSmokeBanks' batteries on armoured shoes on the cheek course).
// The twin's launcher stairs stay where they are and fire as before; each gets a long welded shoe under its lowest row
// that runs forward along the flank to the rear of the cheek course, buried in the casting and in the side bin's front
// face, with a chamfered nose, an armour face plate, bolts and a fillet weld along the flank.
function smokeShoes(P: TankBuilderPort): void {
  const yb = .175, yt = .305, zr = -.64, zm = -.12, zn = -.03;
  for (const s of [-1, 1]) {
    const ring = (outer: number, top: number): [number, number][] => mirrorRing(
      [[1.00, yb], [outer - .07, yb], [outer, yb + .04], [outer, top], [1.08, top]], s);
    P.addEquipment('turretDetail', sectionSolid([
      { z: zr, ring: ring(1.47, yt) }, { z: zm, ring: ring(1.47, yt) }, { z: zn, ring: ring(1.39, yt - .04) },
    ]));
    P.addEquipment('turretDark', box(.010, .052, .34), s * 1.4715, .258, -.36);                    // armour face plate
    for (const [x, z] of [[1.30, -.38], [1.41, -.38], [1.30, -.20], [1.41, -.20]]) P.addEquipment('turretDark', cylY(.013, .013, .012, 6), s * x, yt + .003, z);
    const a = seat(P, ['turret'], [s * 3, yt + .015, -.10], [-s, 0, 0], 'smoke shoe nose');
    const c = seat(P, ['turret'], [s * 3, yt + .015, -.56], [-s, 0, 0], 'smoke shoe heel');
    P.addEquipment('turretDetail', beamBetween([a.x, yt, -.10], [c.x, yt, -.56], .009, 6));
  }
}

// The armoured base of the Kord tower (old: the tall armoured station tower). The station itself is untouched and
// turns whole about its yaw axis; an eight-sided armoured plinth fills the roof under its yoke, sunk into the roof and
// stopping under the station's lowest swept part, clear of the commander's cupola, with eight bolts round it.
// The station is built by sourceMachineGun (not a bucket a ray can read): its yaw axis is t90X.ts classicVCradle's yaw
// point in the turret frame, and its lowest swept point (the yoke base) was measured off the built station.
const STATION_AXIS = [-.6353, -.0071] as const;
const STATION_FLOOR = .8793;
function kordPlinth(P: TankBuilderPort): void {
  const [x, z] = STATION_AXIS, rb = .255, rt = .232;
  let low = 9;
  for (let a = 0; a < 8; a++) {
    const t = a * Math.PI / 4;
    low = Math.min(low, seat(P, ['turret'], [x + Math.sin(t) * rb, 3, z + Math.cos(t) * rb], [0, -1, 0], 'Kord plinth').y);
  }
  const yb = low - .010, yt = STATION_FLOOR - .012, h = yt - yb;
  P.addEquipment('turretDetail', cylY(rt, rb, h, 8, false, Math.PI / 8), x, yb + h / 2, z);
  const yBolt = yt - .030, apothem = (rt + (rb - rt) * (.030 / h)) * Math.cos(Math.PI / 8);
  for (let a = 0; a < 8; a++) {
    const t = a * Math.PI / 4;
    P.addEquipment('turretDark', cylZ(.013, .016, 6), x + Math.sin(t) * apothem, yBolt, z + Math.cos(t) * apothem, 0, t, 0);
  }
}

// A Kord-pattern ammunition box strapped in a welded frame on the commander's bin lid (spare heavy-MG ammunition at the
// commander's station, beside the Kord base).
function kordBox(P: TankBuilderPort): void {
  const cx = -1.11, cz = -1.045, yaw = -.35, c = Math.cos(yaw), s = Math.sin(yaw);
  const lid = seat(P, ['turretDetail'], [cx, 3, cz], [0, -1, 0], 'Kord box').y;
  const at = (bucket: string, g: THREE.BufferGeometry, lx: number, ly: number, lz: number) =>
    P.addEquipment(bucket, g, cx + lx * c + lz * s, lid + ly, cz - lx * s + lz * c, 0, yaw, 0);
  for (const lx of [-.10, .10]) at('turretDetail', box(.03, .025, .46), lx, .0125, 0);                // frame rails
  for (const lz of [-.215, .215]) at('turretDetail', box(.23, .07, .012), 0, .045, lz);               // end stops
  at('turretFittingPaint', box(.17, .19, .40), 0, .025 + .095, 0);
  at('turretDark', box(.15, .012, .30), 0, .025 + .196, 0);                                          // lid seal
  at('turretDark', beamBetween([0, .22, -.08], [0, .25, -.04], .008, 6), 0, 0, 0);
  at('turretDark', beamBetween([0, .25, -.04], [0, .25, .04], .008, 6), 0, 0, 0);
  at('turretDark', beamBetween([0, .25, .04], [0, .22, .08], .008, 6), 0, 0, 0);                    // carry handle
  for (const lz of [-.12, .12]) at('turretDark', box(.19, .21, .025), 0, .025 + .10, lz);             // tie-down straps
}

export function addT90A2006TurretPackage(P: TankBuilderPort): void {
  const twin = measureTwinRear(P);
  faceChevron(P);
  shtoraShoes(P);
  cheekFans(P);
  sightCrown(P);
  smokeShoes(P);
  kordPlinth(P);
  kordBox(P);
  const bustle = weldedBustle(P, twin);
  raisedCrown(P, bustle);
  flankBins(P, twin, bustle);
  sideRails(P, twin, bustle);
  bustleLids(P, bustle);
  sternLouvres(P, bustle);
  radioCourses(P);
}
