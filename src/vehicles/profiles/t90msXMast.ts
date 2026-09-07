import * as THREE from 'three';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {T90MS_X_SOURCE_DATUMS} from '../t90msXArmor.ts';

/** Original stepped mounting stock under the measured antenna, not a floating rod. */
export function addT90MSAntennaSeat(P:TankBuilderPort):void {
  // Independent source parts38183/38701/38851/39136/38005 give the flange,
  // insulator and narrow threaded socket. Small source sub-millimetre seams
  // are closed internally; the exposed measured collars stay distinct.
  const rows:readonly(readonly[number,number])[]=[
    [2.1160,0],[2.1160,.07785],[2.12889,.07785],
    [2.13529,.06395],[2.14259,.06395],[2.14259,.042],
    [2.22469,.042],[2.23389,.03715],[2.23439,.04155],
    [2.26809,.02445],[2.28619,.02445],[2.34229,.02445],
    [2.34229,.01735],[2.36669,.0128],[2.46339,.0128],[2.46339,0],
  ];
  const [x,y,z]=T90MS_X_SOURCE_DATUMS.turretPivot;
  const geometry=new THREE.LatheGeometry(rows.map(([h,r])=>new THREE.Vector2(r,h)),24);
  P.addEquipment('turretDetail',geometry,.55375-x,-y,-1.42146-z);
}
