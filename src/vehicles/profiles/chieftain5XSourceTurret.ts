// Independently authored source-specific casting, not the superseded photo
// turret and not a resampled source contour. Scalar width/roof/shoulder stations
// drive original rounded sections; the front gun notch remains actual space.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { chieftainCastSection, chieftainCheekHorn, type ChieftainHornRow } from './chieftainXFoundation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type Row = readonly [z: number, halfWidth: number, roofHalfWidth: number, low: number, top: number];

function castRing(width: number, flat: number, low: number, top: number): SolidSection['ring'] {
  const sideTop = low + Math.min(.10, (top - low) * .16);
  return chieftainCastSection({ z: 0, floor: [[-width * .97, low], [width * .97, low]],
    rightSide: [[width, sideTop]], roofHalfWidth: flat, roofY: top }).ring;
}

function mainCasting(): THREE.BufferGeometry {
  const rows: readonly Row[] = [
    [-1.65909, .900, .895, 1.7702, 2.2546], [-1.30, .942, .880, 1.7653, 2.2935],
    [-1.04, .980, .84, 1.7615, 2.3152], [-.89, 1.017, .820, 1.7593, 2.3144],
    [-.86, 1.024, .810, 1.5399, 2.3143], [-.20, 1.183, .720, 1.5399, 2.3119],
    [.20, 1.251, .715, 1.5399, 2.3111], [.60, 1.234, .630, 1.5399, 2.3074],
    [1.00, 1.088, .400, 1.5399, 2.2886], [1.30, .859, .240, 1.5399, 2.2526],
    [1.50, .595, .180, 1.5387, 2.1588],
  ];
  return sectionSolid(rows.map(([z, width, flat, low, top]) => ({ z,
    ring: castRing(width, flat, low, top) })));
}

function cheekHorn(side: number): THREE.BufferGeometry {
  const rows: readonly ChieftainHornRow[] = [[1.499, .160, .594, 1.5387, 2.1588],
    [1.65, .168, .339, 1.5390, 2.0717], [1.80, .172, .251, 1.8133, 1.9470],
    [1.8598, .185, .212, 1.861, 1.891]];
  return chieftainCheekHorn(side, rows);
}

export function addChieftain5XSourceTurret(P: TankBuilderPort, pivot: Point): void {
  const add = (g: THREE.BufferGeometry) => P.add('turret', g.translate(-pivot[0], -pivot[1], -pivot[2]));
  add(mainCasting());
  add(cheekHorn(-1));
  add(cheekHorn(1));
  add(KIT.cylY(.991, .991, .123, 40).translate(.0031, 1.476, .36928));
  // Low central sill and rear wall enclose the bearing, but do not span the
  // notch above the actual source sill or join the two forward horns in air.
  add(KIT.box(.336, .219, .181).translate(0, 1.6478, 1.5885));
}
