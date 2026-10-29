// 261 (owner: "the stb 1 and type 74 still need completgely new mantlets and turret geometrry around the mantlets"): the
// STB-1 prototype's and the production Type 74's guns pitch in their own cast masks, each seated in a channel cut into
// its turret front (castGunSeat.ts). 262 (owner, 2026-10-27, with his STB-1 model: "both the type 74 and stb should be
// based from this"): both masks are sized to that model's broad front at its own proportions (Main's 262 ruling): the
// bore 0.29 m over the ring datum, the drum 0.373 m round the trunnion, its face reaching the turret's foot and nearly
// its crown. 263 (owner: the mantlets "should be like 'shaped' by the turret shape instead of protruding out"): each
// mask is now the turret's own nose: the wedge of the cast shell round the trunnion axis inside the channel
// (castGunSeat.ts conformalMask), so its face is the turret's surface, flush with the cheeks and rolling back over the
// top with the crown. Its top runs on as a tongue under a lip of the crown, so the gun's travel opens no slot over it:
// at rest the groove reads as a shallow step under the lip, as the owner's model's panel line does. Sources
// (docs/references/tanks/type74.md and stb1.md, "Mantlet" and "Owner model"):
//   - Type 74: a large mask of Japan's own design under a laced canvas cover; the J1 telescope's capped port on
//     the vehicle's right of the gun and the coaxial 7.62 mm's on its left, a cylindrical collar with a flared half-round
//     hood over its top, a lifting eye on the turret's upper front edge either side, and the IR/white searchlight on a
//     cradle beside the gun base on the left, tied to the collar by two parallel bars, so it rides the gun.
//   - STB-1: the owner's model: a rounded mask face continuing the turret's nose, a port either side of the bore, a short
//     thick collar, and a six-lens searchlight box on the mask's +x side (the 1969 photograph and ja.wiki record a passive
//     night sight; the owner's model governs, and the conflict is in the reference).
// Program frame (BUILD-STANDARD §A): +x is the vehicle's right; the STB-1's handed parts stand on the side the owner's
// model shows them (Main's 262 ruling, profiles/type74Family.ts). Every mask part is a gun-mount part (it pitches with the
// gun and does not recoil); the mask turns round the trunnion axis clear of the receiver and the crown, its sides run a
// constant seam inside the channel's walls, and its trunnion pins run into the walls. japaneseMantlet.selftest.mjs holds
// the gun inside its shield over the whole travel.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { conformalMask, cutConformalSeat, type ConformalSeat } from './castGunSeat.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';

export interface MantletBuilderPort {
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly q?: boolean;
  add(slot: string, geometry: THREE.BufferGeometry, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number): void;
}

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

