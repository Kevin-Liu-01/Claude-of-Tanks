// Independently authored source-sized roof fittings. All arrays below are
// parametric construction stations; no source geometry or connectivity ships.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const YAW = [-.03904, 1.56289, .16819] as const;
const { box, cylY, cylZ } = KIT;
function put(P: TankBuilderPort, slot: string, geometry: THREE.BufferGeometry,
  x = 0, y = 0, z = 0, ry = 0): void {
  P.addEquipment(slot, geometry, x - YAW[0], y - YAW[1], z - YAW[2], 0, ry);
}

function gripSupport(rear: boolean): THREE.BufferGeometry {
  const ys = [2.13029, 2.16449, 2.21279, 2.334, 2.36169, 2.39539];
  const inner = (y: number) => Math.max(1.09476 + (2.36169 - y) * .39406,
    1.09476 + Math.max(0, y - 2.36169) * 1.04);
  const outer = (y: number) => Math.min(1.09476 + (2.36169 - y) * .39406 + .0835,
    1.25486 - Math.max(0, 2.21279 - y) * .45);
  const ring = [...ys.map(y => [inner(y), y] as [number, number]),
    ...[...ys].reverse().map(y => [Math.max(inner(y) + .001, outer(y)), y] as [number, number])].reverse();
  const geometry = sectionSolid([{ z: 0, ring }, { z: .014, ring }]);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const front = (.136992371 - .0440149 * x + .0194231 * y) / .998842;
    p.setXYZ(i, x - (rear ? .0049 : 0), y + (rear ? .0005 : 0),
      front - .014 + p.getZ(i) - (rear ? .0433 : 0));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function addAmx40RightRoofGrip(P: TankBuilderPort): void {
  for (const rear of [false, true]) put(P, 'turretDetail', gripSupport(rear));
  // Closed rectangular bent grip, not a filled bounding box. The two
  // parallel source plates retain the large forward/outboard opening.
  const curve = new THREE.CatmullRomCurve3([
    [1.10, 2.344, 0], [1.175, 2.374, 0], [1.215, 2.367, 0],
    [1.272, 2.302, 0], [1.325, 2.215, 0],
  ].map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const profile = new THREE.Shape();
  profile.moveTo(-.0205, -.013); profile.lineTo(.0205, -.013);
  profile.lineTo(.0205, .013); profile.lineTo(-.0205, .013); profile.closePath();
  const geometry = new THREE.ExtrudeGeometry(profile, { extrudePath: curve, steps: 32, bevelEnabled: false });
  // Source depth follows a shallow transverse rake, independently of the
  // rising XY spine. The grip meets both supporting plates at its crown.
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + .2433 - .122 * p.getX(i));
  geometry.computeVertexNormals();
  put(P, 'turretDetail', geometry);
}

function sourceServicePlate(P: TankBuilderPort): void {
  // Source19216 is a separate 18.6mm armor/service skin supporting the
  // optic flange. Its large forward chamfer is not a generic pedestal.
  const left = .0665, right = .8497, back = -.5891, front = .7019;
  const ring = (inset: number) => [
    [left + inset, back + .153], [left + .082, back + inset],
    [right - .162, back + inset], [right - inset, back + .154],
    [right - inset, front - .398], [right - .322, front - inset],
    [left + .102, front - inset], [left + inset, front - .083],
  ].map(([x, z]) => [x, -z] as const).reverse();
  put(P, 'turretDetail', sectionSolid([{ z: 2.38269, ring: ring(0) },
    { z: 2.40129, ring: ring(.010) }]).rotateX(-Math.PI / 2));
}

export function addAmx40ObliqueRoofSight(P: TankBuilderPort): void {
  const x = .68411, z = -.42216, yaw = -.633, width = .1361, depth = .1116;
  sourceServicePlate(P);
  // Actual source round flange; the enclosed lower 7mm of the case is an
  // explicit engagement allowance across the source's unconnected base gap.
  put(P, 'turretDetail', cylY(.12815, .12815, .024, 32), .68191, 2.41029, -.42081);
  const place = (slot: string, g: THREE.BufferGeometry, u: number, y: number, v: number) =>
    put(P, slot, g, x + u * Math.cos(yaw) + v * Math.sin(yaw), y,
      z - u * Math.sin(yaw) + v * Math.cos(yaw), yaw);
  place('turretDetail', new THREE.BoxGeometry(width, 2.51259 - 2.42129, depth), 0,
    (2.51259 + 2.42129) / 2, 0);
  for (const sign of [-1, 1]) place('turretDetail', box(.013, .061, depth),
    sign * (width - .013) / 2, 2.54309, 0);
  place('turretDetail', box(width - .026, .061, .010), 0, 2.54309, (depth - .010) / 2);
  const ring = (w: number, d: number) => [[-w / 2, -d / 2], [w / 2, -d / 2],
    [w / 2, d / 2], [-w / 2, d / 2]] as const;
  const cap = sectionSolid([{ z: 2.57359, ring: ring(width, depth) },
    { z: 2.57849, ring: ring(width, depth) },
    { z: 2.58929, ring: ring(width - .018, depth - .018) }]).rotateX(-Math.PI / 2);
  put(P, 'turretDetail', cap, x, 0, z, yaw);
  place('turretGlass', box(.11038, .061, .002), .00065, 2.54409, -.0521);
}

export function addAmx40WeaponSideMechanism(mg: ReturnType<typeof sourceMachineGun>): void {
  // Source 6368 is a folded tray with a narrow upstanding inner web, not
  // the old broad solid box. Source 17277 is its closed longitudinal roller.
  const rows = [[-.084, 2.50719, 2.5320, 2.57849], [.010, 2.519, 2.5325, 2.67029],
    [.15, 2.521, 2.5328, 2.623], [.27749, 2.52189, 2.53359, 2.57949]];
  mg.add('turretDetail', sectionSolid(rows.map(([z, bottom, floor, top]) => ({ z, ring: [
    [-1.33884, bottom], [-1.21094, bottom], [-1.21094, top],
    [-1.23334, top], [-1.23334, floor], [-1.33884, floor],
  ] }))), 0, 0, 0);
  for (const center of [-1.30909, -1.25629]) {
    const rollers = [[-.01611, 2.55484, .01805, .02175], [.03439, 2.55869, .02295, .02270],
      [.24289, 2.55969, .02195, .02180], [.27729, 2.55414, .01710, .02245]];
    mg.add('turretDark', sectionSolid(rollers.map(([z, y, rx, ry]) => ({ z,
      ring: Array.from({ length: 24 }, (_, i) => {
        const angle = i * Math.PI / 12;
        return [center + rx * Math.cos(angle), y + ry * Math.sin(angle)] as const;
      }),
    }))), 0, 0, 0);
  }
  mg.add('turretDetail', cylZ(.04345, .0339, 20), -1.28314, 2.61079, .22574);
  mg.add('turretDetail', cylZ(.03025, .0092, 20), -1.28314, 2.61079, .24729);
}
