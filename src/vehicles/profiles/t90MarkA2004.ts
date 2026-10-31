// The T-90A obr. 2004 (`t90a_2004`): its own fittings on the T-90A source build (t90X.ts T90_X_PROFILES.t90a). 2026-10-30 (lane t90-family-266; the owner: "our new
// versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The obr. 2004 is the early welded-turret T-90A in its 2004-2010 garrison and parade fit: rubber skirting, a tubular
// rack on the turret box and crew boxes on the rear fenders. Every part is seated on the source stock by a ray.
// 2026-10-31 (the owner: "make 2013, 2006, and 2004 turrets look more like they were before just on the new base", then
// "the new turrets have to be properly inspired from bases of the turrets from the ones that were there in the new
// verisons. like they should properly look distinguished like what was done with the other tanks but upholding the new
// level of visual quality", then "see the 2022 is the level of innovation i want in our reworked t90s. same but fresh
// and different take"): the turret package (t90MarkA2004Turret.ts) builds the pre-rebuild obr. 2004 turret's boxy,
// cassette-walled, bin-laden character on the source casting as the walled turret: slab-sided two-tier K-5 walls on
// both flanks over cast perimeter flanges, a tall asymmetric bustle superstructure (its chest stands in this kit's
// rack; its bins carry the crew's grab handles), a raised sight crown, a welded roof crown, the tiled K-5 chevron front
// (brows on the cheek wedges, leaves beside the mantlet) and two radio courses with whips. The roof machine-gun
// station is t90.ts's.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { addT90A2004TurretPackage } from './t90MarkA2004Turret.ts';
type Point = readonly [number, number, number];
const { box } = KIT;

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

function tube(P: TankBuilderPort, a: Point, b: Point, r = .016): void {
  P.addEquipment('turretDetail', beamBetween(a, b, r, 10));
}

// Segmented rubber flaps under the side screens: the rubber-fabric strips the garrison T-72/T-90 fleet hung below the
// screens against road dust. Each 410 mm segment laps the screen's lower edge where a ray finds it.
function skirtFlaps(P: TankBuilderPort): void {
  for (const side of [-1, 1]) for (let z = -2.82; z < 3.12; z += .44) {
    const face = stockRay(P, ['hull'], [side * 3, .80, z], [-side, 0, 0]);
    if (!face || Math.abs(face.x) < 1.7) continue;
    const x = Math.abs(face.x) - .007;
    const edge = stockRay(P, ['hull'], [side * x, .30, z], [0, 1, 0]);
    if (!edge || edge.y > .90) continue;
    const top = edge.y + .035, low = .50;
    P.addEquipment('hullDark', box(.012, top - low, .41), side * x, (top + low) / 2, z);
    // the clamping strip bolts the flap to the screen's lower edge
    P.addEquipment('hullDark', box(.016, .030, .40), side * (x + .010), edge.y + .010, z);
  }
}

// Rubber front mud flaps hung from the curled bow guards (garrison road-march fit, as on the T-72B/T-90 parade tanks).
function bowFlaps(P: TankBuilderPort): void {
  const z = 3.745;
  for (const side of [-1, 1]) {
    const roof = stockRay(P, ['hull'], [side * 1.41, 3, z], [0, -1, 0]);
    if (!roof) throw new Error('t90a_2004: no bow guard under the front flap');
    const top = roof.y - .008, low = .52;
    P.addEquipment('hullDark', box(.56, top - low, .012), side * 1.41, (top + low) / 2, z);
    P.addEquipment('hullDark', box(.58, .030, .018), side * 1.41, top - .06, z + .012);   // clamping bar
  }
}

// Crew boxes on the rear fender ends behind the source cases: the right one the crew's kit box, the left a low ZIP box.
function rearFenderBoxes(P: TankBuilderPort): void {
  for (const [side, h] of [[1, .30], [-1, .22]] as const) {
    const x = side * 1.41, z = -3.02;
    const deck = stockRay(P, ['hull'], [x, 3, z], [0, -1, 0]);
    if (!deck) throw new Error('t90a_2004: no rear fender under the crew box');
    const y = deck.y;
    P.addEquipment('hullDetail', box(.50, h, .34), x, y + h / 2, z);
    P.addEquipment('hullDetail', box(.52, .022, .36), x, y + h + .008, z);                        // lid
    for (const dz of [-.10, .10]) P.addEquipment('hullDark', box(.036, .060, .020), side * 1.665, y + h * .62, z + dz, 0, 0, 0); // hasps
    for (const dz of [-.12, .12]) P.addEquipment('hullDark', box(.512, .012, .030), x, y + h + .020, z + dz); // tie-down straps
  }
}

// A welded tubular rack round the top of the turret-rear box and over the stowed OPVT pipe, as fitted to garrison T-90As
// for the crew's rolls and covers. Front posts stand on the box roof, rear posts on the pipe's end brackets.
function turretRack(P: TankBuilderPort): void {
  const top = stockRay(P, ['turretDetail'], [0, 3, -1.55], [0, -1, 0]);
  const pipe = stockRay(P, ['turretDetail'], [.679, 3, -1.95], [0, -1, 0]);
  if (!top || !pipe) throw new Error('t90a_2004: no turret box under the rack');
  const roof = top.y, rail = roof + .25, mid = roof + .13, xl = -.657, xr = .679;
  const zf = -1.42, zm = -1.70, zr = -1.95;
  const posts: Point[] = [[xl, roof - .01, zf], [xr, roof - .01, zf], [xl, roof - .01, zm], [xr, roof - .01, zm],
    [xl, pipe.y - .01, zr], [xr, pipe.y - .01, zr], [0, pipe.y - .04, zr]];
  for (const [x, y, z] of posts) tube(P, [x, y, z], [x, rail, z], .018);
  for (const y of [rail, mid]) {
    tube(P, [xl, y, zf], [xl, y, zr]); tube(P, [xr, y, zf], [xr, y, zr]); tube(P, [xl, y, zr], [xr, y, zr]);
  }
  tube(P, [xl, rail, zf], [xr, rail, zf]);
  for (const [x, , z] of posts.slice(0, 4)) P.addEquipment('turretDetail', box(.07, .012, .07), x, roof + .004, z); // weld pads
}

export function addT90MarkA2004Kit(P: TankBuilderPort): void {
  skirtFlaps(P);
  bowFlaps(P);
  rearFenderBoxes(P);
  turretRack(P);
  addT90A2004TurretPackage(P);
}
