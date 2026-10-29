// Merkava family gun assemblies (release 262, the owner 2026-10-27: "we will need their gun assemblies back and
// beautiful"). One construction for the three guns the six marks carry, each measured from the mark's source model
// (merkavaFamilySource.ts): the 105 mm M64 (the licensed M68) of the Mk 1 and Mk 2, the 120 mm MG251 of the Mk 3 and the
// MG253 of the Mk 4. The barrel is one solid of revolution about the gun's +Z axis through the measured radii (revolveZ):
// the tube, the thermal sleeve's sections and flanged clamps, the evacuator drum and its bands, the bare muzzle, each
// section its own band so the steps read crisp and the tube stays circular. The gun mask (the Mk 1 to Mk 3's long mask
// riding in the turret's slot, the Mk 4's pointed housing: its own cast pieces, not the mount over it) is lofted through
// its measured stations; it, the over-gun cradle's posts and plates, the boot, the coaxial port and the over-gun M2
// pitch with the gun (rig_gun); only the barrel recoils (rig_recoil). Gun frame: origin on the trunnion axis, +Z along
// the bore.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** One station of a revolved profile: z along the axis, r its radius there (0 on the axis). */
export type RevolveStation = readonly [z: number, r: number];

/** A closed solid of revolution about local +Z. Each profile segment is its own band (its own normal), so a step or a
 *  lip stays crisp; round the axis it is smooth. A segment with both radii 0 is skipped. Outward winding. */
