// Merkava family gun assemblies (release 262, the owner 2026-10-27: "we will need their gun assemblies back and
// beautiful"). One construction for the three guns the six marks carry, measured per mark in merkavaFamilyMarks.ts:
// the 105 mm M64 (the licensed M68) of the Mk 1 and Mk 2, the 120 mm MG251 of the Mk 3 and the MG253 of the Mk 4.
// The barrel is one solid of revolution about the gun's +Z axis (revolveZ): the bare tube, the thermal sleeve's
// sections and clamp bands, the fume evacuator and the muzzle, every section its own band so the steps read crisp and
// the tube stays circular. The mantlet, the gun shield and the boot pitch with the gun (rig_gun); only the barrel
// recoils (rig_recoil). Gun frame: origin on the trunnion axis, +Z along the bore.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** One station of a revolved profile: z along the axis, r its radius there (0 on the axis). */
export type RevolveStation = readonly [z: number, r: number];

/** A closed solid of revolution about local +Z. Each profile segment is its own band (its own normal), so a step or a
 *  lip stays crisp; round the axis it is smooth. Stations run along the profile; a segment with both radii 0 is skipped.
 *  Outward winding everywhere (checked by the gun receipt's front-face census). */
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
  /** 'M64' (105 mm, licensed M68), 'MG251' or 'MG253' (120 mm). */
  readonly model: 'M64' | 'MG251' | 'MG253';
  readonly caliberMm: number;
  /** The trunnion in the turret frame. */
  readonly trunnion: readonly [x: number, y: number, z: number];
  /** The muzzle face: the trunnion to the muzzle along the bore. */
  readonly muzzleZ: number;
  /** The barrel's revolved profile from inside the mantlet to the muzzle face, as [z, r] stations (the first and last
   *  close on the axis). Built by merkavaBarrelProfile from the mark's measurements. */
  readonly barrel: readonly RevolveStation[];
  /** The mantlet: a cast block seated in the turret's gun opening (gun frame). */
  readonly mantlet: MerkavaMantletSpec;
  /** Muzzle reference sensor on the muzzle's crown (the 120 mm marks). */
  readonly muzzleReferenceSensor: boolean;
  /** The 12.7 mm M2 over the gun, fired from inside the turret (Mk 2 onward per the sources). */
  readonly overGunMachineGun: boolean;
  /** The coaxial 7.62 mm port (x in the gun frame, + to the gun's left). */
  readonly coaxX: number;
}

export interface MerkavaMantletSpec {
  /** Front face (z) of the mantlet block and its depth back into the turret. */
  readonly frontZ: number;
  readonly depth: number;
  /** Half-width and half-height of the block's front face, and its rear face's growth (a cast block widens back). */
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly rearGrowth: number;
  /** Gun shield collar round the barrel's root on the mantlet face. */
  readonly collarR: number;
  readonly collarLen: number;
  /** Canvas dust boot behind the collar (0 for none). */
  readonly bootR: number;
  /** The Mk 4's large pointed mantlet: a cylindrical housing of this radius from the block's face, ending in a cone
   *  `pointLen` long down to the collar (absent: the block alone). */
  readonly pointed?: { readonly r: number; readonly len: number; readonly pointLen: number };
}

/** Thermal-sleeve and evacuator layout of one barrel, measured along the bore from the trunnion (gun frame). */
export interface MerkavaBarrelLayout {
  /** Where the barrel enters the mantlet's collar (hidden inside it) and its radius there. */
  readonly rootZ: number;
  readonly rootR: number;
  /** The thermal sleeve's ends and radius. */
  readonly sleeve: readonly [z0: number, z1: number];
  readonly sleeveR: number;
  /** Clamp bands over the sleeve's section joints: their centres, radius and width. */
  readonly clamps: readonly number[];
  readonly clampR: number;
  readonly clampW: number;
  /** The fume evacuator: its ends and its radius, with conical shoulders `shoulder` long at each end. */
  readonly evacuator: readonly [z0: number, z1: number];
  readonly evacuatorR: number;
  readonly evacuatorShoulder: number;
  /** The bare tube between the sleeve and the muzzle, and the muzzle face. */
  readonly tubeR: number;
  readonly muzzleZ: number;
  /** A shallow lip round the muzzle face: its length and radius. */
  readonly muzzleLip: readonly [len: number, r: number];
}

/** The revolved station list of a barrel layout: the root, the sleeve with its clamp bands and the evacuator riding
 *  it, the bare tube and the muzzle lip. Features may not overlap; stations must run forward. */
export function merkavaBarrelProfile(b: MerkavaBarrelLayout): RevolveStation[] {
  const out: RevolveStation[] = [];
  const push = (z: number, r: number): void => {
    const last = out[out.length - 1];
    if (last && z < last[0] - 1e-9) throw new Error(`merkavaBarrelProfile: a feature at z ${z.toFixed(3)} overlaps the one before`);
    out.push([z, r]);
  };
  const [s0, s1] = b.sleeve, [e0, e1] = b.evacuator;
  push(b.rootZ, 0); push(b.rootZ, b.rootR); push(s0, b.rootR); push(s0, b.sleeveR);
  const sh = Math.max(0.01, b.evacuatorShoulder), half = b.clampW / 2;
  const features = [
    ...b.clamps.map((z) => ({ z0: z - half, z1: z + half, kind: 'clamp' as const })),
    { z0: e0, z1: e1, kind: 'evacuator' as const },
  ].sort((p, q) => p.z0 - q.z0);
  for (const f of features) {
    if (f.z0 < s0 || f.z1 > s1) throw new Error(`merkavaBarrelProfile: ${f.kind} at ${f.z0.toFixed(3)} leaves the sleeve`);
    if (f.kind === 'clamp') {
      push(f.z0, b.sleeveR); push(f.z0, b.clampR); push(f.z1, b.clampR); push(f.z1, b.sleeveR);
    } else {
      push(f.z0, b.sleeveR); push(f.z0 + sh, b.evacuatorR); push(f.z1 - sh, b.evacuatorR); push(f.z1, b.sleeveR);
    }
  }
  push(s1, b.sleeveR); push(s1, b.tubeR);
  const [lipLen, lipR] = b.muzzleLip;
  push(b.muzzleZ - lipLen, b.tubeR); push(b.muzzleZ - lipLen, lipR); push(b.muzzleZ, lipR); push(b.muzzleZ, 0);
  return out;
}

