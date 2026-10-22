// Type 10 (Dozer): the JGSDF ドーザ装置 (dozer kit) on the production Type 10 hull (buildType10DozerBase, modern3.ts).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md). No source model; the kit follows the JGSDF arrangement:
// a full-width moldboard on two push arms pinned to clevises on the lower bow plate, raised and lowered by two
// hydraulic rams that the crew works from inside (hoses run through the bow plate). It lifts and lowers only; it
// cannot angle or tilt.
//
// One rigid assembly (moldboard, back rails, brackets and push arms) turns about the hinge axis. The battle and Garage
// build carries it STOWED: cutting edge 45 cm up, every vertex over the 0.374 m belly line (coordinator ruling
// 2026-10-16, "nothing below the belly line"), the blade's top 1.24 m, 0.2 m under the 120 mm gun at its 10 degree
// stop across the whole front arc. LOWERED (edge 4 cm off the ground) is a presentation pose only:
// spec.visual.dozerBlade = 'lowered' before the build.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KIT, orientedSlab } from './kit.ts';

export type Type10DozerPose = 'stowed' | 'lowered';

interface Type10DozerPort {
  readonly q?: boolean;
  readonly hullG: THREE.Group;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

// ---- hull datums (buildType10Native2026, hull frame) -------------------------------------------------------------
// Lower bow plate: (y 0.462, z 3.19) to (y 0.935, z 3.586) across |x| <= 0.946; outward normal forward and down.
const LOWER_PLATE = { y0: 0.462, z0: 3.19, y1: 0.935, z1: 3.586 } as const;
// Upper beak plate: (y 1.5015, z 3.168) to (y 1.0505, z 3.74) across |x| <= 0.946; outward normal up and forward.
const BEAK_PLATE = { y0: 1.5015, z0: 3.168, y1: 1.0505, z1: 3.74 } as const;

interface PlateFrame {
  /** Hull [y, z] of the plate surface at its own height y (lower plate) or station z (beak). */
  at(t: number): [number, number];
  /** Outward unit normal [ny, nz]. */
  readonly n: [number, number];
}

function lowerPlate(): PlateFrame {
  const { y0, z0, y1, z1 } = LOWER_PLATE;
  const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz);
  return { at: (y) => [y, z0 + (y - y0) * dz / dy], n: [-dz / len, dy / len] };
}

function beakPlate(): PlateFrame {
  const { y0, z0, y1, z1 } = BEAK_PLATE;
  const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz);
  return { at: (z) => [y0 + (z - z0) * dy / dz, z], n: [dz / len, -dy / len] };
}

