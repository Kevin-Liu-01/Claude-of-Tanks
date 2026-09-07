// Original C1 furniture, interpreted from Army VIRIN 160512-A-DN311-428
// and the same event's unobstructed frontal frame (DVIDS 2587515). Dimensions
// and concealed closures are construction estimates, not photogrammetry.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ } = KIT;
type Point = readonly [number, number, number];

function add(P: TankBuilderPort, pivot: Point, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number, bucket = 'turretDetail'): void {
  P.addEquipment(bucket, geometry, x - pivot[0], y - pivot[1], z - pivot[2]);
}

function line(P: TankBuilderPort, pivot: Point, a: Point, b: Point, radius: number): void {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const axis = end.clone().sub(start);
  const geometry = cylZ(radius, axis.length(), 12).applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.normalize()));
  const center = start.add(end).multiplyScalar(.5);
  add(P, pivot, geometry, center.x, center.y, center.z);
}

export function addArieteXOpticalHead(P: TankBuilderPort, pivot: Point): void {
  // The new low socket is genuinely seated in the unchanged 2.50 m roof.
  add(P, pivot, cylY(.16, .19, .122, 24), .64, 2.558, .47);
  add(P, pivot, box(.38, .205, .22), .64, 2.7175, .425);
  add(P, pivot, box(.41, .031, .33), .64, 2.6335, .48);
  for (const x of [.505, .775]) add(P, pivot, box(.14, .202, .11), x, 2.7195, .590);
  // Same physical front-glass plane as the earlier genuine aperture. Raising
  // its clear height does not put an opaque box in the sight's approach air.
  add(P, pivot, box(.115, .169, .006), .64, 2.736, .613, 'turretGlass');
  add(P, pivot, box(.41, .0395, .345), .64, 2.84025, .4725);
  for (const x of [.462, .818]) for (const y of [2.669, 2.795]) {
    add(P, pivot, cylZ(.008, .009, 6), x, y, .6475);
  }
}

function lowerSight(P: TankBuilderPort, pivot: Point): void {
  // The frontal primary photo shows a broad, separate twin-window sight ahead
  // of the taller head. Side cheeks, top and sill surround two real recesses.
  // In the frontal photo the lower assembly is slightly inboard of the head.
  const pad = sectionSolid([{ z: .84, ring: [[.20, 2.491], [.88, 2.491],
    [.88, 2.517], [.20, 2.517]] }, { z: 1.22, ring: [[.20, 2.462], [.88, 2.462],
    [.88, 2.517], [.20, 2.517]] }]);
  add(P, pivot, pad, 0, 0, 0);
  add(P, pivot, box(.64, .168, .21), .54, 2.589, .955);
  for (const x of [.24, .54, .84]) add(P, pivot, box(.044, .168, .10), x, 2.589, 1.11);
  for (const y of [2.526, 2.671]) add(P, pivot, box(.64, .027, .10), .54, y, 1.11);
  for (const x of [.39, .69]) add(P, pivot, box(.226, .112, .006), x, 2.598, 1.099, 'turretGlass');
  // Paired hinged cheek doors sit outside the clear window planes.
  for (const x of [.198, .882]) {
    add(P, pivot, box(.032, .158, .19), x, 2.593, 1.078);
    add(P, pivot, cylY(.013, .013, .177, 12), x, 2.593, 1.173);
  }
}

function hatchHardware(P: TankBuilderPort, pivot: Point, x: number, z: number): void {
  for (const dx of [-.125, .125]) {
    add(P, pivot, box(.061, .056, .11), x + dx, 2.55, z - .275);
    add(P, pivot, cylX(.025, .098, 12), x + dx, 2.579, z - .264);
  }
  // Closed-rest hatch lift handle: two seated legs, genuinely open underside.
  for (const dx of [-.073, .073]) line(P, pivot,
    [x + dx, 2.570, z - .075], [x + dx, 2.632, z - .075], .010);
  line(P, pivot, [x - .08, 2.63, z - .075], [x + .08, 2.63, z - .075], .010);
}

function roofRails(P: TankBuilderPort, pivot: Point, side: number): void {
  const x = side * 1.21;
  line(P, pivot, [x, 2.565, -1.48], [x, 2.565, .68], .014);
  for (const z of [-1.44, -.62, .64]) {
    add(P, pivot, box(.063, .022, .085), x, 2.499, z);
    line(P, pivot, [x, 2.495, z], [x, 2.571, z], .012);
  }
}

export function addArieteXRoofFurniture(P: TankBuilderPort, pivot: Point): void {
  lowerSight(P, pivot);
  hatchHardware(P, pivot, .64, -.28);
  hatchHardware(P, pivot, -.62, -.21);
  for (const side of [-1, 1]) roofRails(P, pivot, side);
}

function boltStock(parts: THREE.BufferGeometry[], side: number, radius: number,
  angle: number, root: number, outer: number): void {
  const y = radius * Math.cos(angle), z = radius * Math.sin(angle);
  parts.push(cylX(.012, outer - root, 12).translate(side * (outer + root) / 2, y, z));
  parts.push(cylX(.0085, .013, 6).translate(side * (outer + .0045), y, z));
}

export function addArieteXWheelFasteners(core: THREE.BufferGeometry): THREE.BufferGeometry {
  // Localized hub nuts, not a new star-spoke or an enlarged wheel rim. Eight
  // positions and 17 mm hex heads are explicit interpretations of the photo.
  // Both faces share the original native spinning/suspension instance.
  const parts = [core];
  for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
    boltStock(parts, side, .075, i * Math.PI / 4, .150, .205);
  }
  const flat = parts.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
  const merged = mergeGeometries(flat, false);
  for (const geometry of new Set([...parts, ...flat])) geometry.dispose();
  if (!merged) throw new Error('Unable to join Ariete wheel fasteners to the original core');
  return merged;
}
