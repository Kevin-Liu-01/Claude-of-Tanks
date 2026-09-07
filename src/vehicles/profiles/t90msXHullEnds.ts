// Original scalar section construction of the MS source's asymmetric aft hull.
// Source island identities are evidence only; no imported topology is retained.
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {roofSheet} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Height=readonly[z:number,y:number];
const FLANGE:readonly Height[]=[[-3.79005,1.28130],[-3.72365,1.23830],[-3.66895,1.21970],
  [-3.60455,1.21190],[-3.53615,1.21480],[-3.47955,1.22750],[-3.43655,1.24800],[-3.37595,1.29300],[-3.31545,1.34570]];
const WEB:readonly Height[]=[[-3.80175,1.2305],[-3.79785,1.2148],[-3.73535,1.1699],[-3.68455,1.1494],
  [-3.60845,1.1367],[-3.52445,1.1396],[-3.45805,1.1553],[-3.38385,1.1836],[-3.32325,1.2168],[-3.31155,1.2109],[-3.24315,1.2617]];
function height(rows:readonly Height[],z:number):number{
  if(z<=rows[0][0])return rows[0][1];
  for(let i=1;i<rows.length;i++)if(z<=rows[i][0]){
    const[a,y]=rows[i-1],[b,next]=rows[i];return y+(next-y)*(z-a)/(b-a);
  }
  return rows[rows.length-1][1];
}
function cradle(P:TankBuilderPort,x:number,dy:number,dz:number):void{
  const zs=[...new Set([...WEB.map(r=>r[0]),...FLANGE.map(r=>r[0])])].sort((a,b)=>a-b);
  const upper=(z:number)=>z<FLANGE[0][0]?1.2305+(z+3.80175)*4.24:z>FLANGE.at(-1)![0]?1.3428:height(FLANGE,z)-.006;
  P.addEquipment('hullDetail',sectionSolid(zs.map(z=>({z:z+dz,ring:[[x-.0049,height(WEB,z)+dy],
    [x+.0049,height(WEB,z)+dy],[x+.0049,Math.max(upper(z),height(WEB,z)+.0004)+dy],
    [x-.0049,Math.max(upper(z),height(WEB,z)+.0004)+dy]]}))));
  P.addEquipment('hullDetail',roofSheet(FLANGE.map(([z,y])=>[z+dz,x-.0244,x+.0264,y+dy,y+dy] as const),.0098));
  const roots:readonly(readonly[number,number,number])[]=[[-3.29595,1.198,1.19],[-3.25295,1.237,1.1582],
    [-3.23345,1.2422,1.153],[-3.18455,1.2275,1.139],[-3.15335,1.2334,1.139],[-3.11035,1.150,1.1494]];
  P.addEquipment('hullDetail',sectionSolid(roots.map(([z,t,b])=>({z:z+dz,ring:[[x-.0121,b+dy],
    [x+.0121,b+dy],[x+.0121,t+dy],[x-.0121,t+dy]]}))));
  P.addEquipment('hullDetail',roofSheet([[-3.31935+dz,x-.05935,x+.05935,1.2129+dy,1.2129+dy],
    [-3.24515+dz,x-.05935,x+.05935,1.2666+dy,1.2666+dy]],.030));
}
export function addT90MSRearCradles(P:TankBuilderPort):void{
  // Independently measured MS stations; its folds are not the AW stations.
  for(const x of [-.79880,-.37350,.36355,.80275])cradle(P,x,x<-.7?.0029:0,x<-.7?.0078:0);
}
export function addT90MSRearCase(P:TankBuilderPort):void{
  const l=1.02545,r=1.65825,top=1.4678;
  const aft:readonly Height[]=[[-3.60845,1.1445],[-3.35455,.9302],[-2.95995,.9302],[-2.91315,1.0127]];
  P.addEquipment('hullDetail',sectionSolid(aft.map(([z,b])=>({z,ring:[[l,b],[r,b],[r,top],[l,top]]}))));
  P.addEquipment('hullDetail',sectionSolid([-2.91315,-2.16895].map(z=>({z,ring:[[l,1.2969],[r,1.2969],[r,top],[l,top]]}))));
  P.addEquipment('hullDetail',KIT.box(.4092,.0147,.5058),1.34235,1.47215,-3.14455);
  const bearingY=(z:number)=>(-1.46538884548587-.64625770511468*z)/.76311924270058;
  P.addEquipment('hullDetail',roofSheet([-3.59475,-3.37795].map(z=>
    [z,1.21875,1.59865,bearingY(z)+.012,bearingY(z)+.012] as const),.012));
  // Small roof latches are attached furniture, not a second bulky housing.
  for(const z of [-3.5635,-2.2588])P.addEquipment('hullDetail',KIT.box(.1055,.0039,.0625),1.3623,1.46975,z);
  P.addEquipment('hullDetail',KIT.cylX(.0205,.206,20),1.33645,1.4609,-3.69145);
  P.addEquipment('hullDetail',roofSheet([[-3.69145,1.255,1.418,1.455,1.455],[-3.60065,1.255,1.418,1.459,1.459]],.010));
}
function leftRearRaisedCover(P:TankBuilderPort):void{
  // Separate inclined service cover and its real short transverse bearing.
  // The source sheet's shallow corrugations are simplified by its mean plane.
  const y=(z:number)=>1.4847+(z+3)*1.198;
  P.addEquipment('hullDetail',roofSheet([[-3.07135,-1.62395,-1.16305,y(-3.07135),y(-3.07135)],
    [-2.93655,-1.62395,-1.16305,y(-2.93655),y(-2.93655)]],.008));
  P.addEquipment('hullDetail',KIT.box(.6582,.0715,.0117),-1.34175,1.34025,-3.0557);
  for(const[l,r]of [[-1.61525,-1.38865],[-1.26265,-1.16595]]){
    P.addEquipment('hullDetail',KIT.box(r-l,.0692,.006), (l+r)/2,1.3744,-3.0635);
  }
}
export function addT90MSRearFenderCourses(P:TankBuilderPort,side:number):void{
  if(side>0){
    // The actual raised case, not a high solid deck wedge, owns the right roof.
    P.addMudguard('t90ms-x-rear-carrier','hull',roofSheet([[-2.16895,.99,1.61,1.4873,1.4873],
      [-1.00495,.99,1.61,1.50,1.50]],.017));
    return;
  }
  // Source left aft deck is exposed, with a low folded end and no mirrored case.
  const rows:readonly(readonly[number,number,number,number])[]=[[-3.36815,-1.70,1.218,1.243],
    [-3.30,-1.70,1.268,1.276],[-3.24315,-1.67575,1.3047,1.3057],[-3.04595,-1.67575,1.3047,1.3057],
    [-2.94435,-1.62695,1.4834,1.4902],[-1.41995,-1.62695,1.501,1.5078],[-1.00495,-1.62695,1.4971,1.5039]];
  const sections=rows.map(([z,l,yl,yr])=>{
    const xs=[l,-1.62,-1.50,-.96675],ys=xs.map(x=>yl+(yr-yl)*(x-l)/(-.96675-l));
    if(z===-3.30){ys[1]=1.268855;ys[2]=1.274600;ys[3]=1.276115;}
    return{z,ring:[...xs.map((x,i)=>[x,ys[i]-.015] as const),...xs.map((x,i)=>[x,ys[i]] as const).reverse()]};
  });
  P.addMudguard('t90ms-x-left-rear-deck','hull',sectionSolid(sections));
  leftRearRaisedCover(P);
}
