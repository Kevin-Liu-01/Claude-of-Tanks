// The segmented rubber skirt's sheets as numbers (274, t80-skirts-274): each sheet's extent and its cross-section at every
// loft station. The builder (profiles/rubberSkirt.ts) lofts these rings into the visible sheets; the auxiliary armour
// recipe (sourceXSovietAuxArmor.ts) lays its facets on the same rings' outer face, so the plates stay on the sheets. Pure
// arithmetic with no imports, so the boot-light armour path can read it. Every variation is a fixed hash of the sheet's
// index and side, so a build is deterministic.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).

/** The hang and the sections of one run of sheets, without the builder's bucket and label. */
export interface RubberSkirtShape {
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
}

/** One loft station: z and the cross-section as [|x|, y] points, counter-clockwise for the +x side. Points 0 and 5 are the
 * inner face's foot and top; 1-2 the bead's outer face, 2-3 its shoulder, 3-4 the sheet's outer face. */
export interface RubberSkirtStation {readonly z:number;readonly ring:readonly(readonly[number,number])[];}
export interface RubberSkirtSheet {readonly z0:number;readonly z1:number;readonly stations:readonly RubberSkirtStation[];}

const BEAD_H=.045,BEAD_T=.010;
/** A fixed hash of (sheet, side, channel) in [0, 1). */
function hash(i:number,side:number,k:number):number{
  let h=(Math.imul(i+1,0x27d4eb2d)^Math.imul(side>0?3:7,0x165667b1)^Math.imul(k+11,0x9e3779b1))>>>0;
  h=Math.imul(h^(h>>>15),0x85ebca6b)>>>0;h=Math.imul(h^(h>>>13),0xc2b2ae35)>>>0;
  return ((h^(h>>>16))>>>0)/4294967296;
}

export function rubberSkirtSheets(run:RubberSkirtShape,label='rubber skirt'):RubberSkirtSheet[]{
  const {side,top,foot,x}=run,gap=run.gap??.028,t=run.thickness??.012;
  return run.sections.map(([za,zb],i)=>{
    const z0=za+gap/2,z1=zb-gap/2,len=z1-z0;
    if(len<.1)throw new RangeError(`${label}: sheet ${i} is ${len.toFixed(3)} m long`);
    // alternate sheets hang at a steeper or flatter lean (the foot 1-2.5 cm or 3-5 cm out), each twisting along its length
    // (a stiff panel: a third of a sheet's lean at most, little twist or curl, a flat face)
    const k=run.stiff?.25:1;
    const lean=k*(i%2?.030+.020*hash(i,side,1):.010+.015*hash(i,side,1)),twist=k*(hash(i,side,2)-.5)*.024;
    const lift=run.stiff?.008:.015+.025*hash(i,side,0),drop=k*(hash(i,side,4)-.5)*.05,belly=run.stiff?0:.003+.004*hash(i,side,3);
    const edge=Math.min(.08,len/6),flareOut=run.stiff?.008:.018;
    const ring=(u:number):[number,number][]=>{
      const z=z0+len*u,d=Math.min(u,1-u)*len,flare=d<edge?flareOut*(1-d/edge)**2:0;
      const yt=top(z),yb=foot(z)+drop+lift*(2*u-1)**2,kick=lean+twist*(u-.5)+belly*Math.sin(Math.PI*u)+flare;
      // the inner face leaves the hang line square and swings out to the kicked foot (the kick grows with the square of the
      // depth, so a fitting on the sheet's upper band, such as a BV's Kontakt-1 row, stays on it); the bead stands proud
      const face=(y:number)=>x(z,y)+kick*((yt-y)/(yt-yb))**2,ybd=yb+BEAD_H;
      return [[face(yb),yb],[face(yb)+t+BEAD_T,yb],[face(ybd)+t+BEAD_T,ybd],[face(ybd+.012)+t,ybd+.012],
        [face(yt)+t,yt],[face(yt),yt]];
    };
    const e=edge/len;
    return {z0,z1,stations:[0,e/3,e,.2,.35,.5,.65,.8,1-e,1-e/3,1].map(u=>({z:z0+len*u,ring:ring(u)}))};
  });
}

/** Even sections over [z0, z1]. */
export function skirtSections(z0:number,z1:number,n:number):[number,number][]{
  const len=(z1-z0)/n;
  return Array.from({length:n},(_,i)=>[z0+i*len,z0+(i+1)*len] as [number,number]);
}
