// First-party T-90 AW shoulder sections and folded exhaust furniture.
// Measurements are scalar surface stations; the original mesh is not loaded.
import {sectionSolid} from './sectionSolid.ts';
import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';
import {roofSheet} from './measuredPrimitives.ts';
import * as THREE from 'three';
import {KIT} from './kit.ts';
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

/** A bow guard section: z, the inner and outer edges (|x|), the source top line, how far the inner and the outer edge
 * fall under it (the sheet's camber across its width) and the depth of the turned outer lip. */
export type BowGuardStation=readonly[z:number,inner:number,outer:number,top:number,innerFall:number,outerFall:number,lip:number];
const ACROSS=[0,.07,.2,.4,.6,.78,.9] as const;
/** One cambered sheet section of thickness t with its 8 mm turned outer lip, counter-clockwise for the side. */
function bowGuardRing([,inner,outer,top,innerFall,outerFall,lip]:BowGuardStation,side:number,t:number):Array<readonly[number,number]>{
  const lipT=.008,w=outer-inner,x=(u:number)=>inner+w*u;
  const y=(u:number)=>top-innerFall*Math.max(0,1-u/.3)**2-outerFall*Math.max(0,(u-.45)/.55)**2;
  const yOut=y(1),uLip=1-lipT/w;
  const ring:Array<readonly[number,number]>=[...ACROSS.map(u=>[x(u),y(u)-t] as const),[outer-lipT,y(uLip)-t],[outer-lipT,yOut-lip],
    [outer,yOut-lip],[outer,yOut-.005],[outer-.005,yOut],...[...ACROSS].reverse().map(u=>[x(u),y(u)] as const)];
  return side<0?ring.map(([a,b])=>[-a,b] as const).reverse():ring;
}
/** 267 (lane t90-family-267, S1; the 266 blind critics, both models: "the bow mudguards read as oversized wedges jutting
 * forward over the tracks"): a bow guard as sheet steel, the way the service tanks and the sources' own sections build it
 * (a thin shelf whose outer edge turns down, a toe that arches across its width and narrows to a rounded tongue): a 12 mm
 * shelf ahead of the shoulder, a 12 mm hinge gap under three knuckles where the top line breaks down, and a separate
 * 10 mm toe flap. Shared by the T-90 AW and T-90MS source builds (t90msX.ts). */
export function addT90BowGuard(P:TankBuilderPort,side:number,label:string,shelf:readonly BowGuardStation[],
  toe:readonly BowGuardStation[],knuckles:readonly(readonly[number,number])[]):void{
  // the sheet's cambered faces shade as one rolled surface; its edges and the lip keep their creases (the ring's edges
  // 0-6 and 11-17 are its under and upper faces on either side: the mirrored ring is reversed)
  const smoothSideEdges=[0,1,2,3,4,5,6,11,12,13,14,15,16,17];
  P.addMudguard(`${label}-shelf`,'hull',sectionSolid(shelf.map(s=>({z:s[0],ring:bowGuardRing(s,side,.012)})),{smoothSideEdges}));
  P.addMudguard(`${label}-toe`,'hull',sectionSolid(toe.map(s=>({z:s[0],ring:bowGuardRing(s,side,.010)})),{smoothSideEdges}));
  const a=shelf[shelf.length-1],b=toe[0],z=(a[0]+b[0])/2,y=(a[3]+b[3])/2;
  P.addEquipment('hullDetail',KIT.mergeAll(knuckles.map(([x0,x1])=>KIT.cylX(.013,x1-x0,8).translate(side*(x0+x1)/2,y-.004,z))));
}
/** The source top line of the crowned guard (CROWN), between its stations. */
function crownTop(z:number):number{
  for(let i=1;i<CROWN.length;i++)if(z<=CROWN[i][0]){
    const[a,ya]=CROWN[i-1],[b,yb]=CROWN[i];return ya+(yb-ya)*(z-a)/(b-a);
  }
  return CROWN[CROWN.length-1][1];
}
// The AW bow guard ahead of the shoulder's front (z 2.94): the shoulder's right top stands 10 mm over its left there,
// faded out by z 3.10. The toe keeps the source line to its 3.755 tip and narrows to the source's nose (its sections:
// x 1.09-1.72 at z 3.65, 1.11-1.64 at 3.69, 1.27-1.42 at 3.75), so it reaches no further and no wider than the 266 guard.
const AW_SHELF:readonly(readonly[z:number,innerFall:number,outerFall:number])[]=[[2.94,0,.004],[3.02,0,.008],[3.10,0,.012],[3.20,.002,.02],[3.304,.004,.03]];
const AW_TOE:readonly BowGuardStation[]=[[3.316,.944,1.795,crownTop(3.316),.002,.030,.040],[3.45,.952,1.795,crownTop(3.45),.008,.05,.035],
  [3.58,1.000,1.778,crownTop(3.58),.02,.075,.030],[3.67,1.060,1.725,crownTop(3.67),.025,.08,.025],
  [3.725,1.135,1.640,crownTop(3.725),.02,.06,.020],[3.755,1.225,1.495,crownTop(3.755),.01,.03,.015]];
// The hull's upper glacis under the shoulder (t90AwX.ts hull(): its half-width and top at each station).
const GLACIS_EDGE:readonly(readonly[z:number,half:number,y:number])[]=[[1.9,1.052,1.43136],[2.5,1.043,1.17081],[2.7,1.032,1.08402],
  [2.9,1.022,.997225],[3.1,1.0115,.910433]];
