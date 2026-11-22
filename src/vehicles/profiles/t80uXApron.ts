// The T-80U X side apron's hang line and its runs of segmented rubber sheets (274, t80-skirts-274). The builder
// (profiles/t80uX.ts) hangs these sheets, the T-80 marks hang their screens and skirts on the same line
// (profiles/t80Marks.ts), and the auxiliary armour recipe (sourceXSovietAuxArmor.ts) lays its facets on the same sheets.
// Pure arithmetic, so the boot-light armour path can read it.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import {skirtSections,type RubberSkirtShape} from './rubberSkirtSheets.ts';

/** The side apron's hang line under the fender lip ([z, top, foot]); its inner face leans out from x 1.685 at the top to
 * 1.80 at the foot. */
export const T80U_X_APRON:readonly(readonly[number,number,number])[]=[[-2.882,1.414,.886],[-2.45,1.458,.815],[-1.22,1.504,.782],[1.75,1.449,.762],[2.886,1.418,.782]];
export function t80uXApronAt(z:number):{top:number;foot:number}{
  const APRON=T80U_X_APRON;
  for(let i=1;i<APRON.length;i++){
    const a=APRON[i-1],b=APRON[i];
    if(z<=b[0]||i===APRON.length-1){const t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));return {top:a[1]+(b[1]-a[1])*t,foot:a[2]+(b[2]-a[2])*t};}
  }
  return {top:APRON[0][1],foot:APRON[0][2]};
}
export const T80U_X_APRON_X0=1.685,T80U_X_APRON_X1=1.80;
/** The apron's inner face |x| at (z, y). */
export function t80uXApronX(z:number,y:number):number{
  const {top,foot}=t80uXApronAt(z);
  return T80U_X_APRON_X0+(T80U_X_APRON_X1-T80U_X_APRON_X0)*(top-y)/(top-foot);
}

/** The apron's two runs on one side: two loose rubber sheets aft, five stiff armoured panels forward (the T-84 seats its
 * Kontakt-5 on them). */
export function t80uXSkirtRuns(side:number):readonly(RubberSkirtShape&{readonly label:string})[]{
  const hang={side,top:(z:number)=>t80uXApronAt(z).top,foot:(z:number)=>t80uXApronAt(z).foot,x:t80uXApronX};
  return [{...hang,label:'t80u-x-side-apron-rear',sections:skirtSections(-2.882,-1.22,2)},
    {...hang,label:'t80u-x-side-apron',sections:skirtSections(-1.22,2.886,5),stiff:true}];
}
