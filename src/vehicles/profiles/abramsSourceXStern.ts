// Original authored stern construction from selected OBJ owner4 scalar studies.
// Source topology is never imported. The thin source skin has no inner wall;
// a concealed 22 mm closed return supplies native physical stock.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { closedSectionLoft, planeBoundedArmor, type XY } from './abramsSourceXGeometry.ts';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

function acrossX(x0: number, x1: number, outline: readonly XY[]): THREE.BufferGeometry {
  const area = outline.reduce((sum, a, i) => {
    const b = outline[(i + 1) % outline.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const ring = area > 0 ? [...outline] : [...outline].reverse();
  return closedSectionLoft([{ z: x0, ring }, { z: x1, ring }])
    .applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
}

function fingerPlan(cx: number, z: number, front: number): XY[] {
  const polygon = Array.from({length: 8}, (_, i): XY => {
    const a = i * Math.PI / 4;
    return [cx + .01991 * Math.cos(a), -(z + .01991 * Math.sin(a))];
  });
  const result: XY[] = [], edge = -front;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if (a[1] >= edge) result.push(a);
    if ((a[1] >= edge) !== (b[1] >= edge)) {
      const t = (edge - a[1]) / (b[1] - a[1]);
      result.push([a[0] + t * (b[0] - a[0]), edge]);
    }
  }
  return result.reverse();
}

function chamferEye(body: THREE.BufferGeometry, xs: readonly number[], depth: number, throat: number): void {
  const p = body.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const station = Math.round(p.getZ(i) / depth * 3);
    const y = p.getX(i) - 1.602555, z = p.getY(i) - (-3.881545);
    if (station > 0 && station < 3 && Math.abs(Math.hypot(y, z) - .06774) < .000001) {
      const scale = throat / .06774;
      p.setX(i, 1.602555 + y * scale); p.setY(i, -3.881545 + z * scale);
    }
    p.setZ(i, xs[station] - xs[0]);
  }
  body.computeVertexNormals();
}

/** The receiving arm has a real circular eye, a low hinge finger and a
 * tapered fore-web. Its bounding rectangle is mostly empty space. */
export function buildAbramsSourceXSternArm(side: -1 | 1): THREE.BufferGeometry {
  const parts = buildAbramsSourceXSternArmStocks(side);
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  if (!merged) throw new Error('Abrams source receiving arm could not merge');
  return merged;
}

/** Separate closed stocks are exposed for independent manifold tests. */
export function buildAbramsSourceXSternArmStocks(side: -1 | 1): THREE.BufferGeometry[] {
  const left = side < 0, inner = left ? -1.03714 : 1.09394;
  const outer = left ? -1.0678 : 1.12388, x0 = Math.min(inner, outer);
  const bottom = left ? 1.364755 : 1.377595, fingerTop = left ? 1.404665 : 1.416625;
  const fingerZ = left ? -3.930335 : -3.930095;
  const backLow: XY = left ? [1.364245, -3.755205] : [1.377595, -3.745375];
  const backTop: XY = left ? [1.694445, -3.786755] : [1.694225, -3.775345];
  const shape = new THREE.Shape(), r = .0955, cy = 1.601865, cz = -3.881545;
  shape.absarc(cy, cz, r, -5 * Math.PI / 6, Math.PI / 12, false);
  shape.lineTo(...backTop); shape.lineTo(...backLow);
  shape.lineTo(bottom, fingerZ); shape.lineTo(fingerTop, fingerZ);
  if (left) {
    shape.lineTo(1.404665, -3.868075);
    shape.quadraticCurveTo(1.435, -3.8185, 1.473535, -3.858605);
  } else {
    shape.lineTo(1.441585, -3.857635);
    shape.quadraticCurveTo(1.463, -3.8315, 1.486735, -3.857515);
  }
  shape.closePath();
  const eye = new THREE.Path();
  eye.absarc(1.602555, cz, .06774, 0, Math.PI * 2, true); shape.holes.push(eye);
  const body = new THREE.ExtrudeGeometry(shape,
    { depth: Math.abs(outer - inner), bevelEnabled: false, curveSegments: 9, steps: 3 });
  // The outer mouth is larger than the throat: the measured 18-sided
  // inner stock has two distinct axial chamfers, not a straight bore.
  const xs = left ? [x0, -1.05639, -1.04782, inner] : [x0, 1.10463, 1.11319, outer];
  chamferEye(body, xs, Math.abs(outer - inner), left ? .05723 : .05818);
  body.applyMatrix4(new THREE.Matrix4().set(0,0,1,x0, 1,0,0,0, 0,1,0,0, 0,0,0,1));
  // Sparse junction-plane intersections, not an extracted contour. The
  // fore-web seats on the unchanged engine deck and side shoulder.
  const foreX = left ? -1.08473 : 1.14187;
  const foreLow: XY = left ? [1.347835, -3.723765] : [1.364245, -3.725345];
  const foreOuter: XY = left ? [1.694365, -3.769285] : [1.694155, -3.757025];
  const foreInner: XY = left ? [1.694155, -3.706775] : [1.694155, -3.659075];
  const points = [inner, outer].flatMap(x => [backLow, backTop].map(([y,z]) => new THREE.Vector3(x,y,z)));
  points.push(new THREE.Vector3(inner,...foreLow), new THREE.Vector3(inner,...foreInner),
    new THREE.Vector3(foreX,...foreLow), new THREE.Vector3(foreX,...foreOuter));
  const web = new ConvexGeometry(points);
  const webPosition = web.getAttribute('position'), uv: number[] = [];
  for (let i=0;i<webPosition.count;i++) uv.push(webPosition.getY(i),webPosition.getZ(i));
  web.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  // Source's octagonal rounded finger end stops at its actual straight
  // mating edge; no front half-disc is invented beyond that edge.
  const cx = left ? -1.05214 : 1.10895, capZ = left ? -3.944295 : -3.944175;
  const capPlan = fingerPlan(cx, capZ, fingerZ);
  const cap = closedSectionLoft([{z:bottom,ring:capPlan},{z:fingerTop,ring:capPlan}]).rotateX(-Math.PI/2);
  return [body, web, cap];
}

/** Close the narrow side wall into the actual lower sheet's inner return.
 * Its former straight G–A closing edge crossed exterior edge B–C. Keep
 * every exterior datum and use the existing folded-sheet inner datum for
 * the hidden return, rather than trimming the source fold or sealing air. */
export function buildAbramsSourceXSternSideReturn(side: -1 | 1): THREE.BufferGeometry {
  const lo = side < 0 ? -1.067035 : 1.032035;
  const hi = side < 0 ? -1.032035 : 1.067035;
  return acrossX(lo, hi, [
    [.648044, -3.472775], [.670293, -3.461365], [.9020, -3.636135],
    [.921994, -3.6821], [1.211695, -3.710535], [1.332, -3.7222],
    [1.332, -3.472775], [.673, -3.440775],
  ]);
}

/** Continuous broad folded skin, exposed separately for occupied-stock QA. */
export function buildAbramsSourceXSternLowerFold(): THREE.BufferGeometry {
  return acrossX(-1.067035, 1.067035, [
    [.648044, -3.472775], [.670293, -3.461365], [.91149, -3.643175],
    [.921994, -3.651185], [1.009394, -3.659445], [1.008, -3.637835],
    [.920, -3.628], [.682, -3.44], [.673, -3.440775],
  ]);
}

/** One replacement structural emission: the forward tub stays untouched,
 * while the lower stern and the two side returns remain separate stocks.
 * In particular no floor or cap spans the engine aperture above Y1.0094. */
export function withAbramsSourceXStern(forward: THREE.BufferGeometry): THREE.BufferGeometry {
  // Close the original lower stock on the measured 22.249 mm folded end,
  // not on its old vertical cap. Only the first station's hidden inner
  // return moves; the exterior approach-plane point at Y.648044 is fixed.
  const position = forward.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (Math.abs(position.getZ(i) + 3.472775) < .000001 && y < .681) {
      position.setZ(i, (.4563249716221376 * y - 3.385839654699946) / .8898131940323517);
    }
  }
  forward.computeVertexNormals();
  const parts = [forward];
  // The small reversed lower fold is real: it must not be replaced by the
  // former horizontal .504 m deep floor carried to the grille's aft edge.
  parts.push(buildAbramsSourceXSternLowerFold());
  for (const side of [-1, 1] as const) {
    parts.push(buildAbramsSourceXSternSideReturn(side));
    // Closed upper shoulder remains outside the engine mouth. The left
    // source return is 12 mm farther aft than its positive-X counterpart.
    const x0 = side < 0 ? -1.759 : 1.067035, x1 = side < 0 ? -1.067035 : 1.759;
    const rearD = side < 0 ? 3.58936 : 3.5770;
    parts.push(planeBoundedArmor([
      [1, 0, 0, x1], [-1, 0, 0, -x0], [0, 0, 1, -3.472775],
      [0, -.095932, -.995388, rearD], [0, -1, 0, -1.332], [0, 1, 0, 1.697365],
    ]));
  }
  parts.push(buildAbramsSourceXSternArm(-1), buildAbramsSourceXSternArm(1));
  const merged = mergeGeometries(parts);
  for (const geometry of parts) geometry.dispose();
  if (!merged) throw new Error('Abrams stern stock could not merge');
  merged.userData.abramsSourceXStern = 'structural-stock';
  return merged;
}

