// The Object 292 (release 269; owner 2026-11-04, "object 292 for a full line of 152 mm variant tanks"; DECISIONS
// "2026-11-04 Russian 152 mm line"): VNIITransmash and the Kirov Plant's 1990 trials tank, one built, kept at Kubinka.
// Owner 2026-11-04 ("use our proper tank generation procedure and dont use the old t80 hull only use modern new hulls like
// the nnew t80 x hulll"): it is built on the T-80U X hull and casting (profiles/t80uX.ts), by recipe reuse at that build's
// own datums, with no legacy T-80 builder. Owner 2026-11-05 ("the object 292 turret needs to be based off off the t80U
// turret as weell with its bigger gun", "make the hulls much beter", "add a machine gun tto the object 292"): the T-80U X
// casting is the turret (owner 2026-11-05, "i liked the full turret wrapping/box kit more"): the square steel
// weight-imitator blocks wrap its cheeks and flanks either side of the gun, each a chain of welded slabs; the commander's
// cupola where the T-80U X carries it, with the T-80U X's own sight head and NSVT station, the gunner's hatch and sight
// stand on the casting; a separate flat-sided welded box narrower than the casting sits on its rear half and overhangs the
// engine deck, its underside rising to the stern; the LP-83 leaves the embrasure in a fat cradle drum. The hull is the T-80U X base without its Kontakt-5,
// with Kubinka's own fit: the Kontakt-1 stud field with no bricks over the whole glacis, the headlights in their guards,
// the tow hooks and cables, the front fenders' stripped mounting plates and studs, rubber side skirts hanging from a band
// clamped along the apron and fender (owner 2026-11-05: "properly match sideskirts to hull side profiles"), broad flared
// rubber flaps over the fender noses, mud flaps at the stern, and the stern grille. First-party procedural geometry:
// Kevin B. Liu (NOTICE.md); photographs and sources in docs/references/photos/russia-152-20261104.json, the run packet in
// docs/references/tanks/object292.md.
import * as THREE from 'three';
import { reserveDecorVolume } from './fieldChest.ts';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { rubberSkirtRun } from './rubberSkirt.ts';
import { addShtoraEyes } from './shtora.ts';
import { blindTube } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { skirtSections } from './rubberSkirtSheets.ts';
import { buildT80UXCasting, buildT80UXHullBase, commanderSightHead, machineGun, T80U_X_CAST_ROWS, T80U_X_TRUNNION, T80U_X_YAW } from './t80uX.ts';
import { GUN_LP83, build152Gun } from './gun152.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { machinedRing } from '../machineGunGeometry.ts';
import { OBJECT292_FRAME as F } from '../russia152Frames.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ } = KIT;
type V2 = readonly [number, number];
/** The welded box's roof (turret frame: metres over the T-80U X casting's ring datum). */
const BOX_ROOF = F.boxRoof;

/** A contour made counter-clockwise (sectionSolid's contract) without changing its correspondence. */
function ccw(ring: readonly V2[]): V2[] {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a < 0 ? [...ring].reverse() : [...ring];
}

/** A strip of thickness `t` along a 2D path, as a closed contour: the path offset by +t/2 on its left, then by -t/2 back. */
function stripContour(path: readonly V2[], t: number): V2[] {
  const off = (d: number): V2[] => path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const n0 = i > 0 ? norm([-(p[1] - a[1]), p[0] - a[0]]) : null, n1 = i < path.length - 1 ? norm([-(b[1] - p[1]), b[0] - p[0]]) : null;
    const n = n0 && n1 ? norm([n0[0] + n1[0], n0[1] + n1[1]]) : (n0 ?? n1)!;
    const k = n0 && n1 ? 1 / Math.max(.5, n[0] * n0[0] + n[1] * n0[1]) : 1;
    return [p[0] + n[0] * d * k, p[1] + n[1] * d * k] as const;
  });
  return [...off(t / 2), ...off(-t / 2).reverse()];
}
function norm(v: V2): V2 { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }

/** A closed solid lofted along world X: stations at x, each contour in (z, y). */
function loftX(stations: readonly { x: number; ring: readonly V2[] }[]): THREE.BufferGeometry {
  const g = sectionSolid(stations.map(({ x, ring }) => ({ z: x, ring: ccw(ring.map(([z, y]) => [-z, y] as const)) })));
  return g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)));
}

/** A welded slab standing on a plan quad [a, b, bi, ai] (x, z): a-b its outer face, bi and ai its inner corners; from y0 to
 * y1, its top outer edge bevelled (ch high, chW in). Lofted upward. */
function blockSlab(q: readonly [V2, V2, V2, V2], y0: number, y1: number, ch: number, chW: number): THREE.BufferGeometry {
  const [a, b] = q, n = outward(a, b);
  const ring = (inset: number): V2[] => ccw(([[a[0] - n[0] * inset, a[1] - n[1] * inset], [b[0] - n[0] * inset, b[1] - n[1] * inset],
    q[2], q[3]] as const).map(([x, z]) => [x, -z] as const));
  const g = sectionSolid([{ z: y0, ring: ring(0) }, { z: y1 - ch, ring: ring(0) }, { z: y1, ring: ring(chW) }]);
  return g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));
}
/** The unit normal of a plan segment a-b (x, z) pointing away from the turret's centre. */
function outward(a: V2, b: V2): V2 {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n: V2 = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
  return n[0] * (a[0] + b[0]) + n[1] * (a[1] + b[1]) < 0 ? [-n[0], -n[1]] : n;
}

/** Piecewise-linear lookup in rows [z, ...values], clamped at both ends. */
function lerpRows(rows: readonly (readonly number[])[], z: number, col: number): number {
  if (z <= rows[0][0]) return rows[0][col];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (z <= b[0]) return a[col] + (b[col] - a[col]) * (z - a[0]) / (b[0] - a[0]);
  }
  return rows[rows.length - 1][col];
}

// ------------------------------------------------------------------------------------------------------- hull fit --

/** The T-80U X glacis' top (hull frame; its hull core's stations, profiles/t80uX.ts buildT80UXHullCore). */
const GLACIS: readonly (readonly [number, number])[] = [[1.84, 1.487], [2.10, 1.387], [2.40, 1.252], [2.70, 1.150], [3.015, 1.010]];
function glacisAt(z: number): { y: number; tilt: number } {
  for (let i = 1; i < GLACIS.length; i++) {
    const [z0, y0] = GLACIS[i - 1], [z1, y1] = GLACIS[i];
    if (z <= z1 || i === GLACIS.length - 1) return { y: y0 + (y1 - y0) * (z - z0) / (z1 - z0), tilt: Math.atan2(y0 - y1, z1 - z0) };
  }
  return { y: GLACIS[0][1], tilt: 0 };
}
/** The glacis' lower tow hooks and the tow cables' run from them up past the headlights to the fender's corner. */
const TOW_HOOK_X = .70, TOW_HOOK_Z = 2.90;
function cablePath(s: number): [number, number, number][] {
  return ([[.70, 2.86], [.64, 2.70], [.62, 2.45], [.70, 2.20], [.86, 2.00], [.98, 1.90]] as const)
    .map(([x, z]) => [s * x, glacisAt(z).y + .024, z]);
}