export function revolveZ(profile: readonly RevolveStation[], segments: number): THREE.BufferGeometry {
  if (profile.length < 2) throw new Error('revolveZ needs two stations');
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], index: number[] = [];
  const zSpan = Math.max(1e-6, profile[profile.length - 1]![0] - profile[0]![0]);
  for (let k = 0; k + 1 < profile.length; k++) {
    const [z0, r0] = profile[k]!, [z1, r1] = profile[k + 1]!;
    if (r0 <= 0 && r1 <= 0) continue;
    const dz = z1 - z0, dr = r1 - r0, len = Math.hypot(dz, dr);
    if (len < 1e-7) continue;
    const nr = dz / len, nz = -dr / len;
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      positions.push(r0 * c, r0 * s, z0, r1 * c, r1 * s, z1);
      normals.push(nr * c, nr * s, nz, nr * c, nr * s, nz);
      const u = i / segments;
      uvs.push(u, (z0 - profile[0]![0]) / zSpan, u, (z1 - profile[0]![0]) / zSpan);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2, b = base + (i + 1) * 2, d = a + 1, c = b + 1;
      if (r0 > 0) index.push(a, b, d);
      if (r1 > 0) index.push(b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/** A gun as measured for one mark (gun frame, metres). */
export interface MerkavaGunSpec {
  /** 'M64' (105 mm, licensed M68) or 'MG25x' (the 120 mm MG251 / MG253). */
  readonly model: 'M64' | 'MG25x';
  /** The trunnion in the turret frame. */
  readonly trunnion: readonly [x: number, y: number, z: number];
  /** The muzzle face: the trunnion to the muzzle along the bore. */
  readonly muzzleZ: number;
  /** The barrel's revolved profile, closing on the axis at both ends. */
  readonly barrel: readonly RevolveStation[];
  /** The corrugated boot from the mantlet cover to the barrel as measured (its ribs' radii), revolved on the gun's mount
   *  so it pitches with the gun; null where the source has none. */
  readonly boot: readonly RevolveStation[] | null;
  /** The gun mask's measured stations: z, the x extents and the y extents (gun frame). */
  readonly mantlet: readonly (readonly [z: number, x0: number, x1: number, y0: number, y1: number])[];
  /** The mount over the gun as measured. */
  readonly overGun: MerkavaOverGun | null;
  /** The over-gun mount's posts and plates between the mask's top and the M2, as measured boxes (gun frame). */
  readonly cradle: readonly MeasuredBox[];
}

/** A box as measured: min and max corners (gun frame). */
export type MeasuredBox = readonly [min: readonly [number, number, number], max: readonly [number, number, number]];

/** The 12.7 mm over the gun, as the source's `mg_twin` group measures it (gun frame), on the mask's cradle. */
export interface MerkavaOverGun {
  /** The M2's receiver back plate, its muzzle and its bore height; null where the source's cradle stands empty. */
  readonly m2: { readonly rearZ: number; readonly muzzleZ: number; readonly axisY: number } | null;
  /** The M2's side ammunition box (the Mk 1 to Mk 3's large box on its left), where the source carries one. */
  readonly ammoBox: MeasuredBox | null;
}

// The fleet M2 at scale 1 (FITTINGS.pintleMG cls 'm2', measured): back plate z -0.290, muzzle +1.271, bore y +0.0515.
const FLEET_M2 = Object.freeze({ rearZ: -0.290, muzzleZ: 1.271, axisY: 0.0515 });

const boxOf = ([min, max]: MeasuredBox): [THREE.BufferGeometry, number, number, number] =>
  [KIT.box(max[0] - min[0], max[1] - min[1], max[2] - min[2]), (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

/** The gun mask lofted through its measured stations: a rounded rectangle at each, merged stations dropped. */
function mantletGeometry(stations: MerkavaGunSpec['mantlet']): THREE.BufferGeometry | null {
  const st = stations.filter((s, i) => i === 0 || s[0] > stations[i - 1]![0] + 1e-4);
  if (st.length < 2) return null;
  const sections: SolidSection[] = st.map(([z, x0, x1, y0, y1]) => {
    const w = Math.max(0.02, x1 - x0), h = Math.max(0.02, y1 - y0), c = Math.min(w, h) * 0.18;
    const ring: SectionPoint[] = [
      [x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c],
    ];
    return { z, ring };
  });
  return sectionSolid(sections, { sideQuadDiagonal: 'convex' });
}

/** Builds the mark's gun on P.gunG: barrel (rig_recoil), mantlet, coaxial port and over-gun mount (rig_gun), and seats
 *  P.muzzleZ. Returns a receipt the family receipt reads. */
export function addMerkavaGun(P: TankBuilderPort, gun: MerkavaGunSpec): Readonly<Record<string, unknown>> {
  const seg = P.q ? 36 : 20;
  P.gunG.position.set(gun.trunnion[0], gun.trunnion[1], gun.trunnion[2]);
  P.add('gun', revolveZ(gun.barrel, seg));
  if (gun.boot) P.add('gunMount', revolveZ(gun.boot, seg));
  const mantlet = mantletGeometry(gun.mantlet);
  if (mantlet) P.add('gunMount', mantlet);
  // cradle trunnion caps behind the mantlet (gun steel), and the coaxial 7.62 mm port beside the gun on its left
  const rootR = Math.max(...gun.barrel.slice(0, 4).map(([, r]) => r));
  for (const side of [-1, 1]) P.add('gunMountDark', KIT.cylX(0.07, 0.06, 14), side * (rootR + 0.20), 0, 0);
  const face = gun.mantlet.length ? gun.mantlet[gun.mantlet.length - 1]![0] : 0.4;
  P.add('gunMountDark', KIT.cylZ(0.022, 0.12, 12), 0.20, -0.04, face - 0.04);
  for (const piece of gun.cradle) { const [box, bx, by, bz] = boxOf(piece); P.add('gunMount', box, bx, by, bz); }
  const top = gun.overGun;
  if (top) {
    if (top.m2) {
      // the 12.7 mm M2 over the gun, fired from inside the turret: the fleet M2 scaled to the measured back plate to
      // muzzle, its bore at the measured height
      const { rearZ, muzzleZ, axisY } = top.m2;
      const scale = (muzzleZ - rearZ) / (FLEET_M2.muzzleZ - FLEET_M2.rearZ);
      const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', scale, seed: 445, tone: 'two-tone', ammo: false,
        shield: false, ring: false, mount: 'external-cradle' });
      m2.name = 'merkavaOverGunM2';
      m2.position.set(0, axisY - FLEET_M2.axisY * scale, rearZ - FLEET_M2.rearZ * scale);
      // its saddle under the receiver, down to the highest cradle post or mask section beneath it (the measured posts
      // stop 1-5 cm short of the fleet gun's cradle)
      m2.updateMatrixWorld(true);
      const seat = new THREE.Box3().setFromObject(m2), z0 = rearZ + 0.02, z1 = rearZ + 0.24;
      let support = -Infinity;
      for (const [min, max] of gun.cradle) {
        if (min[2] < z1 && max[2] > z0 && min[0] < 0.035 && max[0] > -0.035 && max[1] <= seat.min.y + 0.005) support = Math.max(support, max[1]);
      }
      for (const [z, , , , y1] of gun.mantlet) if (z >= z0 && z <= z1 && y1 <= seat.min.y + 0.005) support = Math.max(support, y1);
      if (Number.isFinite(support) && seat.min.y - support > 0.004) {
        P.add('gunMount', KIT.box(0.07, seat.min.y - support + 0.01, z1 - z0), 0, (seat.min.y + support) / 2, (z0 + z1) / 2);
      }
      P.gunG.add(m2);
    }
    if (top.ammoBox) {
      // the side ammunition box and its lid
      const [box, bx, by, bz] = boxOf(top.ammoBox);
      P.add('gunMount', box, bx, by, bz);
      const [, max] = top.ammoBox, [min] = top.ammoBox;
      P.add('gunMountDark', KIT.box(max[0] - min[0] + 0.01, 0.012, max[2] - min[2] + 0.01), bx, max[1] + 0.006, bz);
    }
  }
  P.muzzleZ = gun.muzzleZ;
  const outerR = Math.max(...gun.barrel.map(([, r]) => r));
  return Object.freeze({
    model: gun.model, muzzleZM: gun.muzzleZ, trunnionTurretM: Object.freeze([...gun.trunnion]),
    barrelStations: gun.barrel.length, outerRadiusM: outerR, mantletStations: gun.mantlet.length,
    overGun: top?.m2 ? 'm2' : 'none',
  });
}
