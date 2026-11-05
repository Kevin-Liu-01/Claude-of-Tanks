// The Object 292 (release 269; owner 2026-11-04, "object 292 for a full line of 152 mm variant tanks"; DECISIONS
// "2026-11-04 Russian 152 mm line"): VNIITransmash and the Kirov Plant's 1990 trials tank, one built, kept at Kubinka.
// Owner 2026-11-04 ("use our proper tank generation procedure and dont use the old t80 hull only use modern new hulls like
// the nnew t80 x hulll"): it is built on the T-80U X hull and casting (profiles/t80uX.ts), by recipe reuse at that build's
// own datums, with no legacy T-80 builder. Owner 2026-11-05 ("the object 292 turret needs to be based off off the t80U
// turret as weell with its bigger gun", "make the hulls much beter"): the T-80U X casting is the turret and reads as one
// (Kubinka's tank keeps the T-80's round cast turret plain at the front): the two square steel weight-imitator blocks
// stand on its cheeks either side of the gun, each a chain of welded slabs following the casting's flank; the roof sights,
// the commander's cupola and the gunner's hatch stand on the casting; a separate flat-sided welded box narrower than the
// casting sits on its rear half and overhangs the engine deck, its underside rising to the stern; the LP-83 leaves the
// embrasure in a fat cradle drum. The hull is the T-80U X base without its Kontakt-5, with Kubinka's own fit: the
// Kontakt-1 stud field with no bricks, the headlights in their guards, the tow hooks and cables, rubber side skirts
// following the apron and fender (owner 2026-11-05: "properly match sideskirts to hull side profiles"), rubber flaps draped
// over the fender noses and hung at the stern, and the stern grille. First-party procedural geometry: Kevin B. Liu
// (NOTICE.md); photographs and sources in docs/references/photos/russia-152-20261104.json, the run packet in
// docs/references/tanks/object292.md.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { buildT80UXCasting, buildT80UXHullBase, T80U_X_TRUNNION, T80U_X_YAW } from './t80uX.ts';
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

/** The glacis' fit, the T-80BV pattern Kubinka keeps: the Kontakt-1 mounting studs with no bricks in staggered rows across
 * the plate (standing along its normal, clear of the headlights, the hooks and the cables), the headlights in their hoop
 * guards, the splash board under the turret, the tow hooks at the plate's foot and the two tow cables run from them up
 * past the headlights to the fenders' corners. Hull frame. */