// ---- the kit's own datums -----------------------------------------------------------------------------------------
const ARM_X = 0.62;                 // push-arm centres, inside the 1.076 track bands and the 0.946 bow plate
const RAM_X = 0.40;                 // ram centres, between the 0.242 prow and the 0.67 tow eyes
const BLADE_HALF_W = 1.62;          // moldboard x +-1.62; end plates carry it to +-1.645 (track bands end 1.592)
const BLADE_H = 0.84;               // moldboard height along its own face
const PLATE_T = 0.032;              // moldboard plate
const STOWED_LEAN = 16 * Math.PI / 180; // the raised blade tips back toward the bow
const STOWED_EDGE: [number, number] = [0.45, 4.30];  // [y, z] of the cutting-edge datum, stowed
const LOWERED_EDGE_Y = 0.04;        // the cutting edge just off the ground, lowered
const HINGE_FACE_Y = 0.56;          // the arm clevis sits on the bow plate at this height (its pad clears the plate's foot)
const HINGE_OUT = 0.065;            // pin centre off the plate
const RAM_FACE_Z = 3.40;            // the ram clevis sits on the beak plate at this station
const RAM_OUT = 0.15;               // a raised clevis pedestal: the lowered rams pass 3 cm over the beak shoulders
const ARM_PIN: [number, number] = [0.15, -0.285];   // [u, w] blade-local: the push-arm pin behind the lower rail
const RAM_PIN: [number, number] = [0.70, -0.20];    // [u, w] blade-local: the ram eye behind the top rail
const BARREL_START = 0.08;          // the barrel begins past the clevis cheeks (a 35 mm neck runs between them)
const BARREL_LEN = 0.46;            // barrel end, from the base pin; stroke 0.34 m between the poses
const ROD_LEN = 0.50;               // eye pin to piston: still 6 cm inside the barrel at full extension

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
  const lp = lowerPlate();
  const [fy, fz] = lp.at(HINGE_FACE_Y);
  const hinge = { y: fy + lp.n[0] * HINGE_OUT, z: fz + lp.n[1] * HINGE_OUT };
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
  const lp = lowerPlate(), bp = beakPlate();
  const hinge = new THREE.Vector3(0, frame.hinge.y, frame.hinge.z);
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
    // hull clevis: a pad welded to the bow plate and two cheeks carrying the pin
    P.add('hullEquipment', pad(lp, HINGE_FACE_Y, 0.17, x - 0.14, x + 0.14, 0.022));
    for (const o of [-1, 1]) P.add('hullEquipment', cheek(lp, HINGE_FACE_Y, 0.15, HINGE_OUT + 0.05, x + o * 0.0675, 0.025));
  }

  // ---- hydraulic rams: clevis on the beak plate -> eye behind the blade's top rail ------------------------------------
  const [rfy, rfz] = bp.at(RAM_FACE_Z);
  for (const s of [-1, 1]) {
    const x = s * RAM_X;
    const base = new THREE.Vector3(x, rfy + bp.n[0] * RAM_OUT, rfz + bp.n[1] * RAM_OUT);
    const eye = local(M, x, RAM_PIN[0], RAM_PIN[1]);
    const dir = new THREE.Vector3().subVectors(eye, base).normalize();
    const along = (t: number): THREE.Vector3 => base.clone().addScaledVector(dir, t);
    P.add('hullEquipment', pad(bp, RAM_FACE_Z, 0.19, x - 0.10, x + 0.10, 0.020));
    for (const o of [-1, 1]) P.add('hullEquipment', cheek(bp, RAM_FACE_Z, 0.16, RAM_OUT + 0.045, x + o * 0.0525, 0.025));
    const length = base.distanceTo(eye);
    P.add('hullEquipment', cylX(0.050, 0.075, 16), x, base.y, base.z);             // barrel trunnion eye
    P.add('hullEquipment', strut(0.035, along(0.03), along(BARREL_START + 0.02), 12)); // neck between the cheeks
    P.add('hullEquipment', strut(0.056, along(BARREL_START), along(BARREL_LEN), q ? 18 : 12)); // barrel
    P.add('hullDark', strut(0.060, along(BARREL_START), along(BARREL_START + 0.025), q ? 18 : 12)); // end cap
    P.add('hullDark', strut(0.062, along(BARREL_LEN - 0.035), along(BARREL_LEN), q ? 18 : 12)); // gland nut
    P.add('hullDark', strut(0.030, along(Math.max(length - ROD_LEN, BARREL_START + 0.03)),
      eye.clone().addScaledVector(dir, -0.03), 12));                                // rod
    P.add('hullDark', cylX(0.042, 0.075, 14), x, eye.y, eye.z);                    // rod eye
    for (const at of [base, eye]) {
      P.add('hullDark', cylX(0.022, 0.155, 10), x, at.y, at.z);                   // pins
      for (const o of [-1, 1]) P.add('hullDark', cylX(0.036, 0.010, 12), x + o * 0.068, at.y, at.z);
    }
    if (q) {
      // two hoses from bulkhead fittings in the beak plate (outboard of the clevis) to elbow ports on the barrel: each
      // leaves its fitting square to the plate and enters its port square to the barrel (one smooth S, no free end)
      const side = new THREE.Vector3(s, 0, 0);
      const n = new THREE.Vector3(0, bp.n[0], bp.n[1]);
      for (const [fz, portT] of [[RAM_FACE_Z - 0.05, BARREL_START + 0.05], [RAM_FACE_Z + 0.07, BARREL_LEN - 0.08]] as const) {
        const [fy, fzz] = bp.at(fz);
        const fit = new THREE.Vector3(x + s * 0.16, fy, fzz);
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
  // equipment, so the hull number stays on the stern plate and the turret carries the tactical number.

  P.hullG.userData.type10DozerReceipt = {
    pose,
    hinge: [frame.hinge.y, frame.hinge.z],
    liftDeg: frame.liftDeg,
    edge: local(M, 0, 0, 0).toArray(),
    top: local(M, 0, BLADE_H, face(BLADE_H)).toArray(),
  };
}
