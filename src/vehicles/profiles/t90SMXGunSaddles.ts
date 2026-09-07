// Original thin folded saddles, authored from independent source dimensions
// and roof slopes. These six partial upper clamps are not annular collars.
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type Saddle=readonly[number,number,number,number,number];
// Rear/front Z, ridge Y, and left/right roof slopes in the canonical frame.
const SADDLES:readonly Saddle[]=[
  [2.645795,2.675790,2.024647,.667266,.670205],
  [3.526714,3.557234,2.020036,.664748,.666420],
  [4.404473,4.433942,2.015800,.643273,.644891],
  [5.536930,5.566399,2.005955,.648292,.649923],
  [6.178937,6.208411,2.006890,.638209,.639814],
  [6.736748,6.766216,2.007637,.660929,.662591],
];

function saddleSection(row:Saddle):readonly SectionPoint[] {
  const x0=-.0483836,x1=.050095,peak=.0009176,roof=row[2];
  const left=roof-row[3]*(peak-x0),right=roof-row[4]*(x1-peak);
  // A closed 6 mm sheet engages the existing native jacket. The source's
  // outer legs sit lower than that smoother jacket; keep measured crowns
  // and leg planes instead of inflating the clamp to force prominence.
  const thickness=.006;
  return [[x0,left-thickness],[peak,roof-thickness],[x1,right-thickness],
    [x1,right],[peak,roof],[x0,left]];
}

export function addT90SMGunSaddles(P:TankBuilderPort):void {
  for(const row of SADDLES) {
    const ring=saddleSection(row);
    const geometry=sectionSolid([{z:row[0],ring},{z:row[1],ring}]);
    // The gun bucket is attached to rig_recoil, unlike addGunExtra, which
    // deliberately owns non-recoiling gunMount equipment.
    P.add('gun',geometry,-.001,-1.90309,-1.56);
  }
}