/** The glacis' fit, the T-80BV pattern Kubinka keeps: the Kontakt-1 mounting studs with no bricks, small bolt heads in an
 * even staggered grid over the whole plate (standing along its normal, clear of the headlights, the hooks and the cables),
 * the headlights in their hoop guards, the splash board under the turret, the tow hooks at the plate's foot and the two
 * tow cables run from them up past the headlights to the fenders' corners. Hull frame. */
const STUD = cylY(.018, .021, .028, 6);
function addGlacis(P: TankBuilderPort): void {
  const clear = (x: number, z: number) => {
    const ax = Math.abs(x);
    if (Math.hypot(ax - .8475, z - 2.62) < .17 || Math.hypot(ax - TOW_HOOK_X, z - TOW_HOOK_Z) < .13) return false;
    if (z < 2.07 && ax < .47) return false;                                       // the splash board
    return cablePath(1).every(([cx, , cz]) => Math.hypot(ax - cx, z - cz) > .055);
  };
  for (let row = 0; row < 9; row++) {
    const z = 1.93 + row * .125, { y, tilt } = glacisAt(z);
    for (let c = 0; c < 16; c++) {
      const x = -.975 + c * .13 + (row % 2 ? .065 : 0);
      if (Math.abs(x) > .99 || !clear(x, z)) continue;
      P.add('hullDetail', STUD.clone(), x, y + .012, z, tilt, 0, 0);
    }
  }
  for (const s of [-1, 1]) {
    const { y, tilt } = glacisAt(2.62), lx = s * .8475;
    P.addEquipment('hullDetail', box(.20, .05, .16), lx, y + .02, 2.60, tilt, 0, 0);                   // the lamp's seat
    P.addEquipment('hullDetail', cylZ(.084, .09, 16), lx, y + .085, 2.585);                              // its housing
    P.addEquipment('hullDetail', markVehicleNightLens(cylZ(.0735, .074, 24), 'headlight'), lx, y + .085, 2.62);
    // the hoop guard: two posts from the seat and a hoop over the lamp's face
    for (const dx of [-.075, .075]) P.addEquipment('hullDetail', box(.018, .12, .018), lx + dx, y + .07, 2.672);
    P.addEquipment('hullDetail', KIT.torus(.075, .009, 14, 5).rotateX(Math.PI / 2).scale(1, .9, 1), lx, y + .13, 2.672);
    // the tow hook at the plate's foot: a cast lug, its pin and the hook turned up
    const h = glacisAt(TOW_HOOK_Z);
    P.addEquipment('hullDetail', box(.17, .07, .15), s * TOW_HOOK_X, h.y + .02, TOW_HOOK_Z, h.tilt, 0, 0);
    P.addEquipment('hullDetail', cylX(.022, .22, 10), s * TOW_HOOK_X, h.y + .06, TOW_HOOK_Z + .02);
    P.addEquipment('hullDark', KIT.torus(.055, .016, 12, 6).rotateZ(Math.PI / 2), s * TOW_HOOK_X, h.y + .085, TOW_HOOK_Z + .045, h.tilt, 0, 0);
    // the tow cable from the hook's eye up the plate to the fender's corner, clipped down at two points
    const path = cablePath(s);
    KIT.towCable(P, path, .019);
    P.addEquipment('hullDark', KIT.torus(.045, .012, 12, 6).rotateZ(Math.PI / 2), path[0][0], path[0][1] + .01, path[0][2] + .045, h.tilt, 0, 0);
    for (const k of [2, 4]) {
      const [cx, cy, cz] = path[k], { tilt: tk } = glacisAt(cz);
      P.addEquipment('hullDetail', box(.07, .03, .05), cx, cy + .004, cz, tk, 0, 0);
    }
  }
  // the splash board across the plate under the turret's front
  const { y, tilt } = glacisAt(2.00);
  P.addEquipment('hullDetail', box(.86, .024, .10), 0, y + .012, 2.00, tilt, 0, 0);
  P.addEquipment('hullDetail', box(.86, .07, .016), 0, y + .045, 2.045, tilt - .5, 0, 0);
  for (const x of [-.36, 0, .36]) P.addEquipment('hullDetail', box(.016, .06, .07), x, y + .03, 2.02, tilt, 0, 0);
}

/** The T-80U X fender's top (profiles/t80uX.ts fenderShell, sheet .024 thick, outer edge x 1.722). */
const FENDER_TOP: readonly (readonly [number, number])[] = [[-3.36, 1.180], [-2.86, 1.411], [-2.40, 1.451], [-1.20, 1.497],
  [.60, 1.467], [2.40, 1.430], [2.90, 1.414], [3.07, 1.363], [3.20, 1.226], [3.36, .939]];
const fenderTop = (z: number) => lerpRows(FENDER_TOP, z, 1);
/** Kubinka's rubber skirt run (hull frame z), from the stern's fender drop to the fender's nose. object292-275: it hangs as
 * the T-80 family's segmented rubber sheets (profiles/rubberSkirt.ts, release 274's shared piece), black rubber under
 * its clamp strips, in place of this build's own band and sheets over the T-80U X apron: each sheet from under the
 * fender's outer lip (x 1.700) down and out to its foot (x 1.735 before the sheet's own lean) at 0.50 m, the foot rising after the track at
 * the nose and the stern. Six even sheets and the short angled one at the nose (Kuzmin's photographs: six or seven hinged
 * sections a side). */
const SKIRT_Z0 = -3.10, SKIRT_Z1 = 3.352, SKIRT_NOSE_Z = 2.90, SKIRT_TOP_X = 1.700, SKIRT_FOOT_X = 1.735;
function skirtBottom(z: number): number {
  return z > 2.50 ? .50 + (z - 2.50) / (SKIRT_Z1 - 2.50) * .14 : z < -2.55 ? .50 + (-2.55 - z) / (-2.55 - SKIRT_Z0) * .14 : .50;
}
const skirtTop = (z: number) => fenderTop(z) - .022;

