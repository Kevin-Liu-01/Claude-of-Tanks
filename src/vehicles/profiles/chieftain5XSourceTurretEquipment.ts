// Original solids driven by the supplied file's scalar equipment envelope.
// Small warped latches and cloth relief are simplified; open basket cells and
// recessed optical faces are geometric space, not dark-painted closed boxes.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { chieftain5SourceClothRoll } from './chieftain5XSourceClosure.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type Add = (bucket: string, geometry: THREE.BufferGeometry, x: number, y: number,
  z: number, rx?: number, ry?: number, rz?: number) => void;
const { box, cylX, cylY, cylZ, torus } = KIT;

function caseSolid(width: number, height: number, depth: number): THREE.BufferGeometry {
  return sectionSolid([-.5, .5].map(z => ({ z: z * depth,
    ring: [[-width / 2, -height / 2], [width / 2, -height / 2],
      [width / 2, height * .36], [width * .43, height / 2],
      [-width * .43, height / 2], [-width / 2, height * .36]],
  })));
}

function equipmentCases(add: Add): void {
  for (const [x, y, z, w, h, d] of [
    [.000448, 2.0032815, -1.899756, 1.444872, .482221, .481326],
    [-1.2127245, 2.0503385, -.199880, .447265, .423961, .627426],
    [1.3480695, 2.0113485, -.0053775, .791453, .575439, .485807],
    [-1.1065, 2.014485, -1.843735, .3962, .42397, .28503],
    [1.14505, 2.014035, -1.8451, .4409, .42487, .3522],
  ]) {
    add('turretDetail', caseSolid(w, h, d), x, y, z);
    add('turretDetail', box(w + .008, .013, d + .008), x, y + h / 2, z);
    for (const dx of [-w * .29, w * .29]) {
      add('turretDetail', box(.026, .052, .016), x + dx, y + .055, z - d / 2 - .006);
    }
  }
}

function basket(add: Add, side: number): void {
  const x0 = side < 0 ? -1.402 : .937, x1 = side < 0 ? -.934 : 1.686;
  const rear = -1.721, front = side < 0 ? -.645 : -.285;
  const bottom = side < 0 ? 1.850 : 1.802;
  const top = side < 0 ? 2.195 : 2.255;
  // Each rail is an independently supported bar. Only these actual open
  // lattices use the existing non-armor equipment role.
  for (const y of [bottom, top]) {
    for (const x of [x0, x1]) add('turretOpenLattice', cylZ(.011, front - rear, 10),
      x, y, (rear + front) / 2);
    for (const z of [rear, front]) add('turretOpenLattice', cylX(.011, x1 - x0, 10),
      (x0 + x1) / 2, y, z);
  }
  for (let i = 0; i < 7; i++) {
    const z = rear + (front - rear) * i / 6;
    for (const x of [x0, x1]) add('turretOpenLattice', cylY(.007, .007, top - bottom, 8),
      x, (top + bottom) / 2, z);
    add('turretOpenLattice', box(x1 - x0, .012, .026), (x0 + x1) / 2, bottom, z);
  }
  // Source inner legs meet the permanent casting, not an invented full floor.
  for (const z of [-1.50, -.84]) add('turretDetail', box(.055, .16, .040),
    side < 0 ? -.952 : .951, bottom - .060, z);
}

function stowage(add: Add): void {
  basket(add, -1);
  basket(add, 1);
  // The supplied starboard cloth roll has broad chamfered ends and contacts
  // the inboard case. Independent rounded sections retain its empty rack below.
  add('turretDetail', chieftain5SourceClothRoll(), 0, 0, 0);
  add('turretDetail', caseSolid(.328951, .475947, .637286),
    1.4538355, 2.0225525, -.93352);
  add('turretDetail', caseSolid(.499252, .253660, .298476),
    1.210932, 1.935609, -1.25530);
  for (const [x, y, z, radius, width] of [[-1.0267375, 2.0593015, -1.361066, .226, .209739],
    [1.199728, 2.0472015, -.8398545, .242, .389004]]) {
    add('turretDark', cylX(radius, width, 32), x, y, z);
    add('turretDetail', cylX(radius * .78, width + .004, 32), x, y, z);
    add('turretDetail', cylX(.058, width + .015, 20), x, y, z);
  }
}

