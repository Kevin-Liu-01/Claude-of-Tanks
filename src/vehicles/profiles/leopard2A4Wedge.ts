// The 2A6-look front for the 2A4s upgraded with the wedge add-on armour (the owner, 2026-10-28: "it should be evenly split
// between the 2a4 squares vs 2a4 modern upgraded variants that look like 2a6s"): our Leopard 2A6 X's measured front
// (leopardA6X.ts) on the 2A4 turret's core: its two cheek wedges with the 2A5 side modules (their measured plan stations
// and roof planes), its long mantlet cover and optical hump, its raised EMES 15 housing and canted window on the roof, the
// PERI R17A2 behind the commander's ring and the fixed sight ahead of it. The 2A6 X's frame is the 2A4 turret's (z as it
// stands, y less the ring's 1.64 m), except ahead of the trunnion: there the front is compressed so the wedge's tip lands
// over the headlight pods on this hull, as on the 2A6 X's own (z' = 1.42 + (z - 1.42) * 0.772; the tip at 3.1427 lands
// at 2.75, hull z 3.12). Wedge, side modules and mantlet cover are the turret's armour; the sights are equipment.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { LEO2A4_TURRET } from '../leopard2A4FamilyArmor.ts';

const T = LEO2A4_TURRET;
const { box, cylY } = KIT;
type Row = readonly [z: number, left: number, right: number, floor: number, roof: number];

/** The 2A6 X's ring height and the compression ahead of its trunnion. */
const A6_Y = T.pivot[1], WARP_FROM = 1.42, A6_TIP = 3.1427, TIP = 2.75;
const WARP = (TIP - WARP_FROM) / (A6_TIP - WARP_FROM);
export const a6WarpZ = (z: number): number => (z <= WARP_FROM ? z : WARP_FROM + (z - WARP_FROM) * WARP);

/** A geometry authored in the 2A6 X's frame, into the turret's (or, with `gun`, the gun's) frame. */
function a6(g: THREE.BufferGeometry, gun = false): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) - (gun ? T.gunLocal[0] : 0), pos.getY(i) - A6_Y - (gun ? T.gunLocal[1] : 0),
      a6WarpZ(pos.getZ(i)) - (gun ? T.gunLocal[2] : 0));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A part authored at a 2A6 X point (its own shape kept). */
function part(P: TankBuilderPort, bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, x, y - A6_Y, a6WarpZ(z), rx, ry, rz);
}

function wall(rows: readonly Row[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z, left, right, floor, roof]) => ({ z,
    ring: [[left, floor], [right, floor], [right, roof], [left, roof]],
  })));
}

/** The 2A6 X's cheek roof planes (its frame). */
function cheekRoof(side: number, x: number, z: number): number {
  if (side > 0) return Math.min(
    (2.41496517 - .02096949 * x - .02873983 * z) / .99936695,
    (3.11507045 - .26781475 * x - .40417141 * z) / .87459747,
    (2.23276603 - .86978401 * x - .03448941 * z) / .49222582);
  return Math.min(
    (2.43833975 + .02484870 * x - .03993549 * z) / .99889324,
    (3.12201470 + .27490637 * x - .41942070 * z) / .86516632,
    (2.31739595 + .86978401 * x - .03448941 * z) / .49222582);
}

/** The 2A6 X's measured plan of one cheek: its outer edge at z (the side module, then the wedge to its tip). */
function cheekPlan(side: number): { inner: number; outerAt: (z: number) => number; turn: number; shoulder: number } {
  const [inner, broad, shoulder] = side > 0 ? [.259, 1.393745, 1.176925] : [.196995, 1.491045, 1.274225];
  const turn = side > 0 ? 1.904985 : 1.833575;
  const outerAt = (z: number): number => {
    if (z <= 1.5634) return broad;
    if (z <= turn) return THREE.MathUtils.lerp(broad, broad - .018, (z - 1.5634) / (turn - 1.5634));
    if (z <= 2.413) return THREE.MathUtils.lerp(broad - .018, shoulder, (z - turn) / (2.413 - turn));
    return THREE.MathUtils.lerp(shoulder, inner + .002, (z - 2.413) / (3.1452 - 2.413));
  };
  return { inner, outerAt, turn, shoulder };
}
const a6Floor = (z: number): number => 1.69774 + Math.max(0, z - 1.905) * .229;