/** Kubinka's rubber skirts (the shared segmented run with its clamp strips and bolts), the broad rubber flaps draped over the fenders' noses and flaring forward in front of the tracks, their lower
 * edges sagging between their corners, and the stern's rubber mud flaps hung from the fenders' tails. Hull frame. */
function addRubberSkirts(P: TankBuilderPort): void {
  const sections: [number, number][] = [...skirtSections(SKIRT_Z0, SKIRT_NOSE_Z, 6), [SKIRT_NOSE_Z, SKIRT_Z1]];
  const x = (z: number, y: number) => {
    const top = skirtTop(z), foot = skirtBottom(z);
    return SKIRT_TOP_X + (SKIRT_FOOT_X - SKIRT_TOP_X) * Math.max(0, Math.min(1, (top - y) / (top - foot)));
  };
  for (const s of [-1, 1]) {
    rubberSkirtRun(P, { label: 'object292-rubber-skirt', bucket: 'hullRubber', side: s, sections, top: skirtTop, foot: skirtBottom, x });
    // the front flap over the fender's nose: on the fender's top 1 cm proud, round the nose, then flaring forward in front
    // of the track; as wide as the fender and over its outer corner. Its hanging part sags between its corners and bellies
    // forward, its lower edge wavy (Kuzmin's head-on photograph), so it is lofted across the fender in nine stations.
    const flapAt = (u: number): V2[] => {
      const sag = Math.sin(Math.PI * u), ripple = .014 * Math.sin(2.6 * Math.PI * u + .5);
      return stripContour([[2.84, fenderTop(2.84) + .008], [2.90, fenderTop(2.90) + .008], [3.07, fenderTop(3.07) + .008],
        [3.20, fenderTop(3.20) + .008], [3.30, fenderTop(3.30) + .006], [3.3625, .930], [3.392 + .012 * sag, .84 - .02 * sag],
        [3.425, .70 - .05 * sag - ripple]], .011);
    };
    P.addMudguard('object292-front-flap', 'hullRubber', loftX(Array.from({ length: 9 }, (_, k) => {
      const x = -1.795 + k * (1.795 - .99) / 8;   // the left side's stations, mirrored for the right
      return s > 0 ? { x: -x, ring: flapAt(1 - k / 8) } : { x, ring: flapAt(k / 8) };
    }).sort((p, q) => p.x - q.x)));
    P.addEquipment('hullDetail', box(.80, .018, .028), s * 1.39, fenderTop(2.86) + .02, 2.86);            // its clamp bar
    // the stern's mud flap from the fender's tail, raked back a little
    P.addMudguard('object292-stern-flap', 'hullRubber', box(.66, .38, .012), s * 1.40, .985, -3.335, .12, 0, 0);
    P.addEquipment('hullDetail', box(.68, .03, .03), s * 1.40, 1.165, -3.322);
  }
}

/** The front fenders behind the flaps as Kubinka has them, stripped of the BV's fender Kontakt-1: the stepped mounting
 * plates left standing and their studs. Hull frame. */
function addFrontFenders(P: TankBuilderPort): void {
  for (const s of [-1, 1]) for (const [z, h] of [[2.12, .02], [2.43, .034], [2.71, .02]] as const) {
    const y = fenderTop(z);
    P.addEquipment('hullDetail', box(.56, h, .26), s * 1.38, y + h / 2, z);
    for (const dx of [-.20, -.07, .07, .20]) for (const dz of [-.07, .07]) P.addEquipment('hullDetail', STUD.clone(), s * (1.38 + dx), y + h + .012, z + dz);
  }
}

/** The stern: the GTD-1000TF's exhaust grille in the sloping upper plate (a dark well under a grid of bars in a frame), the
 * stern's tow hooks and the empty drum cradles' brackets where their arms leave the fenders. Hull frame. */
function addStern(P: TankBuilderPort): void {
  // the upper rear plate slopes from (z -3.13, y 1.547) to (z -3.36, y 1.347)
  const tilt = Math.atan2(1.547 - 1.347, 3.36 - 3.13), zc = -3.245, yc = 1.447 + .004, L = .27;
  P.addEquipment('hullDark', box(1.00, .008, L), 0, yc, zc, -tilt, 0, 0);
  for (let i = 0; i < 21; i++) P.addEquipment('hullDetail', box(.012, .026, L - .02), -.48 + i * .048, yc + .012, zc, -tilt, 0, 0);
  for (const f of [-.33, .33]) P.addEquipment('hullDetail', box(1.0, .028, .012), 0, yc + .013 + f * L * Math.sin(tilt), zc + f * L * Math.cos(tilt), -tilt, 0, 0);
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', box(.03, .04, L + .03), s * .515, yc + .016, zc, -tilt, 0, 0);
    // the tow hook on the lower rear plate
    P.addEquipment('hullDetail', box(.16, .14, .07), s * .78, 1.02, -3.045, -.75, 0, 0);
    P.addEquipment('hullDark', KIT.torus(.05, .016, 12, 6).rotateZ(Math.PI / 2), s * .78, .97, -3.10);
    // the empty drum cradles' brackets where their arms leave the fender
    for (const x of [1.179, 1.542]) P.addEquipment('hullDetail', box(.07, .035, .10), s * x, fenderTop(-3.15) + .015, -3.15);
  }
}

// ------------------------------------------------------------------------------------------------------ turret fit --

/** The cast cheek noses (object292-cheeks-275, Kevin 2026-11-22: "make these also properly fitted and looked attached and
 * meld to the turrets rounding"): in place of the T-80U X's flat-backed nose prisms (under its ERA there; bare here, their
 * backs stood as flat faces over the shell's rounded end), each nose is lofted from the casting's own section (the
 * T-80U X castSections profile: a lower wall to the shoulder, then the dome), so the shell runs on into it. It starts
 * 18 cm inside the shell at its section 4 mm in, leaves the shell's end at z 1.108 and narrows and drops to a rounded
 * nose ahead of it, its inner face a straight wall 2 cm clear of the mantlet's shield, its foot rising off the deck the
 * turret sweeps. Turret frame (the casting's yaw datum: y 0 its base). */
const NOSE_XI = .44, NOSE_EDGE = .012, YAW_Z = T80U_X_YAW[2], SHELL_END_Z = T80U_X_CAST_ROWS[T80U_X_CAST_ROWS.length - 1][0] - YAW_Z;
/** The shell's section at turret-frame z: [left half-width (x < 0), right (x > 0), top, shoulder] over its base. */
function shellAt(z: number): [number, number, number, number] {
  const rows = T80U_X_CAST_ROWS.map(([wz, l, r, t, b, sh]) => [wz - YAW_Z, l, r, t - b, sh - b] as const);
  return [lerpRows(rows, z, 1), lerpRows(rows, z, 2), lerpRows(rows, z, 3), lerpRows(rows, z, 4)];
}
/** The nose's stations: z, its half-width as a share of the shell's at its end, top, shoulder and foot (null: the
 * shell's own section there, 4 mm in). */
