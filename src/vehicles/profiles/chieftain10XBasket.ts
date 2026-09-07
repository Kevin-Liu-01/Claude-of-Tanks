// Independent folded floor, seat pedestals and tray from scalar source planes.
// The original complete turret contains these lower assemblies; they are not
// a solid extension of the external casting and retain their actual air gaps.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type Plan = readonly [number, number];
type Plane = readonly [number, number, number];

function clip(poly: Plan[], [nx, nz, d]: Plane): Plan[] {
  const out: Plan[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + nz * a[1] - d, db = nx * b[0] + nz * b[1] - d;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

function bounded(planes: readonly Plane[]): Plan[] {
  return planes.reduce(clip, [[-2, -2], [2, -2], [2, 2], [-2, 2]] as Plan[]);
}

function floorSolid(outline: readonly Plan[], bottom: number, top: number,
  holes: readonly (readonly Plan[])[] = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z))));
  return new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false,
    steps: 1 }).rotateX(Math.PI / 2).translate(0, top, 0);
}

function sideSolid(outline: readonly Plan[], left: number, right: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(-z, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: right - left, bevelEnabled: false,
    steps: 1 }).rotateY(Math.PI / 2).translate(left, 0, 0);
}

function add(P: TankBuilderPort, pivot: Point, geometry: THREE.BufferGeometry, name: string): void {
  geometry.userData.chieftain10BasketPiece = name;
  P.addEquipment('turretDetail', geometry, -pivot[0], -pivot[1], -pivot[2]);
}

function base(P: TankBuilderPort, pivot: Point): void {
  const radius = .785085, centerZ = .596846;
  const outline: Plan[] = Array.from({ length: 24 }, (_, i) => {
    const a = i * Math.PI / 12;
    return [radius * Math.sin(a), centerZ + radius * Math.cos(a)];
  });
  // The actual starboard floor opening has a straight inner edge and five
  // folded outer boundaries, not a radial painted patch or an entire quadrant.
  const hole = bounded([[-1, 0, -.250071], [0, 1, .561786],
    [.38234472, -.92401976, .17997037], [.60863545, -.79344999, .25794932],
    [.79333562, -.60878452, .36817324], [.92280632, -.38526418, .50184278],
    [.98984094, -.14217914, .64498739]]);
  add(P, pivot, floorSolid(outline, .761857, .794758, [hole]), 'floor');
  const rim: Plan[] = [];
  for (let i = 0; i <= 3; i++) {
    const a = Math.PI * 11 / 12 + i * Math.PI / 12;
    rim.push([.78831 * Math.sin(a), centerZ + .78831 * Math.cos(a)]);
  }
  for (let i = 3; i >= 0; i--) {
    const a = Math.PI * 11 / 12 + i * Math.PI / 12;
    rim.push([radius * Math.sin(a), centerZ + radius * Math.cos(a)]);
  }
  add(P, pivot, floorSolid(rim, .793758, 1.039567), 'localRearRim');
  add(P, pivot, KIT.box(.32229, .11788, .32214).translate(-.000004, .853698, centerZ), 'centralFloorBoss');
}

function pedestals(P: TankBuilderPort, pivot: Point): void {
  add(P, pivot, sideSolid([[.264366, .793758], [.951816, .793758],
    [.951816, 1.013227], [.588326, 1.013227], [.638757, 1.091107],
    [.638757, 1.342027], [.264366, 1.342027]], -.681770, -.453759), 'leftSteppedPedestal');
  const right = bounded([
    [.82286464, .56823743, 1.07621278], [-.51719999, -.85586458, -.92870935],
    [-.98359719, -.18037895, -.57633468], [-.82290117, -.56818453, -.85468792],
    [.58821435, -.80870506, -.16872588], [.19072960, .98164261, 1.20197593],
    [.98544370, -.17000210, .60110384], [-.10550498, -.99441877, -.77255727],
    [-.54870958, .83601303, .68843921], [-.96734373, .25346815, -.12173641],
  ]);
  add(P, pivot, floorSolid(right, .807089, 1.542399), 'rightObliqueSupport');
  // The source pad has a small rear notch rather than a rectangular outline.
  const pad: Plan[] = [[-.77822, .371236], [-.31791, .371236], [-.31791, .782926],
    [-.47016, .782926], [-.47016, .744366], [-.62598, .744366],
    [-.62598, .782926], [-.77822, .782926]];
  add(P, pivot, floorSolid(pad, 1.357556, 1.425676), 'leftSeatPad');
}