function cupolaWindows(add: Add): void {
  const x = -.476844, z = -.45533;
  add('turretDetail', cylY(.4504, .4504, .050195, 40), x, 2.3259575, z);
  add('turretDetail', cylY(.393, .399, .124, 32), x, 2.409, z);
  add('turretDetail', cylY(.4544, .4544, .015237, 40), x, 2.4680245, z);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, s = Math.sin(a), c = Math.cos(a);
    // The source's glass panels span Y2.357329..2.444272. Native planar
    // frames regularize small source warp while retaining 18 mm approach air.
    add('turretGlass', box(.200, .086943, .004), x + s * .412, 2.4008005,
      z + c * .412, 0, a);
    for (const dx of [-.107, .107]) add('turretDetail', box(.014, .102, .029),
      x + s * .430 + c * dx, 2.4008, z + c * .430 - s * dx, 0, a);
    for (const dy of [-.0495, .0495]) add('turretDetail', box(.228, .012, .029),
      x + s * .430, 2.4008 + dy, z + c * .430, 0, a);
  }
  const cap = new THREE.LatheGeometry(Array.from({ length: 13 }, (_, i) => {
    const a = i * Math.PI / 24;
    return new THREE.Vector2(.26262 * Math.cos(a), .109352 * Math.sin(a));
  }), 40).scale(1, 1, .85325);
  add('turretDetail', cap, -.4781885, 2.475643, -.517178);
  for (const x1 of [-.60, -.36]) {
    add('turretDetail', box(.012, .027, .010), x1, 2.588, -.515);
    add('turretDetail', box(.038, .008, .010), x1, 2.602, -.515);
  }
}

function projector(add: Add): void {
  const x = -.8129645, y = 2.6203995, z = -.230803;
  // This source equipment is a round projector, not a machine gun. The
  // independent case ends behind the recessed lens and leaves its front open.
  add('turretDetail', cylZ(.1098, .026, 32), x, y, z - .068);
  const annulus = new THREE.LatheGeometry([[.096, -.067], [.1098, -.067],
    [.1098, .081117], [.096, .081117], [.096, -.067]]
    .map(([r, q]) => new THREE.Vector2(r, q)), 32).rotateX(Math.PI / 2);
  add('turretDetail', annulus, x, y, z);
  add('turretGlass', cylZ(.0954, .003, 32), x, y, -.160149);
  for (const dx of [-.096, .096]) add('turretDetail', box(.016, .130, .036),
    x + dx, 2.509, -.243);
  add('turretDetail', box(.222, .022, .062), x, 2.455, -.243);
}

function sightsAndHatch(add: Add): void {
  // Inclined cupola reflector: frame surrounding recessed sloped glass.
  const x = -.4651915, y = 2.57155, z = -.17461, tilt = -.385;
  add('turretDark', box(.238, .131, .022), x, y, z - .025, tilt);
  add('turretGlass', box(.221391, .119, .003), x, y, z, tilt);
  for (const dx of [-.117, .117]) add('turretDetail', box(.012, .140, .051),
    x + dx, y, z + .008, tilt);
  for (const dy of [-.065, .065]) add('turretDetail', box(.246, .012, .051),
    x, y + dy * Math.cos(tilt), z + dy * Math.sin(tilt) + .008, tilt);
  add('turretDetail', box(.10, .035, .14), x, 2.474, -.212);

  add('turretDetail', box(.571854, .037645, .613084), .507767, 2.3376095, -.363907);
  for (const [hx, hz] of [[.71437, -.52838], [.480875, -.62877],
    [.533765, -.10935], [.30027, -.2092915]]) {
    add('turretDetail', cylX(.023, .113, 16), hx, 2.3675, hz);
  }
  const sx = -.6764075;
  add('turretDetail', box(.365699, .018, .106662), sx, 2.204094, .354496);
  add('turretDark', box(.260, .104, .018), sx, 2.2565, .306);
  add('turretGlass', box(.222288, .086943, .003), -.668209, 2.2564925, .3888486);
  for (const dx of [-.169, .169]) add('turretDetail', box(.027, .142516, .106662),
    sx + dx, 2.266352, .354496);
  add('turretDetail', box(.371974, .025, .101285), -.679413, 2.367237, .323125);
}

function antennae(add: Add): void {
  for (const [x, base, z] of [[.816102, 2.461302, -.969821],
    [.968477, 2.388700, .482222], [-1.152223, 2.203161, .366596]]) {
    add('turretDetail', box(.135, .065, .135), x, base - .140, z);
    add('turretDark', cylY(.035, .0596, .115, 16), x, base - .0575, z);
    add('turretDark', cylY(.0035, .011652, 1.3480697, 12), x, base + .67403485, z);
  }
}

export function addChieftain5XSourceTurretEquipment(P: TankBuilderPort, pivot: Point): void {
  const add: Add = (bucket, g, x, y, z, rx = 0, ry = 0, rz = 0) =>
    P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2], rx, ry, rz);
  equipmentCases(add);
  stowage(add);
  cupolaWindows(add);
  projector(add);
  sightsAndHatch(add);
  antennae(add);
}
