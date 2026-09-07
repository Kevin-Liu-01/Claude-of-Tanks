// First-party primitives measured against the local-only T-90A comparison.
// These are structural mount parts, not another weapon or source mesh import.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Station = readonly [number, number, number];
const YAW = [.010,1.468,-.0039] as const;

function add(P: TankBuilderPort,g: THREE.BufferGeometry,x=0,y=0,z=0): void {
  P.addEquipment('turretDetail',g,x-YAW[0],y-YAW[1],z-YAW[2]);
}

function plate(P: TankBuilderPort,left: number,right: number,rows: readonly Station[]): void {
  add(P,sectionSolid(rows.map(([z,low,high])=>({z,
    ring:[[left,low],[right,low],[right,high],[left,high]],
  }))));
}

function forkCheeks(P: TankBuilderPort): void {
  // Two inclined cheeks, not their full bounding boxes: air remains below
  // the elevated receiver and above the rear ends of these diagonal arms.
  const rows: readonly Station[] = [
    [-.235,2.304,2.310],[-.214,2.302,2.333],[-.084,2.2827,2.4993],
    [.0412,2.4505,2.6598],[.1459,2.5910,2.5970],
  ];
  for(const [left,right] of [[.5221,.5639],[.7145,.7563]] as const) plate(P,left,right,rows);
}

function pivotBlocks(P: TankBuilderPort): void {
  const rows: readonly Station[] = [
    [.0078,2.6573,2.6581],[.0576,2.57674,2.73875],
    [.1572,2.57674,2.73875],[.2070,2.6573,2.6581],
  ];
  plate(P,.47124,.57387,rows);
  plate(P,.68969,.76632,rows);
  // The outboard adjusting boss is the omitted front-outline feature.
  // Its top is a short flat crest with beveled ends, not a round barrel.
  plate(P,.41531,.51794,[
    [.02865,2.6573,2.6581],[.0680,2.59380,2.72169],
    [.14663,2.59380,2.72169],[.18599,2.6573,2.6581],
  ]);
}

function pedestalFork(P: TankBuilderPort): void {
  for(const x of [.49703,.76450]) add(P,KIT.box(.0471,.23976,.1464),x,2.31952,-.02147);
  add(P,KIT.box(.31386,.02101,.1464),.63081,2.42870,-.02147);
}

export function addT90ARwsBracket(P: TankBuilderPort): void {
  pedestalFork(P);
  forkCheeks(P);
  pivotBlocks(P);
}
