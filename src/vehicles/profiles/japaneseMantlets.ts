// 261 (owner: "the stb 1 and type 74 still need completgely new mantlets and turret geometrry around the mantlets"): the
// STB-1 prototype's and the production Type 74's guns pitch in their own cast masks, each seated in a channel cut into
// its turret front (castGunSeat.ts). 262 (owner, 2026-10-27, with his STB-1 model: "both the type 74 and stb should be
// based from this"): both masks are sized to that model's broad front at its own proportions (Main's 262 ruling): the
// bore 0.29 m over the ring datum, the drum 0.373 m round the trunnion, its face reaching the turret's foot and nearly
// its crown. Sources
// (docs/references/tanks/type74.md and stb1.md, "Mantlet" and "Owner model"):
//   - Type 74: a large external mask of Japan's own design under a laced canvas cover; the J1 telescope's capped port on
//     the vehicle's right of the gun and the coaxial 7.62 mm's on its left, a cylindrical collar with a flared half-round
//     hood over its top, a lifting eye on the turret's upper front edge either side, and the IR/white searchlight on a
//     cradle beside the gun base on the left, tied to the collar by two parallel bars, so it rides the gun.
//   - STB-1: the owner's model: a rounded oval mask face with a dark rim, a port either side of the bore, a short thick
//     collar, and a six-lens searchlight box on the mask's +x side (the 1969 photograph and ja.wiki record a passive
//     night sight; the owner's model governs, and the conflict is in the reference).
// Program frame (BUILD-STANDARD §A): +x is the vehicle's right; the STB-1's handed parts stand on the side the owner's
// model shows them (Main's 262 ruling, profiles/type74Family.ts). Every mask part is a gun-mount part (it pitches with the
// gun and does not recoil); the mask's drum turns in its receiver with a constant radial gap, its sides run a constant
// seam inside the channel's walls, and its trunnion pins run into the walls. japaneseMantlet.selftest.mjs holds the gun
// inside its shield over the whole travel.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { cutMaskSeat } from './castGunSeat.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

export interface MantletBuilderPort {
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly q?: boolean;
  add(slot: string, geometry: THREE.BufferGeometry, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number): void;
}

/** A mask's cross-section at one station (gun frame): half-width, underside, top and the corner radii below and above. */
interface MaskStation { readonly z: number; readonly half: number; readonly lo: number; readonly hi: number; readonly rb: number; readonly rt: number }