function emit(P: TankBuilderPort, geometry: THREE.BufferGeometry, name: string): void {
  geometry.userData.abramsSourceXStern = name;
  P.addEquipment('hullDetail', geometry);
}

function rearEye(x: number): THREE.BufferGeometry[] {
  // Source6287/6804 are two upright ears and a low curved heel; their open
  // middle extends above Y.695. A closed torus would invent an upper bar.
  const rows = [
    [.638, .018, .041, -3.685, -3.641], [.665, .017, .040, -3.65589, -3.615],
    [.690, .017, .040, -3.65377, -3.605], [.770, .021, .040, -3.673825, -3.591332],
    [.790, .021, .040, -3.671529, -3.593889], [.805, .021, .040, -3.661771, -3.602964],
    [.818544, .022, .037, -3.6315, -3.6305],
  ];
  const ears = [-1, 1].map(side => closedSectionLoft(rows.map(([y, inner, outer, back, front]) => {
    const x0 = x + (side < 0 ? -outer : inner), x1 = x + (side < 0 ? -inner : outer);
    return { z: y, ring: [[x0, -front], [x1, -front], [x1, -back], [x0, -back]] as const };
  })).rotateX(-Math.PI / 2));
  ears.push(acrossX(x - .040, x + .040, [
    [.621344, -3.665], [.6268, -3.71236], [.63134, -3.72389],
    [.64432, -3.730565], [.65687, -3.72499], [.66088, -3.710905],
    [.665, -3.65589], [.693, -3.65377], [.693, -3.622],
    [.650, -3.62069], [.625, -3.65419],
  ]));
  return ears;
}

