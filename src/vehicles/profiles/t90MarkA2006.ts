// The T-90A obr. 2006 (`t90a_2006`): its own fittings on the T-90A Vladimir source build (t90X.ts T90_X_PROFILES.t90a_vladimir). 2026-10-30 (lane t90-family-266; the owner:
// "our new versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The hull carries the 2022-24 field fit (welded slat over the engine bay, the stern log). 2026-10-31 (the owner: "make
// 2013, 2006, and 2004 turrets look more like they were before just on the new base", then "they should properly look
// distinguished like what was done with the other tanks but upholding the new level of visual quality"): the turret
// carries the pre-rebuild obr. 2006 turret's character as layered equipment on the Vladimir X turret
// (t90MarkA2006Turret.ts), at the level of the T-72B3M obr. 2022 redesign (the owner: "see the 2022 is the level of
// innovation i want in our reworked t90s. same but fresh and different take"): in front, boxed K-5 chevron cassettes
// across the face, the Shtora heads on broad shoes, 902B fans on the cheek course and a crown behind the sight head;
// behind, the raised welded crown growing into a long bustle with lids, rails carrying rolls, flank bins and a louvred
// face; with 902B shoes, the armoured Kord base and two radio courses. Every part is seated on the source stock by a ray.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { addT90A2006TurretPackage } from './t90MarkA2006Turret.ts';
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

export function addT90MarkA2006Kit(P: TankBuilderPort): void {
  bayScreens(P);
  sternLog(P);
  addT90A2006TurretPackage(P);
}
