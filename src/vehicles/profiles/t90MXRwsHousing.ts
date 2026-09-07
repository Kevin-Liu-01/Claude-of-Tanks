// Original native equipment solids from independent source scalar measurements.
// The comparison mesh stays local-only; no source vertices or indices are used.
import * as THREE from 'three';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number];
type Level = readonly [number, number];
const YAW: readonly [number, number, number] = [.018092,1.336748,-.104459];
const CENTER: Point = [-.426345,-.970970];
const RADIUS: Point = [.215808,.227991];

function circle(rx: number, rz: number, cz: number): Point[] {
  return Array.from({length:32},(_,i) => {
    const a=i*Math.PI/16;
    return [CENTER[0]+rx*Math.cos(a),cz+rz*Math.sin(a)] as const;
  });
}

function clipped(points: readonly Point[], axis: 0|1, edge: number, below: boolean): Point[] {
  const result: Point[]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    const ia=below?a[axis]<=edge:a[axis]>=edge,ib=below?b[axis]<=edge:b[axis]>=edge;
    if(ia)result.push(a);
    if(ia!==ib) {
      const t=(edge-a[axis])/(b[axis]-a[axis]);
      result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
  }
  return result;
}

function level(y: number, points: readonly Point[]): SolidSection {
  // Rotate the shared longitudinal solid into a vertical loft. The reversal
  // keeps the cross-section counter-clockwise after mapping world Z to −Y.
  return {z:y,ring:points.map(([x,z])=>[x,-z] as const).reverse()};
}

function equipment(P: TankBuilderPort, sections: readonly SolidSection[]): void {
  const geometry=sectionSolid(sections).rotateX(-Math.PI/2);
  P.addEquipment('turretDetail',geometry,-YAW[0],-YAW[1],-YAW[2]);
}

function prism(P: TankBuilderPort, points: readonly Point[], low: number, high: number): void {
  equipment(P,[level(low,points),level(high,points)]);
}

function clippedArc(front: number): Point[] {
  const angle=Math.asin((front-CENTER[1])/RADIUS[1]);
  const start=Math.PI-angle,end=Math.PI*2+angle;
  return Array.from({length:33},(_,i)=>{
    const a=start+(end-start)*i/32;
    return [CENTER[0]+RADIUS[0]*Math.cos(a),CENTER[1]+RADIUS[1]*Math.sin(a)] as const;
  });
}

function lowerCollar(P: TankBuilderPort): void {
  // The larger low flange continues forward below the relieved tall casing.
  prism(P,circle(.225965,.232364,-.966141),2.196307,2.277472);
  prism(P,circle(.2200,.22605,-.966141),2.2772,2.319793);
}

function inclinedFront(P: TankBuilderPort): void {
  const face=(y:number):number=>(-.607013-.106970583*y)/.994262186;
  const levels: readonly Level[]=[[2.3188,face(2.3188)],[2.671,face(2.671)]];
  equipment(P,levels.map(([y,z])=>level(y,clippedArc(z))));
  // Two separate shallow overhangs shelter the inclined front face. A full
  // height cylinder out to the lip wrongly fills almost 0.4 m of source air.
  prism(P,clippedArc(-.878556),2.6708,2.691);
  prism(P,clippedArc(-.810419),2.6908,2.700091);
}

function cheekReturns(P: TankBuilderPort): void {
  const disk=clipped(circle(...RADIUS,CENTER[1]),1,-.810419,true);
  for(const [edge,below] of [[-.57,true],[-.28,false]] as const) {
    prism(P,clipped(disk,0,edge,below),2.3188,2.700091);
  }
  // The inboard rear side has a short flat return, distinct from the rounded
  // outer flank. This measured overhang is already behind the front recess.
  prism(P,[[-.426,-1.193],[-.3454,-1.1952],[-.2110,-1.1702],
    [-.2120,-.970],[-.426,-.970]],2.2772,2.700091);
}

function sector(start: number, end: number): Point[] {
  const outer: Point[]=[],inner: Point[]=[];
  for(let i=0;i<=8;i++) {
    const a=start+(end-start)*i/8;
    outer.push([-.426582-.321234*Math.cos(a),-.969088-.340536*Math.sin(a)]);
    inner.push([-.426582-.225606*Math.cos(a),-.969088-.232720*Math.sin(a)]);
  }
  return [...outer,...inner.reverse()];
}

function curvedSideGuard(P: TankBuilderPort): void {
  // Independent quarter-annular guard, not the previous full rectangular box.
  // Its hollow inboard crescent and lower aft return remain visible.
  const footprint=sector(0,Math.PI/2);
  prism(P,footprint,2.202816,2.493278);
  prism(P,clipped(footprint,0,-.512,true),2.4930,2.678602);
}

export function addT90MRwsHousing(P: TankBuilderPort): void {
  lowerCollar(P);
  inclinedFront(P);
  cheekReturns(P);
  curvedSideGuard(P);
}