function addGlacis(P: TankBuilderPort): void {
  const stud = cylY(.026, .030, .052, 6), clear = (x: number, z: number) => {
    const ax = Math.abs(x);
    if (Math.hypot(ax - .8475, z - 2.62) < .19 || Math.hypot(ax - TOW_HOOK_X, z - TOW_HOOK_Z) < .14) return false;
    if (z < 2.06 && ax < .46) return false;                                       // the splash board
    return cablePath(1).every(([cx, , cz]) => Math.hypot(ax - cx, z - cz) > .075);
  };
  for (let row = 0; row < 7; row++) {
    const z = 1.97 + row * .148, { y, tilt } = glacisAt(z);
    for (let c = 0; c < 14; c++) {
      const x = -.91 + c * .14 + (row % 2 ? .07 : 0);
      if (Math.abs(x) > .93 || !clear(x, z)) continue;
      P.add('hullDetail', stud.clone(), x, y + .022, z, tilt, 0, 0);
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

/** The T-80U X fender's top (profiles/t80uX.ts fenderShell, sheet .024 thick, outer edge x 1.722) and its side apron
 * ([z, top, foot]; the apron's outer face runs from x 1.685 at its top to 1.80 at its foot). */
const FENDER_TOP: readonly (readonly [number, number])[] = [[-3.36, 1.180], [-2.86, 1.411], [-2.40, 1.451], [-1.20, 1.497],
  [.60, 1.467], [2.40, 1.430], [2.90, 1.414], [3.07, 1.363], [3.20, 1.226], [3.36, .939]];
const APRON: readonly (readonly [number, number, number])[] = [[-2.882, 1.414, .886], [-2.45, 1.458, .815], [-1.22, 1.504, .782],
  [1.75, 1.449, .762], [2.886, 1.418, .782]];
const fenderTop = (z: number) => lerpRows(FENDER_TOP, z, 1), apronFoot = (z: number) => lerpRows(APRON, z, 2);
/** The rubber skirt's run (hull frame z) and its section: its top edge clamped under the fender's outer lip, down the
 * apron's outer face 4 mm proud of it to the apron's foot, then hanging plumb. Its lower edge rises at the nose and the
 * stern after the track. */
const SKIRT_Z0 = -3.10, SKIRT_Z1 = 3.352, SKIRT_TH = .010, SKIRT_TOP_X = 1.700, SKIRT_KNEE_X = 1.804;
function skirtBottom(z: number): number {
  return z > 2.50 ? .50 + (z - 2.50) / (SKIRT_Z1 - 2.50) * .14 : z < -2.55 ? .50 + (-2.55 - z) / (-2.55 - SKIRT_Z0) * .14 : .50;
}
function skirtSection(z: number, s: number): V2[] {
  const top = fenderTop(z) - .022, knee = Math.min(apronFoot(z), top - .06), bottom = skirtBottom(z);
  const ring: V2[] = [[SKIRT_KNEE_X, bottom], [SKIRT_KNEE_X + SKIRT_TH, bottom], [SKIRT_KNEE_X + SKIRT_TH, knee],
    [SKIRT_TOP_X + SKIRT_TH, top], [SKIRT_TOP_X, top], [SKIRT_KNEE_X, knee]];
  return ccw(ring.map(([x, y]) => [s * x, y] as const));
}

/** Kubinka's rubber skirts over the T-80U X apron: eight bolted rubber panels a side from the stern's fender drop to the
 * fender's nose, each clamped under the fender's lip along the whole run and following the apron's face, a row of clamp
 * bolts along their tops; the broad rubber flaps draped over the fenders' noses and down in front of the tracks, closed
 * at the corner into the skirt; the stern's rubber mud flaps hung from the fenders' tails. Hull frame. */
function addRubberSkirts(P: TankBuilderPort): void {
  const n = 8, gap = .008, len = (SKIRT_Z1 - SKIRT_Z0) / n;
  const breaks = [...FENDER_TOP.map((r) => r[0]), ...APRON.map((r) => r[0]), 2.50, -2.55];
  const bolt = cylX(.013, .014, 6);
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const z0 = SKIRT_Z0 + i * len + (i ? gap / 2 : 0), z1 = SKIRT_Z0 + (i + 1) * len - (i < n - 1 ? gap / 2 : 0);
      const zs = [z0, ...breaks.filter((z) => z > z0 + .02 && z < z1 - .02), z1].sort((a, b) => a - b);
      P.addMudguard('object292-rubber-skirt', 'hullRubber', sectionSolid(zs.map((z) => ({ z, ring: skirtSection(z, s) })), { sideQuadDiagonal: 'convex' }));
      // the clamp bolts along the panel's top, on the apron's slope
      for (let k = 0; k < 4; k++) {
        const z = z0 + (k + .5) * (z1 - z0) / 4, top = fenderTop(z) - .022, knee = Math.min(apronFoot(z), top - .06), y = top - .07;
        if (y < knee + .02) continue;
        const x = SKIRT_TOP_X + SKIRT_TH + (SKIRT_KNEE_X - SKIRT_TOP_X) * (top - y) / (top - knee);
        P.addEquipment('hullDetail', bolt.clone(), s * (x + .004), y, z);
      }
    }
    // the front flap over the fender's nose: on the fender's top 1 cm proud, round the nose and down in front of the track
    const nose: V2[] = [[2.84, fenderTop(2.84) + .008], [2.90, fenderTop(2.90) + .008], [3.07, fenderTop(3.07) + .008],
      [3.20, fenderTop(3.20) + .008], [3.30, fenderTop(3.30) + .006], [3.3625, .930], [3.3625, .60]];
    const flap = stripContour(nose, .011);
    P.addMudguard('object292-front-flap', 'hullRubber', loftX(s > 0 ? [{ x: 1.02, ring: flap }, { x: 1.736, ring: flap }]
      : [{ x: -1.736, ring: flap }, { x: -1.02, ring: flap }]));
    P.addMudguard('object292-front-flap', 'hullRubber', box(.072, .30, .011), s * 1.772, .762, 3.3625);   // the corner
    P.addEquipment('hullDetail', box(.70, .018, .028), s * 1.378, fenderTop(2.86) + .02, 2.86);            // its clamp bar
    // the stern's mud flap from the fender's tail, raked back a little
    P.addMudguard('object292-stern-flap', 'hullRubber', box(.66, .38, .012), s * 1.40, .985, -3.335, .12, 0, 0);
    P.addEquipment('hullDetail', box(.68, .03, .03), s * 1.40, 1.165, -3.322);
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

/** The weight-imitator blocks' outer faces in plan (turret frame x, z), front to rear: the front slab square to the gun
 * (its inner face along the gun, the casting's nose standing ahead of it), two along the flank and the rear one turned in
 * to the box's front. Each side its own, 3-9 cm off the casting's flank at its shoulder (the right flank bulges more). */
const BLOCK_PLAN: Record<'L' | 'R', readonly V2[]> = {
  L: [[.46, 1.25], [1.10, 1.03], [1.37, .42], [1.42, -.32], [1.16, -.72]],
  R: [[-.46, 1.25], [-1.16, 1.01], [-1.44, .42], [-1.45, -.32], [-1.16, -.72]],
};
const BLOCK_DEPTH = [.50, .62, .62, .55], BLOCK_Y0 = .08, BLOCK_Y1 = .60;

/** The steel weight-imitator blocks on the casting's cheeks: each a chain of four welded slabs from the gun's side round
 * the cheek and back along the flank (the front one square, its inner face along the gun; the others standing over the
 * dome; their top edges bevelled), with the weld seams at the joints, a bottom flange and lifting eyes. Turret frame. */
function addCheekBlocks(P: TankBuilderPort): void {
  for (const side of ['L', 'R'] as const) {
    const V = BLOCK_PLAN[side], s = side === 'L' ? 1 : -1;
    for (let i = 0; i < 4; i++) {
      const [a, b] = [V[i], V[i + 1]], n = outward(a, b), d = BLOCK_DEPTH[i];
      const bi: V2 = [b[0] - n[0] * d, b[1] - n[1] * d], ai: V2 = i === 0 ? [a[0], a[1] - d] : [a[0] - n[0] * d, a[1] - n[1] * d];
      P.add('turret', blockSlab([a, b, bi, ai], BLOCK_Y0, BLOCK_Y1, .08, .07));
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2 + n[0] * .012, mz = (a[1] + b[1]) / 2 + n[1] * .012;
      P.addEquipment('turretDetail', box(.03, .024, len - .02), mx, BLOCK_Y0 + .012, mz, 0, yaw, 0);   // the bottom flange
      if (i === 2) P.addEquipment('turretDark', box(.016, BLOCK_Y1 - BLOCK_Y0 - .10, .016), mx, (BLOCK_Y0 + BLOCK_Y1 - .07) / 2, mz, 0, yaw, 0);
    }
    for (const k of [1, 2, 3]) P.addEquipment('turretDark', box(.02, BLOCK_Y1 - BLOCK_Y0 - .09, .02), V[k][0], (BLOCK_Y0 + BLOCK_Y1 - .06) / 2, V[k][1]);
    KIT.liftEye(P, 'turretDetail', s * 1.12, BLOCK_Y1, .38, s * .55);
  }
  // the casting's own lifting eyes on its nose beside the gun
  for (const s of [-1, 1]) KIT.liftEye(P, 'turretDetail', s * .30, .345, 1.27, 0);
}

/** The welded box over the casting's rear half (Kubinka: the casting plain ahead of it; the box narrower than the casting,
 * flat-sided, its front bevelled behind the hatches, its underside rising from the casting to the stern and overhanging
 * the engine deck), its roof plate lipped all round, the rear face's middle panel standing proud, the plate seams, grab
 * rails on its flanks, lifting eyes and the loading gear's service hatch. Turret frame. */
const BOX_W = 1.0, BOX_FRONT = -.72, BOX_TAIL = -2.22;
function addBox(P: TankBuilderPort): void {
  const r = BOX_ROOF - .03, c = .045;
  const section = (yb: number, yt: number): V2[] => [[-BOX_W, yb], [BOX_W, yb], [BOX_W, yt - c], [BOX_W - c, yt], [c - BOX_W, yt], [-BOX_W, yt - c]];
  P.add('turret', sectionSolid([
    { z: BOX_TAIL, ring: section(.31, r) }, { z: -1.30, ring: section(.14, r) }, { z: -.86, ring: section(.10, r) },
    { z: BOX_FRONT, ring: section(.10, r - .11) },
  ]));
  P.add('turret', box(2 * BOX_W + .04, .03, BOX_FRONT - BOX_TAIL - .10 + .03), 0, BOX_ROOF - .015, (BOX_TAIL - .03 + BOX_FRONT - .14) / 2);
  P.add('turret', box(.80, .34, .05), 0, .50, BOX_TAIL - .02);                                        // the rear's middle panel
  for (const x of [-.40, .40]) P.addEquipment('turretDark', box(.016, .34, .016), x, .50, BOX_TAIL - .045);
  for (const s of [-1, 1]) {
    // the side plates' seams and the grab rail on three posts
    for (const z of [-1.28, -1.80]) P.addEquipment('turretDark', box(.016, .40, .016), s * (BOX_W + .004), .48 + (z < -1.5 ? .05 : 0), z);
    for (const z of [-1.10, -1.55, -2.00]) P.addEquipment('turretDetail', box(.06, .02, .02), s * (BOX_W + .03), .56, z);
    P.addEquipment('turretDetail', cylZ(.012, 1.0, 8), s * (BOX_W + .055), .56, -1.55);
    KIT.liftEye(P, 'turretDetail', s * .82, BOX_ROOF, -1.02, 0);
    KIT.liftEye(P, 'turretDetail', s * .82, BOX_ROOF, -2.08, 0);
  }
  // the loading gear's service hatch on the box roof, its hinges and grip
  P.addHatch('turret', box(.64, .026, .52), .30, BOX_ROOF + .013, -1.62);
  for (const x of [.08, .52]) P.addEquipment('turretDetail', cylX(.022, .09, 10), x, BOX_ROOF + .022, -1.90);
  P.addEquipment('turretDetail', box(.16, .025, .025), .30, BOX_ROOF + .04, -1.38);
  // the box's ventilator and the antenna bases at its rear corners
  P.add('turret', cylY(.13, .14, .05, 16), -.42, BOX_ROOF + .025, -1.78);
  P.add('turretDark', cylY(.10, .11, .03, 16), -.42, BOX_ROOF + .065, -1.78);
  P.add('turret', cylY(.06, .07, .07, 10), .82, BOX_ROOF + .035, -1.95);
  P.add('turret', cylY(.06, .07, .07, 10), -.82, BOX_ROOF + .035, -1.95);
  const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 1.24, r: 0.011, rake: -0.025, seed: 292 });
  antenna.position.set(.82, BOX_ROOF + .07, -1.95);
  P.turretG.add(antenna);
}

/** The roof on the casting, as the T-80U's: the commander's cupola (right) with his sight and searchlight on its front and
 * periscopes round it, the gunner's hatch (left) and his sight's armoured housing ahead of it with its window to the front,
 * and the ventilator's dome between them. Turret frame. */
function addRoof(P: TankBuilderPort): void {
  const seg = P.q ? 28 : 16;
  // commander's cupola: the race bedded into the sloping roof, the rotating ring, the domed lid and its hinge
  const [cx, cz] = [-.52, -.22];
  P.addCupola('turret', cylY(.355, .37, .11, seg), cx, .565, cz);
  P.addCupola('turret', cylY(.315, .33, .09, seg), cx, .665, cz);
  P.add('turretDark', KIT.torus(.33, .014, seg, 5), cx, .622, cz);
  P.addHatch('turret', cylY(.285, .29, .025, seg), cx, .7225, cz);
  P.addHatch('turret', KIT.sph(.27, seg, Math.PI / 2).scale(1, .15, 1), cx, .735, cz);
  P.addEquipment('turretDetail', cylX(.035, .20, 10), cx, .73, cz - .30);
  for (const a of [-1.15, 1.15, 2.2, -2.2]) KIT.periscope(P, 'turretDetail', cx + .29 * Math.sin(a), .735, cz + .29 * Math.cos(a), a);
  // his sight's head on the cupola's front: the housing, the window, the brow; the searchlight on its right
  P.addModuleVisual('optics', 'turretDetail', box(.22, .17, .20), cx, .79, cz + .25);
  P.addModuleVisual('optics', 'turretDark', box(.16, .075, .014), cx, .80, cz + .355);
  P.addModuleVisual('optics', 'turretGlass', box(.13, .05, .008), cx, .80, cz + .363);
  P.addEquipment('turretDetail', box(.24, .022, .10), cx, .883, cz + .31, .18, 0, 0);
  P.addEquipment('turretDetail', cylZ(.085, .13, 16), cx - .24, .80, cz + .20);
  P.addEquipment('turretDark', cylZ(.068, .012, 16), cx - .24, .80, cz + .27);
  P.addEquipment('turretDetail', box(.05, .09, .05), cx - .24, .73, cz + .20);
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

/** The LP-83 on its cradle: the T-80U X's trunnion block across the embrasure, the cradle's fat root drum out of the
 * casting with its lipped front, a step and a cone down to the tube's thermal sleeve, then the sleeved tube. The drum and
 * its fittings stand proud above the bore, their undersides no lower than the slimmer sleeve's they replace, so the gun
 * keeps its measured depression stops over the deck. Gun frame. */
function addGun(P: TankBuilderPort): void {
  const seg = P.q ? 28 : 14;
  // the T-80U X's own trunnion block (its cheeks at x .222): a cylinder round the pitch axis keeps its envelope at every
  // pitch, so the mount clears the X's deck as the T-80U's does
  P.addGunExtra(cylX(.203, .446, 28), 0, 0, -.004);
  P.addGunExtra(cylZ(.212, .58, seg, .218), 0, .043, .36);          // underside .175 under the bore
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
  buildT80UXHullBase(P);
  addGlacis(P);
  addRubberSkirts(P);
  addStern(P);
  buildT80UXCasting(P);
  addCheekBlocks(P);
  addBox(P);
  addRoof(P);
  for (const s of [-1, 1]) P.decal('turret', 'number', P.spec.visual.number || '', .26, [s * (BOX_W + .006), .45, -1.55], s * Math.PI / 2);
  addGun(P);
  P.muzzleZ = F.muzzleZ - F.trunnionZ;
  P.topY = .89;   // the commander's sight's brow
}

export const OBJECT292_X_PROFILES = { object292: { build: buildObject292X } } as const;
