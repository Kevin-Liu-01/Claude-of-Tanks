// First-party procedural parts for the Ariete family builders: profiles/italy.ts (buildArieteMkSteps, the C1 prototype
// and the C2) and profiles/misc.ts (buildAriete, the C1 Preserie). Lane italy-korea-bmp-267 (2026-11-01), authored from
// the lane's reference packets: the series C1 photographs (front lamp clusters) and the Ariete C2 (AMV) acceptance
// photographs (bolted add-on plates, the rear skirt louvre, the commander's panoramic drum, the loader's shielded gun). Every part is authored here; no source mesh, vertex or texture is used.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

type Vec3 = readonly [number, number, number];

export interface ArieteParts {
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  readonly q?: boolean;
}

/** Eight-corner solid (KIT.slab ring order: bottom then top, each (-x,+z),(+x,+z),(+x,-z),(-x,-z)), re-wound outward
 * when a mirrored call hands it the opposite handedness (the misc.ts orientedSlab rule). */
export function wedge(b0: Vec3, b1: Vec3, b2: Vec3, b3: Vec3, t0: Vec3, t1: Vec3, t2: Vec3, t3: Vec3): THREE.BufferGeometry {
  const c = [b0, b1, b2, b3, t0, t1, t2, t3];
  const cen = [0, 1, 2].map((k) => c.reduce((s, p) => s + p[k], 0) / 8);
  const sub = (a: Vec3, b: readonly number[]): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: readonly number[], b: readonly number[]): number[] =>
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let outward = 0;
  for (const f of [[b0, b1, t1, t0], [b1, b2, t2, t1], [b2, b3, t3, t2], [b3, b0, t0, t3], [t0, t1, t2, t3], [b3, b2, b1, b0]]) {
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const fc = [0, 1, 2].map((k) => (f[0][k] + f[1][k] + f[2][k] + f[3][k]) / 4);
    if (n[0] * (fc[0] - cen[0]) + n[1] * (fc[1] - cen[1]) + n[2] * (fc[2] - cen[2]) > 0) outward++;
  }
  return outward >= 3 ? KIT.slab(b0, b1, b2, b3, t0, t1, t2, t3) : KIT.slab(b0, b3, b2, b1, t0, t3, t2, t1);
}

/** The Ariete's front lamp cluster (series C1 and C2 photographs: a squat armoured box on each front corner, two round
 * lamps side by side in its face under a raked brow, the amber indicator outboard). Base on `yBase`, face at `zFront`,
 * centred on `x`; `side` puts the indicator outboard. */
export function arieteLampCluster(P: ArieteParts, x: number, yBase: number, zFront: number, side: number,
  o: { w?: number; h?: number; d?: number; rx?: number } = {}): void {
  const w = o.w ?? 0.32, h = o.h ?? 0.15, d = o.d ?? 0.17, rx = o.rx ?? 0;
  // every piece is authored about the housing's front foot and pivots there, so a raked seat keeps the cluster one body
  const put = (slot: string, g: THREE.BufferGeometry, px: number, py: number, pz: number): void => {
    const local = KIT.xform(g, px, py, pz);
    P.add(slot, rx ? KIT.xform(local, 0, 0, 0, rx, 0, 0) : local, x, yBase, zFront);
  };
  // housing with the brow: the top runs 4.5 cm short of the face, so the lamps sit under a raked lip
  const hw = w / 2;
  put('hull', wedge([-hw, 0, 0], [hw, 0, 0], [hw, 0, -d], [-hw, 0, -d],
    [-hw, h, -0.045], [hw, h, -0.045], [hw, h, -d], [-hw, h, -d]), 0, 0, 0);
  const ly = h * 0.44, seg = P.q ? 14 : 10;
  for (const k of [-1, 1]) {
    const lx = -side * 0.035 + k * w * 0.21;
    put('hullDark', KIT.cylZ(0.052, 0.02, seg), lx, ly, -0.004);                                         // recessed bezel
    put('hullGlass', markVehicleNightLens(KIT.cylZ(0.040, 0.012, seg), 'headlight'), lx, ly, 0.004);
  }
  put('hullGlass', markVehicleNightLens(KIT.box(0.034, 0.05, 0.012), 'marker', { tint: 'warm' }),
    side * (hw - 0.035), ly, 0.002);                                                                      // indicator
}

/** Louvred intake/exhaust field on a vertical side face at |x| = `faceX` (outward `side`): a dark recess flush with the
 * face and raked slats 4 mm proud (the series C1's rear-hull grilles and the C2's rear skirt louvre). */
export function arieteSideLouvre(P: ArieteParts, slots: { dark: string; detail: string }, side: number, faceX: number,
  y0: number, y1: number, z0: number, z1: number, slats = 6): void {
  const h = y1 - y0, len = z1 - z0;
  P.add(slots.dark, KIT.box(0.012, h, len), side * (faceX - 0.004), (y0 + y1) / 2, (z0 + z1) / 2);
  for (let k = 0; k < slats; k++) {
    const y = y0 + h * (k + 0.5) / slats;
    P.add(slots.detail, KIT.box(0.014, Math.min(0.03, h / slats * 0.55), len - 0.03), side * (faceX + 0.002), y,
      (z0 + z1) / 2, 0, 0, side * 0.35);
  }
}

/** Bolt heads on a plate face: `points` on the face, `normal` outward. Six-sided heads 7 mm proud, buried 4 mm. */
export function boltHeads(P: ArieteParts, slot: string, points: readonly THREE.Vector3[], normal: THREE.Vector3): void {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  for (const p of points) {
    const c = p.clone().addScaledVector(normal, 0.0015);
    P.add(slot, KIT.cylY(0.017, 0.019, 0.011, 6), c.x, c.y, c.z, e.x, e.y, e.z);
  }
}

/** The Ariete C2's commander's panoramic sight (Attila-D, C2 photographs 1-5): an armoured drum on the old pano
 * pedestal, its forward window behind a mesh guard, under a low domed cap. Drum foot at `yBase`. */
export function attilaSightHead(P: ArieteParts, owner: 'turret', x: number, yBase: number, z: number): void {
  const seg = P.q ? 20 : 12;
  P.add(owner, KIT.cylY(0.165, 0.175, 0.05, seg), x, yBase + 0.025, z);                  // armoured collar
  P.add(owner, KIT.cylY(0.155, 0.155, 0.20, seg), x, yBase + 0.15, z);                   // drum
  P.add(owner, KIT.xform(KIT.sph(0.155, seg, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.32, 1]), x, yBase + 0.248, z);
  // forward window pod with its mesh guard (the photographs' grille face)
  P.add(owner, KIT.box(0.20, 0.13, 0.08), x, yBase + 0.15, z + 0.13);
  P.add(`${owner}Glass`, KIT.box(0.15, 0.08, 0.012), x, yBase + 0.155, z + 0.172);
  P.add(`${owner}Dark`, KIT.openRackGrid(0.18, 0.11, 0.008, 4, 5), x, yBase + 0.155, z + 0.182, Math.PI / 2, 0, 0);
}
