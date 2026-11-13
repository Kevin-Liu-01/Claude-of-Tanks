// Shared fittings of the Chieftain marks built on the source-measured castings (release 268b, owner 2026-11-02: "make
// them look much more different inn editing the turret and hull appearances to like like precessors"): the Mk 3 on the
// Mk 5 X (chieftainMk3X.ts) and the Mk 9 on the Mk 10 X (chieftainMk9X.ts). Rolled cloth, lifting eyes and closed lofts.
// First-party construction: Kevin B. Liu.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';

const { box } = KIT;

/** One section of a soft rolled bundle at station s (-0.5..0.5 of its length): a rounded section whose folds wander
 * along the roll, with a flattened belly that sags a little more mid-length. Counter-clockwise from the belly. */
function rollRing(radius: number, s: number, sag: number, grow = 1): [number, number][] {
  const fill = Math.min(1, .62 + 3.9 * (.5 - Math.abs(s)));
  const r = radius * fill * grow, belly = -.55 * r - sag * (1 - Math.abs(s) * 2);
  const ring: [number, number][] = [];
  for (let k = 0; k < 14; k++) {
    const a = -Math.PI / 2 + k * 2 * Math.PI / 14;
    const fold = 1 + .05 * Math.sin(3 * a + 7 * s) * fill;
    ring.push(Math.sin(a) < -.55 ? [Math.cos(a) * r, belly] : [Math.cos(a) * r * fold, Math.sin(a) * r * fold]);
  }
  return ring;
}

/** A rolled camouflage net or tarpaulin along +X; its tied ends draw in and lift off the surface it lies on. */
export function clothRoll(length: number, radius: number, sag: number): THREE.BufferGeometry {
  const stations = [-.5, -.47, -.40, -.15, .15, .40, .47, .5];
  return sectionSolid(stations.map((s) => ({ z: s * length, ring: rollRing(radius, s, sag) }))).rotateY(Math.PI / 2);
}

/** Webbing straps round a clothRoll at `strapAt` (fractions of its length), 3.5 % proud of the cloth. */
export function rollStraps(length: number, radius: number, sag: number, strapAt: readonly number[]): THREE.BufferGeometry[] {
  return strapAt.map((s) => sectionSolid([-.018, .018].map((dz) => ({ z: s * length + dz,
    ring: rollRing(radius, s, sag, 1.035) }))).rotateY(Math.PI / 2));
}

type Placer = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx?: number, ry?: number) => void;

/** A lifting eye: a 30 mm plate on its 16 mm pad with a round eye through it, its foot 8 mm into the stock at (x, y, z)
 *  and the plate's face turned by `yaw` (0: the eye looks along Z). */
export function liftingEye(place: Placer, bucket: string, x: number, y: number, z: number, yaw: number): void {
  place(bucket, box(.11, .016, .11), x, y, z, 0, yaw);
  const plate = new THREE.Shape();
  plate.moveTo(-.050, 0); plate.lineTo(.050, 0); plate.lineTo(.034, .060);
  plate.absarc(0, .066, .036, -.17, Math.PI + .17, false);
  plate.lineTo(-.050, 0);
  plate.holes.push(new THREE.Path().absarc(0, .068, .019, 0, Math.PI * 2, true));
  const g = new THREE.ExtrudeGeometry(plate, { depth: .030, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -.015);
  place(bucket, g, x, y - .008, z, 0, yaw);
}

/** A closed loft through rings of points (each ring the same count, its ends capped with fans), flat-shaded. */
export function loftRings(rings: readonly (readonly THREE.Vector3[])[]): THREE.BufferGeometry {
  const m = rings[0].length, positions: number[] = [], index: number[] = [];
  for (const ring of rings) for (const p of ring) positions.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < m; k++) {
    const a = i * m + k, b = i * m + (k + 1) % m, c = a + m, d = b + m;
    index.push(a, c, b, b, c, d);
  }
  for (const [ring, flip] of [[0, true], [rings.length - 1, false]] as const) {
    const base = ring * m;
    for (let k = 1; k < m - 1; k++) index.push(...(flip ? [base, base + k + 1, base + k] : [base, base + k, base + k + 1]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  // a box-free planar uv (x along, y up) so the loft merges with its bucket's other stock
  const p = flat.getAttribute('position'), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[2 * i] = p.getX(i) + p.getZ(i); uv[2 * i + 1] = p.getY(i); }
  flat.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return flat;
}

/** A round tube through points (a rail or a stalk), `radius` and `sides` round, its ends open (they bed into stock). */
export function tubeThrough(points: readonly (readonly [number, number, number])[], radius: number, sides = 8): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal', .2);
  return new THREE.TubeGeometry(curve, Math.max(2, (points.length - 1) * 6), radius, sides, false);
}

// ---- release 269: the retired upper assembly's turret kit, re-made for the current castings ----------------------------
// The owner (2026-11-03): "for the cheiftain mk 3 and mk 9, add on all the equipment we had on teh turrets from before
// onto the currennt mk 3 and mk 9". Before release 268b both marks wore the uk.ts upper assembly
// (buildChieftainUpper2026Steps on chieftain5Build / chieftainMk10Build): a compressed faceted shell carrying an IR
// searchlight with its lens (Mk 3) or an armoured sight head with its window (Mk 9), smoke banks on the front quarters,
// long side bins with stowed rods on them, the loader's periscopes and a sight box beside the cupola, dark bars across
// the roof shoulders, three whips on box shoes, a bustle rail basket with two tarpaulin rolls and an ammunition can, the
// L37 on the cupola. These are that kit's parts as shaped, seated equipment; each mark seats them on its own casting
// (chieftainMk3X.ts, chieftainMk9X.ts), and the items its build already carries keep the current part.

type Point3 = readonly [number, number, number];

/** A welded case with its top edges chamfered (the Mk 5 X's case section), centred on the origin. */
export function chamferedCase(width: number, height: number, depth: number): THREE.BufferGeometry {
  return sectionSolid([-.5, .5].map((z) => ({ z: z * depth,
    ring: [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height * .36], [width * .43, height / 2],
      [-width * .43, height / 2], [-width / 2, height * .36]],
  })));
}