/** A rounded-rectangle contour, counter-clockwise from +Z, `steps` facets per corner. */
function roundedRing(s: MaskStation, steps: number): SectionPoint[] {
  const ring: SectionPoint[] = [];
  const corner = (cx: number, cy: number, r: number, a0: number) => {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * Math.PI / 2;
      ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(s.half - s.rb, s.lo + s.rb, s.rb, -Math.PI / 2);
  corner(s.half - s.rt, s.hi - s.rt, s.rt, 0);
  corner(-s.half + s.rt, s.hi - s.rt, s.rt, Math.PI / 2);
  corner(-s.half + s.rb, s.lo + s.rb, s.rb, Math.PI);
  return ring;
}

const maskSolid = (stations: readonly MaskStation[], steps: number): THREE.BufferGeometry => sectionSolid(
  stations.map((s): SolidSection => ({ z: s.z, ring: roundedRing(s, steps) })),
  { centeredSideQuads: true, smoothSideEdges: Array.from({ length: 4 * (steps + 1) }, (_, i) => i) },
);

/** A solid lofted along X (sections at x, contours in (-z, y)): sectionSolid turned a quarter about Y. */
function loftAlongX(sections: readonly { x: number; ring: readonly [number, number][] }[], smooth = false): THREE.BufferGeometry {
  const ccw = (ring: readonly [number, number][]) => {
    let a = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
    return a > 0 ? ring : [...ring].reverse();
  };
  const n = sections[0].ring.length;
  const g = sectionSolid(sections.map((s) => ({ z: s.x, ring: ccw(s.ring) })),
    { centeredSideQuads: true, ...(smooth ? { smoothSideEdges: Array.from({ length: n }, (_, i) => i) } : {}) });
  return g.rotateY(Math.PI / 2);
}

/** The radius of a mask's drum at `psi` (radians round the trunnion axis from +Z toward +Y): `r` everywhere but its
 * underside, which keeps `low` under the axis through `travel` radians either way, so the drum never hangs below the
 * turret's underside over the deck at any pitch. */
function drumRadius(psi: number, r: number, low: number, travel: number): number {
  const fromDown = Math.abs(Math.atan2(Math.sin(psi + Math.PI / 2), Math.cos(psi + Math.PI / 2)));
  const a = Math.max(0, fromDown - travel);
  return a >= Math.PI / 2 ? r : Math.min(r, low / Math.cos(a));
}

/** The drum a mask turns on in its receiver: round (`r`) over its top and back, its underside drawn up (drumRadius). */
function maskDrum(half: number, r: number, low: number, travel: number, q: boolean): THREE.BufferGeometry {
  const steps = q ? 56 : 28, ring: [number, number][] = [];
  for (let k = 0; k < steps; k++) {
    const psi = (k / steps) * Math.PI * 2, rr = drumRadius(psi, r, low, travel);
    ring.push([-rr * Math.cos(psi), rr * Math.sin(psi)]);
  }
  return loftAlongX([{ x: -half, ring }, { x: half, ring }], true);
}

/** A canvas cover hugging a drum of radius `r` round the trunnion axis from `from` to `to` (radians from +Z toward +Y),
 * gathered in `folds` folds across its width; its outer face stands `lift` (+ the folds' `depth`) off the drum. */
function drumCanvas(half: number, r: number, from: number, to: number, folds: number, lift: number, depth: number, q: boolean): THREE.BufferGeometry {
  const arcSteps = q ? 18 : 9, xs = q ? 4 * folds + 1 : 2 * folds + 1;
  return loftAlongX(Array.from({ length: xs }, (_, i) => {
    const x = -half + (2 * half * i) / (xs - 1);
    const outer = r + lift + depth * 0.5 * (1 + Math.cos((2 * Math.PI * folds * (x + half)) / (2 * half)));
    const ring: [number, number][] = [];
    for (let k = 0; k <= arcSteps; k++) { const a = from + ((to - from) * k) / arcSteps; ring.push([-outer * Math.cos(a), outer * Math.sin(a)]); }
    for (let k = arcSteps; k >= 0; k--) { const a = from + ((to - from) * k) / arcSteps; ring.push([-(r - 0.01) * Math.cos(a), (r - 0.01) * Math.sin(a)]); }
    return { x, ring };
  }));
}

/** A half-round hood (the upper half of a flared sleeve along Z): its inner and outer radii at each station. */
function halfHood(stations: readonly { z: number; inner: number; outer: number }[], q: boolean): THREE.BufferGeometry {
  const steps = q ? 16 : 8;
  return sectionSolid(stations.map(({ z, inner, outer }) => {
    const ring: SectionPoint[] = [];
    for (let k = 0; k <= steps; k++) { const a = (k / steps) * Math.PI; ring.push([outer * Math.cos(a), outer * Math.sin(a)]); }
    for (let k = steps; k >= 0; k--) { const a = (k / steps) * Math.PI; ring.push([inner * Math.cos(a), inner * Math.sin(a)]); }
    return { z, ring };
  }));
}

/** The dark seal ring hugging the barrel's root in the collar's face. */
function barrelSeal(P: MantletBuilderPort, barrelR: number, z: number, seg: number): void {
  const seal = new THREE.LatheGeometry([new THREE.Vector2(barrelR, 0), new THREE.Vector2(barrelR + 0.014, 0),
    new THREE.Vector2(barrelR + 0.014, 0.008), new THREE.Vector2(barrelR, 0.008), new THREE.Vector2(barrelR, 0)], seg).rotateX(Math.PI / 2);
  P.add('gunMountDark', seal, 0, 0, z);
}

/** A round armoured port boss on a mask's face (axis along +Z): the boss, its dark rim and either a lens or a muzzle. */
function portBoss(P: MantletBuilderPort, x: number, y: number, z: number, r: number, kind: 'sight' | 'coax', seg: number, tilt = 0): void {
  const { cylZ } = KIT;
  P.add('gunMount', cylZ(r, 0.05, seg), x, y, z + 0.025, tilt, 0, 0);
  P.add('gunMountDark', cylZ(r * 0.74, 0.012, seg), x, y + Math.sin(-tilt) * 0.052, z + 0.052 * Math.cos(tilt), tilt, 0, 0);
  if (kind === 'sight') P.add('gunMountGlass', cylZ(r * 0.52, 0.008, seg), x, y + Math.sin(-tilt) * 0.058, z + 0.058 * Math.cos(tilt), tilt, 0, 0);
  else P.add('gunMountDark', cylZ(0.013, 0.07, 10), x, y + Math.sin(-tilt) * 0.08, z + 0.08 * Math.cos(tilt), tilt, 0, 0);
}

/** The fit the receipt measures (japaneseMantlet.selftest.mjs; gunHullClearance.test-support.mjs gunShieldProbe). */
export interface GunShieldFit {
  readonly shield: string;
  readonly halfWidthM: number;
  readonly shieldHalfWidthM: number;
  readonly axis: readonly [number, number];
  readonly receiverR: number;
  readonly drumR: number;
  readonly drumLow: number;
  readonly faceZ: number;
  readonly mouth: readonly [number, number];
  readonly stub: { readonly r: number };
}

function publishFit(P: MantletBuilderPort, fit: Omit<GunShieldFit, 'faceZ' | 'mouth' | 'axis'>): void {
  const { y, z } = P.gunG.position;
  P.gunG.userData.gunShieldFit = Object.freeze({
    ...fit, axis: Object.freeze([y, z]), faceZ: z - fit.receiverR,
    mouth: Object.freeze([y - fit.drumLow + 0.012, y + fit.drumR - 0.012]),
  });
}

/** One mask's seat: the channel cut into the shell, the receiver round the trunnion, the drum turning in it. */
interface MaskSeatFit {
  readonly channelHalf: number;
  readonly receiverR: number;
  readonly drumR: number;
  /** the drum's underside under the bore through its travel: over the deck by more than the gun's 26 mm keep, at every
   * bearing the turret swings it (the mask block's lowest corner, at full depression, stays above it too) */
  readonly drumLow: number;
  readonly drumHalf: number;
  /** the receiver's floor, turret frame: just over the shell's foot ring */
  readonly floorY: number;
  readonly pinR: number;
}

/** Cut the shell for its seat and add the pieces; the trunnion pins run from the drum's sides into the channel's walls. */
function seatShell(P: MantletBuilderPort, shell: THREE.BufferGeometry, fit: MaskSeatFit): void {
  const { y, z } = P.gunG.position;
  for (const piece of cutMaskSeat(shell, {
    halfWidth: fit.channelHalf, axisY: y, axisZ: z, radius: fit.receiverR, bands: P.q ? 24 : 12, floorY: fit.floorY,
  })) P.add('turret', piece);
  shell.dispose();
  const seg = P.q ? 24 : 12, pinLen = fit.channelHalf + 0.035 - fit.drumHalf;
  // painted like the mask: through the seam the pin reads as the mask's own trunnion, inside the wall's front edge
  for (const s of [-1, 1]) P.add('gunMount', KIT.cylX(fit.pinR, pinLen, seg), s * (fit.drumHalf + pinLen / 2 - 0.004), 0, 0);
  P.add('gunMount', maskDrum(fit.drumHalf, fit.drumR, fit.drumLow, DRUM_TRAVEL, !!P.q));
}

// The drum keeps its underside `drumLow` under the bore through 15 degrees either way of level: over the deck the turret
// swings over, the gun's depression at each bearing is the hull's to limit (gunPitchByYawDeg).
const DRUM_TRAVEL = 15 * Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------------------
// Type 74 (production): the broad external mask
// ---------------------------------------------------------------------------------------------------------------------
const T74 = {
  seat: { channelHalf: 0.515, receiverR: 0.405, drumR: 0.373, drumLow: 0.254, drumHalf: 0.50, floorY: 0.05, pinR: 0.06 },
  // the mask block ahead of the drum, its face 0.11 m proud of the turret's nose
  stations: [
    { z: 0.00, half: 0.500, lo: -0.254, hi: 0.373, rb: 0.068, rt: 0.085 },
    { z: 0.16, half: 0.496, lo: -0.251, hi: 0.368, rb: 0.068, rt: 0.090 },
    { z: 0.28, half: 0.484, lo: -0.243, hi: 0.350, rb: 0.068, rt: 0.099 },
    { z: 0.37, half: 0.460, lo: -0.235, hi: 0.325, rb: 0.066, rt: 0.096 },
    { z: 0.42, half: 0.425, lo: -0.226, hi: 0.296, rb: 0.057, rt: 0.085 },
  ] as const,
};

/**
 * The Type 74's mask, cover, ports, collar and hood, the left searchlight on its cradle, the seat cut into `shell` (the
 * cast turret shell, turret frame, unadded) and the lifting eyes on the turret's upper front edge.
 */
export function addType74Mantlet(P: MantletBuilderPort, shell: THREE.BufferGeometry): void {
  const { box, cylX, cylZ } = KIT;
  const seg = P.q ? 40 : 18, steps = P.q ? 4 : 2, { seat } = T74;
  seatShell(P, shell, seat);
  P.add('gunMount', maskSolid(T74.stations, steps));
  // the laced canvas cover gathered over the drum and the mask's crown, tied down by three straps
  P.add('gunMountCanvasSkin', drumCanvas(seat.drumHalf - 0.014, seat.drumR, 0.30, Math.PI * 0.95, 7, 0.005, 0.008, !!P.q));
  P.add('gunMountCanvasSkin', maskSolid([
    { z: 0.0, half: 0.490, lo: 0.147, hi: 0.382, rb: 0.01, rt: 0.090 },
    { z: 0.15, half: 0.487, lo: 0.147, hi: 0.377, rb: 0.01, rt: 0.095 },
    { z: 0.27, half: 0.476, lo: 0.147, hi: 0.359, rb: 0.01, rt: 0.102 },
  ], steps));
  for (const x of [-0.33, 0, 0.33]) P.add('gunMountDark', box(0.045, 0.014, 0.27), x, 0.380, 0.13, -0.07, 0, 0);
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    // the lacing zig-zagging along the cover's crown near each cheek
    P.add('gunMountDark', box(0.01, 0.01, 0.06), s * (0.425 + (k % 2) * 0.022), 0.382 - k * 0.0034, 0.03 + k * 0.042, 0, (k % 2 ? 0.5 : -0.5), 0);
  }
  // the J1 telescope's port on the right and the coaxial 7.62 mm's on the left, both a little over the bore
  portBoss(P, 0.30, 0.113, 0.40, 0.066, 'sight', P.q ? 20 : 12);
  portBoss(P, -0.33, 0.09, 0.40, 0.054, 'coax', P.q ? 20 : 12);
  // the collar the barrel leaves through, the flared half-round hood over its top and the seal round the barrel
  P.add('gunMount', cylZ(0.13, 0.20, seg), 0, 0, 0.51);
  P.add('gunMountDark', cylZ(0.134, 0.018, seg), 0, 0, 0.43);
  P.add('gunMount', halfHood([{ z: 0.51, inner: 0.129, outer: 0.143 }, { z: 0.58, inner: 0.141, outer: 0.155 },
    { z: 0.64, inner: 0.160, outer: 0.174 }], !!P.q));
  barrelSeal(P, 0.0775, 0.605, seg);
  // the searchlight on its cradle beside the gun base (left), clear of the mask's side: a deck plate run in from the
  // mask's left side, a web under it, the lamp house with chamfered rear corners, its framed six-pane glass, and the two
  // bars to the collar
  const lx = -0.80;
  P.add('gunMount', box(0.58, 0.016, 0.40), -0.735, -0.042, 0.42);
  P.add('gunMount', box(0.12, 0.045, 0.24), -0.50, -0.0705, 0.36);                  // the cradle's foot on the mask's side
  P.add('gunMount', box(0.03, 0.035, 0.32), -0.99, -0.0665, 0.42);                   // the deck plate's outer rib
  P.add('gunMount', sectionSolid([
    { z: 0.25, ring: [[-0.17, -0.034], [0.17, -0.034], [0.19, -0.015], [0.19, 0.345], [0.17, 0.365], [-0.17, 0.365], [-0.19, 0.345], [-0.19, -0.015]] },
    { z: 0.31, ring: [[-0.20, -0.034], [0.20, -0.034], [0.21, -0.020], [0.21, 0.350], [0.20, 0.365], [-0.20, 0.365], [-0.21, 0.350], [-0.21, -0.020]] },
    { z: 0.58, ring: [[-0.20, -0.034], [0.20, -0.034], [0.21, -0.020], [0.21, 0.350], [0.20, 0.365], [-0.20, 0.365], [-0.21, 0.350], [-0.21, -0.020]] },
  ]), lx, 0, 0);
  P.add('gunMount', box(0.45, 0.034, 0.036), lx, 0.36, 0.578);
  P.add('gunMount', box(0.45, 0.034, 0.036), lx, -0.024, 0.578);
  P.add('gunMount', box(0.036, 0.35, 0.036), lx - 0.207, 0.168, 0.578);
  P.add('gunMount', box(0.036, 0.35, 0.036), lx + 0.207, 0.168, 0.578);
  P.add('gunMountGlass', markVehicleNightLens(box(0.36, 0.33, 0.012), 'headlight', { searchlight: true }), lx, 0.168, 0.587);
  P.add('gunMountDark', box(0.012, 0.31, 0.016), lx, 0.168, 0.595);
  for (const dy of [-0.055, 0.055]) P.add('gunMountDark', box(0.34, 0.010, 0.016), lx, 0.168 + dy, 0.595);
  P.add('gunMountDark', box(0.30, 0.016, 0.20), lx, 0.373, 0.41);                       // the lid's seam band
  for (const dx of [-0.10, 0.10]) P.add('gunMountDark', box(0.022, 0.026, 0.12), lx + dx, 0.388, 0.41); // lid handles
  for (const y of [-0.022, -0.068]) P.add('gunMountDark', cylX(0.011, 0.47, 10), -0.365, y, 0.577);
  // the turret's lifting eyes on its upper front edge either side of the mask
  for (const s of [-1, 1]) KIT.liftEye(P, 'turretDetail', s * 0.70, 0.52, 0.93, s * 0.25);
  publishFit(P, {
    shield: 'type74-production-external-mask', halfWidthM: seat.channelHalf, shieldHalfWidthM: seat.drumHalf,
    receiverR: seat.receiverR, drumR: seat.drumR, drumLow: seat.drumLow, stub: { r: seat.pinR },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// STB-1 (prototype): the owner's model's rounded oval mask
// ---------------------------------------------------------------------------------------------------------------------
const STB1 = {
  seat: { channelHalf: 0.475, receiverR: 0.405, drumR: 0.373, drumLow: 0.254, drumHalf: 0.46, floorY: 0.05, pinR: 0.06 },
  // an oval face (corner radii near its half-height) domed forward of the drum, 0.08 m proud of the turret's nose
  stations: [
    { z: 0.00, half: 0.460, lo: -0.254, hi: 0.373, rb: 0.158, rt: 0.181 },
    { z: 0.14, half: 0.452, lo: -0.251, hi: 0.364, rb: 0.192, rt: 0.215 },
    { z: 0.26, half: 0.430, lo: -0.243, hi: 0.339, rb: 0.226, rt: 0.249 },
    { z: 0.34, half: 0.395, lo: -0.232, hi: 0.305, rb: 0.215, rt: 0.249 },
    { z: 0.385, half: 0.340, lo: -0.209, hi: 0.260, rb: 0.186, rt: 0.215 },
  ] as const,
};

/**
 * The STB-1's oval mask, its dark rim, its two ports, the thick collar, the six-lens searchlight box on its +x side
 * (the model's) and the seat cut into `shell` (the cast turret shell, turret frame, unadded).
 */
export function addSTB1Mantlet(P: MantletBuilderPort, shell: THREE.BufferGeometry): void {
  const { box, cylZ } = KIT;
  const seg = P.q ? 40 : 18, steps = P.q ? 5 : 3, { seat } = STB1;
  seatShell(P, shell, seat);
  P.add('gunMount', maskSolid(STB1.stations, steps));
  // the rim: a dark bead 6 mm proud round the oval where its face leaves the drum
  P.add('gunMountDark', maskSolid([
    { z: 0.255, half: 0.438, lo: -0.249, hi: 0.347, rb: 0.226, rt: 0.254 },
    { z: 0.275, half: 0.434, lo: -0.246, hi: 0.342, rb: 0.226, rt: 0.254 },
  ], steps));
  // a port either side of the bore, a little over it: the telescope's at -x with the gunner's sight head, the coaxial
  // gun's at +x
  portBoss(P, -0.245, 0.124, 0.36, 0.06, 'sight', P.q ? 20 : 12);
  portBoss(P, 0.245, 0.124, 0.36, 0.052, 'coax', P.q ? 20 : 12);
  // the short thick collar, its ring and the seal round the barrel
  P.add('gunMount', cylZ(0.15, 0.22, seg), 0, 0, 0.47);
  P.add('gunMountDark', cylZ(0.158, 0.02, seg), 0, 0, 0.56);
  P.add('gunMount', cylZ(0.11, 0.06, seg), 0, 0, 0.60);
  barrelSeal(P, 0.0775, 0.63, seg);
  // the searchlight box on the mask's +x side: a cradle plate on the mask's face, the box (its foot at the bore, its top
  // a little over the crown), its six lenses in a frame and the lid's seam
  const lx = 0.445, ly = 0.226;
  P.add('gunMount', box(0.30, 0.03, 0.16), lx - 0.10, -0.005, 0.40);                 // the cradle plate on the face
  P.add('gunMount', box(0.56, 0.45, 0.30), lx, ly, 0.52);
  P.add('gunMountDark', box(0.52, 0.41, 0.012), lx, ly, 0.672);
  for (const c of [-1, 1]) for (const r of [-1, 0, 1]) {
    P.add('gunMountGlass', markVehicleNightLens(box(0.21, 0.11, 0.012), 'headlight', { searchlight: true }), lx + c * 0.125, ly + r * 0.13, 0.68);
  }
  P.add('gunMountDark', box(0.56, 0.012, 0.30), lx, ly + 0.175, 0.52);
  for (const dx of [-0.16, 0.16]) P.add('gunMountDark', box(0.03, 0.02, 0.10), lx + dx, ly + 0.235, 0.50);
  publishFit(P, {
    shield: 'stb1-prototype-oval-mask', halfWidthM: seat.channelHalf, shieldHalfWidthM: seat.drumHalf,
    receiverR: seat.receiverR, drumR: seat.drumR, drumLow: seat.drumLow, stub: { r: seat.pinR },
  });
}