/** One cheek wedge in the 2A6 X's four measured strips (the port strip keeps the EMES floor recessed). */
function cheek(P: TankBuilderPort, side: number): void {
  const plan = cheekPlan(side);
  const stations = [1.095, 1.5634, plan.turn, 2.24, 2.413, 2.616, 3.1427];
  const sections = stations.map((z) => {
    const outer = plan.outerAt(z), shoulderX = Math.min(plan.shoulder, outer - .0003);
    const xs = [plan.inner, Math.min(.4777, outer - .0007), Math.min(.9707, outer - .0005), shoulderX, outer];
    return { z, floor: a6Floor(z), xs };
  });
  for (let strip = 0; strip < 4; strip++) {
    const rows: SolidSection[] = sections.map(({ z, floor, xs }) => {
      const a = xs[strip], b = Math.max(a + .0001, xs[strip + 1]);
      const top = (value: number) => {
        let y = cheekRoof(side, side * value, z);
        if (side < 0 && strip === 1 && z < 2.616) y = Math.min(y, (2.60381611 - .10226206 * value - .15453040 * z) / .98268145);
        return Math.max(floor + .001, y);
      };
      const left = side < 0 ? -b : a, right = side < 0 ? -a : b;
      return { z, ring: [[left, floor], [right, floor], [right, top(Math.abs(right))], [left, top(Math.abs(left))]] };
    });
    P.add('turret', a6(sectionSolid(rows)));
  }
}

/** The raised EMES 15 housing on the roof's right front and its canted window (the 2A6 X's). */
function optic(P: TankBuilderPort): void {
  const top = (x: number, z: number) => Math.min(2.56609, (2.66353118 + .02598410 * x - .07007806 * z) / .99720303);
  const sections: SolidSection[] = [-.981105, -.94, -.80, -.66, -.54, -.468425].map((x) => {
    const back = (1.41226538 + .46021466 * x) / .88780767, front = (1.9494 + .30898084 * x) / .95106826;
    return { z: x, ring: [[-front, 2.270], [-back, 2.30468], [-back, top(x, back)], [-front, top(x, front)]] };
  });
  const body = sectionSolid(sections);
  body.rotateY(Math.PI / 2);
  P.addEquipment('turretDetail', a6(body));
  const cx = -.72, front = 1.822243, y = 2.412, angle = -.314159;
  part(P, 'turretGlass', box(.442, .171, .012), cx + .001854, y, front - .005706, 0, angle);
  for (const dy of [-.099, .099]) part(P, 'turretDetail', box(.49, .040, .08), cx, y + dy, front + .00553, 0, angle);
  for (const dx of [-.237, .237]) {
    part(P, 'turretDetail', box(.024, .235, .08), cx + dx * Math.cos(angle), y, front + .013 - dx * Math.sin(angle), 0, angle);
  }
}

/** The PERI R17A2 behind and left of the commander's ring, and the fixed sight ahead of the ring (the 2A6 X's). */
function commanderSights(P: TankBuilderPort): void {
  part(P, 'turretDetail', box(.31, .1665, .768), -.2776, 2.50, -.7385);
  part(P, 'turretDetail', cylY(.2313, .2313, .16855, P.q ? 32 : 16), -.2776, 2.6646, -.526);
  part(P, 'turretDetail', box(.20414, .1555, .23591), -.2776, 2.82035, -.54275);
  part(P, 'turretGlass', box(.175, .08, .01), -.2776, 2.825, -.416);
  part(P, 'turretDetail', box(.44051, .140, .088), -.6323, 2.497, .373);
  part(P, 'turretDetail', box(.40, .02, .09), -.6323, 2.585, .373, -0.107);
  part(P, 'turretGlass', box(.35195, .05767, .00623), -.6323, 2.613, .342);
}

/**
 * The 2A6 X's long mantlet cover over the gun's root (pitch-owned), its offset optical hump and its fittings, in the gun's
 * frame (the 2A6 X's trunnion is the 2A4 turret's).
 */
