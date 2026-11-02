// The Chieftain marks built on the source-measured Mk 5 X (chieftain5X.ts): what each mark carries that the Mk 5 does
// not. Release 268 (owner 2026-11-02, "also update the cheiftainn mk 3 and mk 9"): the Mk 3 and the Mk 9 share the Mk 5's
// hull and turret castings, so they are the Mk 5 X with their own fittings, never a second casting.
// - Mk 3 (1969-72): the 12.7 mm L21 ranging gun "fitted over the barrel" until the Barr & Stroud laser sight replaced it
//   from 1971 (en.wikipedia.org/wiki/Royal_Ordnance_L11). The Yad la-Shiryon Mk 3 carries a full-width box on the
//   turret rear as the Mk 5 does, so the pack stays the Mk 5's.
// - Mk 9 (1979): a Mk 6 (ex-Mk 2) after every phase of Totem Pole, IFCS and the muzzle reference system of 1975 (its
//   mirror on the muzzle), no Stillbrew (that went to the Mk 10, 11 and 12 in 1984-86, en.wikipedia.org/wiki/
//   Chieftain_(tank)), and the BAOR crews' later stowage: a camouflage net rolled on the bustle and a bundle in the
//   basket. Sources and photographs: ~/cot-lanes/italy-korea-bmp-267-evidence/research/<id>/.
// First-party construction: Kevin B. Liu.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
const { cylZ } = KIT;

/** A gun-frame part from hull-frame metres. */
function gunPart(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry, trunnion: Point,
  x: number, y: number, z: number): void {
  P.add(bucket, g, x - trunnion[0], y - trunnion[1], z - trunnion[2]);
}

/** A lathe about +Z from [radius, z] pairs (a closed profile turns into a solid of revolution). */
function latheZ(profile: readonly (readonly [number, number])[], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments).rotateX(Math.PI / 2);
}

/**
 * The Mk 3's L21 ranging gun on the main gun's cradle (it elevates with the gun and does not recoil with it): an
 * armoured sleeve seated in the top of the root hood above the bore, the .50 heavy barrel out of it and an open
 * flash hider whose mouth is a real recess. The axis is parallel to the bore, 17 cm over it.
 */
function rangingGun(P: TankBuilderPort, trunnion: Point): void {
  const x = -.004, y = 2.032;
  // The sleeve: its underside lies 2-39 mm inside the hood's falling crown (2.027 at z 1.78, 1.990 at z 2.18).
  gunPart(P, 'gunMount', cylZ(.044, .40, 20), trunnion, x, y, 1.98);
  gunPart(P, 'gunMount', latheZ([[0, 0], [.044, 0], [.044, .012], [.034, .040], [0, .040]], 20),
    trunnion, x, y, 2.176);
  gunPart(P, 'gunMountDark', cylZ(.0155, .56, 12), trunnion, x, y, 2.47);
  // Flash hider: outer wall to the mouth, a lip and a 30 mm deep bore.
  gunPart(P, 'gunMountDark', latheZ([[.0150, 0], [.0215, .006], [.0215, .074], [.0105, .074],
    [.0105, .044], [0, .044]], 14), trunnion, x, y, 2.744);
}

/** The Mk 9's muzzle reference system mirror: a saddle housing on the barrel crown behind the muzzle, its hood's dark
 * window facing back down the barrel at the sight. Its underside runs 10-26 mm into the 0.102 m barrel. */
function mrsMirror(P: TankBuilderPort, trunnion: Point): void {
  const x = trunnion[0], z0 = 6.60, z1 = 6.785;
  const crown = trunnion[1] + .1020;
  const section = (z: number): SolidSection => ({ z, ring: [[-.056, crown - .026], [.056, crown - .026],
    [.056, crown + .030], [.040, crown + .046], [-.040, crown + .046], [-.056, crown + .030]] });
  P.add('gun', sectionSolid([section(z0), section(z1)]), x - trunnion[0], -trunnion[1], -trunnion[2]);
  // The mirror's hood stands 3 mm into the housing's aft end; the dark window lies on the hood's aft face.
  gunPart(P, 'gun', KIT.box(.086, .046, .040), trunnion, x, crown + .066, z0 + .040);
  gunPart(P, 'gunDark', KIT.box(.064, .030, .004), trunnion, x, crown + .066, z0 + .0185);
}

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
function clothRoll(length: number, radius: number, sag: number): THREE.BufferGeometry {
  const stations = [-.5, -.47, -.40, -.15, .15, .40, .47, .5];
  return sectionSolid(stations.map((s) => ({ z: s * length, ring: rollRing(radius, s, sag) }))).rotateY(Math.PI / 2);
}

/** Webbing straps round a clothRoll at `strapAt` (fractions of its length), 3.5 % proud of the cloth. */
function rollStraps(length: number, radius: number, sag: number, strapAt: readonly number[]): THREE.BufferGeometry[] {
  return strapAt.map((s) => sectionSolid([-.018, .018].map((dz) => ({ z: s * length + dz,
    ring: rollRing(radius, s, sag, 1.035) }))).rotateY(Math.PI / 2));
}

function laterStowage(P: TankBuilderPort, pivot: Point): void {
  const add = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2]);
  // The net rolled across the NBC pack's top (2.2443): its flattened belly 12 mm into the lid.
  const rollY = 2.2443 + .118 * .55 - .012;
  add('turretCloth', clothRoll(1.24, .118, .004), 0, rollY, -1.93);
  for (const strap of rollStraps(1.24, .118, .004, [-.27, .27])) add('turretDark', strap, 0, rollY, -1.93);
  // A net bundle on the floor bars of the starboard basket (bottom 1.850, inner wall x -.934), clear of the drum
  // behind it (z -1.135) and the basket's front rail (z -.645).
  const bundleY = 1.850 + .148 * .55 - .010;
  add('turretCloth', clothRoll(.40, .148, .010).rotateY(Math.PI / 2), -1.168, bundleY, -.895);
  for (const strap of rollStraps(.40, .148, .010, [0])) add('turretDark', strap.rotateY(Math.PI / 2), -1.168, bundleY, -.895);
}

export function addChieftainMk3Kit(P: TankBuilderPort, trunnion: Point): void {
  rangingGun(P, trunnion);
}

export function addChieftainMk9Kit(P: TankBuilderPort, pivot: Point, trunnion: Point): void {
  mrsMirror(P, trunnion);
  laterStowage(P, pivot);
}
