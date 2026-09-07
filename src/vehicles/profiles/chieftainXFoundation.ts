// First-party Chieftain foundation extracted from the supplied-file Mk5 X.
// Each variant supplies its own measured stations; no assembled tank, foreign
// vertices, rig scaling or equipment overlay participates in this construction.
import { sectionSolid, type SolidSection } from './sectionSolid.ts';

export type ChieftainSectionPoint = readonly [x: number, y: number];
export type ChieftainDeckRow = readonly [z: number, inner: number, outer: number,
  low: number, top: number];
export type ChieftainHornRow = readonly [z: number, inner: number, outer: number,
  low: number, top: number];

/** Reflect an authored right-hand tub/sponson contour. Centerline endpoints
 * belong to the Mk5 dished belly/crown; Mk10's flat bearing carrier instead
 * closes between its two measured lower corners and upper roof corners. */
export function chieftainHullSection(z: number,
  right: readonly ChieftainSectionPoint[]): SolidSection {
  const ring: [number, number][] = right.map(([x, y]) => [x, y]);
  if (right[0][0] === 0 && right[right.length - 1][0] === 0) {
    for (let i = right.length - 2; i > 0; i--) ring.push([-right[i][0], right[i][1]]);
  } else {
    ring.unshift([-right[0][0], right[0][1]]);
    for (let i = right.length - 1; i > 0; i--) ring.push([-right[i][0], right[i][1]]);
  }
  return { z, ring };
}

/** Closed folded deck stock, with independently specified outward crossfall.
 * The separate sheet never fills the genuine air underneath a fender. */
export function chieftainDeckSolid(rows: readonly ChieftainDeckRow[], side: number,
  crossfall = .064): ReturnType<typeof sectionSolid> {
  return sectionSolid(rows.map(([z, inner, outer, low, top]) => {
    const ring: [number, number][] = [[inner, low], [outer, low + .008],
      [outer, top - crossfall], [inner, top]];
    if (side < 0) ring.reverse();
    return { z, ring: ring.map(([x, y]): [number, number] => [side * x, y]) };
  }));
}

export interface ChieftainCastSection {
  readonly z: number;
  readonly floor: readonly ChieftainSectionPoint[];
  readonly rightSide: readonly ChieftainSectionPoint[];
  readonly roofHalfWidth: number;
  readonly roofY: number;
  readonly crownY?: number;
  readonly leftSide?: readonly ChieftainSectionPoint[];
  readonly leftRoofHalfWidth?: number;
  readonly leftRoofY?: number;
  readonly leftShoulderPower?: number;
}

/** Mk5's rounded shoulder/flat-roof grammar. A measured side profile can
 * precede the rounded shoulder without flattening the lower bearing step.
 * The optional gentle roof crown is a Mk10 scalar construction, not a scale
 * applied to the completed Mk5 turret. Eight shoulder spans retain Mk5 bytes. */
export function chieftainCastSection(row: ChieftainCastSection): SolidSection {
  const ring: [number, number][] = row.floor.map(([x, y]) => [x, y]);
  ring.push(...row.rightSide.map(([x, y]): [number, number] => [x, y]));
  const [width, sideTop] = row.rightSide[row.rightSide.length - 1];
  const flat = row.roofHalfWidth, top = row.roofY;
  for (let i = 1; i <= 8; i++) {
    const a = i * Math.PI / 16;
    ring.push([flat + (width - flat) * Math.cos(a), sideTop + (top - sideTop) * Math.sin(a)]);
  }
  if (row.crownY !== undefined) ring.push([0, row.crownY]);
  const left = row.leftSide ?? row.rightSide;
  const [leftWidth, leftSideTop] = left[left.length - 1];
  const leftFlat = row.leftRoofHalfWidth ?? flat, leftTop = row.leftRoofY ?? top;
  ring.push([-leftFlat, leftTop]);
  for (let i = 7; i >= 0; i--) {
    const a = i * Math.PI / 16;
    const rise = row.leftShoulderPower === undefined ? Math.sin(a)
      : Math.pow(Math.sin(a), row.leftShoulderPower);
    ring.push([-leftFlat - (leftWidth - leftFlat) * Math.cos(a),
      leftSideTop + (leftTop - leftSideTop) * rise]);
  }
  for (let i = left.length - 2; i >= 0; i--)
    ring.push([-left[i][0], left[i][1]]);
  return { z: row.z, ring };
}

/** The two forward horns are separate closed solids. Their scalar inner
 * bounds, not a full-width cap, define the real gun-root negative space. */
export function chieftainCheekHorn(side: number, rows: readonly ChieftainHornRow[],
  lowEdgeLift = .006, outerRoofInset = .020): ReturnType<typeof sectionSolid> {
  return sectionSolid(rows.map(([z, inside, outside, low, top]) => {
    const ring: [number, number][] = [[inside, low], [outside, low + lowEdgeLift],
      [outside, top - outerRoofInset], [inside, top]];
    if (side < 0) ring.reverse();
    return { z, ring: ring.map(([x, y]): [number, number] => [side * x, y]) };
  }));
}
