// Original thin-stock construction from sparse source18 sections. The curve
// between stations and the small aperture end chamfers are analytic
// approximations; no source vertex or topology payload is retained.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { closedSectionLoft, type CrossSection, type XY } from './abramsSourceXGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { addAbramsPaintedHullPanel } from './abramsPaintedHullPanel.ts';

type Station = readonly [z: number, inner: number, outer: number, bottom: number, top: number];
type Aperture = readonly [z: number, low0: number, high0: number, low1: number, high1: number];
interface ReturnRecipe {
  name: string;
  stations: readonly Station[];
  apertures: readonly Aperture[];
}

// The values below describe sheet sections, not an enclosing prism. Front
// and aft returns differ in height and fold direction in the supplied file.
const FRONT: ReturnRecipe = {
  name: 'front',
  stations: [
    [-2.88106, 1.82855, 1.83686, .37616, 1.07018],
    [-2.845, 1.82855, 1.83689, .361466, 1.08850],
    [-2.82, 1.82859, 1.84432, .359822, 1.090148],
    [-2.795, 1.873112, 1.900658, .329701, 1.120239],
    [-2.77, 1.929861, 1.956850, .329731, 1.120271],
    [-2.72, 2.042866, 2.069540, .329731, 1.120339],
    [-2.695, 2.099468, 2.125963, .329696, 1.120373],
    [-2.67, 2.140646, 2.158341, .329689, 1.120380],
    [-2.65, 2.162299, 2.178203, .329689, 1.120380],
    [-2.640, 2.1629, 2.17913, .329689, 1.120380],
  ],
  apertures: [
    [-2.769, .4265, .4265, 1.0209, 1.0209],
    [-2.764, .386378, .458661, .988431, 1.060774],
    [-2.750, .386378, .470719, .976439, 1.060796],
    [-2.730, .386378, .470781, .976439, 1.060826],
    [-2.717, .386378, .459629, .987655, 1.060845],
    [-2.713, .388425, .444236, 1.003262, 1.058686],
    [-2.707, .4163, .4163, 1.0310, 1.0310],
  ],
};
const REAR: ReturnRecipe = {
  name: 'rear',
  stations: [
    [2.712, 2.1629, 2.17911, .407757, 1.198440],
    [2.720, 2.159536, 2.177169, .407757, 1.198440],
    [2.745, 2.132490, 2.149767, .407757, 1.198440],
    [2.770, 2.082409, 2.108969, .407773, 1.198424],
    [2.820, 1.969479, 1.996664, .407817, 1.198360],
    [2.845, 1.912678, 1.940068, .407783, 1.198329],
    [2.870, 1.855949, 1.883703, .409583, 1.196441],
    [2.895, 1.828585, 1.836892, .439487, 1.166560],
    [2.920, 1.828556, 1.836910, .439487, 1.166560],
    [2.94862, 1.82854, 1.83691, .45423, 1.14825],
  ],
  apertures: [
    [2.777, .4998, .4998, 1.1031, 1.1031],
    [2.782, .464437, .531872, 1.071532, 1.138840],
    [2.797, .464437, .548777, 1.054500, 1.138840],
    [2.820, .464437, .548777, 1.054500, 1.138840],
    [2.831, .464437, .537879, 1.065316, 1.138840],
    [2.835, .466381, .522698, 1.080170, 1.137013],
    [2.841, .4945, .4945, 1.1086, 1.1086],
  ],
};

function interpolate<T extends readonly number[]>(rows: readonly T[], z: number): number[] {
  let i = 0;
  while (i < rows.length - 2 && z > rows[i + 1][0]) i++;
  const a = rows[i], b = rows[i + 1];
  const t = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
  return a.map((value, k) => value + (b[k] - value) * t);
}

function bandSection(recipe: ReturnRecipe, side: number, z: number,
  band: number, split: boolean): CrossSection {
  const [, inner, outer, bottom, top] = interpolate(recipe.stations, z);
  const [, low0, high0, low1, high1] = interpolate(recipe.apertures, z);
  const low = split ? [bottom, high0, high1][band] : bottom;
  const high = split ? [low0, low1, top][band] : top;
  const ring: XY[] = [[side * inner, low + .203945], [side * outer, low + .203945],
    [side * outer, high + .203945], [side * inner, high + .203945]];
  return { z: .357965 - z, ring: side < 0 ? ring.reverse() : ring };
}

function returnStock(recipe: ReturnRecipe, side: number): THREE.BufferGeometry {
  const zValues = [...new Set([...recipe.stations, ...recipe.apertures].map(row => row[0]))]
    .sort((a, b) => a - b);
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < zValues.length - 1; i++) {
    const a = zValues[i], b = zValues[i + 1];
    const split = a >= recipe.apertures[0][0] && b <= recipe.apertures[recipe.apertures.length - 1][0];
    for (let band = 0; band < (split ? 3 : 1); band++) {
      pieces.push(closedSectionLoft([bandSection(recipe, side, b, band, split),
        bandSection(recipe, side, a, band, split)]));
    }
  }
  const geometry = KIT.mergeAll(pieces);
  geometry.userData.abramsSourceReturn = `${recipe.name}:${side}`;
  return geometry;
}

function receivingStock(P: TankBuilderPort, side: number): void {
  // Actual thin front receiving skin overlaps the return's inner root.
  // It also overlaps the existing skirt receiving plate, not an invented
  // pedestal filling the air behind the curved sheet.
  addAbramsPaintedHullPanel(P, side, KIT.box(.00969, .706835, .91),
    side * 1.824115, 1.0230, 3.08);
  for (const [rawZ, rawY] of [[-2.73, .489679], [-2.73, .966948],
    [2.79745, .567746], [2.79745, 1.04495]]) {
    P.addEquipment('hullDetail', KIT.box(.334, .0089, .035),
      side * 1.996, rawY + .203945, .357965 - rawZ);
  }
  // The outward tips fold back inboard at each end. These are 4 mm-deep
  // returns with positive lap into the curved skin, not wide opaque caps.
  for (const [rawZ, bottom, top, depth] of [[-2.640195, .329689, 1.120380, .00813],
    [2.70802, .407757, 1.198440, .00888]]) {
    P.addEquipment('hullDetail', KIT.box(.089, top - bottom, depth),
      side * 2.132, (bottom + top) / 2 + .203945, .357965 - rawZ);
  }
}

export function addAbramsSourceXSkirtReturns(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    addAbramsPaintedHullPanel(P, side, returnStock(FRONT, side));
    addAbramsPaintedHullPanel(P, side, returnStock(REAR, side));
    receivingStock(P, side);
  }
}

