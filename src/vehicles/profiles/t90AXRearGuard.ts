// Original closed rear fender joints and folded guards. Independent scalar
// measurements describe both source sides; the mesh oracle stays local-only.
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// z, inner roof, shoulder X/Y, fold X/Y, outside X/Y, left inset.
type Row = readonly [number,number,number,number,number,number,number,number,number];
const ROWS: readonly Row[] = [
  [-3.640324,1.17453,1.6570,1.17453,1.6590,1.1742,1.6600,1.1725,.0229],
  [-3.617832,1.20823,1.6591,1.20823,1.6790,1.1980,1.7031,1.1628,.02043],
  [-3.600000,1.21514,1.6500,1.21449,1.7220,1.1900,1.73831,1.15345,.0204],
  [-3.550000,1.23450,1.6500,1.23205,1.7720,1.1898,1.78121,1.12806,.02233],
  [-3.482340,1.26071,1.6591,1.25580,1.8011,1.1898,1.81003,1.09430,.02223],
  [-3.447846,1.26071,1.6710,1.26071,1.8212,1.1869,1.82473,1.07688,.02286],
  [-3.287159,1.26071,1.6782,1.26071,1.8213,1.1869,1.82433,.99852,.0228],
];

function guardSection(row: Row, side: number): SolidSection {
  const [z,roof,shoulder,shoulderY,fold,foldY,outer,outerY,inset]=row;
  const dx=side<0?-inset:0,inner=side<0?1.0548:1.07774;
  const points: readonly (readonly[number,number])[] = [
    [inner,roof],[shoulder+dx,shoulderY],[fold+dx,foldY],[outer+dx,outerY],
  ];
  // A 2.5 mm closed skin, including the near-vertical outer return. This
  // cannot become an opaque slab across the drive-wheel air underneath it.
  const under=points.map(([x,y])=>[x-.0025,y-.0025] as const);
  const ring=[...under,...points.slice().reverse()];
  const leftTip=side<0?Math.max(0,Math.min(1,(-z-3.55)/.090324))*.001081:0;
  return {z:z-leftTip,ring:side>0?ring:ring.map(([x,y])=>[-x,y] as const).reverse()};
}

function neckAndHinge(P: TankBuilderPort, side: number): void {
  // The original main fender ends 85 mm ahead of the source joint. Its neck
  // skin positively overlaps that unchanged fender, then seats in the hinge.
  P.add('hull',KIT.box(.595,.004,.101),side*1.395,1.280231,-3.2395);
  P.addEquipment('hullDetail',KIT.box(.5926,.0732,.0156),
    side*1.3963,1.2774,-3.2918);
}

export function addT90ARearGuard(P: TankBuilderPort, side: number): void {
  neckAndHinge(P,side);
  P.addMudguard('t90a-x-rear','hullRubber',sectionSolid(ROWS.map(row=>guardSection(row,side))));
}
