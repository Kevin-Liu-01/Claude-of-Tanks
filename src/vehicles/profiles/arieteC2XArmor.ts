// Finite first-party upgrade stocks in the ORIGINAL C1 authoring frame.
// Both procedural construction and gameplay faces use these same sections.
// Protection ratings remain an explicit game-balance decision in the spec.
import { ARIETE_X_FAMILY_SCALE as S, ARIETE_C2_X_DATUMS as D } from './arieteXFamilyFrame.ts';
type Point = [number, number, number];
type Section = { z: number; ring: [number, number][] };
export interface ArieteC2ArmorStock {
  name: string;
  owner: 'hull' | 'turret';
  sections: Section[];
}

function panels(side: number): ArieteC2ArmorStock[] {
  const mirrored = (ring: [number, number][]): [number, number][] =>
    side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring;
  const skirt = mirrored([[1.514, 1.08], [1.554, .58], [1.790, .58],
    [1.805, .61], [1.805, 1.25], [1.670, 1.36], [1.506, 1.36]]);
  const cheek = mirrored([[1.435, 1.49], [1.60, 1.49], [1.60, 1.91],
    [1.44, 2.035], [1.423, 2.035], [1.423, 1.91]]);
  return [
    ...[[-2.60, -1.89], [-1.87, -1.16], [-1.14, -.43]].map(([a, b], index) => ({
      name: `pso_skirt_${side}_${index}`, owner: 'hull' as const,
      sections: [a, b].map(z => ({ z, ring: skirt })),
    })),
    ...[[.15, .55], [.57, .97]].map(([a, b], index) => ({
      name: `war_cheek_${side}_${index}`, owner: 'turret' as const,
      sections: [a, b].map(z => ({ z, ring: cheek })),
    })),
  ];
}

export const ARIETE_C2_ARMOR_STOCKS: readonly ArieteC2ArmorStock[] = Object.freeze([
  ...panels(-1), ...panels(1),
  { name: 'mine_belly', owner: 'hull', sections: [-2.60, 2.50].map(z => ({ z,
    ring: [[-.79, .366], [.79, .366], [.83, .385], [.83, .407],
      [-.83, .407], [-.83, .385]] as [number, number][],
  })) },
]);

/** Closed outward face sets, in installed hull/turret-rest metres. Real
 * section faces retain bevels and gaps; there is no broad bounding proxy. */
export function arieteC2ArmorFaces() {
  return ARIETE_C2_ARMOR_STOCKS.flatMap(stock => {
    const [a, b] = stock.sections;
    const point = ([x, y]: [number, number], z: number): Point =>
      [x * S, y * S - (stock.owner === 'turret' ? D.turretPivot[1] : 0),
        z * S - (stock.owner === 'turret' ? D.turretPivot[2] : 0)];
    const fore = b.ring.map(p => point(p, b.z)), rear = a.ring.map(p => point(p, a.z));
    const faces = [rear.slice().reverse(), fore,
      ...rear.map((p, i) => [p, rear[(i + 1) % rear.length], fore[(i + 1) % fore.length], fore[i]])];
    return faces.map((verts, index) => ({ name: `${stock.name}_${index}`, owner: stock.owner, verts }));
  });
}
