// Type 10 (Dozer): the JGSDF ドーザ装置 (dozer kit) on the modern Type 10 (type10X.ts; owner 2026-10-22).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md). No source model; the kit follows the JGSDF arrangement:
// a full-width moldboard on two push arms pinned to clevises on the lower bow, raised and lowered by two hydraulic rams
// that the crew works from inside (hoses run through the bow plate). It lifts and lowers only; it cannot angle or tilt.
//
// One rigid assembly (moldboard, back rails, brackets and push arms) turns about the hinge axis. The battle and Garage
// build carries it STOWED: tipped back 32 degrees, cutting edge 0.52 m up, every vertex over the hull's 0.393 m floor
// (coordinator ruling 2026-10-16, "nothing below the belly line"), the blade's top under the 120 mm gun at its
// 10 degree stop across the whole front arc. LOWERED (edge 4 cm off the ground, the blade near upright) is a
// presentation pose only: spec.visual.dozerBlade = 'lowered' before the build.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KIT, orientedSlab } from './kit.ts';
import { reserveDecorVolume } from './fieldChest.ts';
import { TYPE10_X_BOW_SECTIONS } from './type10X.ts';
import { TYPE10_X_BOW_LINK_W, TYPE10_X_BOW_LINK_XS } from './type10XBow.ts';

export type Type10DozerPose = 'stowed' | 'lowered';

interface Type10DozerPort {
  readonly q?: boolean;
  readonly hullG: THREE.Group;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

// ---- hull datums (type10X.ts, hull frame) ---------------------------------------------------------------------------
// The lower bow is two planes, floor to floor between the tub's bow stations: plate A rises from the belly at
// z 2.90 to the crease at y 0.72, plate B from the crease to the nose (y 1.146, z 3.615), across |x| <= 0.875. Both
// face forward and down. Plate B carries the spare links (type10XBow.ts); the tow eyes stand off it between the pairs.
// Over the nose the beak falls to the roof; the 120 mm gun at its 10 degree stop sweeps 0.15-0.25 m over it, so no ram
// seat fits up there that the lowered rams would not drive through the nose. The arms pin on plate A and the rams seat
// on plate B, between the link pairs, just under the nose.
const [[zA0, , yA0], [zA1, , yA1], [zB0, , yB0], [zB1, , yB1]] = TYPE10_X_BOW_SECTIONS;

interface PlateFrame {
  /** Hull [y, z] of the plate surface `s` metres up the plate from its foot. */
  at(s: number): [number, number];
  /** How far up the plate (metres from its foot) it reaches height y. */
  sAt(y: number): number;
  /** Outward unit normal [ny, nz]: forward and down. */
  readonly n: [number, number];
}

function floorPlate(y0: number, z0: number, y1: number, z1: number): PlateFrame {
  const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz);
  return { at: (s) => [y0 + s * dy / len, z0 + s * dz / len], sAt: (y) => (y - y0) * len / dy, n: [-dz / len, dy / len] };
}

const PLATE_A = floorPlate(yA0, zA0, yA1, zA1);
const PLATE_B = floorPlate(yB0, zB0, yB1, zB1);

