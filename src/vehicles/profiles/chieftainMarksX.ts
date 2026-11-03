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