/** A port boss standing out of the mask's face at (x, y), its axis along the face's normal there. */
function facePort(P: MantletBuilderPort, face: MaskFace, x: number, y: number, r: number, kind: 'sight' | 'coax', seg: number): void {
  const tilt = Math.atan((face.z(x, y + 0.02) - face.z(x, y - 0.02)) / 0.04);
  portBoss(P, x, y, face.z(x, y) - 0.03, r, kind, seg, tilt);
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

/** One mask's seat (263): the channel cut into the shell, the mask the shell's own nose inside it. */
interface MaskSeatFit {
  readonly channelHalf: number;
  readonly maskHalf: number;
  /** the receiver round the trunnion axis, inside the shell's nose over the gun: the crown stays whole over it */
  readonly receiverR: number;
  /** the mask's underside under the bore: over the deck by more than the gun's 26 mm keep at every bearing the turret
   * swings it, at full depression too */
  readonly maskLow: number;
  readonly pinR: number;
}

const DEG = Math.PI / 180;
// The groove the mask pitches under (263, the critics' open slot over the mask): the crown's lip stands LIP_PSI round
// from straight ahead. The mask's full face stops the spec's 9 degrees of elevation and a 5 degree keep short of it (6 mm
// at the mask's corners, 7 cm off the axis), and from there its tongue, a band round the trunnion axis just under the
// turret's skin, runs on under the lip by the 6 degrees of depression and a 2 degree keep. Over the tongue the lip is the crown's own skin, standing TONGUE_KEEP_M
// off the tongue and at least LIP_M thick; the crown's full casting starts where the tongue's top reaches at full
// elevation and a keep. The mask's back stops the depression and a 2 degree keep short of straight down, where the
// casting behind the axis begins.
const LIP_PSI = 70 * DEG, ELEVATION = 9 * DEG, DEPRESSION = 6 * DEG, SLOT_KEEP = 2 * DEG, TOP_KEEP = 5 * DEG;
const MASK_TOP = LIP_PSI - ELEVATION - TOP_KEEP, TONGUE_TOP = LIP_PSI + DEPRESSION + SLOT_KEEP;
const CROWN_PSI = TONGUE_TOP + ELEVATION + TOP_KEEP;
const TONGUE_KEEP_M = 0.006, LIP_M = 0.005, TONGUE_M = 0.035;

/** The mask's face (gun frame): its foremost z at (x, y), and its radius from the trunnion axis at x along `psi`. */
interface MaskFace {
  z(x: number, y: number): number;
  radius(x: number, psi: number): number;
  dispose(): void;
}

/** A band round the trunnion axis (axis frame) across `xs`: at each x its outer face `outer(i, psi)` and its inner
 * face `inner(i)` off the axis, from `from` to `to` radians in whole-degree steps. */
function axisBand(xs: readonly number[], from: number, to: number, outer: (i: number, psi: number) => number,
  inner: (i: number) => number): THREE.BufferGeometry {
  const steps = Math.max(2, Math.round((to - from) / DEG));
  const arc = Array.from({ length: steps + 1 }, (_, k) => from + ((to - from) * k) / steps);
  return loftAlongX(xs.map((x, i) => ({
    x,
    ring: [
      ...arc.map((a): [number, number] => { const r = outer(i, a); return [-r * Math.cos(a), r * Math.sin(a)]; }),
      ...[...arc].reverse().map((a): [number, number] => { const r = inner(i); return [-r * Math.cos(a), r * Math.sin(a)]; }),
    ],
  })));
}

/** Cut the shell for its seat, add the fixed pieces, the mask, its tongue and its trunnion pins, and return the mask's
 * face. */
function seatShell(P: MantletBuilderPort, shell: THREE.BufferGeometry, fit: MaskSeatFit): MaskFace {
  const { y, z } = P.gunG.position;
  // the skin's radius round the trunnion axis over the groove, read by rays on the whole shell before the seat cuts it:
  // at each x across the channel the tongue runs the lip's keep and thickness under the skin's lowest there
  const shellProbe = new THREE.Mesh(shell, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), dir = new THREE.Vector3();
  const skin = (x: number, psi: number): number => {
    ray.set(origin.set(x, y, z), dir.set(0, Math.sin(psi), Math.cos(psi)));
    const hit = ray.intersectObject(shellProbe, false).find((h) => h.distance > 0.01);
    if (!hit) throw new Error(`japaneseMantlets: no turret skin over the groove at x ${x.toFixed(3)}, ${(psi / DEG).toFixed(0)} deg`);
    return hit.distance;
  };
  const xn = P.q ? 24 : 12, lipXs = Array.from({ length: xn + 1 }, (_, i) => -fit.channelHalf + (2 * fit.channelHalf * i) / xn);
  const grooveArc = Array.from({ length: Math.round((CROWN_PSI - MASK_TOP) / DEG) + 1 }, (_, k) => MASK_TOP + k * DEG);
  const skins = lipXs.map((x) => new Map(grooveArc.map((a) => [a, skin(x, a)])));
  const tongueR = skins.map((m) => Math.min(...m.values()) - TONGUE_KEEP_M - LIP_M);
  (shellProbe.material as THREE.Material).dispose();
  const seat: ConformalSeat = {
    halfWidth: fit.channelHalf, axisY: y, axisZ: z, radius: fit.receiverR, bands: P.q ? 24 : 12,
    topPsi: MASK_TOP, crownPsi: CROWN_PSI, bottomPsi: -Math.PI / 2 + DEPRESSION + SLOT_KEEP, floorY: y - fit.maskLow,
  };
  for (const piece of cutConformalSeat(shell, seat)) P.add('turret', piece);
  // the lip: the crown's skin over the groove, its underside TONGUE_KEEP_M off the tongue
  const skinAt = (i: number, a: number) => skins[i].get(grooveArc.reduce((b, c) => (Math.abs(c - a) < Math.abs(b - a) ? c : b)))!;
  P.add('turret', axisBand(lipXs, LIP_PSI, CROWN_PSI, skinAt, (i) => tongueR[i] + TONGUE_KEEP_M).translate(0, y, z));
  const mask = conformalMask(shell, { ...seat, maskHalf: fit.maskHalf });
  shell.dispose();
  if (!mask) throw new Error('japaneseMantlets: the mask cuts nothing from the turret shell');
  mask.translate(0, -y, -z);
  // the tongue across the mask's width (the lip's stations inside it and the mask's sides, its radius linear between
  // them as the lip's is), from a degree inside the mask's top face on under the lip
  const at = (x: number): number => {
    const k = Math.min(xn - 1, Math.floor(((x + fit.channelHalf) / (2 * fit.channelHalf)) * xn));
    const t = (x - lipXs[k]) / (lipXs[k + 1] - lipXs[k]);
    return tongueR[k] + (tongueR[k + 1] - tongueR[k]) * t;
  };
  const tongueXs = [-fit.maskHalf, ...lipXs.filter((x) => Math.abs(x) < fit.maskHalf - 1e-4), fit.maskHalf];
  const tongueRs = tongueXs.map(at);
  const tongue = axisBand(tongueXs, MASK_TOP - DEG, TONGUE_TOP, (i) => tongueRs[i], (i) => Math.max(0.02, tongueRs[i] - TONGUE_M));
  // the face, read by rays on the mask and its tongue before they join their bucket
  const probes = [mask, tongue].map((g) => new THREE.Mesh(g.clone(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  const zs = new Map<string, number>(), rs = new Map<string, number>();
  const face: MaskFace = {
    z(x, yy) {
      const key = `${x},${yy}`;
      if (!zs.has(key)) { ray.set(origin.set(x, yy, 3), dir.set(0, 0, -1)); zs.set(key, ray.intersectObjects(probes, false)[0]?.point.z ?? 0); }
      return zs.get(key)!;
    },
    radius(x, psi) {
      const key = `${x},${psi}`;
      if (!rs.has(key)) {
        ray.set(origin.set(x, 0, 0), dir.set(0, Math.sin(psi), Math.cos(psi)));
        const hits = ray.intersectObjects(probes, false);
        rs.set(key, hits.length ? hits[hits.length - 1].distance : 0);
      }
      return rs.get(key)!;
    },
    dispose() { for (const p of probes) { p.geometry.dispose(); (p.material as THREE.Material).dispose(); } },
  };
  P.add('gunMount', mask);
  P.add('gunMount', tongue);
  const seg = P.q ? 24 : 12, pinLen = fit.channelHalf + 0.035 - fit.maskHalf;
  // painted like the mask: through the seam the pin reads as the mask's own trunnion, inside the wall's front edge
  for (const s of [-1, 1]) P.add('gunMount', KIT.cylX(fit.pinR, pinLen, seg), s * (fit.maskHalf + pinLen / 2 - 0.004), 0, 0);
  return face;
}

/** A sheet lying on the mask's face (a canvas cover), from `from` to `to` radians round the trunnion axis across
 * |x| <= `half`: its outer face `lift` off the mask plus the depth of `folds` folds across its width, its inner face 6 mm
 * into it. */
function faceSheet(face: MaskFace, half: number, from: number, to: number, folds: number, lift: number, depth: number, q: boolean): THREE.BufferGeometry {
  const arcSteps = q ? 14 : 7, xs = q ? 4 * folds + 1 : 2 * folds + 1;
  return loftAlongX(Array.from({ length: xs }, (_, i) => {
    const x = -half + (2 * half * i) / (xs - 1);
    const fold = depth * 0.5 * (1 + Math.cos((2 * Math.PI * folds * (x + half)) / (2 * half)));
    const ring: [number, number][] = [];
    const arc = Array.from({ length: arcSteps + 1 }, (_, k) => from + ((to - from) * k) / arcSteps);
    for (const a of arc) { const r = face.radius(x, a) + lift + fold; ring.push([-r * Math.cos(a), r * Math.sin(a)]); }
    for (const a of [...arc].reverse()) { const r = face.radius(x, a) - 0.006; ring.push([-r * Math.cos(a), r * Math.sin(a)]); }
    return { x, ring };
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Type 74 (production): the broad external mask
// ---------------------------------------------------------------------------------------------------------------------
const T74 = {
  seat: { channelHalf: 0.515, maskHalf: 0.507, receiverR: 0.15, maskLow: 0.254, pinR: 0.06 },
};

/**
 * The Type 74's mask (its turret's own nose), its cover, ports, collar and hood, the left searchlight on its cradle, the
 * seat cut into `shell` (the cast turret shell, turret frame, unadded) and the lifting eyes on the turret's upper front
 * edge.
 */
export function addType74Mantlet(P: MantletBuilderPort, shell: THREE.BufferGeometry): void {
  const { box, cylX, cylZ } = KIT;
  const seg = P.q ? 40 : 18, { seat } = T74;
  const face = seatShell(P, shell, seat);
  // the laced canvas cover over the mask's crown, from 35 degrees over the bore to the groove, gathered in seven folds,
  // tied down by three straps across it, the lacing zig-zagging along its edges by the cheeks
  const c0 = 35 * DEG, c1 = MASK_TOP - 1.5 * DEG, cm = (c0 + c1) / 2;
  P.add('gunMountCanvasSkin', faceSheet(face, seat.maskHalf - 0.014, c0, c1, 7, 0.005, 0.008, !!P.q));
  for (const x of [-0.33, 0, 0.33]) {
    // each strap as long as most of the cover's arc where it lies, so its straight ends stay on the cover
    const r = face.radius(x, cm) + 0.020, len = 0.8 * face.radius(x, cm) * (c1 - c0);
    P.add('gunMountDark', box(0.045, 0.014, len), x, r * Math.sin(cm), r * Math.cos(cm), Math.PI / 2 - cm, 0, 0);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    // each tie inside the cover's arc where it lies (the arc is short by the mask's narrow sides), clear of the groove
    const x = s * (seat.maskHalf - 0.075 + (k % 2) * 0.022), half = 0.015 / (face.radius(x, cm) + 0.017);
    const a = c0 + half + ((c1 - c0 - 2 * half) * k) / 5, r = face.radius(x, a) + 0.017;
    P.add('gunMountDark', box(0.01, 0.01, 0.03), x, r * Math.sin(a), r * Math.cos(a), Math.PI / 2 - a, (k % 2 ? 0.5 : -0.5), 0);
  }
  // the J1 telescope's port on the right and the coaxial 7.62 mm's on the left, both a little over the bore, their
  // bosses clear of the groove at full elevation
  facePort(P, face, 0.30, 0.085, 0.066, 'sight', P.q ? 20 : 12);
  facePort(P, face, -0.33, 0.075, 0.054, 'coax', P.q ? 20 : 12);
  // the collar the barrel leaves through, standing out of the face at the bore, the flared half-round hood over its top
  // and the seal round the barrel
  const fz = face.z(0, 0);
  P.add('gunMount', cylZ(0.13, 0.16, seg), 0, 0, fz + 0.05);
  P.add('gunMountDark', cylZ(0.134, 0.018, seg), 0, 0, fz + 0.005);
  P.add('gunMount', halfHood([{ z: fz + 0.05, inner: 0.129, outer: 0.143 }, { z: fz + 0.10, inner: 0.141, outer: 0.155 },
    { z: fz + 0.15, inner: 0.160, outer: 0.174 }], !!P.q));
  barrelSeal(P, 0.0775, fz + 0.125, seg);
  // the searchlight on its cradle beside the gun base (left), clear of the mask's side: a deck plate run in from the
  // mask's left side, a web under it, the lamp house with chamfered rear corners, its framed six-pane glass, and the two
  // bars to the collar; the whole cradle `lz` ahead of its 262 seat, as far as the fuller cheek beside it came out (263)
  const lx = -0.80, lz = 0.04;
  P.add('gunMount', box(0.58, 0.016, 0.40), -0.735, -0.042, 0.42 + lz);
  P.add('gunMount', box(0.12, 0.045, 0.24), -0.50, -0.0705, 0.36 + lz);                  // the cradle's foot on the mask's side
  P.add('gunMount', box(0.03, 0.035, 0.32), -0.99, -0.0665, 0.42 + lz);                   // the deck plate's outer rib
  P.add('gunMount', sectionSolid([
    { z: 0.25, ring: [[-0.17, -0.034], [0.17, -0.034], [0.19, -0.015], [0.19, 0.345], [0.17, 0.365], [-0.17, 0.365], [-0.19, 0.345], [-0.19, -0.015]] },
    { z: 0.31, ring: [[-0.20, -0.034], [0.20, -0.034], [0.21, -0.020], [0.21, 0.350], [0.20, 0.365], [-0.20, 0.365], [-0.21, 0.350], [-0.21, -0.020]] },
    { z: 0.58, ring: [[-0.20, -0.034], [0.20, -0.034], [0.21, -0.020], [0.21, 0.350], [0.20, 0.365], [-0.20, 0.365], [-0.21, 0.350], [-0.21, -0.020]] },
  ]), lx, 0, lz);
  P.add('gunMount', box(0.45, 0.034, 0.036), lx, 0.36, 0.578 + lz);
  P.add('gunMount', box(0.45, 0.034, 0.036), lx, -0.024, 0.578 + lz);
  P.add('gunMount', box(0.036, 0.35, 0.036), lx - 0.207, 0.168, 0.578 + lz);
  P.add('gunMount', box(0.036, 0.35, 0.036), lx + 0.207, 0.168, 0.578 + lz);
  P.add('gunMountGlass', markVehicleNightLens(box(0.36, 0.33, 0.012), 'headlight', { searchlight: true }), lx, 0.168, 0.587 + lz);
  P.add('gunMountDark', box(0.012, 0.31, 0.016), lx, 0.168, 0.595 + lz);
  for (const dy of [-0.055, 0.055]) P.add('gunMountDark', box(0.34, 0.010, 0.016), lx, 0.168 + dy, 0.595 + lz);
  P.add('gunMountDark', box(0.30, 0.016, 0.20), lx, 0.373, 0.41 + lz);                       // the lid's seam band
  for (const dx of [-0.10, 0.10]) P.add('gunMountDark', box(0.022, 0.026, 0.12), lx + dx, 0.388, 0.41 + lz); // lid handles
  for (const y of [-0.022, -0.068]) P.add('gunMountDark', cylX(0.011, 0.47, 10), -0.365, y, Math.min(0.56 + lz, fz + 0.10));
  // the turret's lifting eyes on its upper front edge either side of the mask
  for (const s of [-1, 1]) KIT.liftEye(P, 'turretDetail', s * 0.70, 0.52, 0.93, s * 0.25);
  publishFit(P, {
    shield: 'type74-production-conformal-mask', halfWidthM: seat.channelHalf, shieldHalfWidthM: seat.maskHalf,
    receiverR: seat.receiverR, drumR: seat.receiverR, drumLow: seat.maskLow, stub: { r: seat.pinR },
  });
  face.dispose();
}

// ---------------------------------------------------------------------------------------------------------------------
// STB-1 (prototype): the owner's model's rounded oval mask
// ---------------------------------------------------------------------------------------------------------------------
const STB1 = {
  seat: { channelHalf: 0.475, maskHalf: 0.467, receiverR: 0.15, maskLow: 0.254, pinR: 0.06 },
};

/**
 * The STB-1's mask (its turret's own rounded nose), its two ports, the thick collar, the six-lens searchlight box on its
 * +x side (the model's) and the seat cut into `shell` (the cast turret shell, turret frame, unadded).
 */
export function addSTB1Mantlet(P: MantletBuilderPort, shell: THREE.BufferGeometry): void {
  const { box, cylZ } = KIT;
  const seg = P.q ? 40 : 18, { seat } = STB1;
  const face = seatShell(P, shell, seat);
  // a port either side of the bore, a little over it: the telescope's at -x with the gunner's sight head, the coaxial
  // gun's at +x, their bosses clear of the groove at full elevation
  facePort(P, face, -0.245, 0.10, 0.06, 'sight', P.q ? 20 : 12);
  facePort(P, face, 0.245, 0.10, 0.052, 'coax', P.q ? 20 : 12);
  // the short thick collar standing out of the face at the bore, its ring and the seal round the barrel
  const fz = face.z(0, 0);
  P.add('gunMount', cylZ(0.15, 0.18, seg), 0, 0, fz + 0.06);
  P.add('gunMountDark', cylZ(0.158, 0.02, seg), 0, 0, fz + 0.14);
  P.add('gunMount', cylZ(0.11, 0.05, seg), 0, 0, fz + 0.175);
  barrelSeal(P, 0.0775, fz + 0.20, seg);
  // the searchlight box beside the mask's +x edge, where the owner's model has it (263: 0.56 by 0.53 m, its centre 0.66
  // m out and 0.18 m over the bore, its face 0.61 m ahead of the trunnion), carried on a cradle arm from the mask's face:
  // its six lenses in a frame and the lid's seam
  const lx = 0.66, ly = 0.175, lz = 0.467;
  {
    // the cradle arm from the mask's face to the box's back, where the face stands behind it
    const z0 = face.z(0.37, ly - 0.21) - 0.02, z1 = lz - 0.12;
    if (z1 > z0 + 0.02) P.add('gunMount', box(0.20, 0.04, z1 - z0), 0.37, ly - 0.21, (z0 + z1) / 2);
  }
  P.add('gunMount', box(0.56, 0.53, 0.28), lx, ly, lz);
  P.add('gunMountDark', box(0.52, 0.49, 0.012), lx, ly, lz + 0.146);
  for (const c of [-1, 1]) for (const r of [-1, 0, 1]) {
    P.add('gunMountGlass', markVehicleNightLens(box(0.21, 0.12, 0.012), 'headlight', { searchlight: true }), lx + c * 0.125, ly + r * 0.145, lz + 0.154);
  }
  P.add('gunMountDark', box(0.56, 0.012, 0.28), lx, ly + 0.205, lz);
  for (const dx of [-0.16, 0.16]) P.add('gunMountDark', box(0.03, 0.02, 0.10), lx + dx, ly + 0.275, lz - 0.02);
  publishFit(P, {
    shield: 'stb1-prototype-conformal-mask', halfWidthM: seat.channelHalf, shieldHalfWidthM: seat.maskHalf,
    receiverR: seat.receiverR, drumR: seat.receiverR, drumLow: seat.maskLow, stub: { r: seat.pinR },
  });
  face.dispose();
}
