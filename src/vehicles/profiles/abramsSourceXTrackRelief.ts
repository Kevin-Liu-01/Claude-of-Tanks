// Local receiving-stock relief for the owner's thicker outward tread. Source
// roof, exterior skirt edge, hull/turret/axle datums and engine air stay fixed.
import * as THREE from 'three';
import {closedSectionLoft} from './abramsSourceXGeometry.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {addAbramsPaintedHullPanel} from './abramsPaintedHullPanel.ts';

export function abramsFrontTrackHalfWidth(z: number, width: number): number {
  // End the concealed structural wing beneath the start of the front guard,
  // not diagonally through the idler's raised outward tread. The separate
  // full-width mudguard and its finite glacis return keep their source planes.
  return z === 2.898445 ? 1.10 : width;
}

export function abramsRearTrackCeiling(z: number): number {
  if(z<=-3.472775||z>=-1.112)return 1.332;
  const rows=[[-3.472775,1.332],[-3.156965,1.414],[-3.079295,1.414],
    [-2.274,1.350],[-1.112,1.332]];
  for(let i=1;i<rows.length;i++)if(z<=rows[i][0]){
    const[a,b]=[rows[i-1],rows[i]],t=(z-a[0])/(b[0]-a[0]);
    return a[1]+t*(b[1]-a[1]);
  }
  return 1.332;
}

function strip(side: number,x0: number,x1: number,rows: readonly (readonly[number,number,number])[]): THREE.BufferGeometry {
  return closedSectionLoft(rows.map(([z,bottom,top])=>{
    const a=side<0?-x1:x0,b=side<0?-x0:x1;
    return{z,ring:[[a,bottom],[b,bottom],[b,top],[a,top]]};
  }));
}

export function addAbramsRearTrackFender(P: TankBuilderPort,side: number): void {
  const rows=[[-3.72,1.405],[-3.472775,1.405],[-3.156965,1.439],
    [-3.079295,1.439],[-2.274,1.405],[-2.27,1.405]];
  const add=(geometry: THREE.BufferGeometry)=>{
    geometry.userData.abramsRearTrackRelief=true;addAbramsPaintedHullPanel(P,side,geometry);
  };
  // Concealed inner tread lane is raised; the original outer rail stays at
  // Y1.405. A finite6mm return laps both sheets, not a floating raised strip.
  add(strip(side,1.11,1.716,rows.map(([z,top])=>[z,top-.025,top])));
  add(strip(side,1.710,1.833,[[-3.72,1.38,1.405],[-2.27,1.38,1.405]]));
  add(strip(side,1.710,1.716,rows.map(([z,top])=>[z,1.38,top])));
}

