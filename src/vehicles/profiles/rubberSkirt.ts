// Segmented rubber side skirts (release 274, lane t80-skirts-274; Kevin 2026-11-21: "fix these rubber sideskirts they look
// so bad"). A run of separate rubber-fabric sheets, each hung from the fender edge under its own steel clamp strip and
// bolt row, with an open joint between neighbours. Alternate sheets hang at different leans, and each sheet's foot twists
// along its length. Its free lower corners flare out and curl up at the joints, its hem sits a little higher or lower
// than its neighbours', and a thicker bead stiffens it. So the sheets catch the light one by one, as the real T-80 and
// T-64 skirts' sections do, instead of one flat slab. The sheets' shape is profiles/rubberSkirtSheets.ts, which the
// auxiliary armour recipe reads too. The caller owns the hang line (top, foot and the face's |x| at a height) and the
// sections' extents.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import {KIT} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import {rubberSkirtSheets,type RubberSkirtShape} from './rubberSkirtSheets.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export interface RubberSkirtRun extends RubberSkirtShape {
  /** The mudguard label every sheet registers under. */
  readonly label:string;
  /** hullRubber: bare black rubber; hullFixedPaintedBodywork: rubber in the vehicle's scheme (markFixedPaintedPanel). */
  readonly bucket:'hullRubber'|'hullFixedPaintedBodywork';
  /** Whether sheet [z0, z1] carries its own clamp strip and bolts (default every sheet; false where a fitting such as a
   * row of ERA containers already runs along its top). */
  readonly clamp?:(z0:number,z1:number)=>boolean;
}

const CLAMP_H=.048,CLAMP_T=.012,BOLT_PITCH=.21;

export function rubberSkirtRun(P:TankBuilderPort,run:RubberSkirtRun):void{
  const {label,bucket,side,top,x}=run,t=run.thickness??.012;
  for(const {z0,z1,stations} of rubberSkirtSheets(run,label)){
    const len=z1-z0;
    const geo=sectionSolid(stations.map(({z,ring})=>({z,ring:side<0?
      ring.map(([px,py])=>[-px,py] as SectionPoint).reverse():ring})));
    P.addMudguard(label,bucket,bucket==='hullFixedPaintedBodywork'?markFixedPaintedPanel(geo,label,'hullRubber'):geo);
    if(run.clamp&&!run.clamp(z0,z1))continue;
    // the clamp strip over the sheet's top on its outer face, leaning with it, and its bolt row
    const zc=(z0+z1)/2,yt=top(zc),yc=yt-CLAMP_H/2-.004,tilt=Math.atan2(x(zc,yt-CLAMP_H)-x(zc,yt),CLAMP_H);
    const xc=x(zc,yc)+t+CLAMP_T/2;
    P.addEquipment('hullDetail',KIT.box(CLAMP_T,CLAMP_H,len-.012),side*xc,yc,zc,0,0,side*tilt);
    const bolts=Math.max(2,Math.round(len/BOLT_PITCH));
    for(let b=0;b<bolts;b++){
      const zb2=z0+.05+(len-.10)*b/(bolts-1);
      P.addEquipment('hullDetail',KIT.cylX(.011,.010,8),side*(x(zb2,yc)+t+CLAMP_T+.004),yc,zb2);
    }
  }
}

