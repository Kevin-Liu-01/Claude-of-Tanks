// First-party T-90 AW shoulder sections and folded exhaust furniture.
// Measurements are scalar surface stations; the original mesh is not loaded.
import {sectionSolid} from './sectionSolid.ts';
import {roofSheet} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type CrownStation=readonly[z:number,top:number,bottom:number];
const CROWN:readonly CrownStation[]=[[-3.367,1.22,1.204],[-3.30,1.2744,1.2518],[-3.10,1.305,1.289],
  [-3.04,1.306,1.2885],[-2.96,1.483,1.2884],[-2.9,1.483,1.2883],[-2.12,1.495,1.2874],
  [-2.02935,1.496,1.2873],[-2,1.495,1.2873],[-1.24415,1.503,1.2869],[-1.22,1.503,1.2869],
  [0,1.491,1.28646],[1,1.452,1.2873],[2,1.3916,1.2863],[2.8,1.340,1.2678],
  [2.94,1.324,1.26],[3.1,1.30327,1.237],[3.3,1.268,1.208],[3.5,1.1688,1.123],[3.65,1.016,.969],[3.755,.91,.87]];
function shoulderRing(z:number,top:number,bottom:number,side:number):Array<readonly[number,number]>{
  const middle=z>=-3.04&&z<=2.94,outer=middle?1.676:1.795;
  const lowered=side>0&&z>=-2.02935&&z<=-1.24415;
  const y=lowered?1.304-(z+1.84)*.0032:top+(side>0&&z>=-1.22&&z<=2.94?.010:0);
  const narrowRear=side>0&&z<-1.22,shoulderX=narrowRear?1.606:1.626,kneeX=narrowRear?1.618:1.640;
  const kneeY=narrowRear?bottom+.017:y-(side>0?.019:.030);
  const ring:Array<readonly[number,number]>=[[.944,bottom],[outer,bottom],[outer,middle?bottom+.016:y-.007],
    [middle?1.668:1.746,middle?bottom+.017:y-.006],[middle?kneeX:1.70,middle?Math.max(kneeY,bottom+.017):y-.005],
    [shoulderX,y-.004],[.944,y]];
  // The low exhaust carrier has no residual raised shoulder wedge.
  if(lowered){ring[4]=[1.618,bottom+.017];ring[5]=[1.606,y-.004];}
  return side<0?ring.map(([x,h])=>[-x,h] as const).reverse():ring;
}
export function addT90AWFender(P:TankBuilderPort,side:number):void{
  P.addMudguard('t90-aw-x-crowned-fender','hull',sectionSolid(CROWN.map(([z,t,b])=>({z,ring:shoulderRing(z,t,b,side)}))));
}

type HemStation=readonly[z:number,lower:number,outer:number];
function skirtRing(low:number,outer:number,side:number,inner:number,crownOuter:number):Array<readonly[number,number]>{
  const crown=Math.min(outer,crownOuter);
  const ring:Array<readonly[number,number]>=[[outer-.018,low],[outer,low],[crown,1.235],[crown-.006,1.26],
    [crown-.028,1.28],[inner+.018,1.300],[inner,1.3057],[inner,1.26],
    [1.725,1.238],[crown-.018,1.223]];
  return side<0?ring.map(([x,y])=>[-x,y] as const).reverse():ring;
}
function skirtCourse(P:TankBuilderPort,rows:readonly HemStation[],side:number,inner=1.669,crownOuter=1.77735):void{
  P.addMudguard('t90-aw-x-fixed-skirt','hullRubber',sectionSolid(rows.map(([z,y,x])=>({z,
    ring:skirtRing(y,x+(side<0?.0019:0),side,inner+(side<0?.0019:0),crownOuter+(side<0?.0019:0))}))));
}
export function addT90AWSkirts(P:TankBuilderPort,side:number):void{
  // Distinct left-rear rising hem, not a mirrored full-height rubber box.
  const rear:readonly HemStation[]=side<0?[[-3.043,1.008,1.77935],[-2.798,.982,1.77964],[-2.553,.929,1.77992],
    [-2.308,.879,1.78020],[-2.063,.843,1.78658],[-1.819,.820,1.79929],[-1.574,.797,1.80992],
    [-1.329,.766,1.80330],[-1.084,.7305,1.77935]]:[[-3.043,.7256,1.78035],[-1.084,.7256,1.78035]];
  skirtCourse(P,rear,side,side<0?1.67285:1.668,1.78035);
  skirtCourse(P,[[-1.083,.7256,1.77635],[-.7711,.7475,1.77685],[-.45925,.7455,1.77951],
    [-.1474,.7295,1.82225],[.008525,.7275,1.80781],[.16455,.7256,1.77635]],side);
  skirtCourse(P,[[.16895,.7256,1.77445],[1.59765,.7256,1.77445]],side);
  skirtCourse(P,[[1.60055,.7256,1.77445],[1.94655,.7360,1.77297],[2.29245,.7256,1.77242],
    [2.63835,.7286,1.79411],[2.81130,.7292,1.80016],[2.98435,.7256,1.78126]],side,1.669,1.77242);
}

