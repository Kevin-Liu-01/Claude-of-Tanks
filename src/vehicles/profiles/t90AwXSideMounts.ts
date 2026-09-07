// Original compact side-cassette mounting hardware, built from scalar source
// planes. Broad fixed skirts and removable cassette skins are unchanged.
import * as THREE from 'three';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type SectionPoint = readonly [number, number];
const CENTER_X = -.0009499788284301758;

function solid(ring: readonly SectionPoint[], back: number, front: number, side: number): THREE.BufferGeometry {
  const section = side > 0 ? ring : ring.map(([x, y]) => [2 * CENTER_X - x, y] as const).reverse();
  return sectionSolid([{ z: back, ring: section }, { z: front, ring: section }]);
}

function add(P: TankBuilderPort, geometry: THREE.BufferGeometry, name: string): void {
  geometry.userData.t90AwSideMount = name;
  P.addEquipment('hullDetail', geometry);
}

function carrier(P: TankBuilderPort, side: number, back: number, front: number,
  webBack: number, webFront: number, lipFront: number): void {
  add(P, solid([[1.72755, 1.1875], [1.79985, 1.1875],
    [1.79985, 1.2979], [1.72755, 1.2979]], back, front, side), 'carrierBase');
  // The rolled outer toe rises only to 1.2168 m. The space above that toe
  // remains open except at the narrow central support web.
  add(P, solid([[1.79985, 1.1875], [1.81935, 1.1875], [1.83015, 1.1943],
    [1.82615, 1.2168], [1.81255, 1.2129], [1.81055, 1.2881],
    [1.79985, 1.2979]], back + .0332, lipFront, side), 'carrierFoldedToe');
  // Independent front-cap outline measures the underside of the web. A
  // bbox solid here would erase the large triangular opening below its root.
  add(P, solid([[1.67095, 1.292], [1.81255, 1.2822], [1.81255, 1.2129],
    [1.82615, 1.2168], [1.82615, 1.2891], [1.81835, 1.2988],
    [1.71875, 1.3398]], webBack, webFront, side), 'carrierInclinedWeb');
}

function receivingPin(P: TankBuilderPort, side: number): void {
  const aft: readonly SectionPoint[] = [[1.80565, 1.3135], [1.81545, 1.3096],
    [1.82425, 1.3125], [1.82815, 1.3203], [1.82525, 1.3281],
    [1.81745, 1.332], [1.80955, 1.3291], [1.80565, 1.3223]];
  const forward: readonly SectionPoint[] = [[1.80565, 1.3213], [1.80865, 1.3135],
    [1.81645, 1.3096], [1.82425, 1.3135], [1.82815, 1.3213],
    [1.82425, 1.3291], [1.81645, 1.332], [1.80865, 1.3291]];
  add(P, solid(aft, 1.58005, 1.61435, side), 'receivingShaftAft');
  add(P, solid(forward, 1.62975, 1.66405, side), 'receivingShaftForward');
  add(P, solid([[1.79395, 1.3213], [1.79885, 1.3076], [1.80955, 1.2998],
    [1.82325, 1.2998], [1.83495, 1.3076], [1.83885, 1.3213],
    [1.83495, 1.334], [1.82325, 1.3418], [1.80955, 1.3418],
    [1.79885, 1.334]], 1.61425, 1.62985, side), 'receivingCollar');
  for (const [back, front] of [[1.54295, 1.58015], [1.66395, 1.70115]]) {
    const ring: SectionPoint[] = Array.from({ length: 8 }, (_, i) => {
      const a = i * Math.PI / 4;
      return [1.81645 + .0156 * Math.sin(a), 1.3213 + .0156 * Math.cos(a)];
    });
    add(P, solid(ring.reverse(), back, front, side), 'receivingStockEnd');
  }
}

export function addT90AWSideMounts(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    carrier(P, side, 1.41795, 1.58495, 1.48245, 1.51955, 1.55275);
    carrier(P, side, 1.65915, 1.82715, 1.72465, 1.76075, 1.79395);
    carrier(P, side, 2.21585, 2.38285, 2.28125, 2.31735, 2.35055);
    receivingPin(P, side);
  }
}