// ---- the kit's own datums -----------------------------------------------------------------------------------------
const ARM_X = 0.67;                 // push-arm centres, midway between the tow eyes (x 0.466) and the tub's flank (0.875)
// ram centres, midway between the inner and outer spare-link pairs (0.351 | 0.573): over the tow eyes, under the nose
const RAM_X = (TYPE10_X_BOW_LINK_XS[2] + TYPE10_X_BOW_LINK_XS[3]) / 2;
const RAM_PAD_HALF_W = (TYPE10_X_BOW_LINK_XS[3] - TYPE10_X_BOW_LINK_XS[2] - TYPE10_X_BOW_LINK_W) / 2 - 0.026;
const BLADE_HALF_W = 1.62;          // moldboard x +-1.62; end plates carry it to +-1.645 (track bands end 1.518)
const BLADE_H = 0.84;               // moldboard height along its own face
const PLATE_T = 0.032;              // moldboard plate
const STOWED_LEAN = 32 * Math.PI / 180; // the raised blade tips back toward the bow; lowered it stands 10 degrees back
const STOWED_EDGE: [number, number] = [0.52, 4.50];  // [y, z] of the cutting-edge datum, stowed
const LOWERED_EDGE_Y = 0.04;        // the cutting edge just off the ground, lowered
const HINGE_S = PLATE_A.sAt(0.62);  // the arm clevis on plate A, its pad clear of the plate's foot and of the crease
const HINGE_OUT = 0.065;            // pin centre off the plate
const HINGE_PAD = 0.22;             // clevis pad and cheeks along the plate
const HINGE_CHEEK = 0.195;
const RAM_S = PLATE_B.sAt(0.98);    // the ram clevis on plate B, its pad clear of the tow eyes below
const RAM_OUT = 0.065;              // pin centre off the plate: the barrel eye clears it
const RAM_PAD = 0.24;
const RAM_CHEEK = 0.205;
const ARM_PIN: [number, number] = [0.15, -0.285];   // [u, w] blade-local: the push-arm pin behind the lower rail
const RAM_PIN: [number, number] = [0.70, -0.20];    // [u, w] blade-local: the ram eye behind the top rail
const BARREL_START = 0.08;          // the barrel begins past the clevis cheeks (a 35 mm neck runs between them)
const ROD_SHOWS = 0.10;             // stowed, the barrel ends this far short of the eye pin (the rod and its eye show)
const ROD_OVERLAP = 0.06;           // lowered, the rod's piston stays this far inside the barrel

/** The moldboard's concave front face: w (forward) at height u up the blade. The lip curls forward at the top. */
const face = (u: number): number => -0.10 * (1 - ((u - 0.40) / 0.42) ** 2);
const back = (u: number): number => face(u) - PLATE_T;

function samples(u0: number, u1: number, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => u0 + (u1 - u0) * i / n);
}

/** A closed (w, u) profile extruded across x0..x1, in blade-local space (X lateral, Y = u up the blade, Z = w forward). */
function extrudeAcross(profile: readonly [number, number][], x0: number, x1: number, smooth = false): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([w, u]) => new THREE.Vector2(w, u)));
  const depth = x1 - x0;
  let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);                       // shape x (w) -> +Z, extrusion -> X
  g.translate((x0 + x1) / 2, 0, 0);
  if (smooth) g = toCreasedNormals(g, Math.PI / 7);
  return g;
}

/** A plate whose (w, u) outline is extruded `t` thick, centred on x. */
const plateAt = (profile: readonly [number, number][], x: number, t: number): THREE.BufferGeometry =>
  extrudeAcross(profile, x - t / 2, x + t / 2);

interface Rail { readonly u0: number; readonly u1: number; readonly depth: number }
const RAILS: readonly Rail[] = [
  { u0: 0.745, u1: 0.84, depth: 0.085 },        // top rail
  { u0: 0.44, u1: 0.52, depth: 0.06 },          // mid rail
  { u0: 0.12, u1: 0.25, depth: 0.11 },          // bottom rail, the push-arm load path
];
const railPlane = (r: Rail): number => Math.min(...samples(r.u0, r.u1, 6).map(back)) - r.depth;

/** Moldboard and its three back rails as one closed section: rails sit on the plate's own back, no seam. */
function moldboardProfile(): [number, number][] {
  const out: [number, number][] = samples(0.10, BLADE_H, 14).map((u) => [face(u), u]);
  const [top, mid, low] = RAILS;
  const wTop = railPlane(top), wMid = railPlane(mid), wLow = railPlane(low);
  out.push([wTop, BLADE_H], [wTop, top.u0]);
  for (const u of samples(top.u0, mid.u1, 6)) out.push([back(u), u]);
  out.push([wMid, mid.u1], [wMid, mid.u0]);
  for (const u of samples(mid.u0, low.u1, 5)) out.push([back(u), u]);
  out.push([wLow, low.u1], [wLow, low.u0], [back(0.10), 0.10]);
  return out;
}

