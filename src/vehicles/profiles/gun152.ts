// The Russian 152 mm line's tank guns (release 269; owner 2026-11-04, "NEW RUSSIAN 152 MM TANK LINE"): the LP-83 of the
// Object 292 and the Object 477 Molot, and the 2A83 of the Object 195 and the T-14 152. One construction, each gun's own
// measures: a smoothbore tube on its breech collar, a thermal sleeve in jointed sections (the 2A83 of the Object 195
// prototype photograph shows five clamped sections; the LP-83 at Kubinka, three) and the muzzle reference collar.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md); sources in
// docs/references/photos/russia-152-20261104.json.
import { KIT } from './kit.ts';
import type * as THREE from 'three';

/** What a 152 mm gun is built into: any builder's geometry port (the T-80 line's and the factory's). */
interface GunPort {
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  readonly q?: boolean | number;
}

const { cylZ, xform } = KIT;

export interface Gun152Measures {
  /** Muzzle face, metres ahead of the trunnion along the bore. */
  readonly len: number;
  /** The tube's outer radius at the muzzle. */
  readonly r: number;
  /** The breech collar's radius where the tube leaves the mantlet. */
  readonly baseR: number;
  /** Thermal sleeve sections, as [start, end] fractions of `len`. */
  readonly sleeve: readonly (readonly [number, number])[];
  /** The bore evacuator's centre as a fraction of `len` (the LP-83's), or null. */
  readonly evac: number | null;
}

/** The 2A83 (Object 195 prototype photograph: five sleeve sections from the mantlet to the reference collar). */
export const GUN_2A83: Gun152Measures = Object.freeze({
  len: 5.75, r: 0.112, baseR: 0.205,
  sleeve: Object.freeze([[0.10, 0.27], [0.28, 0.45], [0.46, 0.63], [0.64, 0.80], [0.81, 0.92]] as const),
  evac: null,
});

/** The LP-83 (Kubinka's Object 292: three sleeve sections clamped ahead of the root collar, no bore evacuator). */
export const GUN_LP83: Gun152Measures = Object.freeze({
  len: 6.15, r: 0.115, baseR: 0.21,
  sleeve: Object.freeze([[0.22, 0.44], [0.45, 0.67], [0.68, 0.90]] as const),
  evac: null,
});

/** The Molot's Perm 152 mm (btvt: 2A73; no photograph shows its tube clear of the casing): four sleeve sections. */
export const GUN_2A73: Gun152Measures = Object.freeze({
  len: 6.30, r: 0.114, baseR: 0.21,
  sleeve: Object.freeze([[0.14, 0.33], [0.34, 0.53], [0.54, 0.72], [0.73, 0.90]] as const),
  evac: null,
});

/** Builds the tube in the gun group (its trunnion at the group's origin) and sets the muzzle. */
export function build152Gun(P: GunPort, gun: Gun152Measures): void {
  const { len, r, baseR, sleeve, evac } = gun;
  KIT.buildGun(P, { len, r, baseR, sleeve: false, collar: true, evac, evacR: 1.48 });
  const seg = P.q ? 28 : 12;
  for (const [a, b] of sleeve) {
    const z0 = a * len, z1 = b * len;
    // each section a little proud of the tube, clamped at both ends by a dark band
    P.add('gun', xform(cylZ(r * 1.2, z1 - z0, seg), 0, 0, (z0 + z1) / 2));
    P.add('gunDark', xform(cylZ(r * 1.27, 0.05, seg), 0, 0, z0 + 0.03));
    P.add('gunDark', xform(cylZ(r * 1.27, 0.05, seg), 0, 0, z1 - 0.03));
  }
}
