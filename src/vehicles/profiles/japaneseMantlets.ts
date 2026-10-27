// 261 (owner: "the stb 1 and type 74 still need completgely new mantlets and turret geometrry around the mantlets"): the
// STB-1 prototype's and the production Type 74's guns pitch in their own cast masks, each seated in a channel cut into
// its own turret front (castGunSeat.ts). Sources (docs/references/tanks/type74.md and stb1.md, "Mantlet"):
//   - Type 74: a large external mask of Japan's own design under a laced canvas cover; the J1 telescope's capped port on
//     the vehicle's right of the gun and the coaxial 7.62 mm's on its left, a cylindrical collar with a flared half-round
//     hood over its top, a lifting eye on the turret's upper front edge either side, and the IR/white searchlight on a
//     cradle beside the gun base on the left, tied to the collar by two parallel bars, so it rides the gun.
//   - STB-1 (1969): a compact rounded mask with a deep rounded chin, laced canvas on its sides, a capped port on its upper
//     left and a lifting eye on its top; a plain collar; no searchlight (it carried a passive night sight: active
//     infrared came with STB-2).
// Program frame (BUILD-STANDARD §A): +x is the vehicle's right. Every mask part is a gun-mount part (it pitches with the
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

/** Cut the shell for its seat and add the pieces; the trunnion pins run from the drum's sides into the channel's walls. */
function seatShell(P: MantletBuilderPort, shell: THREE.BufferGeometry, half: number, receiverR: number, drumHalf: number, pinR: number): void {
  const { y, z } = P.gunG.position;
  // the receiver's floor 7 cm over the ring datum, above the plane the turret's seat lifts the shell's low corners to
  for (const piece of cutMaskSeat(shell, { halfWidth: half, axisY: y, axisZ: z, radius: receiverR, bands: P.q ? 20 : 10, floorY: 0.07 })) P.add('turret', piece);
  shell.dispose();
  const seg = P.q ? 24 : 12, pinLen = half + 0.035 - drumHalf;
  // painted like the mask: through the seam the pin reads as the mask's own trunnion, inside the wall's front edge
  for (const s of [-1, 1]) P.add('gunMount', KIT.cylX(pinR, pinLen, seg), s * (drumHalf + pinLen / 2 - 0.004), 0, 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// Type 74 (production): the broad external mask
// ---------------------------------------------------------------------------------------------------------------------
// Both masks keep their undersides 0.135 m under the bore, level with the turret's own underside over the deck (its
// seat plane, turretSeatRace.ts): through the gun's whole travel the drum never hangs into the fender lockers and deck
// kit the turret swings over. Over the deck, the gun's depression at each bearing is the hull's to limit.
const DRUM_LOW = 0.135, DRUM_TRAVEL = 15 * Math.PI / 180;
const T74 = {
  channelHalf: 0.48, receiverR: 0.20, drumR: 0.18, drumHalf: 0.465,
  stations: [
    { z: 0.00, half: 0.465, lo: -0.135, hi: 0.180, rb: 0.040, rt: 0.050 },
    { z: 0.12, half: 0.462, lo: -0.130, hi: 0.178, rb: 0.040, rt: 0.055 },
    { z: 0.22, half: 0.452, lo: -0.122, hi: 0.168, rb: 0.040, rt: 0.060 },
    { z: 0.30, half: 0.430, lo: -0.115, hi: 0.152, rb: 0.040, rt: 0.058 },
    { z: 0.345, half: 0.398, lo: -0.108, hi: 0.137, rb: 0.036, rt: 0.050 },
  ] as const,
};

/**
 * The Type 74's mask, cover, ports, collar and hood, the left searchlight on its cradle, the seat cut into `shell` (the
 * cast turret shell, turret frame, unadded) and the lifting eyes on the turret's upper front edge.
 */
export function addType74Mantlet(P: MantletBuilderPort, shell: THREE.BufferGeometry): void {
  const { box, cylX, cylZ } = KIT;
  const seg = P.q ? 40 : 18, steps = P.q ? 4 : 2;
  seatShell(P, shell, T74.channelHalf, T74.receiverR, T74.drumHalf, 0.045);
  // the drum turning in its receiver and the mask block ahead of it
  P.add('gunMount', maskDrum(T74.drumHalf, T74.drumR, DRUM_LOW, DRUM_TRAVEL, !!P.q));
  P.add('gunMount', maskSolid(T74.stations, steps));
  // the laced canvas cover gathered over the drum and the mask's crown, tied down by three straps
  P.add('gunMountCanvasSkin', drumCanvas(T74.drumHalf - 0.012, T74.drumR, 0.30, Math.PI * 0.95, 6, 0.004, 0.006, !!P.q));
  P.add('gunMountCanvasSkin', maskSolid([
    { z: 0.0, half: 0.455, lo: 0.06, hi: 0.188, rb: 0.01, rt: 0.06 },
    { z: 0.11, half: 0.452, lo: 0.06, hi: 0.186, rb: 0.01, rt: 0.062 },
    { z: 0.20, half: 0.445, lo: 0.06, hi: 0.176, rb: 0.01, rt: 0.064 },
  ], steps));
  for (const x of [-0.30, 0, 0.30]) P.add('gunMountDark', box(0.035, 0.012, 0.20), x, 0.187, 0.10, -0.06, 0, 0);
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
    // the lacing zig-zagging along the cover's crown near each cheek
    P.add('gunMountDark', box(0.008, 0.008, 0.05), s * (0.395 + (k % 2) * 0.018), 0.19 - k * 0.0025, 0.03 + k * 0.036, 0, (k % 2 ? 0.5 : -0.5), 0);
  }
  // the J1 telescope's port on the right and the coaxial 7.62 mm's on the left, both a little over the bore
  portBoss(P, 0.235, 0.058, 0.345, 0.056, 'sight', P.q ? 20 : 12);
  portBoss(P, -0.285, 0.046, 0.345, 0.046, 'coax', P.q ? 20 : 12);
  // the collar the barrel leaves through, the flared half-round hood over its top and the seal round the barrel
  // (115 mm: at the gun's -6 degrees over the deck a 135 mm collar stood 1.6 cm off the glacis crest)
  P.add('gunMount', cylZ(0.115, 0.17, seg), 0, 0, 0.43);
  P.add('gunMountDark', cylZ(0.119, 0.016, seg), 0, 0, 0.36);
  P.add('gunMount', halfHood([{ z: 0.43, inner: 0.114, outer: 0.127 }, { z: 0.50, inner: 0.126, outer: 0.139 },
    { z: 0.56, inner: 0.145, outer: 0.157 }], !!P.q));
  barrelSeal(P, 0.0775, 0.515, seg);
  // the searchlight on its cradle beside the gun base (left): a deck plate run in from the mask's left side, a web under
  // it, the lamp house with chamfered rear corners, its framed six-pane glass, and the two bars to the collar
  const lx = -0.625;
  P.add('gunMount', box(0.47, 0.016, 0.38), -0.62, -0.042, 0.33);
  P.add('gunMount', box(0.12, 0.045, 0.22), -0.49, -0.0705, 0.27);                  // the cradle's foot on the mask's side
  P.add('gunMount', box(0.03, 0.035, 0.30), -0.80, -0.0665, 0.33);                   // the deck plate's outer rib
  P.add('gunMount', sectionSolid([
    { z: 0.16, ring: [[-0.17, -0.034], [0.17, -0.034], [0.19, -0.015], [0.19, 0.345], [0.17, 0.365], [-0.17, 0.365], [-0.19, 0.345], [-0.19, -0.015]] },
    { z: 0.22, ring: [[-0.20, -0.034], [0.20, -0.034], [0.21, -0.020], [0.21, 0.350], [0.20, 0.365], [-0.20, 0.365], [-0.21, 0.350], [-0.21, -0.020]] },
    { z: 0.49, ring: [[-0.20, -0.034], [0.20, -0.034], [0.21, -0.020], [0.21, 0.350], [0.20, 0.365], [-0.20, 0.365], [-0.21, 0.350], [-0.21, -0.020]] },
  ]), lx, 0, 0);
  P.add('gunMount', box(0.45, 0.034, 0.036), lx, 0.36, 0.488);
  P.add('gunMount', box(0.45, 0.034, 0.036), lx, -0.024, 0.488);
  P.add('gunMount', box(0.036, 0.35, 0.036), lx - 0.207, 0.168, 0.488);
  P.add('gunMount', box(0.036, 0.35, 0.036), lx + 0.207, 0.168, 0.488);
  P.add('gunMountGlass', markVehicleNightLens(box(0.36, 0.33, 0.012), 'headlight', { searchlight: true }), lx, 0.168, 0.497);
  P.add('gunMountDark', box(0.012, 0.31, 0.016), lx, 0.168, 0.505);
  for (const dy of [-0.055, 0.055]) P.add('gunMountDark', box(0.34, 0.010, 0.016), lx, 0.168 + dy, 0.505);
  P.add('gunMountDark', box(0.30, 0.016, 0.20), lx, 0.373, 0.32);                       // the lid's seam band
  for (const dx of [-0.10, 0.10]) P.add('gunMountDark', box(0.022, 0.026, 0.12), lx + dx, 0.388, 0.32); // lid handles
  for (const y of [-0.022, -0.068]) P.add('gunMountDark', cylX(0.011, 0.30, 10), -0.278, y, 0.487);
  // the turret's lifting eyes on its upper front edge either side of the mask
  for (const s of [-1, 1]) KIT.liftEye(P, 'turretDetail', s * 0.60, 0.25, 0.98, s * 0.25);
  publishFit(P, {
    shield: 'type74-production-external-mask', halfWidthM: T74.channelHalf, shieldHalfWidthM: T74.drumHalf,
    receiverR: T74.receiverR, drumR: T74.drumR, drumLow: DRUM_LOW, stub: { r: 0.045 },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// STB-1 (prototype): the compact rounded mask with its deep chin
// ---------------------------------------------------------------------------------------------------------------------
const STB1 = {
  channelHalf: 0.41, receiverR: 0.20, drumR: 0.18, drumHalf: 0.395,
  // rounder than the production mask everywhere, its full chin carried forward under the collar before it rounds up
  stations: [
    { z: 0.00, half: 0.395, lo: -0.135, hi: 0.180, rb: 0.070, rt: 0.070 },
    { z: 0.09, half: 0.392, lo: -0.135, hi: 0.173, rb: 0.090, rt: 0.090 },
    { z: 0.18, half: 0.370, lo: -0.135, hi: 0.160, rb: 0.110, rt: 0.110 },
    { z: 0.26, half: 0.315, lo: -0.133, hi: 0.137, rb: 0.110, rt: 0.105 },
    { z: 0.315, half: 0.240, lo: -0.124, hi: 0.112, rb: 0.095, rt: 0.090 },
    { z: 0.345, half: 0.175, lo: -0.104, hi: 0.088, rb: 0.070, rt: 0.070 },
  ] as const,
};

/**
 * The STB-1's mask, its narrow laced canvas, its port and lifting eye, the plain collar and the seat cut into `shell`
 * (the cast turret shell in the turret's final frame, unadded).
 */
export function addSTB1Mantlet(P: MantletBuilderPort, shell: THREE.BufferGeometry): void {
  const { box, cylZ, torus } = KIT;
  const seg = P.q ? 40 : 18, steps = P.q ? 5 : 3;
  seatShell(P, shell, STB1.channelHalf, STB1.receiverR, STB1.drumHalf, 0.045);
  P.add('gunMount', maskDrum(STB1.drumHalf, STB1.drumR, DRUM_LOW, DRUM_TRAVEL, !!P.q));
  P.add('gunMount', maskSolid(STB1.stations, steps));
  // the casting's parting line, a flash rib standing 6 mm proud round the mask's waist
  P.add('gunMount', maskSolid([
    { z: 0.174, half: 0.376, lo: -0.139, hi: 0.167, rb: 0.113, rt: 0.113 },
    { z: 0.186, half: 0.374, lo: -0.139, hi: 0.165, rb: 0.113, rt: 0.113 },
  ], steps));
  // the narrow laced canvas over the drum, laced down each side
  P.add('gunMountCanvasSkin', drumCanvas(STB1.drumHalf - 0.012, STB1.drumR, 0.55, Math.PI * 0.95, 4, 0.004, 0.005, !!P.q));
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    const a = 0.62 + k * 0.33;
    P.add('gunMountDark', box(0.03, 0.009, 0.009), s * 0.37, (STB1.drumR + 0.005) * Math.sin(a), (STB1.drumR + 0.005) * Math.cos(a), -a, 0, s * (k % 2 ? 0.5 : -0.5));
  }
  // the capped port on the upper left (the coaxial machine gun's) and the telescope's on the right
  portBoss(P, -0.165, 0.075, 0.30, 0.044, 'coax', P.q ? 20 : 12, -0.35);
  portBoss(P, 0.19, 0.0, 0.30, 0.048, 'sight', P.q ? 20 : 12);
  // the lifting eye on the mask's crown
  P.add('gunMountDark', torus(0.04, 0.012, 12, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 2), -0.15, 0.205, 0.10);
  P.add('gunMount', box(0.05, 0.03, 0.08), -0.15, 0.172, 0.10);
  // the plain collar and its dust ring
  P.add('gunMount', cylZ(0.128, 0.14, seg), 0, 0, 0.41);
  P.add('gunMountDark', cylZ(0.136, 0.018, seg), 0, 0, 0.458);
  barrelSeal(P, 0.0775, 0.481, seg);
  publishFit(P, {
    shield: 'stb1-prototype-rounded-mask', halfWidthM: STB1.channelHalf, shieldHalfWidthM: STB1.drumHalf,
    receiverR: STB1.receiverR, drumR: STB1.drumR, drumLow: DRUM_LOW, stub: { r: 0.045 },
  });
}