const NOSE_ROWS: readonly (readonly [number, number, number, number, number] | readonly [number, null])[] = [
  [.93, null], [SHELL_END_Z, null],
  [1.20, .97, .437, .195, 0], [1.29, .89, .414, .182, 0], [1.37, .77, .380, .160, .006],
  [1.43, .63, .340, .135, .014], [1.465, .53, .305, .115, .022],
];
/** One side's nose section (x > 0 for s = 1), counter-clockwise from +z: the foot from the inner wall out, the lower wall
 * to the shoulder (its foot drawn in as the shell's, never inside the inner wall), then the dome (the shell's own sin^.56 rise) sampled evenly in angle back to the inner wall. */
function noseRing(s: number, w: number, t: number, sh: number, b: number): V2[] {
  const phiMax = Math.acos(Math.min(.999, NOSE_XI / w)), ring: V2[] = [[NOSE_XI, b], [Math.max(w * .88, (NOSE_XI + w) / 2), b], [w, b + (sh - b) * .52], [w, sh]];
  for (let k = 1; k <= 6; k++) {
    const phi = k / 6 * phiMax;
    ring.push([k === 6 ? NOSE_XI : w * Math.cos(phi), sh + (t - sh) * Math.sin(phi) ** .56]);
  }
  return s > 0 ? ring : ring.map(([x, y]) => [-x, y] as const).reverse();
}
/** The nose's half-width, top and foot at a station for side s. */
function noseStation(s: number, row: (typeof NOSE_ROWS)[number]): { z: number; w: number; t: number; sh: number; b: number } {
  const z = row[0];
  if (row[1] === null) { const [l, r, t, sh] = shellAt(z); return { z, w: (s > 0 ? r : l) - .004, t: t - .004, sh, b: .004 }; }
  const [l, r] = shellAt(SHELL_END_Z), [, f, t, sh, b] = row as readonly [number, number, number, number, number];
  return { z, w: Math.max(NOSE_XI + .05, f * (s > 0 ? r : l)), t, sh, b };
}
/** The nose's top (the dome's height) at plan point (|x|, z) for side s, for kit seated on it. */
function noseTopAt(s: number, x: number, z: number): number {
  const st = NOSE_ROWS.map((row) => noseStation(s, row));
  const i = Math.max(1, st.findIndex((p) => p.z >= z)), a = st[i - 1], c = st[i], u = Math.max(0, Math.min(1, (z - a.z) / (c.z - a.z)));
  const w = a.w + (c.w - a.w) * u, t = a.t + (c.t - a.t) * u, sh = a.sh + (c.sh - a.sh) * u;
  const phi = Math.acos(Math.max(-1, Math.min(1, Math.abs(x) / w)));
  return sh + (t - sh) * Math.sin(phi) ** .56;
}
function addCastCheeks(P: TankBuilderPort): void {
  for (const s of [-1, 1]) {
    const st = NOSE_ROWS.map((row) => noseStation(s, row)), last = st[st.length - 1];
    const sections = st.map(({ z, w, t, sh, b }) => ({ z, ring: noseRing(s, w, t, sh, b) }));
    // the nose's soft front edge
    sections.push({ z: last.z + NOSE_EDGE, ring: noseRing(s, last.w - NOSE_EDGE, last.t - NOSE_EDGE, last.sh - NOSE_EDGE * .5, last.b + NOSE_EDGE * .5) });
    // the outer wall and dome are one casting (smoothed); the foot, inner wall and front keep their faces
    P.add('turret', sectionSolid(sections, { smoothSideEdges: s > 0 ? [2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8] }));
  }
  // the embrasure's back wall between the noses, in shadow behind the mantlet
  P.add('turretDark', box(2 * NOSE_XI - .01, .40, .01), 0, .20, SHELL_END_Z + .006);
}

/** Shtora-style electro-optical jammers ahead of the weight-imitator boxes (object292-cheeks-275, Kevin 2026-11-22: "put
 * tech like shtora or some other sensors in front of them"; his look pick: a jammer each side with a laser-warning head
 * on it). The jammers are the fleet's shared Shtora-1 OTShU pair (profiles/shtora.ts, as the T-84's: the armoured box,
 * the red lens in its rim and the lid), each on a bolted bracket of two legs, a cross plate and foot plates seated on the
 * cast nose's top ahead of the box; on each jammer's outboard rear corner a laser-warning head (a squat drum with its
 * dark sensor band) on a short post. Turret frame. */
const JAMMER = { x: .74, z: 1.31, w: .24, h: .27, d: .22, lift: .03 } as const;
function addJammers(P: TankBuilderPort): void {
  const seg = P.q ? 24 : 14, { x, z, w, h, d, lift } = JAMMER;
  // the seat: the nose's top under the bracket's legs on both sides, the pair level and clear over the highest
  const legX = [-.08, .08], seat = Math.max(...[-1, 1].flatMap((s) => legX.map((dx) => noseTopAt(s, s * x + dx, z))));
  const y0 = seat + lift, top = y0 + h + .04;
  addShtoraEyes({ mats: P.mats, turretG: P.turretG, disposables: P.disposables,
    add: (slot, geometry, gx, gy, gz) => P.addEquipment(slot, geometry, gx, gy, gz) },
  { x, y: y0 + h / 2, z, scale: 1, round: true, kit: false });
  for (const s of [-1, 1]) {
    for (const dx of legX) {
      const lx = s * x + dx, y = noseTopAt(s, lx, z);
      P.addEquipment('turretDetail', box(.05, .012, .16), lx, y + .004, z);                                // the foot plate
      P.addEquipment('turretDetail', box(.032, y0 - y + .01, .10), lx, (y + y0) / 2, z);                   // the leg
      for (const dz of [-.055, .055]) P.addEquipment('turretDark', cylY(.011, .012, .012, 6), lx, y + .014, z + dz);
    }
    P.addEquipment('turretDetail', box(w - .02, .018, d * .8), s * x, y0 + .004, z);                        // the cross plate
    // the laser-warning head on the outboard rear corner, on the lid
    const hx = s * (x + w / 2 - .045), hz = z - d / 2 + .05;
    P.addEquipment('turretDetail', cylY(.016, .018, .022, 8), hx, top + .011, hz);
    P.addEquipment('turretDetail', cylY(.038, .042, .04, seg), hx, top + .042, hz);
    P.addEquipment('turretDark', cylY(.043, .043, .014, seg), hx, top + .042, hz);
    P.addEquipment('turretDetail', KIT.sph(.038, seg, Math.PI / 2).scale(1, .35, 1), hx, top + .062, hz);
  }
}