function mantletGeometry(m: MerkavaMantletSpec): THREE.BufferGeometry {
  // a cast block: its front face rounded at the corners, its sides drawing out toward the rear
  const ring = (hw: number, hh: number, chamfer: number): SectionPoint[] => [
    [-hw + chamfer, -hh], [hw - chamfer, -hh], [hw, -hh + chamfer], [hw, hh - chamfer],
    [hw - chamfer, hh], [-hw + chamfer, hh], [-hw, hh - chamfer], [-hw, -hh + chamfer],
  ];
  const c = Math.min(m.halfWidth, m.halfHeight) * 0.28;
  const g = m.rearGrowth;
  return sectionSolid([
    { z: m.frontZ - m.depth, ring: ring(m.halfWidth + g, m.halfHeight + g * 0.6, c * 1.2) },
    { z: m.frontZ - m.depth * 0.25, ring: ring(m.halfWidth + g * 0.3, m.halfHeight + g * 0.2, c) },
    { z: m.frontZ, ring: ring(m.halfWidth * 0.94, m.halfHeight * 0.94, c * 1.15) },
  ], { sideQuadDiagonal: 'convex' });
}

/** Builds the mark's gun on P.gunG: barrel (rig_recoil), mantlet, gun shield and boot (rig_gun), and seats P.muzzleZ.
 *  Returns a receipt the family receipt reads. */
export function addMerkavaGun(P: TankBuilderPort, gun: MerkavaGunSpec): Readonly<Record<string, unknown>> {
  const { box, cylZ } = KIT;
  const seg = P.q ? 36 : 20;
  P.gunG.position.set(gun.trunnion[0], gun.trunnion[1], gun.trunnion[2]);
  P.add('gun', revolveZ(gun.barrel, seg));
  const m = gun.mantlet;
  P.add('gunMount', mantletGeometry(m));
  if (m.pointed) {
    const { r, len, pointLen } = m.pointed, z0 = m.frontZ - 0.10;
    P.add('gunMount', revolveZ([[z0, 0], [z0, r], [m.frontZ + len, r], [m.frontZ + len + pointLen, m.collarR],
      [m.frontZ + len + pointLen, 0]], seg));
  }
  // gun shield collar: a cast ring round the barrel root, proud of the mantlet face
  const c0 = m.frontZ + (m.pointed ? m.pointed.len + m.pointed.pointLen - 0.02 : -0.02);
  P.add('gunMount', revolveZ([
    [c0, 0], [c0, m.collarR], [c0 + 0.02 + m.collarLen * 0.6, m.collarR],
    [c0 + 0.02 + m.collarLen, m.collarR * 0.86], [c0 + 0.02 + m.collarLen, 0],
  ], seg));
  if (m.bootR > 0) {
    // the canvas dust boot laid over the collar's front, gathered onto the barrel
    const r0 = gun.barrel.find(([z]) => z >= m.frontZ + m.collarLen)?.[1] ?? m.collarR * 0.6;
    P.add('gunMountCanvasSkin', revolveZ([
      [m.frontZ + m.collarLen * 0.55, 0], [m.frontZ + m.collarLen * 0.55, m.bootR],
      [m.frontZ + m.collarLen + 0.06, m.bootR * 0.92], [m.frontZ + m.collarLen + 0.13, r0 + 0.012],
      [m.frontZ + m.collarLen + 0.13, 0],
    ], seg));
  }
  // cradle trunnion caps behind the mantlet (gun steel), inside the turret's opening
  for (const side of [-1, 1]) {
    P.add('gunMountDark', KIT.cylX(0.075, 0.06, 14), side * (m.halfWidth + m.rearGrowth + 0.02), 0, 0);
  }
  // coaxial 7.62 mm port: a dark sleeve through the mantlet face beside the gun
  P.add('gunMountDark', cylZ(0.024, 0.10, 12), gun.coaxX, -m.halfHeight * 0.18, m.frontZ + 0.02);
  if (gun.muzzleReferenceSensor) {
    // MRS: a small mirror box clamped on the muzzle's crown
    const [lipLen, lipR] = [0.06, gun.barrel[gun.barrel.length - 2]?.[1] ?? 0.08];
    P.add('gunDark', box(0.07, 0.045, 0.09), 0, lipR + 0.02, gun.muzzleZ - lipLen - 0.10);
    P.add('gunDark', box(0.035, 0.03, 0.03), 0, lipR + 0.005, gun.muzzleZ - lipLen - 0.10);
  }
  P.muzzleZ = gun.muzzleZ;
  const outerR = Math.max(...gun.barrel.map(([, r]) => r));
  return Object.freeze({
    model: gun.model, caliberMm: gun.caliberMm, muzzleZM: gun.muzzleZ,
    trunnionTurretM: Object.freeze([...gun.trunnion]), barrelStations: gun.barrel.length,
    outerRadiusM: outerR, mantletFrontZM: m.frontZ, overGunMachineGun: gun.overGunMachineGun,
    muzzleReferenceSensor: gun.muzzleReferenceSensor,
  });
}
