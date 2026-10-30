// The T-90A obr. 2006 (`t90a_2006`): its own fittings on the T-90A Vladimir source build (t90X.ts T90_X_PROFILES.t90a_vladimir). 2026-10-30 (lane t90-family-266; the owner: "our new
// versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The obr. 2006 (ESSA sight) as it serves in 2022-24: field-welded slat over the engine bay and the turret box, an open
// basket, the stern log and a Kord box. Every part is seated on the source stock by a ray.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Point = readonly [number, number, number];
const { box, cylX } = KIT;

/** First hit on the given stock buckets (their parts are in the rig frame), or null. */
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
function need(p: THREE.Vector3 | null, what: string): THREE.Vector3 {
  if (!p) throw new Error(`t90a_2006: no stock under the ${what}`);
  return p;
}

// Field-welded slat over the engine-bay skirt panels (the 2022-24 Russian field fit, the T-90M's factory pattern):
// standoff arms on the screens, posts, eight edge-on bars and a capping rail. It stays below the gun's level sweep
// (1.61 m) and outside the turret's.
function bayScreens(P: TankBuilderPort): void {
  const z0 = -3.10, z1 = -1.40, len = z1 - z0, zc = (z0 + z1) / 2;
  for (const side of [-1, 1]) {
    const xs = Math.abs(need(stockRay(P, ['hull'], [side * 3, 1.10, -2.30], [-side, 0, 0]), 'bay screen').x);
    for (let y = .84; y < 1.56; y += .10) P.addEquipment('hullOpenLattice', box(.050, .012, len), side * (xs + .095), y, zc);
    for (const y of [.815, 1.566]) P.addEquipment('hullOpenLattice', box(.085, .015, len), side * (xs + .0775), y, zc);
    for (const z of [-1.42, -1.98, -2.54, -3.08]) {
      P.addEquipment('hullOpenLattice', box(.030, .76, .040), side * (xs + .055), 1.19, z);
      for (const y of [1.0, 1.30]) P.addEquipment('hullOpenLattice', box(.045, .035, .035), side * (xs + .0175), y, z);
      // the top of each post is braced down to the fender lip
      P.addEquipment('hullOpenLattice', beamBetween([side * (xs + .045), 1.53, z], [side * 1.79, 1.39, z], .012, 8));
    }
  }
}

// A slat screen hung off the turret-rear box on four standoff arms (2022-24 field fit against drones and RPGs).
function turretScreen(P: TankBuilderPort): void {
  // its foot (1.70 m) clears the engine-deck rear plate (1.63 m) it sweeps over
  const zs = -2.15, yl = .30, yh = .84, yc = (yl + yh) / 2;
  for (const x of [-.42, .42]) for (const y of [.42, .66]) {
    const face = need(stockRay(P, ['turretDetail'], [x, y, -5], [0, 0, 1]), 'turret screen arm');
    P.addEquipment('turretOpenLattice', beamBetween([x, y, face.z + .012], [x, y, zs + .05], .018, 10));
  }
  for (let x = -.81; x < .82; x += .09) P.addEquipment('turretOpenLattice', box(.010, yh - yl, .060), x, yc, zs);
  for (const y of [yl, yh]) P.addEquipment('turretOpenLattice', box(1.76, .040, .040), 0, y, zs);
  for (const x of [-.86, .86]) P.addEquipment('turretOpenLattice', box(.040, yh - yl + .04, .040), x, yc, zs);
  for (const y of [.42, .66]) P.addEquipment('turretOpenLattice', box(1.72, .030, .030), 0, y, zs + .045);  // backing rails
}

// An open welded basket in the empty right-rear quarter, welded to the turret box flank and braced to the right bin.
function rightBasket(P: TankBuilderPort): void {
  const flank = need(stockRay(P, ['turretDetail'], [3, .50, -1.72], [-1, 0, 0]), 'basket flank');
  const xi = flank.x + .015, xo = 1.17, zf = -1.60, zr = -1.83, yb = .32, yt = .66, ym = .49;
  const bar = (a: Point, b: Point, r = .012) => P.addEquipment('turretOpenLattice', beamBetween(a, b, r, 8));
  for (const x of [xi, xo]) for (const z of [zf, zr]) bar([x, yb - .012, z], [x, yt, z], .014);
  for (const y of [yb, yt]) {
    bar([xi, y, zf], [xo, y, zf]); bar([xi, y, zr], [xo, y, zr]); bar([xo, y, zf], [xo, y, zr]); bar([xi, y, zf], [xi, y, zr]);
  }
  bar([xi, ym, zf], [xo, ym, zf]); bar([xi, ym, zr], [xo, ym, zr]); bar([xo, ym, zf], [xo, ym, zr]);
  for (const z of [-1.66, -1.715, -1.77]) P.addEquipment('turretOpenLattice', box(xo - xi, .010, .025), (xi + xo) / 2, yb, z); // floor slats
  for (const y of [.36, .62]) for (const z of [zf, zr]) P.addEquipment('turretDetail', box(.025, .08, .08), flank.x + .0115, y, z); // weld pads
  const bin = need(stockRay(P, ['turretDetail'], [1.10, .50, -3], [0, 0, 1]), 'basket brace');
  bar([xo, .50, zf], [1.10, .50, bin.z + .01], .014);
}

// The unditching log carried across the stern under the drums, in two welded cradles (T-72/T-90 practice).
function sternLog(P: TankBuilderPort): void {
  const y = 1.04, r = .10, face = need(stockRay(P, ['hull'], [0, y, -5], [0, 0, 1]), 'stern log');
  const z = face.z - .115;
  P.addEquipment('hullWood', cylX(r, 2.40, 16), 0, y, z);
  for (const side of [-1, 1]) {
    const x = side * .78, foot = need(stockRay(P, ['hull'], [x, y - r - .015, -5], [0, 0, 1]), 'log cradle');
    const back = z - r - .005, d = foot.z + .01 - back;
    P.addEquipment('hullDetail', box(.05, .035, d), x, y - r - .0175, back + d / 2);           // cradle arm
    P.addEquipment('hullDetail', box(.05, .15, .025), x, y - r + .06, back - .0125);           // rear lip
    P.addEquipment('hullDark', cylX(r + .006, .04, 16), x, y, z);                              // chain strap
  }
}

// A Kord-pattern ammunition box strapped in a welded frame on the commander's bin lid (2022-24 crews carry spare
// heavy-MG ammunition at the commander's station; the remote weapon station itself is unchanged).
function kordBox(P: TankBuilderPort): void {
  const cx = -1.11, cz = -1.045, yaw = -.35, c = Math.cos(yaw), s = Math.sin(yaw);
  const lid = need(stockRay(P, ['turretDetail'], [cx, 3, cz], [0, -1, 0]), 'Kord box').y;
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

export function addT90MarkA2006Kit(P: TankBuilderPort): void {
  bayScreens(P);
  turretScreen(P);
  rightBasket(P);
  sternLog(P);
  kordBox(P);
}
