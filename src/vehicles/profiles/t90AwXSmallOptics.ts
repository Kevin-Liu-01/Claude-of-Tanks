// Original small right roof optic from scalar bounds/planes of source
// islands 30478, 49724 and glazing 149. No source mesh or contour arrays.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { T90_AW_X_SOURCE_DATUMS } from '../t90AwXArmor.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const SHIFT = [-.00094997882843, 0, .37695002555847] as const;
const PIVOT = T90_AW_X_SOURCE_DATUMS.turretPivot;
type Pair = readonly [number, number];

function emit(P: TankBuilderPort, g: THREE.BufferGeometry, name: string, glass = false): void {
  g.userData.t90AwSmallOptic = name;
  P.addEquipment(glass ? 'turretGlass' : 'turretDetail', g,
    SHIFT[0] - PIVOT[0], -PIVOT[1], SHIFT[2] - PIVOT[2]);
}

function box(P: TankBuilderPort, name: string, a: readonly [number, number, number],
  b: readonly [number, number, number], glass = false): void {
  emit(P, KIT.box(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    .translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), name, glass);
}

function roundedRing(inset: number): Pair[] {
  const x = .44530, z = -.38478, w = .17380 / 2 - inset, d = .12460 / 2 - inset;
  const r = Math.max(.006, .01930 - inset), result: Pair[] = [];
  for (let corner = 0; corner < 4; corner++) {
    const cx = x + (corner === 0 || corner === 3 ? w - r : -w + r);
    const cz = z + (corner < 2 ? d - r : -d + r);
    for (let j = 0; j <= 3; j++) {
      const theta = (corner + j / 3) * Math.PI / 2;
      result.push([cx + r * Math.cos(theta), -(cz + r * Math.sin(theta))]);
    }
  }
  return result.reverse();
}

function base(P: TankBuilderPort): void {
  // Source support, not an inferred pedestal. The lower stock genuinely
  // enters the permanent cast roof; the 8.8 mm upper chamfer narrows its cap.
  emit(P, sectionSolid([
    { z: 2.153879880905, ring: roundedRing(0) },
    { z: 2.302279949188, ring: roundedRing(0) },
    { z: 2.311079978943, ring: roundedRing(.0117) },
  ]).rotateX(-Math.PI / 2), 'roundedBase');
}

const crown = (z: number): number => (2.372281533209 + .009450685794 * z) / .999955341272;
const backCrown = (z: number): number => (1.875121026284 + .743750019887 * z) / .668457857997;

function sheet(P: TankBuilderPort, name: string, x0: number, x1: number,
  zs: readonly number[], low: (z: number) => number, high: (z: number) => number): void {
  emit(P, sectionSolid(zs.map(z => ({ z, ring: [[x0, low(z)], [x1, low(z)],
    [x1, high(z)], [x0, high(z)]] }))), name);
}

function shell(P: TankBuilderPort): void {
  // Real sloping rear wall and almost level hood roof. Original 4 mm
  // concealed shell stock closes the back without filling the optical void.
  sheet(P, 'slopingRear', .3794, .5059, [-.42868, -.39228], z => backCrown(z) - .004, backCrown);
  sheet(P, 'hoodRoof', .3794, .5059, [-.39228, -.35868, -.33938], () => 2.365780115128, crown);
  box(P, 'rearWall', [.3794, 2.311079978943, -.42878], [.5059, 2.328180074692, -.42468]);
  box(P, 'floor', [.374, 2.311079978943, -.42468], [.5112, 2.31508, -.35868]);
  for (const [a, b] of [[.374, .3794], [.5059, .5112]]) {
    sheet(P, 'sideWall', a, b, [-.42338, -.39228, -.35868], () => 2.311079978943,
      z => Math.min(backCrown(z), crown(z)) - .0054);
    box(P, 'hoodSideWing', [a, 2.356980085373, -.35868], [b, 2.365780115128, -.33938]);
    // Narrow beveled transition meets the upper sheet and the side stock.
    for (const [z0, z1, top] of [[-.42338, -.39228, backCrown], [-.39228, -.33938, crown]] as const) {
      const inner = a === .374 ? b : a, outer = a === .374 ? a : b;
      emit(P, sectionSolid([z0, z1].map(z => {
        const y = top(z), ring: Pair[] = [[outer, y - .0064], [inner, y - .001],
          [inner, y], [outer, y - .0054]];
        return { z, ring: outer < inner ? ring : [...ring].reverse() };
      })), 'hoodEdgeBevel');
    }
  }
}

function glazingFrame(P: TankBuilderPort): void {
  const front = -.358680009842, rear = front - .004;
  // The source glazing occupies a literal opening in the front wall. It is
  // not a dark painted rectangle on a solid front block.
  box(P, 'windowLeft', [.374, 2.311079978943, rear], [.388700008392, 2.365780115128, front]);
  box(P, 'windowRight', [.495099991560, 2.311079978943, rear], [.5112, 2.365780115128, front]);
  box(P, 'windowSill', [.388700008392, 2.311079978943, rear], [.495099991560, 2.317879915237, front]);
  box(P, 'windowHeader', [.388700008392, 2.351079940796, rear], [.495099991560, 2.365780115128, front]);
  box(P, 'glazing', [.388700008392, 2.317879915237, front - .0008],
    [.495099991560, 2.351079940796, front], true);
}

export function addT90AWSmallOptics(P: TankBuilderPort): void {
  base(P); shell(P); glazingFrame(P);
}
