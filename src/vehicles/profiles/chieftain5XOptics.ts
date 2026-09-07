// First-party exterior forms from the public MoD pamphlet, printed pp124–127,
// especially Fig44's forward-inclined object reflector and retaining frame.
// Dimensions/depths remain construction estimates inside the existing datum.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type Add = (bucket: string, g: THREE.BufferGeometry, x: number, y: number,
  z: number, ry?: number) => void;

function windows(add: Add): void {
  for (let i = 0; i < 9; i++) {
    const angle = i * 2 * Math.PI / 9;
    const place = (bucket: string, w: number, h: number, d: number,
      x: number, y: number, z: number) => add(bucket, new THREE.BoxGeometry(w, h, d),
      .45 + Math.sin(angle) * (.343 + z) + Math.cos(angle) * x,
      y, -.30 + Math.cos(angle) * (.343 + z) - Math.sin(angle) * x, angle);
    for (const x of [-.0405, .0405]) place('turretDetail', .010, .064, .061, x, 2.564, 0);
    for (const y of [2.536, 2.592]) place('turretDetail', .091, .008, .061, 0, y, 0);
    place('turretDark', .074, .052, .008, 0, 2.564, .016);
    place('turretGlass', .074, .052, .004, 0, 2.564, .020);
  }
}

function cheek(): THREE.BufferGeometry {
  // A narrow supporting end wall, not an opaque plane across the reflector.
  const shape = new THREE.Shape();
  shape.moveTo(-.13, 2.637);
  shape.lineTo(.046, 2.637);
  shape.lineTo(.109, 2.727);
  shape.lineTo(-.13, 2.727);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: .018, bevelEnabled: false,
    curveSegments: 1, steps: 1 }).rotateY(-Math.PI / 2).translate(.009, 0, 0);
}

function inclinedBox(w: number, h: number, d: number, centerY: number,
  frontOffset: number): THREE.BufferGeometry {
  // z=.046+.7*(y−2.637), with the glass set behind the retaining face.
  const g = new THREE.BoxGeometry(w, h, d);
  const position = g.attributes.position;
  for (let i = 0; i < position.count; i++) position.setZ(i,
    position.getZ(i) + .046 + .7 * (position.getY(i) + centerY - 2.637) + frontOffset);
  g.computeVertexNormals();
  return g;
}

function commandersHead(add: Add): void {
  // Original lower seat and upper cap extents remain. The new hollow front
  // housing does not lift the cupola, optic, hatch, or supporting MG foot.
  add('turretDetail', new THREE.BoxGeometry(.24, .046, .24), .45, 2.6175, -.01);
  add('turretDetail', new THREE.BoxGeometry(.24, .090, .105), .45, 2.682, -.0775);
  for (const x of [.339, .561]) add('turretDetail', cheek(), x, 0, 0);
  add('turretDetail', new THREE.BoxGeometry(.265, .034, .262), .45, 2.743, -.01);
  for (const y of [2.646, 2.718]) add('turretDetail', inclinedBox(.222, .014, .014, y, .004),
    .45, y, 0);
  add('turretDark', inclinedBox(.210, .070, .006, 2.682, -.012), .45, 2.682, 0);
  add('turretGlass', inclinedBox(.210, .070, .004, 2.682, -.008), .45, 2.682, 0);
}

export function addChieftain5XOptics(P: TankBuilderPort, pivot: Point): void {
  const add: Add = (bucket, g, x, y, z, ry = 0) =>
    P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2], 0, ry);
  windows(add);
  commandersHead(add);
}
