// Measured MS side screens: thin rails, separate folded mounts and true gaps.
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {roofSheet} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Rail=readonly[low:number,high:number];
const LEFT:readonly Rail[]=[[1.459,1.4629],[1.3936,1.3984],[1.3291,1.334],[1.2646,1.2695],[1.2002,1.2051],
  [1.1357,1.1396],[1.0713,1.0752],[1.0068,1.0107],[.9419,.9463],[.8774,.8818],[.8125,.8169],[.748,.7524],[.6836,.688]];
const RIGHT:readonly Rail[]=[[1.4541,1.458],[1.3896,1.3945],[1.3262,1.3301],[1.2617,1.2666],[1.1982,1.2021],
  [1.1338,1.1387],[1.0703,1.0742],[1.0059,1.0098],[.9419,.9463],[.8779,.8823],[.814,.8184],[.7495,.7539],[.6855,.6899]];
function rail(P:TankBuilderPort,side:number,low:number,high:number,a:number,b:number):void{
  const x=side<0?-1.84615:1.84035;
  P.addEquipment('hullDetail',KIT.box(.0498,high-low,b-a),x,(low+high)/2,(a+b)/2);
}
function frontRails(P:TankBuilderPort,side:number):void{
  const rows=side<0?LEFT:RIGHT,back=side<0?-2.17095:-2.16895,front=side<0?-1.00495:-1.01175;
  const lower=side<0?[-1.99515,-1.81345,-1.62895,-1.44725]:[-1.99315,-1.81155,-1.62695,-1.44535];
  rows.forEach(([lo,hi],i)=>{
    if(side>0&&i>=3&&i<=5){rail(P,side,lo,hi,back,-1.86425);rail(P,side,lo,hi,-1.44335,front);}
    else rail(P,side,lo,hi,i<9?back:lower[i-9],front);
  });
  const x=side<0?-1.84615:1.84035,d=side<0?0:.0029;
  P.addEquipment('hullDetail',roofSheet([[back-.0039,x-.0249,x+.0249,.9441,.9441],
    [-1.26465,x-.0249,x+.0249,.6235+d,.6235+d],[front,x-.0249,x+.0249,.6230+d,.6230+d]],.0044));
}
function rearRails(P:TankBuilderPort,side:number):void{
  const rows:readonly Rail[]=side<0?[[1.458,1.4629],[1.3936,1.3984],[1.3281,1.333],[1.2646,1.2695],
    [1.1992,1.2041],[1.1357,1.1396],[1.0703,1.0752],[1.0068,1.0107]]:
    [[1.4541,1.459],[1.3906,1.3945],[1.3262,1.3301],[1.2627,1.2666],[1.1982,1.2021],[1.1338,1.1387],[1.0703,1.0742],[1.0068,1.0107]];
  for(const[lo,hi]of rows)rail(P,side,lo,hi,-3.08305,-2.17875);
  for(const z of [-3.078,-2.184])P.addEquipment('hullDetail',KIT.box(.0498,.455,.005),side<0?-1.84615:1.84035,1.2355,z);
}
function upright(P:TankBuilderPort,side:number,z:number,depth:number,top:number):void{
  const x0=1.79785,x1=1.84765,outer=side<0?1.89055:1.88965;
  // Width extrema belong only to the low rounded hinge toe, not the tall post.
  const ring: Array<readonly[number,number]>=[[x0,.9517],[1.8765,.9517],[outer-.004,.96],
    [outer,.976],[outer-.003,.992],[1.8793,1.0019],[x1,1.0019],[x1,top],[x0,top]];
  const signed=side<0?ring.map(([x,y])=>[-x,y] as const).reverse():ring;
  P.addEquipment('hullDetail',sectionSolid([{z:z-depth/2,ring:signed},{z:z+depth/2,ring:signed}]));
}
function posts(P:TankBuilderPort,side:number):void{
  upright(P,side,-2.0586,.0059,1.4541);upright(P,side,-1.01515,.0048,1.4541);upright(P,side,-1.6275,.0049,1.0703);
  for(const[z,low]of [[-2.0635,.9053],[-1.63235,.7544],[-1.02,.626]]){
    P.addEquipment('hullDetail',KIT.box(.0498,.9951-low,.0048),side*1.82275,(.9951+low)/2,z);
    P.addEquipment('hullDetail',KIT.box(.0869,.026,.0048),side*1.8413,.975,z);
  }
}
function mounts(P:TankBuilderPort,side:number):void{
  const inboard=side<0?1.67475:1.66315,outboard=side<0?1.85545:1.84375,dy=side<0?.0039:0;
  const stations=side<0?[-2.99125,-2.26665,-2.08595,-1.04205]:[-3.00295,-2.208,-2.08885,-1.0425];
  for(const z of stations){
    for(const y of [1.45115,1.38865,1.32425])P.addEquipment('hullDetail',KIT.box(outboard-inboard,.0039,.0508),side*(inboard+outboard)/2,y+dy,z);
    P.addEquipment('hullDetail',KIT.box(outboard-inboard,.0596,.004),side*(inboard+outboard)/2,1.4194+dy,z);
    // Real angled lower web lands on the separate inner hanging sheet.
    const left=side<0?-outboard:inboard,right=side<0?-inboard:outboard;
    P.addEquipment('hullDetail',roofSheet([[z-.002,left,right,side<0?1.3262:1.3008,side<0?1.3047:1.3232],
      [z+.002,left,right,side<0?1.3262:1.3008,side<0?1.3047:1.3232]],.010));
  }
}
function innerSheet(P:TankBuilderPort,side:number):void{
  const x=side<0?-1.7822:1.7715,lowBack=side<0?1.0166:1.0127,lowFront=side<0?.5244:.5205;
  P.addEquipment('hullDetail',sectionSolid([[-3.04395,lowBack],[-1.00495,lowFront]].map(([z,b])=>({z,
    ring:[[x-.00585,b],[x+.00585,b],[x+.00585,1.2305],[x-.00585,1.2305]]}))));
  const l=side<0?-1.78805:1.66315,r=side<0?-1.67185:1.77735;
  P.addEquipment('hullDetail',roofSheet([[-3.04395,l,r,side<0?1.2305:1.3008,side<0?1.2998:1.2383],
    [-1.00495,l,r,side<0?1.2305:1.3008,side<0?1.2998:1.2383]],.0117));
}
export function addT90MSHullCages(P:TankBuilderPort):void{
  for(const side of [-1,1]){frontRails(P,side);rearRails(P,side);posts(P,side);mounts(P,side);innerSheet(P,side);}
}
