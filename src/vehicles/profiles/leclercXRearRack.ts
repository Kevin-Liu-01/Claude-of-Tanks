// First-party closed rods, floor and canted box from independent scalar
// planes of the complete source. No source mesh or connectivity is reused.
import * as THREE from 'three';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
const YAW: Point = [-.00215336, 1.40294995, .72122934];

function add(P: TankBuilderPort, geometry: THREE.BufferGeometry, lattice = false): void {
  // The rear rack's bins carry camouflage; its open frame is painted lattice.
  P.addEquipment(lattice ? 'turretOpenLattice' : 'turretPaintedDetail',
    lattice ? geometry : markFixedPaintedPanel(geometry, 'leclerc-x-rear-rack', 'turretDetail'), -YAW[0], -YAW[1], -YAW[2]);
}

function rod(P: TankBuilderPort, a: Point, b: Point, radius = .014): void {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start), length = delta.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  add(P, geometry.translate(...start.add(end).multiplyScalar(.5).toArray()), true);
}

function horizontalStock(P: TankBuilderPort, a: Point, b: Point): void {
  const rx = .0164695, ry = .015823;
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  const ring = Array.from({ length: 16 }, (_, i) => {
    const angle = i * Math.PI / 8;
    return [rx * Math.cos(angle), ry * Math.sin(angle)] as const;
  });
  add(P, sectionSolid([{ z: 0, ring }, { z: length, ring }])
    .rotateY(Math.atan2(dx, dz)).translate(...a), true);
}

function hoop(P: TankBuilderPort, y: number, forwardShift: number): void {
  // Two unequal forward returns and chamfered rear bends form a U. There
  // is no broad upper shelf spanning the large central source opening.
  const left = -1.4845745, right = -.0823588, back = -2.3058405 + forwardShift;
  const path: Point[] = [[left, y, -1.4200752 + forwardShift],
    [left, y, back + .25274], [-1.3281164, y, back],
    [-.2474117, y, back], [right, y, back + .25168],
    [right, y, -1.6781838 + forwardShift]];
  for (let i = 1; i < path.length; i++) horizontalStock(P, path[i - 1], path[i]);
  for (const p of path.slice(1, -1)) add(P, new THREE.SphereGeometry(1, 12, 8)
    .scale(.0164695, .015823, .0164695).translate(...p), true);
}

function basketFloor(P: TankBuilderPort): void {
  const left = -1.4845745, right = -.0823588, back = -2.202621;
  const ring = [[left, -1.3168557], [left, back + .25274], [-1.3281164, back],
    [-.2474117, back], [right, back + .25168], [right, -1.5749643],
    [-.19253, -1.3168557]].map(([x, z]) => [x, -z] as const).reverse();
  add(P, sectionSolid([{ z: 1.838, ring }, { z: 1.845575, ring }]).rotateX(-Math.PI / 2));
  add(P, new THREE.BoxGeometry(1.1814579, .0227255, .4163181)
    .translate(-.7832597, 1.8439923, -1.9356536));
}

function basketPosts(P: TankBuilderPort): void {
  // Actual rear posts kink between the lower stepped hoops and upper pair.
  // Side posts instead remain vertical beside the forward return stocks.
  for (const x of [-1.25426, -.97039, -.65950, -.34096]) {
    rod(P, [x, 1.852, -2.20521], [x, 2.067, -2.306], .01396);
    rod(P, [x, 2.062, -2.30868], [x, 2.19220, -2.30868], .01396);
  }
  for (const x of [-1.48817, -.08962])
    rod(P, [x, 1.85170, -1.94687], [x, 2.18895, -1.94687], .0145);
}

const boxRoof = (x: number, z: number) => z < -1.924
  ? (2.4507574217 + .0007114 * x + .0941367 * z) / .995559
  : (2.0393319977 - .0000296 * x - .1170752 * z) / .9931231;
const boxFloor = (x: number, z: number) => z < -1.924
  ? (.2507774386 - .0018416 * x - .6119644 * z) / .7908832
  : Math.max((1.5666115173 - .0000298 * x - .117075 * z) / .9931231,
    (1.7371206367 + .065742 * x - .0002304 * z) / .9978366);

function boxSection(z: number) {
  const left = z < -1.924 ? .14722 - .01091 * (z + 1.925) : .14682 + .19996 * (z + 1.924);
  const upperRight = z < -1.924 ? .95645 - .0109 * (z + 1.925) : .95665 + .19996 * (z + 1.924);
  const lowerRight = z < -1.924 ? upperRight : .95648 + .0035 * (z + 1.924);
  // The sloping lower edge has a genuine outboard rise, represented by
  // regular analytic subdivisions rather than a copied source contour.
  const bottom = Array.from({ length: 9 }, (_, i) => {
    const x = left + (lowerRight - left) * i / 8;
    return [x, boxFloor(x, z)] as const;
  });
  return { z, ring: [...bottom, [lowerRight, Math.min(boxRoof(lowerRight, z) - .065, 2.21427)],
    [upperRight, boxRoof(upperRight, z)], [left, boxRoof(left, z)]] as readonly (readonly [number, number])[] };
}

function rearBox(P: TankBuilderPort): void {
  const rows = [-2.18, -2.10, -2.0, -1.924, -1.85, -1.75, -1.65, -1.517];
  const sections = rows.map(boxSection);
  // The source rear wall leans 35mm per metre; its toe is not an overhanging
  // full-height cuboid. The terminal ring uses intersections of the three
  // measured planes, then its Z coordinates land on the inclined rear face.
  const low = (x: number) => (.2507774386 - .0018416 * x
    + .6119644 * (2.0927781869 + .0034887 * x) / .9993909)
    / (.7908832 - .6119644 * .0347227 / .9993909);
  const high = (x: number) => (2.4507574217 + .0007114 * x
    - .0941367 * (2.0927781869 + .0034887 * x) / .9993909)
    / (.995559 + .0941367 * .0347227 / .9993909);
  sections[0].ring = sections[0].ring.map(([x], i) => [x,
    i < 9 ? low(x) : i === 9 ? (low(x) + high(x)) / 2 : high(x)]);
  const body = sectionSolid(sections), p = body.attributes.position;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i) + 2.18) < .000001)
    p.setZ(i, (-2.0927781869 - .0034887 * p.getX(i) - .0347227 * p.getY(i)) / .9993909);
  body.computeVertexNormals();
  add(P, body);
  // Separate low canted cover is visible below the main box, not a dark
  // painted rectangle. Its measured top overlaps the main lower face.
  const cover = [-2.158, -2.10, -2.00, -1.947].map(z => {
    const low = (x: number) => (.2294432473 - .0018414 * x - .611965 * z) / .7908827;
    return { z, ring: [[.173, low(.173)], [.932, low(.932)],
      [.932, low(.932) + .04145], [.173, low(.173) + .04145]] as const };
  });
  add(P, sectionSolid(cover));
}

export function addLeclercXRearRack(P: TankBuilderPort): void {
  basketFloor(P);
  for (const [y, shift] of [[1.855354, .1032195], [1.9576867, .0505893],
    [2.0650048, 0], [2.1886936, 0]]) hoop(P, y, shift);
  basketPosts(P);
  rearBox(P);
}
