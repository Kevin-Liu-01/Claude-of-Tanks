// Owner-requested style/mechanical correction, not a source-fidelity claim.
// Close upper wheel-well sightlines with real folded sheet and receiving rails;
// preserve the exposed lower road wheels and the moving track channel.
import * as THREE from 'three';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { addAbramsPaintedHullPanel } from './abramsPaintedHullPanel.ts';

type StripStation = readonly [z: number, bottom: number, top: number];

function strip(side: number, inner: number, outer: number,
  rows: readonly StripStation[], label: string): THREE.BufferGeometry {
  const sections: SolidSection[] = rows.map(([z, bottom, top]) => {
    const ring: [number, number][] = [[inner, bottom], [outer, bottom], [outer, top], [inner, top]];
    return { z, ring: side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring };
  });
  const geometry = sectionSolid(sections);
  geometry.userData.abramsShoulderClosure = label;
  return geometry;
}

/** Paired inner guard returns and outboard upper-skirt carriers. None of
 * these stock surfaces crosses the lane occupied by the track/wheel train. */
export function addAbramsSourceXShoulderClosure(P: TankBuilderPort): void {
  const guard: readonly [number, number][] = [[2.80, 1.34447], [3.11, 1.34315],
    [3.511485, 1.286265], [3.608, 1.27259], [3.72, 1.109217], [3.86, .905]];
  const glacis = (z: number): number => 1.42863 +
    (1.15266 - 1.42863) * (z - 1.72) / (3.913465 - 1.72);
  const innerRows: StripStation[] = guard.map(([z, y]) =>
    [z, Math.min(y - .008, glacis(z) - .020), Math.max(y + .002, glacis(z) + .003)]);
  const carrier: readonly StripStation[] = [
    [-3.710035, 1.090, 1.407], [-3.142035, 1.090, 1.407],
    [-2.992035, 1.083, 1.407], [-2.842035, .952, 1.407],
    // Finish the lower taper forward of the source20 raised-edge opening.
    // Upper Y1.0 panel joints remain backed; the aft Y.904 wheel-view slot
    // must not become an opaque end cap merely to close the upper bay.
    [-2.442035, .880, 1.407], [2.990, .880, 1.407], [3.535, 1.080, 1.293],
  ];
  for (const side of [-1, 1]) {
    // 13 mm concealed lap into the central glacis; outer return is still
    // 18 mm inboard of the nearer track's inner edge at the rest axle.
    addAbramsPaintedHullPanel(P, side, strip(side, 1.087, 1.125, innerRows, `guard-return:${side}`));
    // Positive overlap into the actual receiving skins at X1.821+. A thin
    // permanent sheet backs upper panel joints even after the ERA is spent.
    addAbramsPaintedHullPanel(P, side, strip(side, 1.810, 1.825, carrier, `skirt-carrier:${side}`));
  }
  P.hullG.userData.abramsShoulderClosure = {
    version: 1, sides: 2, material: 'painted-steel',
    lowerRoadWheelsRemainVisible: true, lowerCarrierEdgeM: .880,
    innerGuardHalfWidthsM: [1.087, 1.125], outerCarrierHalfWidthsM: [1.810, 1.825],
    sourceDeviation: 'Owner-requested upper gap closure; thin receiving returns absent from source draft',
  };
}