/** Bolted cutting edge: 8 mm proud of the face and 8 mm deeper than the plate, chamfered at the toe. */
function edgeProfile(): [number, number][] {
  const front = samples(0.02, 0.13, 4).map((u): [number, number] => [face(u) + 0.008, u]);
  const rear = samples(0.13, 0, 4).map((u): [number, number] => [face(u) - 0.040, u]);
  return [[face(0) - 0.012, 0], ...front, ...rear];
}

/** Bracket and rib plates: their front edge rides 4 mm inside the plate back (face - 0.028) over u0..u1. */
const ribFront = (u0: number, u1: number): [number, number][] => samples(u0, u1, 8).map((u) => [face(u) - 0.028, u]);

export interface Type10DozerDatums {
  readonly pose: Type10DozerPose;
  readonly hinge: Readonly<{ y: number; z: number }>;
  readonly liftDeg: number;
  readonly matrix: THREE.Matrix4;
}

/** The blade-local -> hull matrix for a pose, with the hinge and the lift angle. */
export function type10DozerFrame(pose: Type10DozerPose): Type10DozerDatums {
  const [fy, fz] = PLATE_A.at(HINGE_S);
  const hinge = { y: fy + PLATE_A.n[0] * HINGE_OUT, z: fz + PLATE_A.n[1] * HINGE_OUT };
  const stowed = new THREE.Matrix4().compose(new THREE.Vector3(0, STOWED_EDGE[0], STOWED_EDGE[1]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-STOWED_LEAN, 0, 0)), new THREE.Vector3(1, 1, 1));
  // Lowering turns the rigid assembly forward-down about the hinge (+x rotation) until the edge datum reaches
  // LOWERED_EDGE_Y: solve on the edge datum's circle about the hinge.
  const ey = STOWED_EDGE[0] - hinge.y, ez = STOWED_EDGE[1] - hinge.z, r = Math.hypot(ey, ez);
  const lift = Math.atan2(ey, ez) - Math.asin((LOWERED_EDGE_Y - hinge.y) / r);
  const angle = pose === 'lowered' ? lift : 0;
  const about = new THREE.Matrix4().makeTranslation(0, hinge.y, hinge.z)
    .multiply(new THREE.Matrix4().makeRotationX(angle))
    .multiply(new THREE.Matrix4().makeTranslation(0, -hinge.y, -hinge.z));
  return { pose, hinge, liftDeg: lift * 180 / Math.PI, matrix: about.multiply(stowed) };
}

function local(matrix: THREE.Matrix4, x: number, u: number, w: number): THREE.Vector3 {
  return new THREE.Vector3(x, u, w).applyMatrix4(matrix);
}

/** The ram's base pin on plate B (hull frame, x = 0 plane). */
function ramBase(): THREE.Vector3 {
  const [y, z] = PLATE_B.at(RAM_S);
  return new THREE.Vector3(0, y + PLATE_B.n[0] * RAM_OUT, z + PLATE_B.n[1] * RAM_OUT);
}

/** Pin-to-pin ram length in a pose. */
function ramLength(pose: Type10DozerPose): number {
  return ramBase().distanceTo(local(type10DozerFrame(pose).matrix, 0, RAM_PIN[0], RAM_PIN[1]));
}