const glacisEdge=(z:number,k:1|2):number=>{
  for(let i=1;i<GLACIS_EDGE.length;i++)if(z<=GLACIS_EDGE[i][0]){const a=GLACIS_EDGE[i-1],b=GLACIS_EDGE[i];return a[k]+(b[k]-a[k])*(z-a[0])/(b[0]-a[0]);}
  return GLACIS_EDGE[GLACIS_EDGE.length-1][k];
};
const crownBottom=(z:number):number=>{
  for(let i=1;i<CROWN.length;i++)if(z<=CROWN[i][0]){const[a,,ba]=CROWN[i-1],[b,,bb]=CROWN[i];return ba+(bb-ba)*(z-a)/(b-a);}
  return CROWN[CROWN.length-1][2];
};
export function addT90AWFender(P:TankBuilderPort,side:number):void{
  P.addMudguard('t90-aw-x-crowned-fender','hull',sectionSolid(CROWN.filter(([z])=>z<=2.94).map(([z,t,b])=>({z,ring:shoulderRing(z,t,b,side)}))));
  // 267: the hull side plate's top edge closes the wedge of air between the falling glacis edge and the shoulder over it,
  // from the shoulder's inner edge out to the hull's side (the source's own sections turn the guard's inner edge down to
  // the hull here), 10 mm into the glacis and 6 mm into the shoulder: no roof over air there (roof-pocket census: the
  // 0.05 m2 hull pocket a side).
  P.addEquipment('hullDetail',sectionSolid([2.30,2.5,2.7,2.94].map(z=>{
    const out=glacisEdge(z,1)-.003,low=glacisEdge(z,2)-.010,high=crownBottom(z)+.006;
    const ring:Array<readonly[number,number]>=[[.944,low],[out,low],[out,high],[.944,high]];
    return {z,ring:side<0?ring.map(([x,y])=>[-x,y] as const).reverse():ring};
  })));
  const raise=(z:number)=>side>0?Math.max(0,.010*(1-(z-2.94)/.16)):0;
  addT90BowGuard(P,side,'t90-aw-x-bow-guard',AW_SHELF.map(([z,fi,fo])=>[z,.944,1.795,crownTop(z)+raise(z),fi,fo,.045] as const),
    AW_TOE,[[1.00,1.24],[1.30,1.52],[1.58,1.76]]);
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
  P.addMudguard('t90-aw-x-fixed-skirt','hullFixedPaintedBodywork',markFixedPaintedPanel(sectionSolid(rows.map(([z,y,x])=>({z,
    ring:skirtRing(y,x+(side<0?.0019:0),side,inner+(side<0?.0019:0),crownOuter+(side<0?.0019:0))}))), 't90-aw-x-fixed-skirt','hullRubber'));
}
/** 267 (lane t90-family-267, S3; the 266 blind critics: "the side skirts read as plain slabs with flat hems"): a toothed
 * rubber strip `t` thick under a screen whose hem stands at `hem` from z0 to z1, one loft: trapezoid teeth about `pitch`
 * apart between V notches `2 notch` wide and `depth` deep, the tips `drop` under the hem, its top edge 40 mm up behind
 * the screen (the outline is extruded through the strip and stood on edge at x 0, for the caller to place). Shared by
 * the T-90 AW screens and the T-90MS curtains (t90msX.ts). */
export function toothedRubberStrip(z0:number,z1:number,hem:number,drop:number,depth=.06,pitch=.19,notch=.03,t=.012):THREE.BufferGeometry{
  const n=Math.max(1,Math.round((z1-z0)/pitch)),p=(z1-z0)/n,tip=hem-drop;
  const ring:Array<readonly[number,number]>=[[z0,tip]];
  for(let k=1;k<n;k++){const z=z0+k*p;ring.push([z-notch,tip],[z,tip+depth],[z+notch,tip]);}
  ring.push([z1,tip],[z1,hem+.04],[z0,hem+.04]);
  return sectionSolid([{z:-t/2,ring},{z:t/2,ring}]).rotateY(-Math.PI/2);
}
export function addT90AWSkirts(P:TankBuilderPort,side:number):void{
  // Distinct left-rear rising hem, not a mirrored full-height rubber box.
  const rear:readonly HemStation[]=side<0?[[-3.043,1.008,1.77935],[-2.798,.982,1.77964],[-2.553,.929,1.77992],
    [-2.308,.879,1.78020],[-2.063,.843,1.78658],[-1.819,.820,1.79929],[-1.574,.797,1.80992],
    [-1.329,.766,1.80330],[-1.084,.7305,1.77935]]:[[-3.043,.7256,1.78035],[-1.084,.7256,1.78035]];
  // the toothed strip runs under the screens' common .7256 hem to the front course's end, the tips 100 mm under it: the
  // full length on the right, from the left rear course's foot (z -1.084) on the left, whose rising rear hem stays bare.
  // x 1.744-1.756: inboard of every screen's inner face (1.758 and out), outboard of the track (1.690) and its wheels.
  P.addMudguard('t90-aw-x-toothed-hem','hullRubber',toothedRubberStrip(side<0?-1.084:-3.043,2.98435,.7256,.10).translate(side*1.75,0,0));
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