type FoldStation=readonly[x:number,height:number];
function foldedSheet(P:TankBuilderPort,rows:readonly FoldStation[],back:number,front:number,thickness:number):void{
  for(let i=1;i<rows.length;i++){
    const[a,ya]=rows[i-1],[b,yb]=rows[i];
    P.addEquipment('hullDetail',roofSheet([[back,a,b,ya,yb],[front,a,b,ya,yb]],thickness));
  }
}
function exhaustCap(P:TankBuilderPort):void{
  // Broad oval-ended inboard cap and the lower housing it actually seats on.
  const cap:readonly(readonly[number,number,number])[]=[[-2.02935,1.4633,1.4625],[-2.02145,1.5264,1.4102],
    [-2.00395,1.5371,1.3994],[-1.27055,1.5371,1.3994],[-1.25395,1.5264,1.4102],[-1.24415,1.4633,1.4625]];
  P.addEquipment('hullDetail',sectionSolid(cap.map(([z,t,b])=>({z,ring:[[1.08205,b+.035],[1.106,b],
    [1.5855,b],[1.60945,b+.035],[1.60945,Math.max(b+.0354,t-.035)],
    [1.5855,Math.max(t,b+.0358)],[1.106,Math.max(t,b+.0358)],[1.08205,Math.max(b+.0354,t-.035)]]}))));
  const base:readonly(readonly[number,number,number])[]=[[-2.02735,1.351,1.347],[-1.98635,1.419,1.276],
    [-1.29785,1.419,1.276],[-1.25785,1.351,1.347]];
  P.addEquipment('hullDetail',sectionSolid(base.map(([z,t,b])=>({z,ring:[[1.13775,b],[1.64065,b+.002],
    [1.64065,t],[1.13385,t-.0019]]}))));
}
export function addT90AWExhaust(P:TankBuilderPort):void{
  exhaustCap(P);
  // Three independent louvres. The outermost curled edge is the source's
  // real X1.84375 outline, not an extension of the entire raised deck.
  foldedSheet(P,[[1.62505,1.44920],[1.65335,1.45310],[1.70905,1.44240],[1.77735,1.41410],
    [1.82135,1.37890],[1.82525,1.34380],[1.84375,1.32810]],-1.97265,-1.31255,.0060);
  foldedSheet(P,[[1.63675,1.4326],[1.69245,1.42770],[1.73635,1.41210],[1.77735,1.39160],
    [1.80665,1.36720]],-1.97265,-1.31155,.0078);
  foldedSheet(P,[[1.64355,1.42090],[1.67975,1.4150],[1.73345,1.39840],[1.78515,1.36910],
    [1.80665,1.35160]],-1.97265,-1.31155,.0080);
  // Lower angled return remains thin, with an actual air passage above it.
  foldedSheet(P,[[1.64065,1.2803],[1.65535,1.2930],[1.77445,1.252]],-1.89845,-1.38475,.0157);
  for(const z of [-1.7881,-1.6416,-1.4961])
    foldedSheet(P,[[1.634,1.421],[1.654,1.453],[1.712,1.441],[1.778,1.414],[1.807,1.352]],z-.0068,z+.0068,.010);
}
