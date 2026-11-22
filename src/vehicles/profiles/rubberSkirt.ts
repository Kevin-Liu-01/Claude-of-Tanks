// Segmented rubber side skirts (release 274, lane t80-skirts-274; Kevin 2026-11-21: "fix these rubber sideskirts they look
// so bad"). A run of separate rubber-fabric sheets, each hung from the fender edge under its own steel clamp strip and
// bolt row, with an open joint between neighbours. Alternate sheets hang at different leans, and each sheet's foot twists
// along its length. Its free lower corners flare out and curl up at the joints, its hem sits a little higher or lower
// than its neighbours', and a thicker bead stiffens it. So the sheets catch the light one by one, as the real T-80 and
// T-64 skirts' sections do, instead of one flat slab. Every variation is a fixed hash of the sheet's index and side, so a
// build is deterministic. The caller owns the hang line (top, foot and the face's |x| at a height) and the sections'
// extents.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import {KIT} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export interface RubberSkirtRun {
  /** The mudguard label every sheet registers under. */
  readonly label:string;
  /** hullRubber: bare black rubber; hullFixedPaintedBodywork: rubber in the vehicle's scheme (markFixedPaintedPanel). */
  readonly bucket:'hullRubber'|'hullFixedPaintedBodywork';
  readonly side:number;
  /** Each sheet's [z0, z1], z0 < z1; neighbours may touch (the gap is cut from both). */
  readonly sections:readonly(readonly[number,number])[];
  /** The sheet's top edge at z: where it hangs under the fender. */
  readonly top:(z:number)=>number;
  /** The sheet's nominal foot at z, before the curl lifts its corners. */
  readonly foot:(z:number)=>number;
  /** The inner face's |x| at (z, y) on the hang plane. */
  readonly x:(z:number,y:number)=>number;
  /** The gap between two sheets (m). */
  readonly gap?:number;
  /** Sheet thickness (m). */
  readonly thickness?:number;
  /** Armoured rubber-fabric panels (the T-80U's forward sections, under the T-84's Kontakt-5): stiff, so they barely lean,
   * twist or curl, and a block seated on the panel stays proud of it. */
  readonly stiff?:boolean;
  /** Whether sheet [z0, z1] carries its own clamp strip and bolts (default every sheet; false where a fitting such as a
   * row of ERA containers already runs along its top). */
  readonly clamp?:(z0:number,z1:number)=>boolean;
}

const BEAD_H=.045,BEAD_T=.010,CLAMP_H=.048,CLAMP_T=.012,BOLT_PITCH=.21;
/** A fixed hash of (sheet, side, channel) in [0, 1). */
function hash(i:number,side:number,k:number):number{
  let h=(Math.imul(i+1,0x27d4eb2d)^Math.imul(side>0?3:7,0x165667b1)^Math.imul(k+11,0x9e3779b1))>>>0;
  h=Math.imul(h^(h>>>15),0x85ebca6b)>>>0;h=Math.imul(h^(h>>>13),0xc2b2ae35)>>>0;
  return ((h^(h>>>16))>>>0)/4294967296;
}

export function rubberSkirtRun(P:TankBuilderPort,run:RubberSkirtRun):void{
  const {label,bucket,side,top,foot,x}=run,gap=run.gap??.028,t=run.thickness??.012;
  run.sections.forEach(([za,zb],i)=>{
    const z0=za+gap/2,z1=zb-gap/2,len=z1-z0;
    if(len<.1)throw new RangeError(`${label}: sheet ${i} is ${len.toFixed(3)} m long`);
    // alternate sheets hang at a steeper or flatter lean (the foot 1-2.5 cm or 3-5 cm out), each twisting along its length
    // (a stiff panel: a third of a sheet's lean at most, little twist or curl, a flat face)
    const k=run.stiff?.25:1;
    const lean=k*(i%2?.030+.020*hash(i,side,1):.010+.015*hash(i,side,1)),twist=k*(hash(i,side,2)-.5)*.024;
    const lift=run.stiff?.008:.015+.025*hash(i,side,0),drop=k*(hash(i,side,4)-.5)*.05,belly=run.stiff?0:.003+.004*hash(i,side,3);
    const edge=Math.min(.08,len/6),flareOut=run.stiff?.008:.018;
    const ring=(u:number):SectionPoint[]=>{
      const z=z0+len*u,d=Math.min(u,1-u)*len,flare=d<edge?flareOut*(1-d/edge)**2:0;
      const yt=top(z),yb=foot(z)+drop+lift*(2*u-1)**2,kick=lean+twist*(u-.5)+belly*Math.sin(Math.PI*u)+flare;
      // the inner face leaves the hang line square and swings out to the kicked foot (the kick grows with the square of the
      // depth, so a fitting on the sheet's upper band, such as a BV's Kontakt-1 row, stays on it); the bead stands proud
      const face=(y:number)=>x(z,y)+kick*((yt-y)/(yt-yb))**2,ybd=yb+BEAD_H;
      const r:SectionPoint[]=[[face(yb),yb],[face(yb)+t+BEAD_T,yb],[face(ybd)+t+BEAD_T,ybd],[face(ybd+.012)+t,ybd+.012],
        [face(yt)+t,yt],[face(yt),yt]];
      return side<0?r.map(([px,py])=>[-px,py] as SectionPoint).reverse():r;
    };
    const e=edge/len,stations=[0,e/3,e,.2,.35,.5,.65,.8,1-e,1-e/3,1];
    const geo=sectionSolid(stations.map(u=>({z:z0+len*u,ring:ring(u)})));
    P.addMudguard(label,bucket,bucket==='hullFixedPaintedBodywork'?markFixedPaintedPanel(geo,label,'hullRubber'):geo);
    if(run.clamp&&!run.clamp(z0,z1))return;
    // the clamp strip over the sheet's top on its outer face, leaning with it, and its bolt row
    const zc=(z0+z1)/2,yt=top(zc),yc=yt-CLAMP_H/2-.004,tilt=Math.atan2(x(zc,yt-CLAMP_H)-x(zc,yt),CLAMP_H);
    const xc=x(zc,yc)+t+CLAMP_T/2;
    P.addEquipment('hullDetail',KIT.box(CLAMP_T,CLAMP_H,len-.012),side*xc,yc,zc,0,0,side*tilt);
    const bolts=Math.max(2,Math.round(len/BOLT_PITCH));
    for(let b=0;b<bolts;b++){
      const zb2=z0+.05+(len-.10)*b/(bolts-1);
      P.addEquipment('hullDetail',KIT.cylX(.011,.010,8),side*(x(zb2,yc)+t+CLAMP_T+.004),yc,zb2);
    }
  });
}

/** Even sections over [z0, z1]. */
export function skirtSections(z0:number,z1:number,n:number):[number,number][]{
  const len=(z1-z0)/n;
  return Array.from({length:n},(_,i)=>[z0+i*len,z0+(i+1)*len] as [number,number]);
}
