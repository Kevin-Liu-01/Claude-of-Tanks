// Individually removable cassettes seated on the current C2 receiving armor.
import { ARIETE_X_FAMILY_SCALE as S, ARIETE_C2_X_DATUMS as D } from './arieteXFamilyFrame.ts';
import type { ArmorPlate } from '../specHelpers.ts';
export const ARIETE_C2_ERA = [
  ...[-1,1].flatMap(side => [0,1,2].flatMap(row => [0,1].map(column => {
    const z = 2.12 + row * .245, x = side * (.45 + column * .52);
    const roof = 1.346614 - (z - 1.760422) * .09665;
    return { name: `c2_glacis_${side}_${row}_${column}`, owner: 'hull' as const,
      center: [x,roof+.034,z], size: [.46,.08,.22], slope: .09665 };
  }))),
  ...[-1,1].flatMap(side => [0,1,2,3].map(i => ({
    name: `c2_cheek_${side}_${i}`, owner: 'turret' as const,
    center: [side*1.634,1.74,.24+i*.205], size: [.080,.245,.185], slope: 0,
  }))),
];
export function arieteC2EraPlates(): { owner: 'hull' | 'turret'; plate: ArmorPlate }[] {
  return ARIETE_C2_ERA.map(tile => {
    const [x,y,z]=tile.center,[w,h,d]=tile.size;
    const surface = tile.owner === 'hull'
      ? [[x-w/2,y+h/2+tile.slope*d/2,z-d/2],[x-w/2,y+h/2-tile.slope*d/2,z+d/2],
        [x+w/2,y+h/2-tile.slope*d/2,z+d/2],[x+w/2,y+h/2+tile.slope*d/2,z-d/2]]
      : [[x+Math.sign(x)*w/2,y-h/2,z-d/2],[x+Math.sign(x)*w/2,y+h/2,z-d/2],
        [x+Math.sign(x)*w/2,y+h/2,z+d/2],[x+Math.sign(x)*w/2,y-h/2,z+d/2]];
    if (tile.owner === 'turret' && x<0) surface.reverse();
    const verts = surface.map(p => p.map((v,i) => v*S-(tile.owner==='turret'?D.turretPivot[i]:0)) as [number,number,number]);
    return { owner: tile.owner, plate: { name: tile.name, verts, physicalMm: 12, keMm: 12, ceMm: 12,
      kind: 'era', era: { keReduction: .15, ceFlatMm: 320 }, moduleLink: null, gunFollow: false } };
  });
}
