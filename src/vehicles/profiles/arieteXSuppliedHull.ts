// Independent Ariete supplied-file tub and armor. No photo-draft geometry,
// source topology, whole-vehicle wrapper or dimension-fit transform is used.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX } = KIT;
type Station = readonly [z: number, bottom: number, roof: number];

function stock(rows: readonly Station[], left: number, right: number) {
  return sectionSolid(rows.map(([z, bottom, roof]) => ({ z,
    ring: [[left, bottom], [right, bottom], [right, roof], [left, roof]],
  })));
}

function lowerTub(P: TankBuilderPort): void {
  // Rear and lower-glacis fold locations are separate from the shoulder
  // shell: there is no broad filled slab over either end wheel.
  P.add('hull', stock([
    [-3.157488, .990815, 1.200249], [-2.763854, .402046, 1.200249],
    [2.657875, .402046, 1.200249], [3.035, .69896, 1.1873],
    [3.329914, .931097, 1.02028], [3.400566, .990, .9918],
  ], -.877267, .877267));
  P.add('hull', stock([[-3.190291, .877267, 1.038758],
    [-3.155, .877267, 1.0404]], -.28808, .28808));
}

function bearingDeck(P: TankBuilderPort): void {
  const shape = new THREE.Shape();
  shape.moveTo(-.878, -.862968); shape.lineTo(.878, -.862968);
  shape.lineTo(.878, 1.760422); shape.lineTo(-.878, 1.760422); shape.closePath();
  // Preserve the actual offset well. Its floor is the tub's Y1.200249 crown;
  // the yaw bearing's center is 23.55 mm forward of this circular opening.
  const hole = new THREE.Path();
  hole.absarc(0, .304478, .770447, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const deck = new THREE.ExtrudeGeometry(shape, { depth: .147192,
    bevelEnabled: false, curveSegments: 48 }).rotateX(Math.PI / 2);
  P.add('hull', deck, 0, 1.347441, 0);
  const ring = new THREE.LatheGeometry([[.690, 1.200249], [.740, 1.200249],
    [.740, 1.3070], [.690, 1.3070], [.690, 1.200249]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 64);
  // Concealed 0.8 mm bearing contact is inferred; the visible well stays open.
  P.add('hull', ring, 0, 0, .328029);
  P.add('hull', stock([[-3.157488, 1.199, 1.497999],
    [-1.497157, 1.199, 1.497999], [-.862968, 1.199, 1.347441]], -.878, .878));
  P.add('hull', stock([[1.760422, 1.199, 1.346614],
    [2.935438, 1.198, 1.23305], [3.035, 1.17, 1.1873]], -.878, .878));
}

function shoulders(P: TankBuilderPort, side: -1 | 1): void {
  // The source return course clips its concealed shoulder floor by18.5mm.
  // Raise only that hidden floor to1.080; keep all exterior roof/fold planes.
  const rows: readonly Station[] = [[-3.157488, 1.08, 1.4264],
    [-1.497157, 1.08, 1.428], [-.862968, 1.08, 1.347441],
    [1.760422, 1.08, 1.346614], [2.935438, 1.08, 1.23305],
    [3.1, 1.003754, 1.139102], [3.400566, .931097, .9918]];
  const inner = .876, outer = 1.489588;
  P.add('hull', stock(rows, side < 0 ? -outer : inner, side < 0 ? -inner : outer));
  for (const [a, b, innerRoof, outerRoof] of [
    [-3.157488, -1.497157, 1.497999, 1.428],
  ]) {
    const section = (z: number): SolidSection => {
      const ring: [number, number][] = [[inner, 1.423], [outer, 1.423],
        [outer, outerRoof], [1.424823, innerRoof], [inner, innerRoof]];
      return { z, ring: side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring };
    };
    P.add('hull', sectionSolid([section(a), section(b)]));
  }
}

function thinSkirts(P: TankBuilderPort, side: -1 | 1): void {
  const x = side < 0 ? -1.521549 : 1.521970;
  // The thin outside return joins the skirt hinge to the shoulder wall. It
  // sits OUTSIDE the track envelope; do not fill the raised wheel-well roof.
  P.add('hull', box(.047, .054, 3.092), side * 1.5105, 1.063, -1.62);
  P.addExternalArmor('hull', box(.0155, .209434, .548397), x, .971891, -2.890019);
  for (const [a, b] of [[-2.61582, -1.697339], [-1.687246, -.776335],
    [-.770447, .141305], [.148875, 1.059786], [1.06315, 1.974061],
    [1.98079, 2.89086]]) {
    P.addExternalArmor('hull', box(side < 0 ? .01514 : .015981, .418868, b - a),
      x, .831848, (a + b) / 2);
    for (const z of [a + .052, b - .052]) {
      // Positive carrier roots reach the shoulder's fixed outer wall.
      P.addEquipment('hullDetail', box(.047, .033, .047), side * 1.504, 1.048, z);
      P.addEquipment('hullDetail', cylX(.012, .022, 10), side * 1.532, 1.052, z);
    }
  }
  P.addMudguard(`ariete-source-forward-skirt-${side}`, 'hullDetail',
    box(.039, .353262, .50466), side * 1.509, .95633, 3.141507);
}

function heavyPanel(side: -1 | 1, rear: number, front: number) {
  // Author-selected planar bevel contour; no sampled boundary is imported.
  const ring: [number, number][] = [[1.503045, 1.07072], [1.535, .689],
    [1.7293, .532416], [1.792, .532416], [1.805, .545033],
    [1.805, 1.211184], [1.66117, 1.333143], [1.503045, 1.333143]];
  const contour = side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring;
  return sectionSolid([rear, front].map(z => ({ z, ring: contour })));
}

function heavySkirts(P: TankBuilderPort, side: -1 | 1): void {
  for (const [a, b] of [[-.074858, .394], [.416, .874], [.896, 1.338],
    [1.361, 1.813], [1.836, 2.289], [2.314, 2.770582]]) {
    P.addExternalArmor('hull', heavyPanel(side, a, b));
    for (const z of [a + .052, b - .052]) {
      P.addEquipment('hullDetail', box(.16, .062, .047), side * 1.491, 1.314, z);
      P.addEquipment('hullDetail', cylX(.015, .032, 10), side * 1.579, 1.331, z);
    }
  }
  P.addExternalArmor('hull', box(.300, .2942, .30532), side * 1.654, 1.186043, -.23004);
}

export function addArieteXSuppliedHull(P: TankBuilderPort): void {
  lowerTub(P); bearingDeck(P);
  for (const side of [-1, 1] as const) {
    shoulders(P, side); thinSkirts(P, side); heavySkirts(P, side);
  }
}
