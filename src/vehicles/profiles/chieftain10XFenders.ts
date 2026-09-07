// Original closed sheet sections from independent canonical-source cuts.
// No source vertices, index buffers, meshes or textures are runtime inputs.
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type SheetRow = readonly [z: number, innerY: number, middleY: number, outerY: number];

function foldedSheet(rows: readonly SheetRow[], innerX: number, outerX: number,
  thickness: number, side: number,
  innerReturns?: readonly (readonly [edgeX: number, edgeY: number,
    bendY: number, bendUndersideY: number])[]) {
  const xs = [innerX, 1.4, outerX];
  const geometry = sectionSolid(rows.map(([z, ...ys], row) => {
    const lip = innerReturns?.[row];
    const columns = lip ? [lip[0], 1.0, ...xs] : xs;
    const heights = lip ? [lip[1], lip[2], ...ys] : ys;
    const bottoms = heights.map(y => y - thickness);
    // At the steep transverse fold the same thin source sheet spans a
    // larger vertical interval; retaining only 5.5 mm vertically erases it.
    if (lip) bottoms[1] = lip[3];
    const ring: [number, number][] = [
      ...columns.map((x, i): [number, number] => [x, bottoms[i]]),
      ...columns.map((x, i): [number, number] => [x, heights[i]]).reverse(),
    ];
    return { z, ring };
  }));
  if (side < 0) {
    // Preserve the actual diagonal on warped panels while reversing each
    // triangle. Reversing whole section contours changes that diagonal.
    const indices: number[] = [];
    for (let i = 0; i < geometry.attributes.position.count; i += 3) indices.push(i, i + 2, i + 1);
    geometry.setIndex(indices);
    geometry.scale(-1, 1, 1);
    geometry.computeVertexNormals();
  }
  return geometry;
}

export function addChieftain10XFenders(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    // root_7.006/.008/.011/.013/.015: the return-course roof is a
    // 5–10 mm sheet, not the former low, full-width rectangular carrier.
    const deck: readonly SheetRow[] = [
      [-3.575, 1.25464, 1.25464, 1.25464],
      [-3.20, 1.25473, 1.25473, 1.25473],
      [-3.04, 1.26835, 1.26835, 1.25614],
      [-1.70, 1.28587, 1.28357, 1.27467],
      [0, 1.31018, 1.30648, 1.29652],
      [.92, 1.30842, 1.30842, 1.30842],
      [2.16, 1.32466, 1.32469, 1.32473],
      [3.24, 1.33881, 1.33885, 1.33889],
    ];
    P.add('hull', foldedSheet(deck, 1.00, 1.749, .0098, side));

    // ex_decor_01: a shallow crown followed by a folded-down free edge.
    // Its two overlapping leaves remain distinct, with air above the idler.
    P.addMudguard(`chieftain10_x_forward_guard_${side}`, 'hullDetail', foldedSheet([
      [3.21812, 1.33703, 1.33701, 1.33703],
      [3.42, 1.34919, 1.34951, 1.34984],
      [3.448, 1.35100, 1.35155, 1.35172],
      [3.55, 1.33133, 1.32880, 1.32394],
      [3.65, 1.31603, 1.30798, 1.29648],
      [3.73, 1.30380, 1.28418, 1.29310],
      [3.75, 1.29759, 1.26612, 1.26612],
      [3.80, 1.21160, 1.19837, 1.17900],
      [3.85359, 1.11401, 1.10935, 1.08930],
    ], 1.10, 1.73667, .0055, side, [
      [.93875, 1.1120, 1.27193, 1.24450], [.9399, 1.0985, 1.27258, 1.24211],
      [.9401, 1.0948, 1.27246, 1.24284], [.9440, 1.0887, 1.26414, 1.23795],
      [.9620, 1.0880, 1.25058, 1.22498], [.9700, 1.0830, 1.22449, 1.17902],
      [.9760, 1.0800, 1.18875, 1.14322], [.9800, 1.0760, 1.13330, 1.10800],
      [.9850, 1.06178, 1.07120, 1.06570],
    ]));
    P.addMudguard(`chieftain10_x_forward_flap_${side}`, 'hullDetail', foldedSheet([
      [3.824, 1.18810, 1.18567, 1.15840],
      [3.85, 1.14891, 1.14606, 1.10313],
      [3.90, 1.07320, 1.06989, 1.01981],
      [3.95, 1.00595, 1.00703, .94701],
      [3.981, .97490, .97310, .90192],
    ], 1.10, 1.73667, .0065, side));
  }
}
