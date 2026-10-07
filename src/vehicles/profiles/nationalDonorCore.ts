// Original concept turret casting: rounded Soviet ancestry remains visible
// beneath independently authored national bolt-on modernization packages.
// Coordinates are turret-local; the receiving throat matches the shared gun.
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {addNationalReceiver} from './nationalMantlet.ts';

export interface ModernizedCasting {
  halfWidth:number;
  roofY:number;
  rearZ:number;
  frontZ:number;
  shoulderY?:number;
  crownHalf?:number;
}

export function castModernizedTurret(P:TankBuilderPort,d:ModernizedCasting):void {
  addNationalReceiver(P,d.roofY);
  const floor=.10,shoulder=d.shoulderY??.28,crown=d.crownHalf??.68;
  // Transverse courses round down from a compact, serviceable roof onto the
  // broad cast shoulder, rather than a welded vertical box with bevels.
  const ring=(w:number,top:number,flat:number):SectionPoint[]=>{
    const rise=Math.min(shoulder,top-.08);
    const out:SectionPoint[]=[[-w*.86,floor],[w*.86,floor],[w,rise]];
    for(let i=1;i<=10;i++){
      const a=i*Math.PI/20;
      out.push([flat+(w-flat)*Math.cos(a),rise+(top-rise)*Math.sin(a)]);
    }
    out.push([-flat,top]);
    for(let i=9;i>=0;i--){
      const a=i*Math.PI/20;
      out.push([-flat-(w-flat)*Math.cos(a),rise+(top-rise)*Math.sin(a)]);
    }
    return out;
  };
  P.add('turret',sectionSolid([
    {z:d.rearZ,ring:ring(.20,.34,.10)},
    {z:d.rearZ+.17,ring:ring(d.halfWidth*.59,d.roofY-.13,.30)},
    {z:-.96,ring:ring(d.halfWidth*.89,d.roofY,crown)},
    {z:-.54,ring:ring(d.halfWidth,d.roofY,crown)},
    {z:.05,ring:ring(d.halfWidth,d.roofY,crown)},
    {z:.34,ring:ring(d.halfWidth*.97,d.roofY-.015,crown)},
  ],{centeredSideQuads:true,smoothSideEdges:Array.from({length:21},(_,i)=>i+2)}));
  // Finite left and right cast cheeks leave a genuine opening ahead of the
  // rear bulkhead. The bearing enters the stock at x±.38, z.84, y.43.
  for(const side of [-1,1]){
    const rows=[
      [.32,d.halfWidth*.97,d.roofY-.015],
      [.84,d.halfWidth*.88,d.roofY-.08],
      [d.frontZ-.19,d.halfWidth*.61,.51],
      [d.frontZ,.48,.45],
    ];
    P.add('turret',sectionSolid(rows.map(([z,w,top])=>{
      const outer=Math.max(.43,w),flat=Math.min(crown,outer-.04),rise=Math.min(shoulder,top-.08),points:SectionPoint[]=[
        [.38,floor],[outer*.91,floor],[outer,rise],
      ];
      for(let i=1;i<=10;i++){
        const a=i*Math.PI/20;
        points.push([flat+(outer-flat)*Math.cos(a),rise+(top-rise)*Math.sin(a)]);
      }
      points.push([.38,top]);
      return{z,ring:side>0?points:points.map(([x,y])=>[-x,y] as const).reverse()};
    }),{centeredSideQuads:true,smoothSideEdges:Array.from({length:11},(_,i)=>i+(side>0?2:0))}));
  }
}
