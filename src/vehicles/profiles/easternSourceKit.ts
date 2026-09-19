// Small first-party construction vocabulary shared by four independent source
// studies. Every vehicle owns its primary shell sections and measured frames.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;

export function hullStation(z: number, lowHalf: number, shoulderHalf: number,
  topHalf: number, floor: number, shoulder: number, roof: number): SolidSection {
  const ledge = Math.max(floor + .012, shoulder - .025);
  // A narrow tub rises beside the suspension, then its over-track shoulder
  // expands above the belt. A single floor-to-shoulder diagonal occupies the
  // live track corridor and is not the source hull's actual cross-section.
  return { z, ring: [[-lowHalf, floor], [lowHalf, floor], [lowHalf, ledge],
    [shoulderHalf, shoulder], [topHalf, roof], [-topHalf, roof],
    [-shoulderHalf, shoulder], [-lowHalf, ledge]] };
}

export function turretStation(P: TankBuilderPort, z: number, lowHalf: number,
  shoulderHalf: number, roofHalf: number, floor: number, shoulder: number, roof: number): SolidSection {
  const py = P.turretG.position.y;
  return { z: z - P.turretG.position.z,
    ring: [[-lowHalf, floor - py], [lowHalf, floor - py],
      [shoulderHalf, shoulder - py], [roofHalf, roof - py],
      [-roofHalf, roof - py], [-shoulderHalf, shoulder - py]] };
}

export function equipment(P: TankBuilderPort, owner: 'hull' | 'turret', material: string,
  geometry: THREE.BufferGeometry, x: number, y: number, z: number,
  rx = 0, ry = 0, rz = 0): void {
  const p = owner === 'turret' ? P.turretG.position : P.hullG.position;
  P.addEquipment(owner + material, geometry, x - p.x, y - p.y, z - p.z, rx, ry, rz);
}

export function optic(P: TankBuilderPort, owner: 'hull' | 'turret',
  x: number, y: number, z: number, width: number, height: number, depth: number): void {
  equipment(P, owner, 'Detail', box(width, height, depth), x, y, z);
  equipment(P, owner, 'Dark', box(width * .76, height * .70, .018), x, y, z + depth / 2 + .005);
  equipment(P, owner, 'Glass', box(width * .62, height * .52, .012), x, y, z + depth / 2 + .017);
}

export function hatch(P: TankBuilderPort, owner: 'hull' | 'turret',
  x: number, y: number, z: number, radius: number): void {
  equipment(P, owner, 'Detail', cylY(radius, radius, .045, P.q ? 28 : 16), x, y, z);
  equipment(P, owner, 'Detail', box(radius * .55, .032, .036), x, y + .035, z);
  for (const side of [-1, 1]) equipment(P, owner, 'Detail', box(.038, .036, .042), x + side * radius * .24, y + .025, z);
}

export function antenna(P: TankBuilderPort, x: number, floor: number, z: number, top: number, tipZ = z): void {
  equipment(P, 'turret', 'Detail', cylY(.036, .056, .14, 10), x, floor + .07, z);
  const rise = top - floor - .11, run = tipZ - z;
  equipment(P, 'turret', 'Dark', cylY(.0038, .012, Math.hypot(rise, run), P.q ? 8 : 6),
    x, floor + .11 + rise / 2, (z + tipZ) / 2, Math.atan2(run, rise));
}

export function smokeBank(P: TankBuilderPort, side: number, x: number,
  y: number, z: number, count: number, spacing = .16): void {
  for (let i = 0; i < count; i++) {
    const xx = side * (x + i * .055), zz = z - i * spacing;
    equipment(P, 'turret', 'Detail', cylZ(.062, .28, P.q ? 16 : 9), xx, y, zz, -.55, side * .30);
    equipment(P, 'turret', 'Dark', cylZ(.048, .012, 12), xx + side * .042, y + .08, zz + .12, -.55, side * .30);
  }
}

export function deckGrille(P: TankBuilderPort, x: number, y: number, z: number,
  width: number, length: number): void {
  equipment(P, 'hull', 'Dark', box(width, .025, length), x, y, z);
  const count = P.q ? 12 : 6;
  for (let i = 0; i < count; i++) equipment(P, 'hull', 'Detail', box(width * .95, .025, .021),
    x, y + .015, z - length / 2 + (i + .5) * length / count);
}