/** The 902B Tucha smoke grenade launchers (object292-cheeks-275, from the smoke-salvo lane: the T-80BV the 292 is built
 * from carries eight; the Kubinka tank shows none, its launchers off as museum pieces mostly are): four a side on the
 * casting's upper flank behind the weight-imitator box, inboard of the flank panels' tops, raked up and out, each on its
 * bracket over a rail; marked as smoke sockets (vehicleAuxiliaryGeometry markSmokeTube, as the T-84's twelve), so the
 * fleet rule fires the eight that are drawn. The right bank sits ahead of the commander's NSVT riser. Turret frame. */
const SMOKE_Z = [.40, .48, .56, .64] as const, SMOKE_X = .76, SMOKE_TILT = -.60, SMOKE_YAW = .30;
function addSmoke(P: TankBuilderPort): void {
  const shellTop = (s: number, ax: number, z: number) => {
    const [l, r, t, sh] = shellAt(z), w = s > 0 ? r : l;
    return sh + (t - sh) * Math.sin(Math.acos(Math.min(1, ax / w))) ** .56;
  };
  for (const s of [-1, 1]) {
    const seats = SMOKE_Z.map((z) => { const [l, r] = shellAt(z), ax = SMOKE_X * (s > 0 ? r : l); return { z, ax, y: shellTop(s, ax, z) }; });
    for (const { z, ax, y } of seats) {
      P.addEquipment('turretDetail', box(.07, .05, .07), s * ax, y + .02, z);                                // the bracket
      P.addEquipment('turretDark', markSmokeTube(blindTube(.044, .033, .24, .15, 16), [0, 0, 1], true), s * ax, y + .085, z, SMOKE_TILT, s * SMOKE_YAW, 0);
    }
    // the rail the brackets stand on, along the bank
    const a = seats[0], c = seats[seats.length - 1], len = Math.hypot(c.ax - a.ax, c.z - a.z) + .10;
    P.addEquipment('turretDetail', box(.05, .025, len), s * (a.ax + c.ax) / 2, Math.min(a.y, c.y) + .006, (a.z + c.z) / 2, 0, s * Math.atan2(c.ax - a.ax, c.z - a.z), 0);
  }
}

/** The weight imitators as Kubinka has them (object292-275, Kevin 2026-11-21: "fix the turret cheeks and mantlet fully";
 * Kuzmin's head-on and Wilson's close photographs): not a wall round the casting but the T-80BV's turret Kontakt-1 rack
 * replaced by plain welded steel boxes. A wedge box on each front cheek, its big face sloped back about 45 degrees over a
 * short upright lip, standing clear of the mantlet; behind it a row of three shallow flat panels hung on the casting's
 * flank, following its curve and leaning in with it, their tops 0.18 m under the casting's crown so the dome rises over
 * them. Plan points are the panels' outer faces (turret frame x, z), 6 cm outside the casting's flank at its shoulder
 * (profiles/t80uX.ts casting: the right flank, x < 0, bulges more). */
const CHEEK_ROW: Record<'L' | 'R', readonly V2[]> = {
  L: [[1.31, .60], [1.40, .22], [1.42, -.16], [1.27, -.55]],
  R: [[-1.38, .60], [-1.45, .22], [-1.43, -.16], [-1.28, -.55]],
};
/** The front boxes' plan: front edge inner and outer, the outer back corner (the row's start) and the inner back corner. */
const FRONT_BOX: Record<'L' | 'R', readonly [V2, V2, V2, V2]> = {
  L: [[.56, 1.22], [1.22, .99], [1.31, .60], [.56, .66]],
  R: [[-.56, 1.22], [-1.26, .99], [-1.38, .60], [-.56, .66]],
};
const CHEEK_Y0 = .06, CHEEK_Y1 = .44, PANEL_DEPTH = .16, PANEL_LEAN = .05, JOINT_GAP = .014;
const FRONT_LIP = .08, FRONT_SLOPE_IN = .30;

/** A bolt head standing out of a face along its outward normal n (plan), at (x, y, z), tilted up by `tilt`. Turret frame. */
function faceBolt(P: TankBuilderPort, n: V2, x: number, y: number, z: number, tilt = 0): void {
  P.addEquipment('turretDetail', cylX(.022, .026, 6), x + n[0] * .010, y, z + n[1] * .010, 0, Math.atan2(-n[1], n[0]), tilt);
}

/** The weight-imitator boxes on the casting (turret frame): each side the front cheek's wedge box (its sloped face bolted,
 * a lip along its foot) and the flank's three panels (open joints with the weld seams set back in them, a flared bottom
 * lip, two bolt heads near each panel's top), and a lifting eye on the casting over the row. */