/** A cylinder along the hull-frame segment a -> b (both in the x = const plane). */
function strut(radius: number, a: THREE.Vector3, b: THREE.Vector3, segments: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = KIT.cylY(radius, radius, d.length(), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const c = a.clone().add(b).multiplyScalar(0.5);
  g.translate(c.x, c.y, c.z);
  return g;
}

/** A clevis cheek on a plate: a slab from the plate (out 0) to `out`, `span` along the plate, `t` thick. */
function cheek(
  plate: PlateFrame, along: number, span: number, out: number, x: number, t: number, outerSpan = span * 0.72,
): THREE.BufferGeometry {
  const a = plate.at(along - span / 2), b = plate.at(along + span / 2);
  const ta = plate.at(along - outerSpan / 2), tb = plate.at(along + outerSpan / 2);
  const [ny, nz] = plate.n;
  const embed = -0.004;
  const p = (pt: [number, number], o: number, xx: number): number[] => [xx, pt[0] + ny * o, pt[1] + nz * o];
  const x0 = x - t / 2, x1 = x + t / 2;
  return orientedSlab(
    p(a, embed, x0), p(a, embed, x1), p(b, embed, x1), p(b, embed, x0),
    p(ta, out, x0), p(ta, out, x1), p(tb, out, x1), p(tb, out, x0),
  );
}

/** A base pad laid on a plate: `span` along it, x0..x1 wide, `t` proud. */
function pad(plate: PlateFrame, along: number, span: number, x0: number, x1: number, t: number): THREE.BufferGeometry {
  return cheek(plate, along, span, t, (x0 + x1) / 2, x1 - x0, span);
}

export function addType10DozerKit(P: Type10DozerPort, pose: Type10DozerPose = 'stowed'): void {
  const { box, cylX } = KIT;
  const q = P.q !== false;
  const frame = type10DozerFrame(pose);
  const M = frame.matrix;
  const lp = PLATE_A, bp = PLATE_B;
  const hinge = new THREE.Vector3(0, frame.hinge.y, frame.hinge.z);
  // the rams' barrel and rod follow the seats: the barrel ends ROD_SHOWS short of the eye stowed, and the rod keeps
  // ROD_OVERLAP inside the barrel lowered
  const barrelLen = ramLength('stowed') - ROD_SHOWS;
  const rodLen = ramLength('lowered') - barrelLen + ROD_OVERLAP;
  const posed = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.applyMatrix4(M);

  // ---- moldboard, cutting edge, end plates ------------------------------------------------------------------------
  P.add('hullEquipment', posed(extrudeAcross(moldboardProfile(), -BLADE_HALF_W, BLADE_HALF_W, true)));
  P.add('hullDark', posed(extrudeAcross(edgeProfile(), -BLADE_HALF_W + 0.01, BLADE_HALF_W - 0.01)));
  const endPlate: [number, number][] = [
    ...samples(0, 0.86, 10).map((u): [number, number] => [face(u) + 0.014, u]),
    [-0.14, 0.86], [-0.27, 0.16], [-0.12, 0],
  ];
  for (const s of [-1, 1]) P.add('hullEquipment', posed(plateAt(endPlate, s * (BLADE_HALF_W + 0.010), 0.030)));
  // hardened end bits on the edge's outer corners
  const endBit: [number, number][] = [[face(0) - 0.012, 0], [face(0.02) + 0.014, 0.02], [face(0.16) + 0.014, 0.16],
    [face(0.16) - 0.044, 0.16], [face(0) - 0.044, 0]];
  for (const s of [-1, 1]) P.add('hullDark', posed(extrudeAcross(endBit,
    s > 0 ? BLADE_HALF_W - 0.17 : -BLADE_HALF_W + 0.005, s > 0 ? BLADE_HALF_W - 0.005 : -BLADE_HALF_W + 0.17)));
  if (q) {
    for (let k = 0; k < 14; k++) {
      const x = -1.30 + k * 0.20;
      const u = 0.065, n = face(u) + 0.008;
      const at = local(M, x, u, n);
      const dir = local(M, x, u, n + 1).sub(at);
      const bolt = KIT.cylY(0.016, 0.016, 0.012, 8);
      bolt.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      bolt.translate(at.x, at.y, at.z);
      P.add('hullDark', bolt);                                                   // plough bolts, heads 2 mm proud
    }
  }

  // ---- back structure: ribs, the arm brackets, the ram brackets ----------------------------------------------------
  const rib: [number, number][] = [...ribFront(0.06, BLADE_H), [-0.175, BLADE_H], [-0.26, 0.20], [-0.14, 0.06]];
  for (const s of [-1, 1]) P.add('hullEquipment', posed(plateAt(rib, s * 1.15, 0.025)));
  const armBracket: [number, number][] = [...ribFront(0.06, 0.60), [back(0.60) - 0.06, 0.60], [-0.25, 0.34],
    [-0.345, 0.17], [-0.33, 0.08], [-0.20, 0.04], [face(0.04) - 0.028, 0.04]];
  const ramBracket: [number, number][] = [...ribFront(0.56, BLADE_H), [-0.16, BLADE_H], [-0.255, 0.74],
    [-0.255, 0.64], [-0.19, 0.56]];
  for (const s of [-1, 1]) {
    for (const o of [-1, 1]) {
      P.add('hullEquipment', posed(plateAt(armBracket, s * ARM_X + o * 0.0675, 0.025)));
      P.add('hullEquipment', posed(plateAt(ramBracket, s * RAM_X + o * 0.0525, 0.022)));
    }
  }

  // ---- push arms: box beams from the hull clevis pin to the blade's arm pin -----------------------------------------
  for (const s of [-1, 1]) {
    const x = s * ARM_X;
    const pin = local(M, x, ARM_PIN[0], ARM_PIN[1]);
    const h = new THREE.Vector3(x, hinge.y, hinge.z);
    const d = new THREE.Vector3().subVectors(pin, h);
    const len = d.length();
    P.add('hullEquipment', box(0.10, 0.16, len), x, (h.y + pin.y) / 2, (h.z + pin.z) / 2, -Math.atan2(d.y, d.z), 0, 0);
    P.add('hullEquipment', cylX(0.062, 0.10, 16), x, h.y, h.z);                    // arm eye on the hull pin
    P.add('hullEquipment', cylX(0.058, 0.10, 16), x, pin.y, pin.z);                // arm eye on the blade pin
    for (const at of [h, pin]) {
      P.add('hullDark', cylX(0.026, 0.19, 10), x, at.y, at.z);                    // pins through both cheeks
      for (const o of [-1, 1]) P.add('hullDark', cylX(0.044, 0.012, 12), x + o * 0.086, at.y, at.z); // retaining bosses
    }
    // hull clevis: a pad welded to plate A and two cheeks carrying the pin
    P.add('hullEquipment', pad(lp, HINGE_S, HINGE_PAD, x - 0.14, x + 0.14, 0.022));
    for (const o of [-1, 1]) P.add('hullEquipment', cheek(lp, HINGE_S, HINGE_CHEEK, HINGE_OUT + 0.05, x + o * 0.0675, 0.025));
  }

  // ---- hydraulic rams: clevis on plate B, between the link pairs -> eye behind the blade's top rail -------------------
  for (const s of [-1, 1]) {
    const x = s * RAM_X;
    const base = ramBase().setX(x);
    const eye = local(M, x, RAM_PIN[0], RAM_PIN[1]);
    const dir = new THREE.Vector3().subVectors(eye, base).normalize();
    const along = (t: number): THREE.Vector3 => base.clone().addScaledVector(dir, t);
    P.add('hullEquipment', pad(bp, RAM_S, RAM_PAD, x - RAM_PAD_HALF_W, x + RAM_PAD_HALF_W, 0.020));
    for (const o of [-1, 1]) P.add('hullEquipment', cheek(bp, RAM_S, RAM_CHEEK, RAM_OUT + 0.045, x + o * 0.0525, 0.025));
    const length = base.distanceTo(eye);
    P.add('hullEquipment', cylX(0.050, 0.075, 16), x, base.y, base.z);             // barrel trunnion eye
    P.add('hullEquipment', strut(0.035, along(0.03), along(BARREL_START + 0.02), 12)); // neck between the cheeks
    P.add('hullEquipment', strut(0.056, along(BARREL_START), along(barrelLen), q ? 18 : 12)); // barrel
    P.add('hullDark', strut(0.060, along(BARREL_START), along(BARREL_START + 0.025), q ? 18 : 12)); // end cap
    P.add('hullDark', strut(0.062, along(barrelLen - 0.035), along(barrelLen), q ? 18 : 12)); // gland nut
    P.add('hullDark', strut(0.030, along(Math.max(length - rodLen, BARREL_START + 0.03)),
      eye.clone().addScaledVector(dir, -0.03), 12));                                // rod
    P.add('hullDark', cylX(0.042, 0.075, 14), x, eye.y, eye.z);                    // rod eye
    for (const at of [base, eye]) {
      P.add('hullDark', cylX(0.022, 0.155, 10), x, at.y, at.z);                   // pins
      for (const o of [-1, 1]) P.add('hullDark', cylX(0.036, 0.010, 12), x + o * 0.068, at.y, at.z);
    }
    if (q) {
      // two hoses from bulkhead fittings in plate B (over the clevis pad, inboard and outboard) to elbow ports on the
      // barrel's two sides: each leaves its fitting square to the plate and enters its port square to the barrel (one
      // smooth S, no free end)
      const n = new THREE.Vector3(0, bp.n[0], bp.n[1]);
      for (const [o, portT] of [[-1, BARREL_START + 0.05], [1, barrelLen - 0.08]] as const) {
        const side = new THREE.Vector3(s * o, 0, 0);
        const [fy, fzz] = bp.at(RAM_S + RAM_PAD / 2 + 0.04);
        const fit = new THREE.Vector3(x + s * o * 0.04, fy, fzz);
        P.add('hullDark', strut(0.028, fit.clone().addScaledVector(n, -0.004), fit.clone().addScaledVector(n, 0.022), 6)); // bulkhead nut
        P.add('hullDark', strut(0.016, fit.clone().addScaledVector(n, 0.02), fit.clone().addScaledVector(n, 0.065), 10)); // nipple
        const axis = along(portT);
        P.add('hullDark', strut(0.020, axis.clone().addScaledVector(side, 0.040), axis.clone().addScaledVector(side, 0.082), 10)); // port elbow
        const start = fit.clone().addScaledVector(n, 0.06);
        const end = axis.clone().addScaledVector(side, 0.078);
        const curve = new THREE.CatmullRomCurve3([start, start.clone().addScaledVector(n, 0.05),
          end.clone().addScaledVector(side, 0.06), end], false, 'centripetal');
        P.add('hullRubber', new THREE.TubeGeometry(curve, 16, 0.012, 7, false));
      }
    }
  }

  // No plate on the blade: marking seats are armour-only (vehicleMarkingSeating.ts markingArmorMeshes) and the kit is
  // equipment, so the turret carries the tactical number.

  // The bow is the kit's: the decor keeps its shackles and chain off the blade and the clevises (fieldChest.ts). One
  // volume for the blade assembly, one for the clevises and rams on the lower bow, in this pose.
  const blade = new THREE.Box3();
  for (const x of [-BLADE_HALF_W - 0.04, BLADE_HALF_W + 0.04]) {
    for (const u of [-0.02, BLADE_H + 0.04]) for (const w of [-0.36, 0.03]) blade.expandByPoint(local(M, x, u, w));
  }
  const mounts = new THREE.Box3();
  for (const [plate, s0, s1, out, half] of [[lp, HINGE_S - HINGE_PAD / 2, HINGE_S + HINGE_PAD / 2, HINGE_OUT + 0.07, ARM_X + 0.15],
    [bp, RAM_S - RAM_PAD / 2, RAM_S + RAM_PAD / 2 + 0.07, RAM_OUT + 0.07, RAM_X + 0.10]] as const) {
    for (const t of [s0, s1]) for (const o of [0, out]) {
      const [y, z] = plate.at(t);
      for (const x of [-half, half]) mounts.expandByPoint(new THREE.Vector3(x, y + plate.n[0] * o, z + plate.n[1] * o));
    }
  }
  for (const v of [blade, mounts]) reserveDecorVolume(P.hullG, v.min.toArray(), v.max.toArray());

  P.hullG.userData.type10DozerReceipt = {
    pose,
    hinge: [frame.hinge.y, frame.hinge.z],
    liftDeg: frame.liftDeg,
    edge: local(M, 0, 0, 0).toArray(),
    top: local(M, 0, BLADE_H, face(BLADE_H)).toArray(),
    ram: [ramLength('stowed'), ramLength('lowered')],
  };
}