/** A grab rail across a roof: a 22 mm bar bent up off two weld pads at a and b (their feet 8 mm into the plate),
 *  `height` over the roof, its bends rounded. */
export function grabRail(place: Placer, bucket: string, a: Point3, b: Point3, height = .075, radius = .011): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, k = Math.min(.045, l * .2);
  const pts: [number, number, number][] = [[a[0], a[1] - .008, a[2]], [a[0], a[1] + height - k, a[2]],
    [a[0] + ux * k * .4, a[1] + height - k * .12, a[2] + uz * k * .4], [a[0] + ux * k, a[1] + height, a[2] + uz * k],
    [b[0] - ux * k, b[1] + height, b[2] - uz * k], [b[0] - ux * k * .4, b[1] + height - k * .12, b[2] - uz * k * .4],
    [b[0], b[1] + height - k, b[2]], [b[0], b[1] - .008, b[2]]];
  place(bucket, tubeThrough(pts, radius, 8), 0, 0, 0);
  for (const p of [a, b]) place(bucket, KIT.cylY(radius * 2.2, radius * 2.5, .014, 10), p[0], p[1] - .001, p[2]);
}

/** A cast periscope head on the roof (the loader's), its glass on the face turned to `yaw` (0: forward), its foot
 *  10 mm into the roof at y. */
export function periscopeHead(place: Placer, bucket: string, glass: string, x: number, y: number, z: number, yaw = 0): void {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  place(bucket, chamferedCase(.15, .085, .12), x, y + .0325, z, 0, yaw);
  place(bucket, box(.17, .014, .14), x, y - .003, z, 0, yaw);
  place(glass, box(.112, .032, .006), x + s * .059, y + .036, z + c * .059, 0, yaw);
  // the hood over the pane
  place(bucket, box(.13, .010, .030), x + s * .062, y + .060, z + c * .062, 0, yaw);
}

/** The old roof sight box: a chamfered case with a recessed dark window on its face turned to `yaw`. */
export function sightBox(place: Placer, bucket: string, dark: string, glass: string, x: number, y: number, z: number,
  yaw = 0, w = .22, h = .15, d = .22): void {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  place(bucket, chamferedCase(w, h, d), x, y + h / 2 - .008, z, 0, yaw);
  place(dark, box(w * .68, h * .48, .012), x + s * (d / 2 - .002), y + h * .52, z + c * (d / 2 - .002), 0, yaw);
  place(glass, box(w * .56, h * .36, .004), x + s * (d / 2 + .003), y + h * .52, z + c * (d / 2 + .003), 0, yaw);
  // the window's brow
  place(bucket, box(w * .78, .012, .035), x + s * (d / 2 + .012), y + h * .82, z + c * (d / 2 + .012), 0, yaw);
}

/** Stowed rods (the cleaning staves and pickets the old build carried along its side bins): `count` rods of `length` along
 *  +Z lying side by side across X on the surface at yBase (a bin lid), each end in a welded cradle (a bar across under
 *  them, 6 mm into the lid, its ends turned up) with a webbing strap over them. */
export function stowedRods(place: Placer, bucket: string, dark: string, x: number, yBase: number, zc: number, length: number,
  count = 3): void {
  const r = .017, pitch = .042, span = (count - 1) * pitch, y = yBase + .006 + r;
  for (let i = 0; i < count; i++) {
    place(dark, KIT.cylZ(i === 1 ? .02 : r, length - (i % 2) * .08, 10), x + (i - (count - 1) / 2) * pitch, y + (i === 1 ? .003 : 0), zc + (i % 2) * .03);
  }
  for (const dz of [-length * .34, length * .34]) {
    place(bucket, box(span + .07, .012, .034), x, yBase, zc + dz);
    for (const sx of [-1, 1]) place(bucket, box(.012, .046, .034), x + sx * (span / 2 + .03), yBase + .017, zc + dz);
    place(dark, box(span + .06, .006, .028), x, y + r + .006, zc + dz);
  }
}