function addCheekBlocks(P: TankBuilderPort): void {
  for (const side of ['L', 'R'] as const) {
    const s = side === 'L' ? 1 : -1, [fa, fb, fbi, fai] = FRONT_BOX[side];
    // the front wedge box: upright for its lip, then its face sloped back to the flat top
    const nf = outward(fa, fb);
    P.add('turret', blockSlab([fa, fb, fbi, fai], CHEEK_Y0, CHEEK_Y1, CHEEK_Y1 - CHEEK_Y0 - FRONT_LIP, FRONT_SLOPE_IN));
    const flen = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]), fyaw = Math.atan2(fb[0] - fa[0], fb[1] - fa[1]);
    P.addEquipment('turretDetail', box(.03, .024, flen - .02), (fa[0] + fb[0]) / 2 + nf[0] * .012, CHEEK_Y0 + .012,
      (fa[1] + fb[1]) / 2 + nf[1] * .012, 0, fyaw, 0);
    const slope = Math.atan2(FRONT_SLOPE_IN, CHEEK_Y1 - CHEEK_Y0 - FRONT_LIP), yb = CHEEK_Y0 + FRONT_LIP + .14;
    const back = FRONT_SLOPE_IN * (yb - CHEEK_Y0 - FRONT_LIP) / (CHEEK_Y1 - CHEEK_Y0 - FRONT_LIP);
    for (const u of [.22, .5, .78]) faceBolt(P, nf, fa[0] + (fb[0] - fa[0]) * u - nf[0] * back, yb, fa[1] + (fb[1] - fa[1]) * u - nf[1] * back, slope);
    // the flank's panels
    const V = CHEEK_ROW[side];
    for (let i = 0; i < V.length - 1; i++) {
      const [a0, b0] = [V[i], V[i + 1]], n = outward(a0, b0);
      const len0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), e: V2 = [(b0[0] - a0[0]) / len0, (b0[1] - a0[1]) / len0];
      const a: V2 = [a0[0] + e[0] * JOINT_GAP, a0[1] + e[1] * JOINT_GAP], b: V2 = [b0[0] - e[0] * JOINT_GAP, b0[1] - e[1] * JOINT_GAP];
      const ai: V2 = [a[0] - n[0] * PANEL_DEPTH, a[1] - n[1] * PANEL_DEPTH], bi: V2 = [b[0] - n[0] * PANEL_DEPTH, b[1] - n[1] * PANEL_DEPTH];
      P.add('turret', blockSlab([a, b, bi, ai], CHEEK_Y0, CHEEK_Y1, CHEEK_Y1 - CHEEK_Y0 - .05, PANEL_LEAN));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      P.addEquipment('turretDetail', box(.035, .022, len - .01), (a[0] + b[0]) / 2 + n[0] * .016, CHEEK_Y0 + .011,
        (a[1] + b[1]) / 2 + n[1] * .016, 0, yaw, 0);                                                     // the bottom lip
      const lean = Math.atan2(PANEL_LEAN, CHEEK_Y1 - CHEEK_Y0 - .05), yt = CHEEK_Y1 - .08;
      const inset = PANEL_LEAN * (yt - CHEEK_Y0 - .05) / (CHEEK_Y1 - CHEEK_Y0 - .05);
      for (const u of [.25, .75]) faceBolt(P, n, a[0] + (b[0] - a[0]) * u - n[0] * inset, yt, a[1] + (b[1] - a[1]) * u - n[1] * inset, lean);
    }
    // the weld seams set back in the joints (the front box's to the row's first panel included)
    for (let k = 0; k < V.length - 1; k++) {
      const n = outward(V[Math.max(0, k - 1)], V[k + 1]);
      P.addEquipment('turretDark', box(.02, CHEEK_Y1 - CHEEK_Y0 - .10, .02), V[k][0] - n[0] * .03, (CHEEK_Y0 + CHEEK_Y1 - .07) / 2, V[k][1] - n[1] * .03);
    }
    KIT.liftEye(P, 'turretDetail', s * 1.02, .54, -.05, s * .55);
  }
}

/** The welded box over the casting's rear half (Kubinka: the casting plain ahead of it; the box narrower than the casting,
 * flat-sided, its underside rising from the casting to the stern and overhanging the engine deck), in two steps
 * (object292-275, Kuzmin's rear and right-rear photographs): the forward box, its front a long raked wedge rising behind
 * the hatches from the cheek blocks' tops to the roof (Wilson 2017), and the rear module welded on behind a vertical seam,
 * a little wider and taller, its own roof carrying the two blow-out panels over the ammunition niche. The roof plates
 * lipped all round, the rear face's middle panel standing proud, the plate seams, grab rails on the forward box's flanks,
 * lifting eyes, the loading gear's service hatch and the ventilator. Turret frame. */
const BOX_W = 1.0, BOX_FRONT = -.72, BOX_TAIL = -2.22;
/** The front wedge's foot and the roof's leading edge (turret frame z), and the rear module's seam, its step out each side
 * and up, and its floor at the seam and the tail. */
const WEDGE_Z = -1.00, MODULE_Z = -1.60, MODULE_OUT = .03, MODULE_UP = .03, MODULE_FLOOR: V2 = [.16, .27];
function addBox(P: TankBuilderPort): void {
  const r = BOX_ROOF - .03, c = .045;
  const section = (yb: number, yt: number, w = BOX_W): V2[] => [[-w, yb], [w, yb], [w, yt - c], [w - c, yt], [c - w, yt], [-w, yt - c]];
  P.add('turret', sectionSolid([
    { z: BOX_TAIL, ring: section(.31, r) }, { z: -1.30, ring: section(.14, r) }, { z: WEDGE_Z, ring: section(.10, r) },
    { z: -.86, ring: section(.10, r - .085) }, { z: BOX_FRONT, ring: section(.10, r - .17) },
  ]));
  P.add('turret', box(2 * BOX_W + .04, .03, WEDGE_Z - MODULE_Z), 0, BOX_ROOF - .015, (WEDGE_Z + MODULE_Z) / 2);
  // the rear module: its walls 3 cm outside the forward box's and its roof 3 cm over it, from the seam to the tail
  const mw = BOX_W + MODULE_OUT, mr = BOX_ROOF + MODULE_UP;
  P.add('turret', sectionSolid([
    { z: BOX_TAIL - .015, ring: section(MODULE_FLOOR[1], mr - .03, mw) }, { z: MODULE_Z, ring: section(MODULE_FLOOR[0], mr - .03, mw) },
  ]));
  P.add('turret', box(2 * mw + .04, .03, MODULE_Z - BOX_TAIL + .045), 0, mr - .015, (MODULE_Z + BOX_TAIL - .045) / 2);
  P.add('turret', box(.80, .34, .05), 0, .50, BOX_TAIL - .04);                                        // the rear's middle panel
  for (const x of [-.40, .40]) P.addEquipment('turretDark', box(.016, .34, .016), x, .50, BOX_TAIL - .065);
  // the two blow-out panels on the module's roof, each a plate in a bolted frame
  for (const x of [-.44, .44]) {
    P.add('turret', box(.60, .014, .42), x, mr + .007, -1.93);
    for (const [dx, dz] of [[-.27, 0], [.27, 0], [0, -.19], [0, .19]] as const) {
      P.addEquipment('turretDark', box(dz ? .56 : .014, .006, dz ? .014 : .40), x + dx, mr + .016, -1.93 + dz);
    }
    for (const dx of [-.24, 0, .24]) for (const dz of [-.17, .17]) P.addEquipment('turretDetail', cylY(.014, .016, .012, 6), x + dx, mr + .02, -1.93 + dz);
  }
  for (const s of [-1, 1]) {
    // the forward box's seam, the step's flange down the module's front edge, the grab rail on three posts
    P.addEquipment('turretDark', box(.016, .40, .016), s * (BOX_W + .004), .48, -1.28);
    P.addEquipment('turretDetail', box(.03, mr - MODULE_FLOOR[0] - .05, .03), s * (mw + .006), (mr + MODULE_FLOOR[0]) / 2, MODULE_Z - .015);
    for (const z of [-1.10, -1.33, -1.54]) P.addEquipment('turretDetail', box(.06, .02, .02), s * (BOX_W + .03), .56, z);
    P.addEquipment('turretDetail', cylZ(.012, .52, 8), s * (BOX_W + .055), .56, -1.32);
    KIT.liftEye(P, 'turretDetail', s * .82, BOX_ROOF, -1.10, 0);
    KIT.liftEye(P, 'turretDetail', s * .82, mr, -2.17, 0);
  }
  // the loading gear's service hatch on the forward box's roof, its hinges and grip
  P.addHatch('turret', box(.60, .026, .44), .32, BOX_ROOF + .013, -1.30);
  for (const x of [.12, .52]) P.addEquipment('turretDetail', cylX(.022, .09, 10), x, BOX_ROOF + .022, -1.53);
  P.addEquipment('turretDetail', box(.16, .025, .025), .32, BOX_ROOF + .04, -1.10);
  // the box's ventilator, and the antenna bases at the module's rear corners
  P.add('turret', cylY(.13, .14, .05, 16), -.42, BOX_ROOF + .025, -1.30);
  P.add('turretDark', cylY(.10, .11, .03, 16), -.42, BOX_ROOF + .065, -1.30);
  P.add('turret', cylY(.06, .07, .07, 10), .82, mr + .035, -2.00);
  P.add('turret', cylY(.06, .07, .07, 10), -.82, mr + .035, -2.00);
  // the whip 3 cm shorter, so its tip stays where it was over the higher module
  const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 1.24 - MODULE_UP, r: 0.011, rake: -0.025, seed: 292 });
  antenna.position.set(.82, mr + .07, -2.00);
  P.turretG.add(antenna);
}