function upperTray(P: TankBuilderPort, pivot: Point): void {
  // Seven independently measured outer wall planes meet in a folded arc.
  // The inboard return is open; the 241 mm rim is never a filled tray block.
  const outer: Plan[] = [[-.104411, -.472944], [-.308711, -.436344],
    [-.592501, -.311873], [-.828941, -.109313], [-.998920, .160157],
    [-1.092150, .458547], [-1.085, .820227]];
  const inner: Plan[] = [[-.902410, .820087], [-.902410, .477827],
    [-.308490, .377946], [-.227481, -.034724], [-.114400, -.120634],
    [-.114400, -.461074]];
  add(P, pivot, floorSolid([...outer, ...inner], 1.364646, 1.374587), 'leftUpperTrayFloor');
  for (let i = 0; i < outer.length - 1; i++) {
    const a = outer[i], b = outer[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz), nx = dz / length, nz = -dx / length;
    add(P, pivot, floorSolid([a, b, [b[0] + nx * .008, b[1] + nz * .008],
      [a[0] + nx * .008, a[1] + nz * .008]], 1.364646, 1.605556), 'leftUpperTrayRim');
  }
  // Source inner folded return descends to 1.25236 m instead of stopping at
  // the horizontal seat plane. It retains the source's narrow 10 mm width.
  add(P, pivot, floorSolid([[-.308490, .072706], [-.248460, .377946],
    [-.238640, .379756], [-.298670, .074526]], 1.252357, 1.605647), 'leftInnerReturn');
  add(P, pivot, KIT.box(.054, .02462, .19).translate(-.52, 1.353337, .45), 'concealedSeatJoint');
}

function lowerTray(P: TankBuilderPort, pivot: Point): void {
  const outer: Plan[] = [[-.850189, .484956], [-.850189, .596847],
    [-.785249, .989397], [-.728458, 1.152007], [-.309988, 1.152007],
    [-.389549, .799966], [-.389549, .484956]];
  add(P, pivot, floorSolid(outer, 1.016326, 1.023697), 'leftLowerTrayFloor');
  // Actual taller outboard and forward lips; the opposite low wall stops
  // at 1.06521 m and does not enclose the upper opening.
  for (let i = 0; i < outer.length - 1; i++) {
    const a = outer[i], b = outer[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz), nx = dz / length, nz = -dx / length;
    add(P, pivot, floorSolid([a, b, [b[0] + nx * .007, b[1] + nz * .007],
      [a[0] + nx * .007, a[1] + nz * .007]], 1.016326,
    i < 4 ? 1.179977 : 1.065207), 'leftLowerTrayRim');
  }
}

function hangingReturn(P: TankBuilderPort, pivot: Point): void {
  // Two original plane-defined folds continue below the tray. The opening
  // beneath the seat stays empty; this is a roughly 10 mm sheet, not a block.
  const planes = [
    [[-.99895137, .00467951, -.04554408, .84346819],
      [.99895629, .00079426, .04566946, -.82671547],
      [-.83004797, -.55640657, -.03784302, -.03129739],
      [.82833779, .55893649, .03803293, .04576387]],
    [[-.98482401, .00537274, .17347277, 1.00231181],
      [.98478347, .00041581, -.17378532, -.98546196],
      [-.81743818, -.55899964, .13897564, .09176969],
      [.81545538, .56131030, -.14129143, -.07931518]],
  ];
  for (let i = 0; i < 2; i++) {
    const [outer, inner, slopeOuter, slopeInner] = planes[i];
    const x = (p: number[], y: number, z: number): number => (p[3] - p[1] * y - p[2] * z) / p[0];
    const sections: SolidSection[] = [i ? .7774 : .4705, i ? 1.042 : .7775].map(z => ({ z,
      ring: [[x(outer, 1.226186, z), 1.226186], [x(inner, 1.226186, z), 1.226186],
        [x(inner, 1.309746, z), 1.309746], [x(slopeInner, 1.374405, z), 1.374405],
        [x(slopeOuter, 1.364646, z), 1.364646], [x(outer, 1.306726, z), 1.306726]],
    }));
    add(P, pivot, sectionSolid(sections), 'leftHangingReturn');
  }
}

function hangingLink(P: TankBuilderPort, pivot: Point): void {
  // Source's narrow bent linkage: scalar centerline and 40 mm cross-section.
  // Round junction fillets are simplified; no surrounding gap is filled.
  const points: Point[] = [[.0858, .6634, -.155], [.0878, 1.244, -.110],
    [.270, 1.375, -.068], [.884, 1.378, .250], [1.078, 1.605, .250]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[i]), b = new THREE.Vector3(...points[i + 1]);
    const delta = b.clone().sub(a), midpoint = a.clone().add(b).multiplyScalar(.5);
    const geometry = KIT.cylY(.01995, .01995, delta.length() + .002, 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), delta.normalize())).translate(...midpoint.toArray());
    add(P, pivot, geometry, 'rightHangingLink');
  }
}

export function addChieftain10XBasket(P: TankBuilderPort, pivot: Point): void {
  base(P, pivot);
  pedestals(P, pivot);
  upperTray(P, pivot);
  lowerTray(P, pivot);
  hangingReturn(P, pivot);
  hangingLink(P, pivot);
}
