// Older supplied-file lamp pockets and upturned exhaust: original primitives.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

function closedRectangle(a: number, b: number, low: number, high: number): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(a, low); path.lineTo(a, high); path.lineTo(b, high);
  path.lineTo(b, low); path.closePath();
  return path;
}

function lampRoof(x: number, right: boolean): number {
  if (right) return x > 1.015389 ? (1.633661956 - .192746049 * x) / .981248674
    : (1.456221483 + .009008883 * x) / .999959419;
  return x < -1.027366 ? (1.6514710948 + .214190998 * x) / .9767917979
    : (1.4606763666 - .00461036277 * x) / .9999893722;
}

function lampFrame(P: TankBuilderPort, right: boolean): void {
  const [a, b, knee] = right ? [.9143768, 1.1476308, 1.015389] : [-1.147601, -.914347, -1.027366];
  const shape = new THREE.Shape();
  shape.moveTo(a, 1.280531); shape.lineTo(b, 1.280531);
  for (const x of [b, knee, a]) shape.lineTo(x, lampRoof(x, right));
  shape.closePath();
  if (right) shape.holes.push(closedRectangle(.923715, 1.016291, 1.312775, 1.454592),
    closedRectangle(1.021274, 1.141269, 1.311589, 1.438377));
  else shape.holes.push(closedRectangle(-1.138263, -1.026464, 1.312775, 1.429136),
    closedRectangle(-1.021481, -.920709, 1.311589, 1.438377));
  P.addEquipment('hullDetail', new THREE.ExtrudeGeometry(shape,
    { depth: .080126524, bevelEnabled: false }).translate(0, 0, 3.37216258));
  // Complete rear stock supports both pockets, not a black flat front cap.
  const back = new THREE.Shape(shape.getPoints());
  P.addEquipment('hullDetail', new THREE.ExtrudeGeometry(back,
    { depth: .057371176, bevelEnabled: false }).translate(0, 0, 3.315291404));
  P.addEquipment('hullDark', KIT.box(.098834, .111631, .008785248),
    right ? 1.08167 : -1.088846, 1.3685905, 3.376555204);
  // Independently measured canted15.519mm backing plate seats on bow287.
  const base = sectionSolid([3.31119, 3.46549].map(z => {
    const y = (1.8872095276 - .1715658657 * z) / .9851726517;
    const [left, end] = right ? [.904353, 1.159006] : [-1.157625, -.902972];
    return { z, ring: [[left, y - .0157526], [end, y - .0157526],
      [end, y], [left, y]] };
  }));
  P.addEquipment('hullDetail', base);
}

function lampGlass(P: TankBuilderPort, right: boolean): void {
  // The source lamp is a recessed curved closed lens, not a proud sphere.
  // Independent radial stations preserve its8.37mm central glass stock.
  const dish = [[0, 3.391994526], [.03, 3.4012], [.05, 3.42496],
    [.054518, 3.447822], [.05, 3.44680], [.03, 3.41189], [0, 3.400365164],
    [0, 3.391994526]].map(([r, z]) => new THREE.Vector2(r, z));
  P.addEquipment('hullGlass', new THREE.LatheGeometry(dish, 40).rotateX(Math.PI / 2),
    right ? .9694035 : -.9719255, 1.3849, 0);
  for (const x of (right ? [1.0585931, 1.1047525] : [-1.10654575, -1.0603862])) {
    P.addEquipment('hullDark', KIT.box(.0419141, .0845537, .0794611),
      x, 1.382128715, 3.42067838);
    P.addEquipment('hullGlass', KIT.box(.0419141, .0845537, .002),
      x, 1.382128715, 3.459408926);
  }
}

class ExhaustPath extends THREE.Curve<THREE.Vector3> {
  constructor() { super(); }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const straight = .130002, bend = Math.PI * .11 / 2, rise = .097083;
    const distance = t * (straight + bend + rise);
    if (distance < straight) return target.set(1.469231, 1.441284, -3.323795 - distance);
    if (distance < straight + bend) {
      const angle = (distance - straight) / .11;
      return target.set(1.469231, 1.551284 - Math.cos(angle) * .11,
        -3.453797 - Math.sin(angle) * .11);
    }
    return target.set(1.469231, 1.551284 + distance - straight - bend, -3.563797);
  }
}

function exhaust(P: TankBuilderPort): void {
  // Source401 is the real rear shoulder mounting plate. Its69mm depth
  // overlaps both the source pipe root and the unchanged main carrier.
  P.addEquipment('hullDetail', KIT.box(.532685, .249216, .068555),
    1.3608815, 1.5420567, -3.344079, -.0032865);
  const skin = new THREE.TubeGeometry(new ExhaustPath(), 48, .110655, 32, false).toNonIndexed();
  const root = new THREE.CircleGeometry(.110655, 32)
    .translate(1.469231, 1.441284, -3.323795).toNonIndexed();
  // A real annular mouth and deep internal floor close the exterior stock.
  // The rear bend is not hollowed into unrelated engine geometry.
  const cavity = new THREE.LatheGeometry([[.110655, 1.648367], [.096383, 1.648367],
    [.096383, 1.53314364], [0, 1.53314364]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 32)
    .translate(1.469231, 0, -3.563797).toNonIndexed();
  const g = mergeGeometries([skin, root, cavity]);
  skin.dispose(); root.dispose(); cavity.dispose();
  if (!g) throw new Error('Classic exhaust closed primitive merge failed');
  P.addEquipment('hullDetail', g);
}

export function addLeclercClassicXHullEquipment(P: TankBuilderPort): void {
  // The source pair is not exactly mirrored: lens/body offsets and roof
  // crossfalls are independently retained from the earlier revision.
  for (const right of [false, true]) { lampFrame(P, right); lampGlass(P, right); }
  exhaust(P);
}