/** The roof on the casting, as the T-80U's: the commander's cupola (right) where the T-80U X carries it, its race bedded
 * into the sloping roof to the T-80U X's ring height, periscopes round it and its lid, with the T-80U X's own sight head
 * on its front and its commander's NSVT station ahead of it (profiles/t80uX.ts, one shared part); the gunner's hatch
 * (left) and his sight's armoured housing ahead of it with its window to the front; the ventilator's dome between them.
 * Turret frame. */
function addRoof(P: TankBuilderPort): void {
  const seg = P.q ? 28 : 16;
  const [cx, cz] = [T80U_X_CUPOLA[0], T80U_X_CUPOLA[1]];
  P.addCupola('turret', cylY(.3455, .36, .17, seg), cx, .595, cz);
  P.addEquipment('turretDetail', cylY(.328, .328, .028, seg), cx, .6834, cz);
  P.addHatch('turret', cylY(.235, .24, .025, seg), cx, .71, cz - .06);
  P.addHatch('turret', KIT.sph(.225, seg, Math.PI / 2).scale(1, .16, 1), cx, .7225, cz - .06);
  P.addEquipment('turretDetail', cylX(.03, .18, 10), cx, .705, cz - .31);
  for (const a of [1.7, -1.7, 2.5, -2.5]) KIT.periscope(P, 'turretDetail', cx + .29 * Math.sin(a), .735, cz + .29 * Math.cos(a), a);
  commanderSightHead(P);
  machineGun(P);
  // the decor's loads keep out of the NSVT's sweep over the casting and the box's front (fieldChest.ts reserveDecorVolume;
  // turret frame): against the stock its barrel turns a full circle (tools/roof-station-arcs.mjs), and the decor's cans on
  // the box roof stopped it from 151 to 172 degrees
  reserveDecorVolume(P.turretG, [-2.20, .70, -1.08], [.30, 1.40, 1.43]);
  // over the casting's left flank (70-92 degrees) the barrel depresses 0.177 rad, not the NSVT's full 0.18
  // (.qa-dev/r152/station-table-full.mjs; each degree the smallest of it and its neighbours)
  const nsvt = P.turretG.getObjectByName('fitting_browningDerived_nsvt');
  if (!nsvt) throw new Error('object292: the T-80U X commander\'s NSVT is missing');
  nsvt.userData.depressionByYaw = [[1.2043, .18], [1.2217, .177], [1.6057, .177], [1.6232, .18]];
  // gunner's hatch and its periscope
  const [gx, gz] = [.38, -.36];
  P.addCupola('turret', cylY(.30, .31, .08, seg), gx, .57, gz);
  P.addHatch('turret', cylY(.27, .28, .035, seg), gx, .6275, gz);
  P.addEquipment('turretDetail', cylX(.03, .18, 10), gx + .02, .63, gz - .29);
  P.addEquipment('turretDetail', box(.12, .03, .03), gx, .66, gz + .05);
  KIT.periscope(P, 'turretDetail', gx - .02, .62, gz + .34, 0);
  // gunner's sight: the armoured housing on its plinth, the window and its frame to the front, the open shutters, the hood
  const [sx, sz] = [.36, .36];
  P.addModuleVisual('optics', 'turretDetail', box(.34, .07, .44), sx, .545, sz);
  P.addModuleVisual('optics', 'turretDetail', box(.30, .20, .40), sx, .66, sz);
  P.addModuleVisual('optics', 'turretDark', box(.22, .13, .02), sx, .675, sz + .205);
  P.addModuleVisual('optics', 'turretGlass', box(.18, .095, .01), sx, .675, sz + .214);
  for (const d of [-1, 1]) P.addEquipment('turretDetail', box(.02, .13, .10), sx + d * .13, .675, sz + .25, 0, d * .45, 0);
  P.addEquipment('turretDetail', box(.34, .03, .46), sx, .772, sz + .01);
  // the ventilator's dome ahead of the cupola
  P.add('turret', cylY(.12, .13, .05, 16), -.10, .605, .30);
  P.addEquipment('turretDetail', KIT.sph(.11, 14, Math.PI / 2).scale(1, .55, 1), -.10, .63, .30);
}
/** The T-80U X commander's cupola centre (turret frame; profiles/t80uX.ts roofEquipment's -.6265, -.225 at its yaw
 * datum), where its sight head and NSVT station are authored. */
const T80U_X_CUPOLA = [-.6265, -.225 - T80U_X_YAW[2]] as const;

/** The LP-83 on its cradle (object292-cheeks-275, Kevin 2026-11-22: "make the mantlet a lot better and add a gun assembly
 * to turret"; his look pick, the curved cast shield). The mantlet is a cast shield whose face is a cylinder about the
 * trunnion axis (radius .31), so it turns in the embrasure between the cast noses with an even gap at every pitch: its
 * chamfered side edges 3 cm inside the noses' inner walls, the trunnion caps on its ends, the welded centre insert's seams
 * across its face, the coaxial machine gun's port to the gun's right and the gunner's auxiliary sight aperture under its
 * hood to the left. Ahead of it the gun assembly: the bolted cradle flange where the barrel enters, the armoured recoil
 * housing (the cradle's sleeve) with its clamp bands and guide key, a step and a cone down to the tube's thermal sleeve.
 * The shield's underside stays .21 under the axis from -5 to +15 degrees of pitch (as the drum's it replaces); the
 * housing keeps the old root drum's underside, .175 under the bore, so the gun keeps its measured depression stops.
 * Gun frame (the trunnion axis; +z forward). */