export function towEye(P: TankBuilderPort, side: number, x: number, y: number, z: number): void {
  equipment(P, 'hull', 'Detail', box(.09, .08, .10), side * x, y, z - .035);
  equipment(P, 'hull', 'Detail', torus(.055, .018, P.q ? 16 : 10, 6), side * x, y, z + .025);
}

export function rearRamp(P: TankBuilderPort, y: number, z: number, width: number, height: number): void {
  equipment(P, 'hull', 'Dark', box(width + .045, height + .045, .018), 0, y, z);
  equipment(P, 'hull', 'Detail', box(width, height, .05), 0, y, z - .03);
  for (const x of [-width * .40, width * .40]) equipment(P, 'hull', 'Detail', cylX(.035, .19, 10), x, y - height * .45, z - .065);
  equipment(P, 'hull', 'Detail', box(.20, .045, .05), width * .32, y + .08, z - .065);
}

/** Open outer stock, inward-facing inner wall, annular face and finite backstop.
 * The contract is declared only alongside these actual visible surfaces. */
export function openGunTube(P: TankBuilderPort, start: number, end: number,
  rearRadius: number, frontRadius: number, boreRadius: number, depth = .20): void {
  if (!(end-start >= depth && boreRadius < Math.min(rearRadius,frontRadius)))
    throw new RangeError('Open gun tube requires wall stock around its complete recess');
  const n = P.q ? 28 : 16;
  const outer = new THREE.CylinderGeometry(frontRadius,rearRadius,end-start,n,1,true).rotateX(Math.PI/2);
  P.add('gun',outer,0,0,(end+start)/2);
  const inner = new THREE.CylinderGeometry(boreRadius,boreRadius,depth,n,1,true).rotateX(Math.PI/2);
  const index=inner.index!;
  for(let i=0;i<index.count;i+=3) {
    const a=index.getX(i+1); index.setX(i+1,index.getX(i+2)); index.setX(i+2,a);
  }
  inner.computeVertexNormals();
  P.add('gunDark',inner,0,0,end-depth/2);
  P.add('gun',new THREE.RingGeometry(boreRadius,frontRadius,n),0,0,end);
  P.add('gunDark',new THREE.CircleGeometry(boreRadius,n),0,0,end-depth);
  P.muzzleZ=end;
  P.physicalMuzzleBore={outerRadiusM:frontRadius,innerRadiusM:boreRadius,depthM:depth};
}

export function barrel(P: TankBuilderPort, length: number, radius: number,
  sleeveEnd: number, evacuator?: { z: number; length: number; radius: number },
  boreRadius = radius * .72): void {
  P.add('gun', cylZ(radius * 1.28, sleeveEnd, P.q ? 28 : 16, radius * 1.72), 0, 0, sleeveEnd / 2);
  openGunTube(P,sleeveEnd,length,radius,radius,boreRadius);
  P.add('gunDark', cylZ(radius * 1.82, .06, P.q ? 28 : 16), 0, 0, .06);
  if (evacuator) P.add('gun', cylZ(evacuator.radius, evacuator.length, P.q ? 28 : 16), 0, 0, evacuator.z);
}

export function hullSolid(P: TankBuilderPort, sections: readonly SolidSection[]): void {
  P.add('hull', sectionSolid(sections));
}

/** Closed chamfered roof/access cover authored from its measured envelope. */
export function panel(P: TankBuilderPort, owner: 'hull' | 'turret',
  x: number, y: number, z: number, width: number, length: number,
  thickness: number, chamfer: number, rx = 0): void {
  const w = width / 2, l = length / 2, c = Math.min(chamfer, w, l);
  const shape = new THREE.Shape();
  shape.moveTo(-w + c, -l);
  for (const [a, b] of [[w-c,-l],[w,-l+c],[w,l-c],[w-c,l],[-w+c,l],[-w,l-c],[-w,-l+c]]) shape.lineTo(a,b);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2).translate(0, -thickness / 2, 0);
  equipment(P, owner, 'Detail', g, x, y, z, rx);
}

/** A closed rectangular brace with explicit finite receiving endpoints. */
export function brace(P: TankBuilderPort, owner: 'hull' | 'turret',
  from: readonly [number, number, number], to: readonly [number, number, number],
  width: number, depth: number): void {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const g = box(width, direction.length(), depth);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), direction.normalize()));
  a.add(b).multiplyScalar(.5);
  equipment(P, owner, 'Detail', g, a.x, a.y, a.z);
}