function mantletCover(P: TankBuilderPort): void {
  // the cover's underside rises toward its back inside the turret (the 2A6 X's runs level to z 1.08), so at full
  // elevation it keeps clear of the hull's ring on the 2A4's deeper trunnion
  const stations = [[1.076785, 1.815, 2.32568], [1.170095, 1.785, 2.37004], [1.33, 1.71535, 2.37004],
    [1.707855, 1.71535, 2.37004],
    [1.740935, 1.71535, 2.35304], [1.776495, 1.71535, 2.37004], [2.448, 1.71535, 2.32709], [2.478895, 1.72866, 2.32512],
    [2.70, 1.824, 2.22513], [3.146975, 1.983, 2.02298]];
  P.add('gunMount', a6(wall(stations.map(([z, floor, roof]) => [z, -.191385, .251975, floor, roof] as Row)), true));
  const hump = [[1.528005, 2.370, 2.403], [1.605675, 2.370, 2.498], [1.705215, 2.370, 2.50433], [1.779545, 2.359, 2.44272],
    [1.935855, 2.34915, 2.42330]];
  P.add('gunMount', a6(sectionSolid(hump.map(([z, bottom, top]) => ({ z, ring: [
    [-.144745, bottom], [.025375, bottom], [.019835, bottom + .025], [-.016, top], [-.10337, top], [-.139205, bottom + .025],
  ] }))), true));
  for (const side of [-1, 1]) {
    for (const z of [1.8391, 2.0588]) {
      P.add('gunMount', a6(box(.0216, .0206, .0614).translate(side > 0 ? .22590 : -.171375, 2.37347 - (z - 1.8391) * .0622, z), true));
    }
    P.add('gunMount', a6(box(.0613, .0190, .0216).translate(side > 0 ? .19873 : -.13092, 2.337195, 2.409985), true));
  }
  // the coaxial MG3's port on the cover's left cheek
  P.add('gunMountDark', a6(KIT.cylZ(.026, .05, 8).translate(.215, 1.93, 2.46), true));
}

/** The 2A6-look front on the 2A4 core: the wedges, the mantlet cover, the roof EMES housing, the commander's sights. */
export function buildLeopard2A6Front(P: TankBuilderPort): void {
  cheek(P, 1);
  cheek(P, -1);
  mantletCover(P);
  optic(P);
  commanderSights(P);
}

/**
 * A point on a wedge's front face (turret metres) and the rotation that turns a part's +Z out along the face's normal:
 * `side` +1 is the left (+X) wedge; `u` runs from the tip (0) to the shoulder (1), `v` from the face's foot (0) to its top
 * edge (1).
 */
export function leopard2A4WedgeFace(side: 1 | -1, u: number, v: number): { point: THREE.Vector3; normal: THREE.Vector3;
  rotation: THREE.Euler } {
  const plan = cheekPlan(side);
  const z = THREE.MathUtils.lerp(3.1452, 2.413, u), outer = plan.outerAt(z);
  const floor = a6Floor(z), roof = cheekRoof(side, side * outer, z);
  const point = new THREE.Vector3(side * outer, THREE.MathUtils.lerp(floor, roof, v) - A6_Y, a6WarpZ(z));
  // the face's run in plan (tip to shoulder) and its outward normal, after the compression
  const dx = plan.shoulder - (plan.inner + .002), dz = (2.413 - 3.1452) * WARP;
  const normal = new THREE.Vector3(side * -dz, 0, dx).normalize();
  return { point, normal, rotation: new THREE.Euler(0, Math.atan2(normal.x, normal.z), 0) };
}

/**
 * A point on a wedge's sloped top (turret metres), its outward normal, and the rotation that turns a part's +Z along the
 * normal with its +X across the wedge: `side` +1 is the left (+X) wedge; `u` runs from the tip (0) back to the side
 * module's turn (1), `w` from the gun's slot (0) to the wedge's outer edge (1). The old OTCO laid its cheek ERA here.
 */
export function leopard2A4WedgeTop(side: 1 | -1, u: number, w: number): { point: THREE.Vector3; normal: THREE.Vector3;
  rotation: THREE.Euler } {
  const plan = cheekPlan(side);
  const at = (uu: number, ww: number): THREE.Vector3 => {
    const z = THREE.MathUtils.lerp(3.1452, plan.turn, uu);
    const x = THREE.MathUtils.lerp(plan.inner + .004, plan.outerAt(z) - .004, ww);
    return new THREE.Vector3(side * x, cheekRoof(side, side * x, z) - A6_Y, a6WarpZ(z));
  };
  const e = 1e-3, point = at(u, w);
  const du = at(Math.min(1, u + e), w).sub(at(Math.max(0, u - e), w));
  const dw = at(u, Math.min(1, w + e)).sub(at(u, Math.max(0, w - e)));
  const normal = new THREE.Vector3().crossVectors(du, dw).normalize();
  if (normal.y < 0) normal.negate();
  const across = dw.clone().normalize().multiplyScalar(side);
  const up = new THREE.Vector3().crossVectors(normal, across).normalize();
  const basis = new THREE.Matrix4().makeBasis(across, up, normal);
  return { point, normal, rotation: new THREE.Euler().setFromRotationMatrix(basis) };
}