const SHIELD_R = .31, SHIELD_HALF = .41, SHIELD_LOW = -36 * Math.PI / 180, SHIELD_HIGH = 62 * Math.PI / 180, SHIELD_BACK = -.06;
/** The shield's section (z, y) at radius r: the face arc from its foot to its brow, then back to the embrasure. */
function shieldRing(r: number): V2[] {
  const ring: V2[] = [];
  for (let k = 0; k <= 8; k++) { const a = SHIELD_LOW + (SHIELD_HIGH - SHIELD_LOW) * k / 8; ring.push([r * Math.cos(a), r * Math.sin(a)]); }
  ring.push([SHIELD_BACK, r * Math.sin(SHIELD_HIGH)], [SHIELD_BACK, r * Math.sin(SHIELD_LOW)]);
  return ring;
}
/** A band on the shield's face between x0 and x1 (a seam or a lip), its arc from a0 to a1, t proud. */
function shieldBand(x0: number, x1: number, a0: number, a1: number, t: number): THREE.BufferGeometry {
  const arc = (r: number): V2[] => Array.from({ length: 7 }, (_, k) => { const a = a0 + (a1 - a0) * k / 6; return [r * Math.cos(a), r * Math.sin(a)] as const; });
  const ring = [...arc(SHIELD_R + t), ...arc(SHIELD_R - .004).reverse()];
  return loftX([{ x: x0, ring }, { x: x1, ring }]);
}
function addGun(P: TankBuilderPort): void {
  const seg = P.q ? 28 : 14, R = SHIELD_R, H = SHIELD_HALF, C = .025;
  // the shield: chamfered at both ends (its face and brow drawn in by C over the last C of its width)
  P.addGunExtra(loftX([{ x: -H, ring: shieldRing(R - C) }, { x: C - H, ring: shieldRing(R) }, { x: H - C, ring: shieldRing(R) }, { x: H, ring: shieldRing(R - C) }]));
  // the centre insert's two welded seams across the face, and the lip along the brow
  for (const x of [-.20, .20]) P.addGunExtraDark(shieldBand(x - .006, x + .006, SHIELD_LOW + .05, SHIELD_HIGH - .04, .004));
  P.addGunExtra(shieldBand(C - H, H - C, SHIELD_HIGH - .07, SHIELD_HIGH, .010));
  for (const s of [-1, 1]) {
    // the trunnion cap on the shield's end, its bolt ring
    P.addGunExtra(cylX(.11, .012, seg), s * (H + .004), 0, 0);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; P.addGunExtraDark(cylX(.012, .008, 6), s * (H + .013), .075 * Math.sin(a), .075 * Math.cos(a)); }
  }
  // the coaxial machine gun's port to the gun's right (x < 0): a boss on the face and its dark bore
  { const a = .08, x = -.27; P.addGunExtra(cylZ(.048, .05, seg), x, R * Math.sin(a), R * Math.cos(a) + .012); P.addGunExtraDark(cylZ(.020, .052, 10), x, R * Math.sin(a), R * Math.cos(a) + .014); }
  // the auxiliary sight's aperture to the left under its armoured hood
  { const a = .55, x = .27, y = R * Math.sin(a), z = R * Math.cos(a);
    P.addGunExtra(box(.13, .10, .06), x, y, z);
    P.addGunExtraDark(box(.10, .06, .012), x, y - .005, z + .031);
    P.addGunExtra(box(.15, .016, .09), x, y + .055, z + .01); }
  // the cradle flange where the barrel enters the shield, its bolt ring
  // (radius .222: its underside .179 under the axis, .207 at 5 degrees' depression, as the root drum it rings)
  P.addGunExtra(cylZ(.222, .045, seg), 0, .043, R + .005);
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; P.addGunExtraDark(cylZ(.006, .012, 6), .216 * Math.sin(a), .043 + .216 * Math.cos(a), R + .031); }
  // the recoil housing: the old root drum's envelope (underside .175 under the bore), its clamp bands and the guide key
  P.addGunExtra(cylZ(.212, .58, seg, .218), 0, .043, .36);
  for (const z of [.43, .58]) P.addGunExtraDark(cylZ(.222, .03, seg), 0, .045, z);
  P.addGunExtra(box(.05, .03, .30), 0, .043 + .214, .48);
  P.addGunExtraDark(cylZ(.224, .045, seg), 0, .052, .63);
  P.addGunExtra(cylZ(.184, .06, seg), 0, .012, .675);
  P.addGunExtra(cylZ(.150, .26, seg, .184), 0, .012, .835);
  P.addGunExtraDark(cylZ(.158, .03, seg), 0, 0, .965);
  build152Gun(P, { ...GUN_LP83, len: F.muzzleZ - F.trunnionZ });
}

function buildObject292X(P: TankBuilderPort): void {
  // the T-80U X ring datum on its raised race (as profiles/t80uX.ts seats its own casting); turret parts are authored
  // against the casting's yaw datum and rise with it
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(T80U_X_YAW[0], F.ringY, F.ringZ);
  P.addEquipment('hullDetail', machinedRing(.90, 1.01, F.ringY - .030 - 1.522, .004, P.q ? 32 : 20), T80U_X_YAW[0], 1.522, F.ringZ);
  P.gunG.position.set(T80U_X_TRUNNION[0] - T80U_X_YAW[0], F.trunnionY - F.ringY, F.trunnionZ - F.ringZ);
  buildT80UXHullBase(P, { skirts: false });
  addGlacis(P);
  addRubberSkirts(P);
  addFrontFenders(P);
  addStern(P);
  buildT80UXCasting(P, { cheekNoses: false });
  addCastCheeks(P);
  addCheekBlocks(P);
  addJammers(P);
  addSmoke(P);
  addBox(P);
  addRoof(P);
  for (const s of [-1, 1]) P.decal('turret', 'number', P.spec.visual.number || '', .26, [s * (BOX_W + .006), .45, -1.32], s * Math.PI / 2);
  addGun(P);
  P.muzzleZ = F.muzzleZ - F.trunnionZ;
  P.topY = .85;   // the commander's sight head (profiles/t80uX.ts commanderSightHead: 2.3999 at the yaw datum)
}

export const OBJECT292_X_PROFILES = { object292: { build: buildObject292X } } as const;