function rearLug(x: number): THREE.BufferGeometry {
  return acrossX(x - .02168, x + .02168, [
    [.726104, -3.638565], [.734354, -3.664055], [.754194, -3.682015],
    [.780383, -3.687595], [.807, -3.679], [.848094, -3.609195],
    [.863553, -3.599245], [.848094, -3.518045], [.730263, -3.518045], [.722174, -3.500085],
  ]);
}

/** Source4 real lower receiving assembly. Dimensions here describe stock,
 * not an inferred armor rating. Small cast fillets remain analytic. */
export function addAbramsSourceXSternFittings(P: TankBuilderPort): void {
  for (const [side, x] of [[-1, -.983865], [1, .980560]]) {
    for (const [i, g] of rearEye(x).entries()) emit(P, g, `rear-eye-${side}-${i}`);
    emit(P, rearLug(x), `rear-lug-${side}`);
    emit(P, KIT.cylX(.0211, .11013, 16).translate(x, .777434, -3.63104), `rear-pin-${side}`);
  }
  // Separate folded lower grille receiving rail, with authentic underside
  // rather than a continuous box from its crown to the bottom of the tub.
  emit(P, acrossX(-1.04172, 1.07137, [
    [.938404, -3.778015], [.985684, -3.711385], [1.009, -3.68894],
    [1.005893, -3.687235], [.969993, -3.709205], [.926954, -3.769885],
  ]), 'lower-grille-receiver');
  // The central pintle has a distinct folded mount, open between its two
  // gussets; the receiver's actual hook and latch are separate below.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -.07313 : .05028, x1 = side < 0 ? -.05029 : .07311;
    // The narrow source bevel reaches the skin at its inner X edge. A
    // constant-width extrusion of the outer side would leave a real gap.
    emit(P, planeBoundedArmor([
      [1, 0, 0, x1], [-1, 0, 0, -x0], [0, -1, 0, -.702184],
      [0, 0, -1, 3.722555], [0, .9384025, -.3455441, 2.09162],
      side < 0 ? [-.8023009535, .3595402876, .4764913027, -1.3677143695]
        : [.7990771345, .3619625807, .4800612704, -1.3786232688],
    ]), `central-gusset-${side}`);
  }
  emit(P, KIT.box(.14624, .142, .0136).translate(-.00001, .773184, -3.715755), 'central-receiver');
  // Rounded hook in its true YZ plane, open above the throat. The source
  // uses a separate movable latch, not an unbroken circular eye.
  emit(P, acrossX(-.03190, .03189, [
    [.6783, -3.8834], [.661104, -3.826], [.684, -3.741],
    // Original hook/receiver extremities have a .12 mm seam. A .24 mm
    // concealed flat at this existing mating end gives .12 mm native lap.
    [.720, -3.722435], [.729, -3.722435],
    [.848744, -3.727405], [.853784, -3.784575], [.751574, -3.788575],
    [.719, -3.811], [.715, -3.844], [.742, -3.872], [.769734, -3.875],
    [.769734, -3.910795], [.742, -3.911285],
  ]), 'central-hook');
  emit(P, acrossX(-.03230, .03229, [[.769734, -3.910795], [.79065, -3.91274],
    [.81157, -3.90448], [.83249, -3.88073], [.853413, -3.83],
    [.83249, -3.82155], [.81157, -3.80212], [.79065, -3.79709],
    [.77863, -3.80799], [.786804, -3.81989], [.769734, -3.848655]]), 'central-latch');
}

