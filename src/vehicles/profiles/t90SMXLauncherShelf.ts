// Independently authored folded left carrier. Source scalar planes distinguish
// the rear skin, diagonal down-step, inclined deck and narrow raised outer lip.
import {sectionSolid,type SolidSection} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type Plane=readonly[number,number,number,number,number,number];
const LOWER:Plane=[.112674,.963854,-.241435,-1.38,2.0603456,0];
const INNER:Plane=[.077691,.968259,-.237567,-1.2494733,1.9713708,-.3];
const NOSE:Plane=[.087549,.994016,-.065325,-1.38,2.1098948,.2];
const BEVEL:Plane=[.814427,.528302,.240014,-1.46,2.1434956,.15];
const FRONT_BEVEL:Plane=[.730315,.676058,-.097903,-1.46,2.1257434,.2];
const CROWN:Plane=[.0203496,.9997004,.0135993,-1.5,2.1632827,.22];
const OUTER_BEVEL:Plane=[-.593237,.801030,-.080132,-1.54,2.156004,.22];
const OUTER_WALL:Plane=[-.975941,.0193278,-.217175,-1.6130094,1.8461131,.21];
const STEP:Plane=[-.284631,.033414,.958055,-1.213899,2.128754,-.42];

function height(p:Plane,x:number,z:number):number {
  return p[4]-(p[0]*(x-p[3])+p[2]*(z-p[5]))/p[1];
}

function lowDeck(x:number,z:number):number {
  return Math.min(height(NOSE,x,z),Math.max(height(LOWER,x,z),height(INNER,x,z)));
}

export function t90SMLeftCarrierRoof(x:number,z:number,existing:number):number {
  if(z>.3653)return existing;
  return Math.min(height(CROWN,x,z),height(OUTER_BEVEL,x,z),height(OUTER_WALL,x,z),
    Math.max(height(NOSE,x,z),height(FRONT_BEVEL,x,z)));
}

export function t90SMLeftCarrierBreakpoints(z:number,outer:number,inner:number):number[] {
  const planes=[NOSE,FRONT_BEVEL,CROWN,OUTER_BEVEL,OUTER_WALL],xs:number[]=[];
  for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++) {
    const a=planes[i],b=planes[j],slopeA=-a[0]/a[1],slopeB=-b[0]/b[1];
    const x=(height(b,0,z)-height(a,0,z))/(slopeA-slopeB);
    xs.push(Math.max(outer+.00003,Math.min(inner-.00003,x)));
  }
  return xs;
}

function stepZ(x:number,y:number):number {
  return STEP[5]-(STEP[0]*(x-STEP[3])+STEP[1]*(y-STEP[4]))/STEP[2];
}

function surface(x:number,z:number,outer:number):readonly[number,number] {
  const high=2.163+(z+.30)*.0015,low=lowDeck(x,z);
  if(z<stepZ(x,high))return [high-.008,high];
  const bevel=x<outer+.055?Math.max(height(BEVEL,x,z),height(FRONT_BEVEL,x,z)):low;
  const folded=Math.min(high,Math.max(low,bevel));
  const wall=height(STEP,x,z),roof=z<stepZ(x,low)?Math.max(folded,wall):folded;
  // The rolled outer corner has a narrow falling edge; the full carrier is
  // not an elevated solid bounding box extending into the launcher mouths.
  const edgeDrop=Math.max(0,1-(x-outer)/.008)*.007;
  return [Math.min(low-.007,roof-.003),roof-edgeDrop];
}

function bounds(z:number):readonly[number,number] {
  const outer=-1.460732-.289619*z;
  const inner=z< -1.40?-.734-(-1.40-z)*2.34334:-1.1503585-.291482*z;
  return [outer,Math.min(outer+.312,inner)];
}

function shelfSection(z:number):SolidSection {
  const [outer,inner]=bounds(z),width=inner-outer;
  const xs=Array.from({length:25},(_,i)=>outer+width*i/24);
  // Include both edges of the real diagonal fold, independent of the regular
  // subdivision used for the other simple planes.
  for(const y of [1.935,2.05,2.163]) {
    const x=STEP[3]-(STEP[1]*(y-STEP[4])+STEP[2]*(z-STEP[5]))/STEP[0];
    xs.push(Math.max(outer+.00001,Math.min(inner-.00001,x)));
  }
  xs.sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++)xs[i]=Math.max(xs[i],xs[i-1]+.000002);
  const rows=xs.map(x=>({x,y:surface(x,z,outer)}));
  return {z,ring:[...rows.map(p=>[p.x,p.y[0]] as const),
    ...rows.slice().reverse().map(p=>[p.x,p.y[1]] as const)]};
}

export function addT90SMLeftLauncherShelf(P:TankBuilderPort):void {
  const stations=[-1.513,-1.50,-1.40,-1.20,-.90,-.60,-.48,-.465,-.44,-.42,-.40,-.38,-.366,
    -.35,-.20,0,.10,.15,.20,.209];
  P.addEquipment('turretDetail',sectionSolid(stations.map(shelfSection)),-.008,-1.532,-.359);
}
